import { MODULE_ID } from "../shared/constants.mjs";
import { HubMenu } from "../hub/HubMenu.mjs";
import { CraftingSystem } from "./CraftingSystem.mjs";
import { RecipeBook } from "./apps/RecipeBook.mjs";
import { RecipeEditor } from "./apps/RecipeEditor.mjs";
import { RecipeManager } from "./apps/RecipeManager.mjs";

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

  Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
    buttons.unshift({
      label: game.i18n.localize("CRAFTING.RecipeBook"),
      class: "open-recipe-book",
      icon: "fas fa-hammer",
      onclick: () => new RecipeBook({ actor: sheet.document }).render(true)
    });
  });

  console.log("Faundryvtt Tools | Crafting feature initialized");
}
