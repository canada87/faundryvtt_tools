import { MODULE_ID } from "../../shared/constants.mjs";
import { CraftingSystem } from "../CraftingSystem.mjs";
import { RecipeEditor } from "./RecipeEditor.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM-only window that lists all recipes and lets the GM
 * create, edit, delete, and assign recipes to actors.
 */
export class RecipeManager extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "crafting-recipe-manager",
    classes: ["crafting", "recipe-manager"],
    window: {
      title: "CRAFTING.RecipeManager",
      icon: "fas fa-flask",
      resizable: true
    },
    position: {
      width: 700,
      height: 550
    },
    actions: {
      createRecipe: RecipeManager.#onCreate,
      editRecipe: RecipeManager.#onEdit,
      deleteRecipe: RecipeManager.#onDelete,
      assignRecipe: RecipeManager.#onAssign
    }
  };

  static PARTS = {
    recipes: {
      template: `modules/${MODULE_ID}/templates/crafting/recipe-manager.hbs`
    }
  };

  async _prepareContext(options) {
    const recipes = CraftingSystem.getRecipes();
    return {
      recipes,
      isEmpty: recipes.length === 0
    };
  }

  /* ---------------------------------------- */
  /*  Actions                                 */
  /* ---------------------------------------- */

  static async #onCreate() {
    new RecipeEditor({ onSave: () => this.render() }).render(true);
  }

  static async #onEdit(event, target) {
    const recipeId = target.closest("[data-recipe-id]").dataset.recipeId;
    const recipe = CraftingSystem.getRecipes().find(r => r.id === recipeId);
    if (!recipe) return;

    new RecipeEditor({
      recipeId: recipe.id,
      recipeData: foundry.utils.deepClone(recipe),
      onSave: () => this.render()
    }).render(true);
  }

  static async #onDelete(event, target) {
    const recipeId = target.closest("[data-recipe-id]").dataset.recipeId;
    const recipe = CraftingSystem.getRecipes().find(r => r.id === recipeId);
    if (!recipe) return;

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("CRAFTING.DeleteRecipe") },
      content: `<p>${game.i18n.format("CRAFTING.Confirm.Delete", { name: recipe.name })}</p>`
    });

    if (confirmed) {
      await CraftingSystem.deleteRecipe(recipeId);
      this.render();
    }
  }

  /**
   * Open a dialog with checkboxes for every player-owned actor
   * so the GM can toggle which actors know this recipe.
   */
  static async #onAssign(event, target) {
    const recipeId = target.closest("[data-recipe-id]").dataset.recipeId;
    const recipe = CraftingSystem.getRecipes().find(r => r.id === recipeId);
    if (!recipe) return;

    const actors = game.actors.filter(a => a.hasPlayerOwner);
    if (!actors.length) {
      ui.notifications.warn(game.i18n.localize("CRAFTING.NoActors"));
      return;
    }

    // Build checkbox HTML
    const checkboxes = actors.map(a => {
      const known = CraftingSystem.getActorRecipeIds(a);
      const checked = known.includes(recipeId) ? "checked" : "";
      return `<label class="crafting-assign-label">
        <input type="checkbox" name="actor-${a.id}" ${checked} />
        <img src="${a.img}" width="24" height="24" />
        ${a.name}
      </label>`;
    }).join("");

    const content = `<form class="crafting-assign-form">${checkboxes}</form>`;

    // Reference for the closure
    const self = this;

    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.format("CRAFTING.AssignRecipeTo", { name: recipe.name }) },
      content,
      buttons: [
        {
          action: "save",
          label: game.i18n.localize("CRAFTING.Save"),
          icon: "fas fa-save",
          callback: (event, button, dialog) => {
            const checks = {};
            const form = dialog.querySelector ? dialog : button.closest(".application");
            form.querySelectorAll("input[type=checkbox]").forEach(cb => {
              const actorId = cb.name.replace("actor-", "");
              checks[actorId] = cb.checked;
            });
            return checks;
          }
        },
        {
          action: "cancel",
          label: game.i18n.localize("Cancel"),
          icon: "fas fa-times"
        }
      ]
    });

    if (!result || result === "cancel") return;

    for (const [actorId, assigned] of Object.entries(result)) {
      const actor = game.actors.get(actorId);
      if (!actor) continue;
      if (assigned) {
        await CraftingSystem.assignRecipe(actor, recipeId);
      } else {
        await CraftingSystem.unassignRecipe(actor, recipeId);
      }
    }
    ui.notifications.info(game.i18n.localize("CRAFTING.Info.RecipesAssigned"));
  }
}
