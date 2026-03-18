import { MODULE_ID } from "../shared/constants.mjs";
import { HubMenu } from "../hub/HubMenu.mjs";
import { EncounterSystem } from "./EncounterSystem.mjs";
import { EncounterGenerator } from "./apps/EncounterGenerator.mjs";
import { EncounterSettings } from "./apps/EncounterSettings.mjs";

class EncounterSettingsLauncher extends FormApplication {
  constructor(...args) {
    super(...args);
    new EncounterSettings().render(true);
    this.close();
  }
  async _updateObject() {}
  render() { return this; }
}

/**
 * Initialize the Random Encounters feature.
 * Called once during module init.
 */
export function initEncounters() {

  /* ---- Settings ---- */

  game.settings.register(MODULE_ID, "encounterCompendium", {
    name: "ENCOUNTERS.CompendiumName",
    hint: "ENCOUNTERS.CompendiumHint",
    scope: "world",
    config: false,
    type: String,
    default: "canadavtt.Monsters"
  });

  game.settings.register(MODULE_ID, "encounterCreatureTypePath", {
    name: "ENCOUNTERS.CreatureTypePath",
    hint: "ENCOUNTERS.CreatureTypePathHint",
    scope: "world",
    config: false,
    type: String,
    default: "system.details.creatureType"
  });

  game.settings.register(MODULE_ID, "encounterTargetFolder", {
    name: "ENCOUNTERS.TargetFolder",
    hint: "ENCOUNTERS.TargetFolderHint",
    scope: "world",
    config: false,
    type: String,
    default: "mostri"
  });

  game.settings.register(MODULE_ID, "encounterGroups", {
    name: "ENCOUNTERS.Groups",
    scope: "world",
    config: false,
    type: Array,
    default: EncounterSystem.DEFAULT_GROUPS
  });

  game.settings.register(MODULE_ID, "encounterScenarios", {
    name: "ENCOUNTERS.Scenarios",
    scope: "world",
    config: false,
    type: Array,
    default: EncounterSystem.DEFAULT_SCENARIOS
  });

  game.settings.registerMenu(MODULE_ID, "encounterSettingsMenu", {
    name: "ENCOUNTERS.SettingsTitle",
    label: "ENCOUNTERS.OpenSettings",
    hint: "ENCOUNTERS.SettingsHint",
    icon: "fas fa-cog",
    type: EncounterSettingsLauncher,
    restricted: true
  });

  /* ---- Hub registration ---- */

  HubMenu.registerFeature({
    id: "encounters",
    icon: "fas fa-dice-d20",
    name: "ENCOUNTERS.FeatureName",
    description: "ENCOUNTERS.FeatureDescription",
    open: () => new EncounterGenerator().render(true)
  });

  /* ---- Public API ---- */

  game.faundryvttTools.encounters = {
    EncounterSystem,
    EncounterGenerator,
    EncounterSettings,
    openGenerator() {
      new EncounterGenerator().render(true);
    }
  };

  console.log("Faundryvtt Tools | Encounters feature initialized");
}
