import { MODULE_ID } from "../shared/constants.mjs";
import { HubMenu } from "../hub/HubMenu.mjs";
import { HexMapSystem } from "./HexMapSystem.mjs";
import { HexMapGenerator } from "./apps/HexMapGenerator.mjs";
import { HexMapSettings } from "./apps/HexMapSettings.mjs";

class HexMapSettingsLauncher extends FormApplication {
  constructor(...args) {
    super(...args);
    new HexMapSettings().render(true);
    this.close();
  }
  async _updateObject() {}
  render() { return this; }
}

export function initHexMap() {

  game.settings.register(MODULE_ID, "hexmapSettings", {
    name: "HexMap Settings",
    scope: "world",
    config: false,
    type: Object,
    default: HexMapSystem.getDefaultSettings()
  });

  game.settings.registerMenu(MODULE_ID, "hexmapTerrainSettings", {
    name: "HEXMAP.SettingsMenuName",
    label: "HEXMAP.SettingsMenuLabel",
    hint: "HEXMAP.SettingsMenuHint",
    icon: "fas fa-map",
    type: HexMapSettingsLauncher,
    restricted: true
  });

  HubMenu.registerFeature({
    id: "hexmap",
    icon: "fas fa-map",
    name: "HEXMAP.FeatureName",
    description: "HEXMAP.FeatureDescription",
    open: () => {
      if (!game.user.isGM) return;
      new HexMapGenerator().render(true);
    }
  });

  game.faundryvttTools.hexmap = {
    HexMapSystem,
    HexMapGenerator,
    HexMapSettings,
    open() {
      if (game.user.isGM) new HexMapGenerator().render(true);
    }
  };

  console.log("Faundryvtt Tools | HexMap feature initialized");
}
