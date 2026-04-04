import { MODULE_ID } from "../shared/constants.mjs";

const BACKUP_VERSION = "1.0.0";

/**
 * Maps feature IDs to the world-level setting keys they own.
 */
const SETTING_MAP = {
  crafting: ["craftingRecipes", "craftingRarities"],
  mindmap: ["mindmapBoards"],
  encounters: [
    "encounterCompendium",
    "encounterCreatureTypePath",
    "encounterLevelPath",
    "encounterTargetFolder",
    "encounterGroups",
    "encounterScenarios"
  ],
  loot: ["lootCompendium", "lootActorName", "lootCurrencyPath", "lootGroups", "lootGoldRanges"],
  lighting: ["lightingPresets", "lightingDarknessLevels"]
};

export class BackupSystem {

  static SETTING_MAP = SETTING_MAP;

  /* -------- Export -------- */

  /**
   * Build a backup object from the current world state and trigger a JSON download.
   * @param {string[]} features  Feature IDs to include (e.g. ["crafting", "mindmap"])
   */
  static async exportBackup(features) {
    const backup = {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      features: {}
    };

    for (const featureId of features) {
      const keys = SETTING_MAP[featureId];
      if (!keys) continue;

      const data = {};
      for (const key of keys) {
        try {
          data[key] = game.settings.get(MODULE_ID, key);
        } catch {
          // Setting not registered in this installation — skip silently
        }
      }

      // Crafting: also snapshot per-actor recipe assignments
      if (featureId === "crafting") {
        data.actorRecipes = {};
        for (const actor of game.actors) {
          const ids = actor.getFlag(MODULE_ID, "crafting.recipes");
          if (Array.isArray(ids) && ids.length) {
            data.actorRecipes[actor.name] = ids;
          }
        }
      }

      backup.features[featureId] = data;
    }

    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `faundryvtt-backup-${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* -------- Import -------- */

  /**
   * Restore settings (and actor flags) from a parsed backup object.
   * @param {object}   backup    Parsed backup JSON
   * @param {string[]} features  Feature IDs to restore
   * @returns {{ restored: string[], errors: string[] }}
   */
  static async importBackup(backup, features) {
    const restored = [];
    const errors = [];

    for (const featureId of features) {
      const data = backup.features?.[featureId];
      if (!data) {
        errors.push(`"${featureId}" non presente nel backup`);
        continue;
      }

      const keys = SETTING_MAP[featureId];
      if (!keys) continue;

      for (const key of keys) {
        if (data[key] === undefined) continue;
        try {
          await game.settings.set(MODULE_ID, key, data[key]);
          restored.push(key);
        } catch (e) {
          errors.push(`${key}: ${e.message}`);
        }
      }

      // Crafting: restore per-actor recipe assignments
      if (featureId === "crafting" && data.actorRecipes) {
        for (const [actorName, recipeIds] of Object.entries(data.actorRecipes)) {
          const actor = game.actors.getName(actorName);
          if (actor) {
            await actor.setFlag(MODULE_ID, "crafting.recipes", recipeIds);
            restored.push(`crafting.recipes → ${actorName}`);
          } else {
            errors.push(`Attore "${actorName}" non trovato — assegnazioni ricette saltate`);
          }
        }
      }
    }

    return { restored, errors };
  }

  /* -------- File parsing -------- */

  /**
   * Read and parse a backup .json File selected by the user.
   * @param {File} file
   * @returns {Promise<object>}
   */
  static parseBackupFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          resolve(JSON.parse(e.target.result));
        } catch {
          reject(new Error("File JSON non valido"));
        }
      };
      reader.onerror = () => reject(new Error("Errore lettura file"));
      reader.readAsText(file);
    });
  }
}
