import { MODULE_ID } from "../shared/constants.mjs";

/**
 * Auto-generates recipe components by picking random items from a compendium.
 * Items are drawn from folders lv1/lv2/lv3 inside a "components" folder
 * within the "Crafting & Consumables" compendium.
 */
export class ComponentGenerator {

  static COMPENDIUM_LABEL = "Crafting & Consumables";
  static COMPONENTS_FOLDER = "components";
  static WORLD_FOLDER_NAME = "Crafting Components";

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

  static LEVEL_POINTS = { 1: 1, 2: 2, 3: 3 };

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

    // Find compendium
    const pack = game.packs.find(p => p.metadata.label === this.COMPENDIUM_LABEL);
    if (!pack) {
      ui.notifications.error(game.i18n.format("CRAFTING.Error.CompendiumNotFound",
        { name: this.COMPENDIUM_LABEL }));
      return null;
    }

    // Load index with folder info
    await pack.getIndex({ fields: ["folder", "img"] });

    // Build level → items map
    const levelItems = this._getLevelItems(pack);
    if (!levelItems) return null;

    // Generate random component picks
    const picks = this._pickComponents(rarity, levelItems);
    if (!picks.length) {
      ui.notifications.warn(game.i18n.localize("CRAFTING.Warn.NoComponentsFound"));
      return null;
    }

    // Import items to world and return component data
    return await this._importAndBuild(pack, picks);
  }

  /* ---------------------------------------- */
  /*  Compendium folder traversal             */
  /* ---------------------------------------- */

  static _getLevelItems(pack) {
    const folders = pack.folders;

    // Find the top-level "components" folder
    const compFolder = folders.find(f =>
      f.name.toLowerCase() === this.COMPONENTS_FOLDER.toLowerCase() && !f.folder
    );
    if (!compFolder) {
      ui.notifications.error(game.i18n.format("CRAFTING.Error.FolderNotFound",
        { name: this.COMPONENTS_FOLDER }));
      return null;
    }

    const result = {};
    for (const level of [1, 2, 3]) {
      const lvFolder = folders.find(f =>
        f.name === `lv${level}` && f.folder?.id === compFolder._id
      );
      if (lvFolder) {
        result[level] = pack.index.filter(entry => entry.folder === lvFolder._id);
      } else {
        result[level] = [];
      }
    }
    return result;
  }

  /* ---------------------------------------- */
  /*  Random component selection              */
  /* ---------------------------------------- */

  static _pickComponents(rarity, levelItems) {
    const { points: totalPoints, minLevel } = rarity;
    const picks = [];
    let currentPoints = 0;

    // First: at least one component of the minimum required level
    const first = this._pickRandom(levelItems[minLevel]);
    if (first) {
      picks.push({ entry: first, level: minLevel });
      currentPoints += this.LEVEL_POINTS[minLevel];
    }

    // Fill remaining budget
    while (currentPoints < totalPoints) {
      const remaining = totalPoints - currentPoints;
      const possibleLevels = [1, 2, 3].filter(l =>
        this.LEVEL_POINTS[l] <= remaining && levelItems[l]?.length
      );
      if (!possibleLevels.length) break;

      const level = possibleLevels[Math.floor(Math.random() * possibleLevels.length)];
      const entry = this._pickRandom(levelItems[level]);
      if (entry) {
        picks.push({ entry, level });
        currentPoints += this.LEVEL_POINTS[level];
      }
    }

    return picks;
  }

  static _pickRandom(arr) {
    if (!arr?.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /* ---------------------------------------- */
  /*  Import to world & build component list  */
  /* ---------------------------------------- */

  static async _importAndBuild(pack, picks) {
    // Ensure world folders exist
    const levelFolders = await this._ensureWorldFolders();

    const components = [];
    for (const { entry, level } of picks) {
      // Check if already imported in the correct folder
      const folder = levelFolders[level];
      let worldItem = game.items.find(i =>
        i.name === entry.name && i.folder?.id === folder.id
      );

      if (!worldItem) {
        const fullItem = await pack.getDocument(entry._id);
        const data = fullItem.toObject();
        data.folder = folder.id;
        worldItem = await Item.create(data);
      }

      // Merge duplicates
      const existing = components.find(c => c.uuid === worldItem.uuid);
      if (existing) {
        existing.quantity++;
      } else {
        components.push({
          uuid: worldItem.uuid,
          name: worldItem.name,
          img: worldItem.img,
          quantity: 1
        });
      }
    }

    return components;
  }

  static async _ensureWorldFolders() {
    // Root folder
    let root = game.folders.find(f =>
      f.name === this.WORLD_FOLDER_NAME && f.type === "Item" && !f.folder
    );
    if (!root) {
      root = await Folder.create({ name: this.WORLD_FOLDER_NAME, type: "Item" });
    }

    // Level subfolders
    const levelFolders = {};
    for (const level of [1, 2, 3]) {
      const name = `lv${level}`;
      let folder = game.folders.find(f =>
        f.name === name && f.type === "Item" && f.folder?.id === root.id
      );
      if (!folder) {
        folder = await Folder.create({ name, type: "Item", folder: root.id });
      }
      levelFolders[level] = folder;
    }

    return levelFolders;
  }
}
