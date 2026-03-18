import { MODULE_ID } from "../shared/constants.mjs";
import { HubMenu } from "../hub/HubMenu.mjs";
import { LightingSystem } from "./LightingSystem.mjs";
import { LightingControl } from "./apps/LightingControl.mjs";
import { LightingSettings } from "./apps/LightingSettings.mjs";

class LightingSettingsLauncher extends FormApplication {
  constructor(...args) {
    super(...args);
    new LightingSettings().render(true);
    this.close();
  }
  async _updateObject() {}
  render() { return this; }
}

/**
 * Initialize the Lighting Control feature.
 * Called once during module init.
 */
export function initLighting() {

  /* ---- Settings ---- */

  game.settings.register(MODULE_ID, "lightingPresets", {
    name: "LIGHTING.Presets",
    scope: "world",
    config: false,
    type: Array,
    default: LightingSystem.DEFAULT_PRESETS
  });

  game.settings.register(MODULE_ID, "lightingDarknessLevels", {
    name: "LIGHTING.DarknessLevels",
    scope: "world",
    config: false,
    type: Array,
    default: LightingSystem.DEFAULT_DARKNESS_LEVELS
  });

  game.settings.registerMenu(MODULE_ID, "lightingSettingsMenu", {
    name: "LIGHTING.SettingsTitle",
    label: "LIGHTING.OpenSettings",
    hint: "LIGHTING.SettingsHint",
    icon: "fas fa-cog",
    type: LightingSettingsLauncher,
    restricted: true
  });

  /* ---- Hub registration ---- */

  HubMenu.registerFeature({
    id: "lighting",
    icon: "fas fa-lightbulb",
    name: "LIGHTING.FeatureName",
    description: "LIGHTING.FeatureDescription",
    open: () => new LightingControl().render(true)
  });

  /* ---- Public API ---- */

  game.faundryvttTools.lighting = {
    LightingSystem,
    LightingControl,
    LightingSettings,
    openControl() {
      new LightingControl().render(true);
    }
  };

  console.log("Faundryvtt Tools | Lighting feature initialized");
}
