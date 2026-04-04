import { HubMenu } from "../hub/HubMenu.mjs";
import { BackupSystem } from "./BackupSystem.mjs";
import { BackupApp } from "./apps/BackupApp.mjs";

export function initBackup() {

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
