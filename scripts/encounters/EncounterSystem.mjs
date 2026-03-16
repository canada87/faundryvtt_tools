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
  /*  Drawing                                  */
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
