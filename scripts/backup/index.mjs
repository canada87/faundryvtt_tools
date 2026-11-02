import { MODULE_ID } from "../shared/constants.mjs";
import { HubMenu } from "../hub/HubMenu.mjs";
import { BackupSystem } from "./BackupSystem.mjs";
import { BackupApp } from "./apps/BackupApp.mjs";

export function initBackup() {

  /* ---- Settings ---- */

  game.settings.register(MODULE_ID, "backupEnabled", {
    name: "BACKUP.Settings.Enabled.Name",
    hint: "BACKUP.Settings.Enabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  if (!game.settings.get(MODULE_ID, "backupEnabled")) return;

  /* ---- Hub registration ---- */

  HubMenu.registerFeature({
    id: "backup",
    icon: "fas fa-archive",
    name: "BACKUP.FeatureName",
    description: "BACKUP.FeatureDescription",
    open: () => new BackupApp().render(true)
  });

  /* ---- Public API ---- */

  game.faundryvttTools.backup = {
    BackupSystem,
    BackupApp,
    openBackup() {
      new BackupApp().render(true);
    }
  };

  console.log("Faundryvtt Tools | Backup feature initialized");
}
