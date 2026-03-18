import { HubMenu } from "../hub/HubMenu.mjs";
import { PartySystem } from "./PartySystem.mjs";
import { PartyPlacer } from "./apps/PartyPlacer.mjs";

/**
 * Initialize the Party Placer feature.
 * Called once during module init.
 */
export function initParty() {

  /* ---- Hub registration ---- */

  HubMenu.registerFeature({
    id: "party",
    icon: "fas fa-users",
    name: "PARTY.FeatureName",
    description: "PARTY.FeatureDescription",
    open: () => new PartyPlacer().render(true)
  });

  /* ---- Public API ---- */

  game.faundryvttTools.party = {
    PartySystem,
    PartyPlacer,
    openPlacer() {
      new PartyPlacer().render(true);
    }
  };

  console.log("Faundryvtt Tools | Party feature initialized");
}
