import { MODULE_ID } from "../../shared/constants.mjs";
import { BackupSystem } from "../BackupSystem.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class BackupApp extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "faundryvtt-backup",
    classes: ["faundryvtt-tools", "backup-app"],
    window: {
      title: "BACKUP.AppTitle",
      icon: "fas fa-archive",
      resizable: false
    },
    position: {
      width: 440,
      height: "auto"
    },
    actions: {
      exportBackup: BackupApp.#onExport,
      importBackup: BackupApp.#onImport
    }
  };

  static PARTS = {
    app: {
      template: `modules/${MODULE_ID}/templates/backup/backup-app.hbs`
    }
  };

  static FEATURES = [
    { id: "crafting",   labelKey: "BACKUP.FeatureCrafting" },
    { id: "mindmap",    labelKey: "BACKUP.FeatureMindMap" },
    { id: "encounters", labelKey: "BACKUP.FeatureEncounters" },
    { id: "loot",       labelKey: "BACKUP.FeatureLoot" },
    { id: "lighting",   labelKey: "BACKUP.FeatureLighting" }
  ];

  async _prepareContext(options) {
    return {
      features: BackupApp.FEATURES.map(f => ({
        id: f.id,
        label: game.i18n.localize(f.labelKey)
      }))
    };
  }

  /** Collect checked feature IDs from the form. */
  #getCheckedFeatures() {
    return [...this.element.querySelectorAll("input[name='features']:checked")]
      .map(cb => cb.value);
  }

  static async #onExport(event, target) {
    const features = this.#getCheckedFeatures();
    if (!features.length) {
      ui.notifications.warn(game.i18n.localize("BACKUP.Warn.NoFeatures"));
      return;
    }
    await BackupSystem.exportBackup(features);
    ui.notifications.info(game.i18n.localize("BACKUP.Info.Exported"));
  }

  static async #onImport(event, target) {
    const input = this.element.querySelector(".backup-file-input");
    const file = input?.files?.[0];
    if (!file) {
      ui.notifications.warn(game.i18n.localize("BACKUP.Warn.NoFile"));
      return;
    }

    const features = this.#getCheckedFeatures();
    if (!features.length) {
      ui.notifications.warn(game.i18n.localize("BACKUP.Warn.NoFeatures"));
      return;
    }

    let backup;
    try {
      backup = await BackupSystem.parseBackupFile(file);
    } catch (e) {
      ui.notifications.error(e.message);
      return;
    }

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("BACKUP.Confirm.ImportTitle") },
      content: `<p>${game.i18n.localize("BACKUP.Confirm.ImportBody")}</p>`
    });
    if (!confirmed) return;

    const { restored, errors } = await BackupSystem.importBackup(backup, features);

    if (errors.length) {
      for (const err of errors) console.warn("Faundryvtt Tools | Backup import:", err);
      ui.notifications.warn(
        game.i18n.format("BACKUP.Warn.PartialImport", { count: errors.length })
      );
    } else {
      ui.notifications.info(
        game.i18n.format("BACKUP.Info.Imported", { count: restored.length })
      );
    }

    if (input) input.value = "";
  }
}
