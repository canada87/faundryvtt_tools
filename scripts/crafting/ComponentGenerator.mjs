import { MODULE_ID } from "../shared/constants.mjs";

/**
 * Auto-generates recipe components by picking random items from a compendium.
 * Items are drawn from folders lv1/lv2/lv3 inside a "components" folder
 * within a configurable compendium (default: "Crafting & Consumables").
 */
export class ComponentGenerator {

  /** Default generator config — compendium, folder, and level definitions. */
  static DEFAULT_CONFIG = {
    compendiumLabel: "Crafting & Consumables",
    componentsFolder: "components",
    levels: [
      { folderName: "lv1", points: 1 },
      { folderName: "lv2", points: 2 },
      { folderName: "lv3", points: 3 }
    ]
  };

  /** Default rarity config — used as fallback and initial setting value. */
  static DEFAULT_RARITIES = {
    veryCommon:    { points: 1,  minLevel: 1 },
    common:        { points: 2,  minLevel: 1 },
    uncommon:      { points: 3,  minLevel: 1 },
    rare:          { points: 4,  minLevel: 2 },
    veryRare:      { points: 6,  minLevel: 2 },
    legendary:     { points: 8,  minLevel: 2 },
    veryLegendary: { points: 12, minLevel: 3 },
    unique:        { points: 20, minLevel: 3 }
  };

  /**
   * Get current generator config from settings (falls back to defaults).
   */
  static getConfig() {
    const saved = game.settings.get(MODULE_ID, "craftingGeneratorConfig");
    if (saved && Object.keys(saved).length) return saved;
    return this.DEFAULT_CONFIG;
  }

  /**
   * Get current rarities config from settings (falls back to defaults).
   */
  static getRarities() {
    const saved = game.settings.get(MODULE_ID, "craftingRarities");
    if (saved && Object.keys(saved).length) return saved;
    return this.DEFAULT_RARITIES;
  }

  /**
   * Generate components for a given rarity.
   * @param {string} rarityKey — key from RARITIES
   * @returns {Array|null} Array of {uuid, name, img, quantity} or null on error
   */
  static async generate(rarityKey) {
    const rarity = this.getRarities()[rarityKey];
    if (!rarity) return null;

    const config = this.getConfig();

    // Find compendium
    const pack = game.packs.find(p => p.metadata.label === config.compendiumLabel);
    if (!pack) {
      ui.notifications.error(game.i18n.format("CRAFTING.Error.CompendiumNotFound",
        { name: config.compendiumLabel }));
      return null;
    }

    // Load index with folder info
    await pack.getIndex({ fields: ["folder", "img"] });

    // Build level → items map
    const levelItems = this._getLevelItems(pack, config);
    if (!levelItems) return null;

    // Generate random component picks
    const picks = this._pickComponents(rarity, levelItems, config);
    if (!picks.length) {
      ui.notifications.warn(game.i18n.localize("CRAFTING.Warn.NoComponentsFound"));
      return null;
    }

    // Build component list directly from compendium (no world import needed)
    return await this._buildFromCompendium(pack, picks);
  }

  /* ---------------------------------------- */
  /*  Compendium folder traversal             */
  /* ---------------------------------------- */

  static _getLevelItems(pack, config) {
    const folders = pack.folders;

    // Find the top-level components folder
    const compFolder = folders.find(f =>
      f.name.toLowerCase() === config.componentsFolder.toLowerCase() && !f.folder
    );
    if (!compFolder) {
      ui.notifications.error(game.i18n.format("CRAFTING.Error.FolderNotFound",
        { name: config.componentsFolder }));
      return null;
    }

    // levels is an array; level number = index + 1
    const result = {};
    config.levels.forEach((levelData, idx) => {
      const levelNum = idx + 1;
      const lvFolder = folders.find(f =>
        f.name === levelData.folderName && f.folder?.id === compFolder._id
      );
      result[levelNum] = lvFolder
        ? pack.index.filter(entry => entry.folder === lvFolder._id)
        : [];
    });
    return result;
  }

  /* ---------------------------------------- */
  /*  Random component selection              */
  /* ---------------------------------------- */

  static _pickComponents(rarity, levelItems, config) {
    const { points: totalPoints, minLevel } = rarity;
    // Build levelNum → points map from the array (level number = index + 1)
    const levelPointsMap = {};
    config.levels.forEach((levelData, idx) => {
      levelPointsMap[idx + 1] = levelData.points;
    });
    const allLevels = config.levels.map((_, idx) => idx + 1);
    const picks = [];
    let currentPoints = 0;

    // First: at least one component of the minimum required level
    const first = this._pickRandom(levelItems[minLevel]);
    if (first) {
      picks.push({ entry: first, level: minLevel });
      currentPoints += levelPointsMap[minLevel] ?? 1;
    }

    // Fill remaining budget
    while (currentPoints < totalPoints) {
      const remaining = totalPoints - currentPoints;
      const possibleLevels = allLevels.filter(l =>
        (levelPointsMap[l] ?? 1) <= remaining && levelItems[l]?.length
      );
      if (!possibleLevels.length) break;

      const level = possibleLevels[Math.floor(Math.random() * possibleLevels.length)];
      const entry = this._pickRandom(levelItems[level]);
      if (entry) {
        picks.push({ entry, level });
        currentPoints += levelPointsMap[level] ?? 1;
      }
    }

    return picks;
  }

  static _pickRandom(arr) {
    if (!arr?.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /* ---------------------------------------- */
  /*  Build component list from compendium     */
  /* ---------------------------------------- */

  /**
   * Fetch full item data from the compendium and return the component array.
   * Items are NOT imported into the world: fromUuid() resolves compendium UUIDs
   * at craft time, and inventory checks use item names only.
   */
  static async _buildFromCompendium(pack, picks) {
    const components = [];
    for (const { entry } of picks) {
      const fullItem = await pack.getDocument(entry._id);
      const existing = components.find(c => c.name === fullItem.name);
      if (existing) {
        existing.quantity++;
      } else {
        components.push({
          uuid: fullItem.uuid,
          name: fullItem.name,
          img: fullItem.img,
          quantity: 1
        });
      }
    }
    return components;
  }
}
