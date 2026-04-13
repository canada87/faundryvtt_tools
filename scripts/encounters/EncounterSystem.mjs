import { MODULE_ID } from "../shared/constants.mjs";

/**
 * Core logic for the Random Encounters feature.
 * Handles compendium loading, type extraction, filtering, and token spawning.
 *
 * Monster levels are read from a configurable actor field (e.g. system.details.level)
 * instead of relying on the compendium folder structure.
 */
export class EncounterSystem {

  /**
   * Default CR groups — level ranges.
   */
  static DEFAULT_GROUPS = [
    { label: "CR 1-2", minLevel: 1, maxLevel: 2 },
    { label: "CR 3-4", minLevel: 3, maxLevel: 4 },
    { label: "CR 5-6", minLevel: 5, maxLevel: 6 },
    { label: "CR 8-10", minLevel: 8, maxLevel: 10 }
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
   * Return index entries whose actor level falls within the given range.
   * @param {Array}  index     Compendium index entries
   * @param {string} levelPath Dot-path to the level field
   * @param {number} minLevel
   * @param {number} maxLevel
   * @returns {Array}
   */
  static getEntriesByLevelRange(index, levelPath, minLevel, maxLevel) {
    return index.filter(entry => {
      const level = Number(this.getNestedValue(entry, levelPath));
      if (isNaN(level)) return false;
      return level >= minLevel && level <= maxLevel;
    });
  }

  /* ---------------------------------------- */
  /*  Compendium data                          */
  /* ---------------------------------------- */

  /**
   * Load the compendium index with type and level fields.
   * @returns {{ pack, index } | null}
   */
  static async loadCompendium() {
    const compendiumName = game.settings.get(MODULE_ID, "encounterCompendium");
    const typePath = game.settings.get(MODULE_ID, "encounterCreatureTypePath");
    const levelPath = game.settings.get(MODULE_ID, "encounterLevelPath");

    const pack = game.packs.get(compendiumName)
      ?? game.packs.find(p => p.metadata.label === compendiumName);
    if (!pack) {
      ui.notifications.error(
        game.i18n.format("ENCOUNTERS.Error.CompendiumNotFound", { name: compendiumName })
      );
      return null;
    }

    const index = await pack.getIndex({ fields: [typePath, levelPath] });

    return { pack, index };
  }

  /**
   * Extract all unique creature types from entries that fall within configured groups.
   */
  static extractCreatureTypes(index, groups, typePath, levelPath) {
    const allTypes = new Set();
    for (const group of groups) {
      const entries = this.getEntriesByLevelRange(index, levelPath, group.minLevel, group.maxLevel);
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
   * Always rounds up. Multipliers are loaded from settings if available.
   */
  static calculateBudget(partyLevel, partySize, difficulty) {
    const highBudget = partySize * partyLevel;
    let multiplier;
    try {
      const mults = game.settings.get(MODULE_ID, "encounterDifficultyMultipliers");
      multiplier = mults?.[difficulty - 1] ?? this.DIFFICULTY_MULTIPLIERS[difficulty] ?? 1.0;
    } catch {
      multiplier = this.DIFFICULTY_MULTIPLIERS[difficulty] ?? 1.0;
    }
    return Math.ceil(highBudget * multiplier);
  }

  /**
   * Hard floor for the minimum monster level per difficulty tier.
   * High cannot drop below 2, Very High cannot drop below 3.
   */
  static DIFFICULTY_MIN_FLOORS = { 4: 2, 5: 3 };

  /**
   * Calculate the valid monster-level range for a given difficulty.
   *   min = max(floor, partyLevel + difficulty − 5 + offset)
   *   max = partyLevel + difficulty − 1 + offset
   * The offset is loaded from settings (default 0).
   */
  static calculateLevelRange(partyLevel, difficulty) {
    const floor = this.DIFFICULTY_MIN_FLOORS[difficulty] ?? 1;
    let offset = 0;
    try {
      offset = game.settings.get(MODULE_ID, "encounterLevelOffset") ?? 0;
    } catch { /* settings not yet ready */ }
    return {
      min: Math.max(floor, partyLevel + difficulty - 5 + offset),
      max: partyLevel + difficulty - 1 + offset
    };
  }

  /**
   * Draw monsters based on party parameters and difficulty.
   * Monsters are picked randomly until the point budget is met or exceeded.
   * Each monster costs points equal to its actor level.
   *
   * @param {Array}    index        Compendium index entries
   * @param {Array}    groups       CR group definitions (used to enumerate all known level ranges)
   * @param {number}   partyLevel
   * @param {number}   partySize
   * @param {number}   difficulty   1–5
   * @param {string}   typePath     Dot-path to creature type field
   * @param {string}   levelPath    Dot-path to level field
   * @param {string[]} included     Included types (empty = all)
   * @param {string[]} excluded     Excluded types
   * @returns {Array}               Drawn index entries
   */
  static drawByDifficulty(
    index, groups,
    partyLevel, partySize, difficulty,
    typePath, levelPath, included, excluded
  ) {
    const budget = this.calculateBudget(partyLevel, partySize, difficulty);
    const { min, max } = this.calculateLevelRange(partyLevel, difficulty);

    // Collect candidates: entries whose level falls within the difficulty range
    const allCandidates = [];   // { entry, level }

    for (const entry of index) {
      const level = Number(this.getNestedValue(entry, levelPath));
      if (isNaN(level) || level < min || level > max) continue;

      // Apply type filters (entries with no type are included unless an inclusion list is active)
      const type = this.getNestedValue(entry, typePath)?.trim() ?? "";
      if (type && excluded.includes(type)) continue;
      if (included.length > 0 && !included.includes(type)) continue;

      allCandidates.push({ entry, level });
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
   * @param {Array}    index        Compendium index entries
   * @param {Array}    groups       CR group definitions (level ranges)
   * @param {number[]} counts       How many to draw from each group
   * @param {string}   typePath     Dot-path to creature type field
   * @param {string}   levelPath    Dot-path to level field
   * @param {string[]} included     Included types (empty = all allowed)
   * @param {string[]} excluded     Excluded types
   * @returns {Array}               Drawn index entries
   */
  static drawMonsters(index, groups, counts, typePath, levelPath, included, excluded) {
    const drawn = [];

    for (let i = 0; i < groups.length; i++) {
      const count = counts[i];
      if (count <= 0) continue;

      let candidates = this.getEntriesByLevelRange(
        index, levelPath, groups[i].minLevel, groups[i].maxLevel
      );

      // Apply type filters (entries with no type are included unless an inclusion list is active)
      candidates = candidates.filter(entry => {
        const type = this.getNestedValue(entry, typePath)?.trim() ?? "";
        if (type && excluded.includes(type)) return false;
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
