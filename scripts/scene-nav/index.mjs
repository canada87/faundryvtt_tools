import { MODULE_ID } from "../shared/constants.mjs";
import { HubMenu } from "../hub/HubMenu.mjs";
import { SceneNavSystem } from "./SceneNavSystem.mjs";
import { SceneNavBar } from "./SceneNavBar.mjs";
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
    default: { sceneMeta: {}, links: [] },
    onChange: () => {
      if (!SceneNavSystem.isEnabled()) return;
      SceneNavigator.refresh();
      SceneNavBar.render();
    }
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

  game.settings.register(MODULE_ID, "scenesNavMode", {
    name: "Scene Navigator Mode",
    scope: "client",
    config: false,
    type: String,
    default: "grid"
  });

  game.settings.register(MODULE_ID, "scenesNavGraphGroups", {
    name: "Scene Navigator Graph Folder Boxes",
    scope: "client",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "scenesNavGraphSnap", {
    name: "Scene Navigator Graph Snap",
    scope: "client",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "scenesNavBarCollapsed", {
    name: "Scene Navigator Bar Collapsed",
    scope: "client",
    config: false,
    type: Boolean,
    default: false
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

  /* ---- Socket (every client, so players can be pulled) ---- */

  Hooks.once("ready", () => SceneNavSystem.setupSocket());

  /* ---- Lifecycle ---- */

  for (const hook of ["createScene", "updateScene", "updateUser", "userConnected", "canvasReady"]) {
    Hooks.on(hook, () => SceneNavigator.refresh());
  }

  for (const hook of ["createFolder", "updateFolder", "deleteFolder"]) {
    Hooks.on(hook, (folder) => {
      if (folder.type === "Scene") SceneNavigator.refresh();
    });
  }

  // In-scene navigation bar (GM only)
  Hooks.on("canvasReady", () => SceneNavBar.render());
  Hooks.on("updateScene", (scene, changes) => {
    if ("name" in changes || "journal" in changes || "journalEntryPage" in changes) SceneNavBar.render();
  });

  // Player positions and scene notes are shown in both the panel and the bar
  const refreshAll = foundry.utils.debounce(() => {
    SceneNavigator.refresh();
    SceneNavBar.render();
  }, 150);
  const hooks = [
    "userActivity", "renderSceneNavigation", "updateUser", "userConnected",
    "updateJournalEntry", "deleteJournalEntry",
    "createJournalEntryPage", "updateJournalEntryPage", "deleteJournalEntryPage"
  ];
  for (const hook of hooks) Hooks.on(hook, () => refreshAll());

  Hooks.on("deleteScene", (scene) => {
    SceneNavigator.refresh();
    if (game.user.isActiveGM) SceneNavSystem.pruneScene(scene.id);
  });

  /* ---- Public API ---- */

  game.faundryvttTools.sceneNav = {
    SceneNavSystem,
    SceneNavigator,
    SceneLinksEditor,
    SceneNavBar,
    toggle() {
      SceneNavigator.toggle();
    }
  };

  console.log("Faundryvtt Tools | Scene Navigator feature initialized");
}
