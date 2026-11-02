import { MODULE_ID } from "../shared/constants.mjs";
import { HubMenu } from "../hub/HubMenu.mjs";
import { MindMapSystem } from "./MindMapSystem.mjs";
import { MindMapApp } from "./apps/MindMapApp.mjs";
import { MindMapBrowser } from "./apps/MindMapBrowser.mjs";

export function initMindMap() {

  /* ---- Settings ---- */

  game.settings.register(MODULE_ID, "mindmapEnabled", {
    name: "MINDMAP.Settings.Enabled.Name",
    hint: "MINDMAP.Settings.Enabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  game.settings.register(MODULE_ID, "mindmapBoards", {
    name: "Mind Map Boards",
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  if (!game.settings.get(MODULE_ID, "mindmapEnabled")) return;

  /* ---- Hub registration ---- */

  HubMenu.registerFeature({
    id: "mindmap",
    icon: "fas fa-project-diagram",
    name: "MINDMAP.FeatureName",
    description: "MINDMAP.FeatureDescription",
    open: () => new MindMapBrowser().render(true)
  });

  /* ---- Public API ---- */

  game.faundryvttTools.mindmap = {
    MindMapSystem,
    MindMapApp,
    MindMapBrowser,
    openMindMap() {
      new MindMapBrowser().render(true);
    }
  };

  console.log("Faundryvtt Tools | Mind Map feature initialized");
}
