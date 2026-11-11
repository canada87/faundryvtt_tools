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
    classes: ["crafting", "crafting-bench", "recipe-manager"],
    window: {
      title: "CRAFTING.RecipeManager",
      icon: "fas fa-flask",
      resizable: true
    },
    position: {
      width: 700,
      height: 600
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

  /** Current search text (survives re-renders). */
  #query = "";

  async _prepareContext(options) {
    const MAX_MINIS = 6;
    const MAX_AVATARS = 4;
    const playerActors = CraftingSystem.getPlayerActors();
    const knownByActor = new Map(playerActors.map(a => [a.id, CraftingSystem.getActorRecipeIds(a)]));

    const recipes = CraftingSystem.getRecipes().map(recipe => {
      const components = recipe.components ?? [];
      const assignedAll = playerActors.filter(a => knownByActor.get(a.id).includes(recipe.id));
      return {
        ...recipe,
        minis: components.slice(0, MAX_MINIS),
        extraCount: Math.max(0, components.length - MAX_MINIS),
        assigned: assignedAll.slice(0, MAX_AVATARS).map(a => ({ name: a.name, img: a.img })),
        assignedExtra: Math.max(0, assignedAll.length - MAX_AVATARS),
        assignedTitle: assignedAll.length
          ? game.i18n.format("CRAFTING.AssignedTo", { names: assignedAll.map(a => a.name).join(", ") })
          : game.i18n.localize("CRAFTING.NotAssigned"),
        searchText: [recipe.name, ...components.map(c => c.name)].join(" ").toLowerCase()
      };
    });

    return {
      recipes,
      isEmpty: recipes.length === 0
    };
  }

  /* ---------------------------------------- */
  /*  Search                                  */
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

    for (const row of root.querySelectorAll(".recipe-row")) {
      const matches = !query || row.dataset.search.includes(query);
      row.hidden = !matches;
      if (matches) visible++;
    }

    const empty = root.querySelector(".no-results");
    if (empty) empty.hidden = visible > 0;
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

    const actors = CraftingSystem.getPlayerActors();
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
