import { MODULE_ID } from "../shared/constants.mjs";
import { HubMenu } from "../hub/HubMenu.mjs";
import { MindMapSystem } from "./MindMapSystem.mjs";
import { MindMapApp } from "./apps/MindMapApp.mjs";

export function initMindMap() {

  /* ---- Settings ---- */

  game.settings.register(MODULE_ID, "mindmapBoards", {
    name: "Mind Map Boards",
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  /* ---- Hub registration ---- */

  HubMenu.registerFeature({
    id: "mindmap",
    icon: "fas fa-project-diagram",
    name: "MINDMAP.FeatureName",
    description: "MINDMAP.FeatureDescription",
    open: () => new MindMapApp().render(true)
  });

  /* ---- Public API ---- */

  game.faundryvttTools.mindmap = {
    MindMapSystem,
    MindMapApp,
    openMindMap() {
      new MindMapApp().render(true);
    }
  };

  console.log("Faundryvtt Tools | Mind Map feature initialized");
}
