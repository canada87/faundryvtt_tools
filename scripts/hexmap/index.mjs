import { MODULE_ID } from "../shared/constants.mjs";
import { HubMenu } from "../hub/HubMenu.mjs";
import { HexMapSystem } from "./HexMapSystem.mjs";
import { HexMapGenerator } from "./apps/HexMapGenerator.mjs";
import { HexMapSettings } from "./apps/HexMapSettings.mjs";

export function initHexMap() {

  game.settings.register(MODULE_ID, "hexmapSettings", {
    name: "HexMap Settings",
    scope: "world",
    config: false,
    type: Object,
    default: HexMapSystem.getDefaultSettings()
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
