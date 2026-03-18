import { MODULE_ID } from "../shared/constants.mjs";

/**
 * Core logic for the Loot Generator feature.
 * Draws random items from compendium folders and adds them to an actor.
 */
export class LootSystem {

  /**
   * Default loot groups — each maps to one or more compendium folders.
   */
  static DEFAULT_GROUPS = [
    { label: "Componenti lv1", folders: ["lv1"] },
    { label: "Componenti lv2", folders: ["lv2"] },
    { label: "Componenti lv3", folders: ["lv3"] },
    { label: "Consumabili totali", folders: ["aggiuntivi", "alchemy", "Brewery", "Calligrafia", "Cucina", "erbalista", "Proiettili", "veleni"] },
    { label: "Armi e armature normali", folders: ["armi e armature normali"] },
    { label: "Armi danni +1", folders: ["danni +1"] },
    { label: "Colpire +1", folders: ["colpire +1"] },
    { label: "Colpire +2", folders: ["colpire +2"] },
    { label: "AD +1", folders: ["AD +1"] },
    { label: "PD +1", folders: ["PD +1"] }
  ];

  /**
   * Default gold ranges per difficulty tier.
   */
  static DEFAULT_GOLD_RANGES = [
    { label: "Very Low",  min: 0,    max: 200  },
    { label: "Low",       min: 200,  max: 500  },
    { label: "Medium",    min: 500,  max: 1000 },
    { label: "High",      min: 1000, max: 3000 },
    { label: "Very High", min: 3000, max: 5000 }
  ];

  /* ---------------------------------------- */
  /*  Compendium data                          */
  /* ---------------------------------------- */

  /**
   * Load the compendium index and build a folder map.
   * @returns {{ pack, index, folderMap: Map<string,string> } | null}
   */
  static async loadCompendium() {
    const compendiumName = game.settings.get(MODULE_ID, "lootCompendium");
    const pack = game.packs.find(p => p.metadata.label === compendiumName);
    if (!pack) {
      ui.notifications.error(
        game.i18n.format("LOOT.Error.CompendiumNotFound", { name: compendiumName })
      );
      return null;
    }

    const index = await pack.getIndex();
    const folderMap = new Map();
    pack.folders.forEach(f => folderMap.set(f.name, f.id));

    return { pack, index, folderMap };
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

  /**
   * Pick `count` random entries from a set of compendium folders.
   * @param {Array}  index
   * @param {Map}    folderMap
   * @param {string[]} folders  Folder names
   * @param {number} count      How many to draw
   * @returns {Array}           Drawn index entries
   */
  static drawItems(index, folderMap, folders, count) {
    const candidates = this.getEntriesFromFolders(index, folderMap, folders);
    if (candidates.length === 0) return [];

    const drawn = [];
    for (let i = 0; i < count; i++) {
      drawn.push(candidates[Math.floor(Math.random() * candidates.length)]);
    }
    return drawn;
  }

  /* ---------------------------------------- */
  /*  Gold                                     */
  /* ---------------------------------------- */

  /**
   * Generate a random gold amount for a given difficulty index.
   * @param {number} diffIndex  Index into the gold ranges array (-1 = none)
   * @returns {number}
   */
  static generateGold(diffIndex) {
    if (diffIndex < 0) return 0;
    const ranges = game.settings.get(MODULE_ID, "lootGoldRanges");
    const range = ranges[diffIndex];
    if (!range) return 0;
    return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
  }

  /**
   * Add gold to an actor's currency.
   * @param {Actor} actor
   * @param {number} gold
   */
  static async addGold(actor, gold) {
    if (gold <= 0) return;
    const currencyPath = game.settings.get(MODULE_ID, "lootCurrencyPath");
    const currentGold = foundry.utils.getProperty(actor.system, currencyPath.replace(/^system\./, "")) ?? 0;
    await actor.update({ [currencyPath]: currentGold + gold });
  }

  /* ---------------------------------------- */
  /*  Generation pipeline                      */
  /* ---------------------------------------- */

  /**
   * Full loot generation pipeline.
   * @param {CompendiumCollection} pack
   * @param {Array}  index
   * @param {Map}    folderMap
   * @param {Actor}  actor        Target actor to receive loot
   * @param {number[]} counts     Number of items to draw per group
   * @param {number} diffIndex    Difficulty index for gold (-1 = none)
   */
  static async generate(pack, index, folderMap, actor, counts, diffIndex) {
    const groups = game.settings.get(MODULE_ID, "lootGroups");

    // Gold
    const gold = this.generateGold(diffIndex);
    if (gold > 0) {
      await this.addGold(actor, gold);
      ui.notifications.info(
        game.i18n.format("LOOT.Info.GoldAdded", { gold, name: actor.name })
      );
    }

    // Draw items from each group
    for (let i = 0; i < groups.length; i++) {
      const count = counts[i] ?? 0;
      if (count <= 0) continue;

      const drawn = this.drawItems(index, folderMap, groups[i].folders, count);
      if (drawn.length === 0) {
        ui.notifications.warn(
          game.i18n.format("LOOT.Warn.NoItemsInGroup", { name: groups[i].label })
        );
        continue;
      }

      for (const entry of drawn) {
        try {
          const doc = await pack.getDocument(entry._id);
          await actor.createEmbeddedDocuments("Item", [doc.toObject()]);
          ui.notifications.info(
            game.i18n.format("LOOT.Info.ItemAdded", { name: doc.name })
          );
        } catch (err) {
          console.error("Faundryvtt Tools | Failed to add loot item:", err);
        }
      }
    }

    ui.notifications.info(game.i18n.localize("LOOT.Info.GenerationComplete"));
  }
}
