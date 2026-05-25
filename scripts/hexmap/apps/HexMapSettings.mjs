import { MODULE_ID } from "../../shared/constants.mjs";
import { HexMapSystem, TERRAIN_TYPES } from "../HexMapSystem.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class HexMapSettings extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "faundryvtt-hexmap-settings",
    classes: ["faundryvtt-tools", "hexmap-settings"],
    window: {
      icon: "fas fa-cog",
      title: "HEXMAP.SettingsTitle",
      resizable: true
    },
    position: { width: 620, height: "auto" },
    actions: {
      save: HexMapSettings.#onSave
    }
  };

  static PARTS = {
    settings: {
      template: `modules/${MODULE_ID}/templates/hexmap/hexmap-settings.hbs`
    }
  };

  async _prepareContext() {
    const settings = HexMapSystem.getSettings();
    return {
      terrainTypes: TERRAIN_TYPES.map(t => ({
        id:     t.id,
        label:  game.i18n.localize(t.labelKey),
        folder: settings.terrainFolders[t.id] ?? ""
      })),
      poiFolder: settings.poiFolder ?? ""
    };
  }

  static async #onSave(event, target) {
    const root = this.element;
    const terrainFolders = {};
    root.querySelectorAll("[data-terrain-id]").forEach(input => {
      terrainFolders[input.dataset.terrainId] = input.value.trim();
    });
    const poiFolder = root.querySelector("[data-field='poiFolder']")?.value.trim() ?? "";
    const current = HexMapSystem.getSettings();
    await HexMapSystem.saveSettings({ ...current, terrainFolders, poiFolder });
    ui.notifications.info(game.i18n.localize("HEXMAP.Info.SettingsSaved"));
    this.close();
  }
}
