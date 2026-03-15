import { MODULE_ID } from "../../shared/constants.mjs";
import { CraftingSystem } from "../CraftingSystem.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM form for creating / editing a single recipe.
 * Components and result are added via drag-and-drop from the Items sidebar.
 */
export class RecipeEditor extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "crafting-recipe-editor",
    classes: ["crafting", "recipe-editor"],
    tag: "form",
    window: {
      title: "CRAFTING.RecipeEditor",
      icon: "fas fa-edit",
      resizable: true
    },
    position: {
      width: 500,
      height: 620
    },
    form: {
      submitOnChange: false,
      closeOnSubmit: true,
      handler: RecipeEditor.#onSubmit
    },
    actions: {
      removeComponent: RecipeEditor.#onRemoveComponent,
      removeResult: RecipeEditor.#onRemoveResult
    }
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/crafting/recipe-editor.hbs`
    }
  };

  /** Recipe being edited (null id = new recipe) */
  recipeId = null;

  /** Live recipe data (mutated by drag-drop before submit) */
  recipeData = {
    name: "",
    img: "icons/sundries/scrolls/scroll-plain.webp",
    description: "",
    components: [],
    result: null
  };

  /** Optional callback invoked after save */
  onSave = null;

  constructor(options = {}) {
    super(options);
    if (options.recipeId) this.recipeId = options.recipeId;
    if (options.recipeData) this.recipeData = options.recipeData;
    if (options.onSave) this.onSave = options.onSave;
  }

  get title() {
    return this.recipeId
      ? game.i18n.localize("CRAFTING.EditRecipe")
      : game.i18n.localize("CRAFTING.NewRecipe");
  }

  async _prepareContext(options) {
    return {
      recipe: this.recipeData,
      isEdit: !!this.recipeId
    };
  }

  /* ---------------------------------------- */
  /*  Drag-and-drop (manual listeners)        */
  /* ---------------------------------------- */

  _onRender(context, options) {
    super._onRender(context, options);

    const el = this.element;
    const compZone = el.querySelector(".component-drop-zone");
    const resultZone = el.querySelector(".result-drop-zone");

    for (const zone of [compZone, resultZone]) {
      if (!zone) continue;
      zone.addEventListener("dragover", e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      });
    }
    if (compZone) compZone.addEventListener("drop", e => this.#onDropComponent(e));
    if (resultZone) resultZone.addEventListener("drop", e => this.#onDropResult(e));
  }

  async #onDropComponent(event) {
    event.preventDefault();
    const data = TextEditor.getDragEventData(event);
    if (data?.type !== "Item") return;

    const item = await fromUuid(data.uuid);
    if (!item) return;

    const existing = this.recipeData.components.find(c => c.uuid === data.uuid);
    if (existing) {
      existing.quantity++;
    } else {
      this.recipeData.components.push({
        uuid: data.uuid,
        name: item.name,
        img: item.img,
        quantity: 1
      });
    }
    this.render();
  }

  async #onDropResult(event) {
    event.preventDefault();
    const data = TextEditor.getDragEventData(event);
    if (data?.type !== "Item") return;

    const item = await fromUuid(data.uuid);
    if (!item) return;

    this.recipeData.result = {
      uuid: data.uuid,
      name: item.name,
      img: item.img,
      quantity: 1
    };
    this.render();
  }

  /* ---------------------------------------- */
  /*  Actions                                 */
  /* ---------------------------------------- */

  static async #onRemoveComponent(event, target) {
    const index = Number(target.closest("[data-index]").dataset.index);
    this.recipeData.components.splice(index, 1);
    this.render();
  }

  static async #onRemoveResult() {
    this.recipeData.result = null;
    this.render();
  }

  /* ---------------------------------------- */
  /*  Form submission                         */
  /* ---------------------------------------- */

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);

    // Merge text fields from the form
    this.recipeData.name = data.name?.trim() || "";
    this.recipeData.description = data.description?.trim() || "";
    this.recipeData.img = data.img?.trim() || "icons/sundries/scrolls/scroll-plain.webp";

    // Update component quantities from the form inputs
    if (data.components) {
      for (const [i, compData] of Object.entries(data.components)) {
        const idx = Number(i);
        if (this.recipeData.components[idx]) {
          this.recipeData.components[idx].quantity = Math.max(1, Number(compData.quantity) || 1);
        }
      }
    }

    // Update result quantity
    if (data.result?.quantity && this.recipeData.result) {
      this.recipeData.result.quantity = Math.max(1, Number(data.result.quantity) || 1);
    }

    // Validation
    if (!this.recipeData.name) {
      ui.notifications.warn(game.i18n.localize("CRAFTING.Warn.NoName"));
      return false;
    }
    if (!this.recipeData.components.length) {
      ui.notifications.warn(game.i18n.localize("CRAFTING.Warn.NoComponents"));
      return false;
    }
    if (!this.recipeData.result) {
      ui.notifications.warn(game.i18n.localize("CRAFTING.Warn.NoResult"));
      return false;
    }

    // Save
    if (this.recipeId) {
      await CraftingSystem.updateRecipe(this.recipeId, this.recipeData);
    } else {
      await CraftingSystem.addRecipe(this.recipeData);
    }

    ui.notifications.info(game.i18n.localize("CRAFTING.Info.RecipeSaved"));
    if (this.onSave) this.onSave();
  }
}
