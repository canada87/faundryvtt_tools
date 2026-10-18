import { MODULE_ID } from "../shared/constants.mjs";
import { HubMenu } from "../hub/HubMenu.mjs";
import { SceneNavSystem } from "./SceneNavSystem.mjs";
import { SceneNavTab } from "./SceneNavTab.mjs";
import { SceneNavigator } from "./apps/SceneNavigator.mjs";
import { SceneLinksEditor } from "./apps/SceneLinksEditor.mjs";

/**
 * Initialize the Scene Navigator feature.
 * Disabled by default: the GM turns it on from the module settings.
 */
export function initSceneNav() {

  /* ---- Settings ---- */

  game.settings.register(MODULE_ID, "scenesNavEnabled", {
    name: "SCENENAV.Settings.Enabled.Name",
    hint: "SCENENAV.Settings.Enabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    requiresReload: true
  });

  game.settings.register(MODULE_ID, "scenesNavData", {
    name: "Scene Navigator Data",
    scope: "world",
    config: false,
    type: Object,
    default: { folders: [], sceneMeta: {}, links: [] },
    onChange: () => SceneNavigator.refresh()
  });

  game.settings.register(MODULE_ID, "scenesNavCardSize", {
    name: "Scene Navigator Card Size",
    scope: "client",
    config: false,
    type: Number,
    default: 220
  });

  game.settings.register(MODULE_ID, "scenesNavCollapsed", {
    name: "Scene Navigator Collapsed Folders",
    scope: "client",
    config: false,
    type: Array,
    default: []
  });

  if (!SceneNavSystem.isEnabled()) return;

  /* ---- Keybinding (GM only) ---- */

  game.keybindings.register(MODULE_ID, "scenesNavToggle", {
    name: "SCENENAV.Toggle",
    editable: [{ key: "KeyN", modifiers: ["Shift"] }],
    restricted: true,
    onDown: () => {
      SceneNavigator.toggle();
      return true;
    }
  });

  /* ---- Hub registration ---- */

  HubMenu.registerFeature({
    id: "scene-nav",
    icon: "fas fa-map",
    name: "SCENENAV.FeatureName",
    description: "SCENENAV.FeatureDescription",
    open: () => SceneNavigator.toggle()
  });

  /* ---- Lifecycle ---- */

  Hooks.once("ready", () => SceneNavTab.init());

  for (const hook of ["createScene", "updateScene", "updateUser", "userConnected", "canvasReady"]) {
    Hooks.on(hook, () => SceneNavigator.refresh());
  }

  Hooks.on("deleteScene", (scene) => {
    SceneNavigator.refresh();
    if (game.user.isActiveGM) SceneNavSystem.pruneScene(scene.id);
  });

  /* ---- Public API ---- */

  game.faundryvttTools.sceneNav = {
    SceneNavSystem,
    SceneNavigator,
    SceneLinksEditor,
    toggle() {
      SceneNavigator.toggle();
    }
  };

  console.log("Faundryvtt Tools | Scene Navigator feature initialized");
}
