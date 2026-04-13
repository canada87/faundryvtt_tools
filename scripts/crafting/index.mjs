import { MODULE_ID } from "../shared/constants.mjs";
import { HubMenu } from "../hub/HubMenu.mjs";
import { CraftingSystem } from "./CraftingSystem.mjs";
import { ComponentGenerator } from "./ComponentGenerator.mjs";
import { RecipeBook } from "./apps/RecipeBook.mjs";
import { RecipeEditor } from "./apps/RecipeEditor.mjs";
import { RecipeManager } from "./apps/RecipeManager.mjs";
import { RaritySettings } from "./apps/RaritySettings.mjs";
import { GeneratorSettings } from "./apps/GeneratorSettings.mjs";

class RaritySettingsLauncher extends FormApplication {
  constructor(...args) {
    super(...args);
    new RaritySettings().render(true);
    this.close();
  }
  async _updateObject() {}
  render() { return this; }
}

class GeneratorSettingsLauncher extends FormApplication {
  constructor(...args) {
    super(...args);
    new GeneratorSettings().render(true);
    this.close();
  }
  async _updateObject() {}
  render() { return this; }
}

/**
 * Initialize the Crafting feature.
 * Called once during module init.
 */
export function initCrafting() {

  /* ---- Settings ---- */

  game.settings.register(MODULE_ID, "craftingRecipes", {
    name: "Recipes",
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  game.settings.register(MODULE_ID, "craftingRarities", {
    name: "CRAFTING.RaritySettings",
    scope: "world",
    config: false,
    type: Object,
    default: ComponentGenerator.DEFAULT_RARITIES
  });

  game.settings.register(MODULE_ID, "craftingGeneratorConfig", {
    name: "CRAFTING.GeneratorSettings",
    scope: "world",
    config: false,
    type: Object,
    default: ComponentGenerator.DEFAULT_CONFIG
  });

  game.settings.registerMenu(MODULE_ID, "raritySettingsMenu", {
    name: "CRAFTING.RaritySettings",
    label: "CRAFTING.OpenRaritySettings",
    hint: "CRAFTING.RaritySettingsHint",
    icon: "fas fa-sliders-h",
    type: RaritySettingsLauncher,
    restricted: true
  });

  game.settings.registerMenu(MODULE_ID, "generatorSettingsMenu", {
    name: "CRAFTING.GeneratorSettings",
    label: "CRAFTING.OpenGeneratorSettings",
    hint: "CRAFTING.GeneratorSettingsHint",
    icon: "fas fa-cogs",
    type: GeneratorSettingsLauncher,
    restricted: true
  });

  /* ---- Hub registration ---- */

  HubMenu.registerFeature({
    id: "crafting",
    icon: "fas fa-flask",
    name: "CRAFTING.FeatureName",
    description: "CRAFTING.FeatureDescription",
    open: () => new RecipeManager().render(true)
  });

  /* ---- Public API ---- */

  game.faundryvttTools.crafting = {
    CraftingSystem,
    RecipeBook,
    RecipeEditor,
    RecipeManager,
    openRecipeBook(actor) {
      if (!actor) {
        ui.notifications.warn(game.i18n.localize("CRAFTING.Warn.NoActor"));
        return;
      }
      new RecipeBook({ actor }).render(true);
    },
    openRecipeManager() {
      new RecipeManager().render(true);
    }
  };

  /* ---- Actor sheet header button (all users) ---- */

  // Legacy ActorSheet (e.g. DC20 and most non-dnd5e systems)
  Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
    buttons.unshift({
      label: game.i18n.localize("CRAFTING.RecipeBook"),
      class: "open-recipe-book",
      icon: "fas fa-hammer",
      onclick: () => new RecipeBook({ actor: sheet.document }).render(true)
    });
  });

  // ApplicationV2-based sheets (e.g. D&D 5e v3+ on FoundryVTT v13)
  Hooks.on("getApplicationHeaderButtons", (app, buttons) => {
    console.log("Faundryvtt Tools | getApplicationHeaderButtons fired", app?.constructor?.name, app?.document?.constructor?.name);
    if (!app.document || !(app.document instanceof Actor)) return;
    buttons.unshift({
      label: game.i18n.localize("CRAFTING.RecipeBook"),
      class: "open-recipe-book",
      icon: "fas fa-hammer",
      onclick: () => new RecipeBook({ actor: app.document }).render(true)
    });
  });

  // DEBUG: log every render hook that fires with an Actor document
  Hooks.on("renderApplication", (app, html) => {
    if (app.document instanceof Actor) {
      console.log("Faundryvtt Tools | renderApplication (Actor sheet):", app?.constructor?.name);
    }
  });

  console.log("Faundryvtt Tools | Crafting feature initialized");
}
