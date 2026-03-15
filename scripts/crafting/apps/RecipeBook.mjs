import { MODULE_ID } from "../../shared/constants.mjs";
import { CraftingSystem } from "../CraftingSystem.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Player-facing recipe book.
 * Shows known recipes, highlights craftable ones, and allows crafting.
 */
export class RecipeBook extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "crafting-recipe-book",
    classes: ["crafting", "recipe-book"],
    window: {
      title: "CRAFTING.RecipeBook",
      icon: "fas fa-book",
      resizable: true
    },
    position: {
      width: 550,
      height: 500
    },
    actions: {
      craft: RecipeBook.#onCraft
    }
  };

  static PARTS = {
    recipes: {
      template: `modules/${MODULE_ID}/templates/crafting/recipe-book.hbs`
    }
  };

  /** @type {Actor} */
  actor;

  constructor(options = {}) {
    super(options);
    this.actor = options.actor;
  }

  get title() {
    return `${game.i18n.localize("CRAFTING.RecipeBook")} — ${this.actor.name}`;
  }

  async _prepareContext(options) {
    const allRecipes = CraftingSystem.getRecipes();
    const knownIds = CraftingSystem.getActorRecipeIds(this.actor);
    const recipes = [];

    for (const id of knownIds) {
      const recipe = allRecipes.find(r => r.id === id);
      if (!recipe) continue;

      const components = recipe.components.map(comp => {
        const owned = CraftingSystem.countItem(this.actor, comp.name);
        return { ...comp, owned, sufficient: owned >= comp.quantity };
      });

      const canCraft = components.every(c => c.sufficient) && !!recipe.result;
      recipes.push({ ...recipe, components, canCraft });
    }

    return {
      recipes,
      actor: this.actor,
      isEmpty: recipes.length === 0
    };
  }

  /* ---------------------------------------- */
  /*  Actions                                 */
  /* ---------------------------------------- */

  static async #onCraft(event, target) {
    const recipeId = target.closest("[data-recipe-id]").dataset.recipeId;
    const success = await CraftingSystem.craft(this.actor, recipeId);
    if (success) this.render();
  }
}
