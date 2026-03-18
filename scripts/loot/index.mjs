import { MODULE_ID } from "../shared/constants.mjs";
import { HubMenu } from "../hub/HubMenu.mjs";
import { LootSystem } from "./LootSystem.mjs";
import { LootGenerator } from "./apps/LootGenerator.mjs";
import { LootSettings } from "./apps/LootSettings.mjs";

class LootSettingsLauncher extends FormApplication {
  constructor(...args) {
    super(...args);
    new LootSettings().render(true);
    this.close();
  }
  async _updateObject() {}
  render() { return this; }
}

/**
 * Initialize the Loot Generator feature.
 * Called once during module init.
 */
export function initLoot() {

  /* ---- Settings ---- */

  game.settings.register(MODULE_ID, "lootCompendium", {
    name: "LOOT.CompendiumName",
    hint: "LOOT.CompendiumHint",
    scope: "world",
    config: false,
    type: String,
    default: "Crafting & Consumables"
  });

  game.settings.register(MODULE_ID, "lootActorName", {
    name: "LOOT.ActorName",
    hint: "LOOT.ActorNameHint",
    scope: "world",
    config: false,
    type: String,
    default: "Tesoro"
  });

  game.settings.register(MODULE_ID, "lootCurrencyPath", {
    name: "LOOT.CurrencyPath",
    hint: "LOOT.CurrencyPathHint",
    scope: "world",
    config: false,
    type: String,
    default: "system.currency.gp"
  });

  game.settings.register(MODULE_ID, "lootGroups", {
    name: "LOOT.Groups",
    scope: "world",
    config: false,
    type: Array,
    default: LootSystem.DEFAULT_GROUPS
  });

  game.settings.register(MODULE_ID, "lootGoldRanges", {
    name: "LOOT.GoldRanges",
    scope: "world",
    config: false,
    type: Array,
    default: LootSystem.DEFAULT_GOLD_RANGES
  });

  game.settings.registerMenu(MODULE_ID, "lootSettingsMenu", {
    name: "LOOT.SettingsTitle",
    label: "LOOT.OpenSettings",
    hint: "LOOT.SettingsHint",
    icon: "fas fa-cog",
    type: LootSettingsLauncher,
    restricted: true
  });

  /* ---- Hub registration ---- */

  HubMenu.registerFeature({
    id: "loot",
    icon: "fas fa-coins",
    name: "LOOT.FeatureName",
    description: "LOOT.FeatureDescription",
    open: () => new LootGenerator().render(true)
  });

  /* ---- Public API ---- */

  game.faundryvttTools.loot = {
    LootSystem,
    LootGenerator,
    LootSettings,
    openGenerator() {
      new LootGenerator().render(true);
    }
  };

  console.log("Faundryvtt Tools | Loot feature initialized");
}
