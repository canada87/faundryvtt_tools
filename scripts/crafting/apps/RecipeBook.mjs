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
    classes: ["crafting", "crafting-bench", "recipe-book"],
    window: {
      title: "CRAFTING.RecipeBook",
      icon: "fas fa-book",
      resizable: true
    },
    position: {
      width: 580,
      height: 560
    },
    actions: {
      craft: RecipeBook.#onCraft,
      filterAll: RecipeBook.#onFilter,
      filterCraftable: RecipeBook.#onFilter
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

  /** Current search text and "craftable only" filter (survive re-renders). */
  #query = "";
  #onlyCraftable = false;

  async _prepareContext(options) {
    const allRecipes = CraftingSystem.getRecipes();
    const knownIds = CraftingSystem.getActorRecipeIds(this.actor);
    const recipes = [];

    for (const id of knownIds) {
      const recipe = allRecipes.find(r => r.id === id);
      if (!recipe) continue;

      const components = recipe.components.map(comp => {
        const owned = CraftingSystem.countItem(this.actor, comp.name);
        const quantity = Math.max(1, Number(comp.quantity) || 1);
        return {
          ...comp,
          owned,
          sufficient: owned >= quantity,
          percent: Math.min(100, Math.round((owned / quantity) * 100))
        };
      });

      const canCraft = CraftingSystem.canCraft(this.actor, recipe);
      const haveCount = components.filter(c => c.sufficient).length;
      const searchText = [recipe.name, ...components.map(c => c.name)].join(" ").toLowerCase();
      recipes.push({
        ...recipe,
        components,
        canCraft,
        haveCount,
        missingCount: components.length - haveCount,
        searchText
      });
    }

    return {
      recipes,
      actor: this.actor,
      isEmpty: recipes.length === 0,
      readyCount: recipes.filter(r => r.canCraft).length
    };
  }

  /* ---------------------------------------- */
  /*  Search and filter                       */
  /* ---------------------------------------- */

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this.element.addEventListener("input", event => {
      if (!event.target.matches(".recipe-search")) return;
      this.#query = event.target.value;
      this.#applyFilter();
    });
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const input = this.element.querySelector(".recipe-search");
    if (input) input.value = this.#query;
    this.#applyFilter();
  }

  #applyFilter() {
    const root = this.element;
    const query = this.#query.trim().toLowerCase();
    let visible = 0;

    for (const card of root.querySelectorAll(".recipe-card")) {
      const craftable = !card.classList.contains("disabled");
      const matches = (!this.#onlyCraftable || craftable)
        && (!query || card.dataset.search.includes(query));
      card.hidden = !matches;
      if (matches) visible++;
    }

    const empty = root.querySelector(".no-results");
    if (empty) empty.hidden = visible > 0;

    for (const btn of root.querySelectorAll(".cb-seg-btn")) {
      btn.setAttribute("aria-pressed", String((btn.dataset.filter === "craftable") === this.#onlyCraftable));
    }
  }

  /* ---------------------------------------- */
  /*  Actions                                 */
  /* ---------------------------------------- */

  static #onFilter(event, target) {
    this.#onlyCraftable = target.dataset.filter === "craftable";
    this.#applyFilter();
  }

  static async #onCraft(event, target) {
    const recipeId = target.closest("[data-recipe-id]").dataset.recipeId;
    const success = await CraftingSystem.craft(this.actor, recipeId);
    if (success) this.render();
  }
}
