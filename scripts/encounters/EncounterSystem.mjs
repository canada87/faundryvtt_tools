import { MODULE_ID } from "../shared/constants.mjs";

/**
 * Core logic for the Random Encounters feature.
 * Handles compendium loading, type extraction, filtering, and token spawning.
 */
export class EncounterSystem {

  /**
   * Default CR groups — matches the compendium folder structure.
   */
  static DEFAULT_GROUPS = [
    { label: "CR 1-2", folders: ["CR1", "CR2"] },
    { label: "CR 3-4", folders: ["CR3", "CR4"] },
    { label: "CR 5-6", folders: ["CR5", "CR6"] },
    { label: "CR 8-10", folders: ["CR8", "CR9", "CR10"] }
  ];

  /**
   * Default encounter scenarios — tactical encounter descriptions.
   */
  static DEFAULT_SCENARIOS = [
    "Pochi nemici, rinforzi nemici in arrivo fra 3 turni. Fuggite.",
    "Nemici ad ondate, rinforzi alleati in 5 turni.",
    "Piccolo gruppo di nemici d'élite che insegue il party per catturarlo.",
    "NPC in pericolo circondato da nemici. I nemici ignorano il party finché non interviene.",
    "Attacco a sorpresa. Il party è in svantaggio nel primo turno.",
    "Imboscata perfetta, party in svantaggio. Via di fuga sorvegliata da pochi nemici.",
    "Il party ha il vantaggio della sorpresa su un obiettivo nemico isolato. Agire in silenzio.",
    "Il party scorta un carico. I nemici puntano al carico, non al party.",
    "Nemici deboli e numerosi. L'obiettivo è consumare risorse del party prima di un incontro più duro.",
    "Un nemico potente ignora il party e sta distruggendo qualcosa di importante. Va fermato prima dell'ambiente, non con la forza bruta.",
    "Il party è in inferiorità numerica. I nemici possono essere aggirati o evitati del tutto.",
    "Combattimento facile. A metà incontro arriva qualcosa di molto più grosso.",
    "Un nemico molto forte, da solo. Niente minion, niente fasi. Solo lui.",
    "Rituale in corso. Il mago nemico deve perdere concentrazione entro X turni o evoca qualcosa di peggio.",
    "Un NPC è il bersaglio di una caccia. I nemici sono già in movimento.",
    "Nemici in ritirata con qualcosa di rubato. Inseguimento.",
    "Nemico che si arrende e chiede aiuto. Potrebbe essere una trappola.",
    "I nemici avanzano verso un obiettivo indifeso. Tenere la linea finché non è in salvo.",
    "Il party stava per colpire un obiettivo nemico. Era una trappola. Ruoli invertiti.",
    "Un gruppo d'élite nemico sta per completare una missione. Fermarlo in fretta."
  ];

  /* ---------------------------------------- */
  /*  Helpers                                  */
  /* ---------------------------------------- */

  /**
   * Resolve a dot-notation path on an object.
   * @param {object} obj
   * @param {string} path  e.g. "system.details.creatureType"
   * @returns {*}
   */
  static getNestedValue(obj, path) {
    return path.split(".").reduce((o, k) => o?.[k], obj);
  }

  /**
   * Return index entries whose `folder` matches one of the given folder names.
   */
  static getEntriesFromFolders(index, folderMap, folderNames) {
    const entries = [];
    for (const name of folderNames) {
      const folderId = folderMap.get(name);
      if (folderId) {
        entries.push(...index.filter(i => i.folder === folderId));
      }
    }
    return entries;
  }

  /* ---------------------------------------- */
  /*  Compendium data                          */
  /* ---------------------------------------- */

  /**
   * Load the compendium index and build a folder map.
   * @returns {{ pack, index, folderMap: Map<string,string> } | null}
   */
  static async loadCompendium() {
    const compendiumName = game.settings.get(MODULE_ID, "encounterCompendium");
    const typePath = game.settings.get(MODULE_ID, "encounterCreatureTypePath");

    const pack = game.packs.get(compendiumName);
    if (!pack) {
      ui.notifications.error(
        game.i18n.format("ENCOUNTERS.Error.CompendiumNotFound", { name: compendiumName })
      );
      return null;
    }

    const index = await pack.getIndex({ fields: [typePath] });

    const folderMap = new Map();
    pack.folders.forEach(f => folderMap.set(f.name, f.id));

    return { pack, index, folderMap };
  }

  /**
   * Extract all unique creature types from the configured groups.
   */
  static extractCreatureTypes(index, folderMap, groups, typePath) {
    const allTypes = new Set();
    for (const group of groups) {
      const entries = this.getEntriesFromFolders(index, folderMap, group.folders);
      for (const entry of entries) {
        const type = this.getNestedValue(entry, typePath);
        if (type) allTypes.add(String(type).trim());
      }
    }
    return Array.from(allTypes).sort();
  }

  /* ---------------------------------------- */
  /*  Difficulty calculations                   */
  /* ---------------------------------------- */

  /**
   * Multipliers for each difficulty level (1–5) relative to "High".
   */
  static DIFFICULTY_MULTIPLIERS = {
    1: 0.3,   // Very Low  — 70 % less than High
    2: 0.5,   // Low       — 50 % less
    3: 0.8,   // Medium    — 20 % less
    4: 1.0,   // High      — base
    5: 1.4    // Very High — 40 % more
  };

  /**
   * Calculate the encounter point budget.
   * High = partySize × partyLevel; other difficulties scale from there.
   * Always rounds up.
   */
  static calculateBudget(partyLevel, partySize, difficulty) {
    const highBudget = partySize * partyLevel;
    const multiplier = this.DIFFICULTY_MULTIPLIERS[difficulty] ?? 1.0;
    return Math.ceil(highBudget * multiplier);
  }

  /**
   * Hard floor for the minimum monster level per difficulty tier.
   * High cannot drop below 2, Very High cannot drop below 3.
   */
  static DIFFICULTY_MIN_FLOORS = { 4: 2, 5: 3 };

  /**
   * Calculate the valid monster-level range for a given difficulty.
   *   min = max(1, partyLevel + difficulty − 5)  — then clamped by floor
   *   max = partyLevel + difficulty − 1
   */
  static calculateLevelRange(partyLevel, difficulty) {
    const floor = this.DIFFICULTY_MIN_FLOORS[difficulty] ?? 1;
    return {
      min: Math.max(floor, partyLevel + difficulty - 5),
      max: partyLevel + difficulty - 1
    };
  }

  /**
   * Extract the numeric level from a compendium folder name (e.g. "CR5" → 5).
   * Returns null when no number is found.
   */
  static extractFolderLevel(folderName) {
    const match = folderName.match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  /**
   * Draw monsters based on party parameters and difficulty.
   * Monsters are picked randomly until the point budget is met or exceeded.
   * Each monster costs points equal to the level of its compendium folder.
   *
   * @param {Array}    index        Compendium index entries
   * @param {Map}      folderMap    folder-name → folder-id
   * @param {Array}    groups       CR group definitions (to enumerate all known folders)
   * @param {number}   partyLevel
   * @param {number}   partySize
   * @param {number}   difficulty   1–5
   * @param {string}   typePath     Dot-path to creature type field
   * @param {string[]} included     Included types (empty = all)
   * @param {string[]} excluded     Excluded types
   * @returns {Array}               Drawn index entries
   */
  static drawByDifficulty(
    index, folderMap, groups,
    partyLevel, partySize, difficulty,
    typePath, included, excluded
  ) {
    const budget = this.calculateBudget(partyLevel, partySize, difficulty);
    const { min, max } = this.calculateLevelRange(partyLevel, difficulty);

    // Collect candidates from all group folders whose level falls in range
    const allCandidates = [];   // { entry, level }

    for (const group of groups) {
      for (const folderName of group.folders) {
        const level = this.extractFolderLevel(folderName);
        if (level === null || level < min || level > max) continue;

        const folderId = folderMap.get(folderName);
        if (!folderId) continue;

        let entries = index.filter(i => i.folder === folderId);

        // Apply type filters
        entries = entries.filter(entry => {
          const type = this.getNestedValue(entry, typePath)?.trim();
          if (!type) return false;
          if (excluded.includes(type)) return false;
          if (included.length > 0 && !included.includes(type)) return false;
          return true;
        });

        for (const entry of entries) {
          allCandidates.push({ entry, level });
        }
      }
    }

    if (allCandidates.length === 0) return [];

    // Greedy random selection: keep drawing until budget is met or exceeded
    const drawn = [];
    let remaining = budget;

    while (remaining > 0) {
      const pick = allCandidates[Math.floor(Math.random() * allCandidates.length)];
      drawn.push(pick.entry);
      remaining -= pick.level;
    }

    return drawn;
  }

  /* ---------------------------------------- */
  /*  Drawing (manual mode)                    */
  /* ---------------------------------------- */

  /**
   * Randomly draw monsters from the index, respecting filters.
   * @param {Array} index           Compendium index entries
   * @param {Map}   folderMap       folder-name → folder-id
   * @param {Array} groups          CR group definitions
   * @param {number[]} counts       How many to draw from each group
   * @param {string} typePath       Dot-path to creature type field
   * @param {string[]} included     Included types (empty = all allowed)
   * @param {string[]} excluded     Excluded types
   * @returns {Array}               Drawn index entries
   */
  static drawMonsters(index, folderMap, groups, counts, typePath, included, excluded) {
    const drawn = [];

    for (let i = 0; i < groups.length; i++) {
      const count = counts[i];
      if (count <= 0) continue;

      let candidates = this.getEntriesFromFolders(index, folderMap, groups[i].folders);

      // Apply type filters
      candidates = candidates.filter(entry => {
        const type = this.getNestedValue(entry, typePath)?.trim();
        if (!type) return false;
        if (excluded.includes(type)) return false;
        if (included.length > 0 && !included.includes(type)) return false;
        return true;
      });

      if (candidates.length === 0) continue;

      for (let r = 0; r < count; r++) {
        drawn.push(candidates[Math.floor(Math.random() * candidates.length)]);
      }
    }

    return drawn;
  }

  /* ---------------------------------------- */
  /*  Spawning                                 */
  /* ---------------------------------------- */

  /**
   * Import actors (if needed) and place tokens on the canvas.
   * @param {CompendiumCollection} pack
   * @param {Array}  entries   Drawn index entries
   * @param {{x:number, y:number}} position  World-space click position
   */
  static async spawnEncounter(pack, entries, position) {
    const targetFolderName = game.settings.get(MODULE_ID, "encounterTargetFolder");

    // Get or create target folder
    let targetFolder = game.folders.find(f => f.name === targetFolderName && f.type === "Actor");
    if (!targetFolder) {
      targetFolder = await Folder.create({ name: targetFolderName, type: "Actor", parent: null });
    }

    // Visual template
    const [templateDoc] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [{
      t: "circle",
      user: game.user.id,
      x: position.x,
      y: position.y,
      distance: 5,
      fillColor: "#cc2865"
    }]);

    const tokenDataArray = [];
    const radiusPixels = 5 * canvas.grid.size;

    for (const entry of entries) {
      // Check if already imported
      let worldActor = game.actors.find(a => a.getFlag("core", "sourceId") === entry.uuid);

      if (!worldActor) {
        try {
          ui.notifications.info(
            game.i18n.format("ENCOUNTERS.Info.Importing", { name: entry.name })
          );
          worldActor = await game.actors.importFromCompendium(pack, entry._id, {
            folder: targetFolder.id
          });
        } catch (err) {
          console.error("Faundryvtt Tools | Failed to import actor:", err);
          continue;
        }
      }

      // Random position within the circle
      const angle = Math.random() * 2 * Math.PI;
      const distance = Math.random() * radiusPixels;
      const tokenX = position.x + Math.cos(angle) * distance;
      const tokenY = position.y + Math.sin(angle) * distance;
      const snapped = canvas.grid.getSnappedPosition(tokenX, tokenY, 1);

      const tokenProto = await worldActor.getTokenDocument();
      tokenDataArray.push({
        ...tokenProto.toObject(),
        x: snapped.x,
        y: snapped.y,
        actorLink: false
      });
    }

    await canvas.scene.createEmbeddedDocuments("Token", tokenDataArray);

    // Remove visual template after a short delay
    setTimeout(
      () => canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", [templateDoc.id]),
      500
    );

    ui.notifications.info(game.i18n.localize("ENCOUNTERS.Info.SpawnComplete"));
  }
}
