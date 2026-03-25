import { MODULE_ID } from "../shared/constants.mjs";
import { HubMenu } from "../hub/HubMenu.mjs";
import { SavingThrowSystem } from "./SavingThrowSystem.mjs";
import { SavingThrowRequest } from "./apps/SavingThrowRequest.mjs";

/**
 * Initialize the Saving Throw feature.
 * Called once during module init.
 */
export function initSavingThrow() {

  /* ---- Hub registration ---- */

  HubMenu.registerFeature({
    id: "savingThrow",
    icon: "fas fa-shield-alt",
    name: "SAVING_THROW.FeatureName",
    description: "SAVING_THROW.FeatureDescription",
    open: () => new SavingThrowRequest().render(true)
  });

  /* ---- Socket (needs game.socket → wait for ready) ---- */

  Hooks.once("ready", () => {
    SavingThrowSystem.setupSocket();
  });

  /* ---- Public API ---- */

  game.faundryvttTools.savingThrow = {
    SavingThrowSystem,
    SavingThrowRequest,
    open() { new SavingThrowRequest().render(true); }
  };

  console.log("Faundryvtt Tools | Saving Throw feature initialized");
}
