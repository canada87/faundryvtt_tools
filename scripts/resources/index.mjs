import { MODULE_ID } from "../shared/constants.mjs";
import { HubMenu } from "../hub/HubMenu.mjs";
import { ResourceSystem } from "./ResourceSystem.mjs";
import { ResourcesHUD } from "./ResourcesHUD.mjs";
import { ResourceManager } from "./apps/ResourceManager.mjs";

/**
 * Initialize the Resources feature.
 * Called once during module init.
 */
export function initResources() {

  /* ---- Settings ---- */

  game.settings.register(MODULE_ID, "resources", {
    name: "Resources",
    scope: "world",
    config: false,
    type: Array,
    default: [],
    onChange: () => {
      ResourcesHUD.render();
      const mgr = Object.values(ui.windows ?? {}).find(w => w instanceof ResourceManager);
      if (mgr) mgr.render();
      const v2 = foundry.applications?.instances;
      if (v2) {
        for (const app of v2.values()) {
          if (app instanceof ResourceManager) app.render();
        }
      }
    }
  });

  /* ---- Hub registration (GM only sees the manager) ---- */

  HubMenu.registerFeature({
    id: "resources",
    icon: "fas fa-list-ol",
    name: "RESOURCES.FeatureName",
    description: "RESOURCES.FeatureDescription",
    open: () => {
      if (!game.user.isGM) return;
      new ResourceManager().render(true);
    }
  });

  /* ---- HUD lifecycle ---- */

  Hooks.once("ready", () => {
    ResourcesHUD.init();
  });

  /* ---- Public API ---- */

  game.faundryvttTools.resources = {
    ResourceSystem,
    ResourcesHUD,
    ResourceManager,
    open() {
      if (game.user.isGM) new ResourceManager().render(true);
    }
  };

  console.log("Faundryvtt Tools | Resources feature initialized");
}
