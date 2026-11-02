import { MODULE_ID } from "../shared/constants.mjs";
import { HubMenu } from "../hub/HubMenu.mjs";
import { PartySystem } from "./PartySystem.mjs";
import { PartyPlacer } from "./apps/PartyPlacer.mjs";

/**
 * Initialize the Party Placer feature.
 * Called once during module init.
 */
export function initParty() {

  /* ---- Settings ---- */

  game.settings.register(MODULE_ID, "partyEnabled", {
    name: "PARTY.Settings.Enabled.Name",
    hint: "PARTY.Settings.Enabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  if (!game.settings.get(MODULE_ID, "partyEnabled")) return;

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
