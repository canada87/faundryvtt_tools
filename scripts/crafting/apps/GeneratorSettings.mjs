import { MODULE_ID } from "../../shared/constants.mjs";
import { ComponentGenerator } from "../ComponentGenerator.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM form for configuring the component auto-generator:
 * compendium label, components folder name, and level definitions (N levels, add/remove).
 */
export class GeneratorSettings extends HandlebarsApplicationMixin(ApplicationV2) {

  /** Local form state — survives add/remove level re-renders. */
  #compendiumLabel;
  #componentsFolder;
  #levels;

  static DEFAULT_OPTIONS = {
    id: "crafting-generator-settings",
    classes: ["crafting", "generator-settings"],
    tag: "form",
    window: {
      title: "CRAFTING.GeneratorSettings",
      icon: "fas fa-cogs",
      resizable: true
    },
    position: {
      width: 500,
      height: "auto"
    },
    form: {
      submitOnChange: false,
      closeOnSubmit: true,
      handler: GeneratorSettings.#onSubmit
    },
    actions: {
      addLevel: GeneratorSettings.#onAddLevel,
      removeLevel: GeneratorSettings.#onRemoveLevel
    }
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/crafting/generator-settings.hbs`
    }
  };

  constructor(options = {}) {
    super(options);
    const config = ComponentGenerator.getConfig();
    this.#compendiumLabel = config.compendiumLabel;
    this.#componentsFolder = config.componentsFolder;
    this.#levels = foundry.utils.deepClone(config.levels);
  }

  /* ---------------------------------------- */
  /*  Context                                  */
  /* ---------------------------------------- */

  async _prepareContext(options) {
    return {
      compendiumLabel: this.#compendiumLabel,
      componentsFolder: this.#componentsFolder,
      levels: this.#levels.map((data, idx) => ({
        index: idx,
        num: idx + 1,
        folderName: data.folderName,
        points: data.points
      }))
    };
  }

  /* ---------------------------------------- */
  /*  State sync                               */
  /* ---------------------------------------- */

  /**
   * Read current DOM values into instance state before a re-render.
   */
  #syncFormToState() {
    const el = this.element;
    this.#compendiumLabel = el.querySelector('[name="compendiumLabel"]')?.value ?? this.#compendiumLabel;
    this.#componentsFolder = el.querySelector('[name="componentsFolder"]')?.value ?? this.#componentsFolder;

    const levels = [];
    el.querySelectorAll(".level-entry").forEach(entry => {
      levels.push({
        folderName: entry.querySelector('[name$=".folderName"]')?.value?.trim() || "",
        points: Math.max(1, Number(entry.querySelector('[name$=".points"]')?.value) || 1)
      });
    });
    this.#levels = levels;
  }

  /* ---------------------------------------- */
  /*  Actions                                  */
  /* ---------------------------------------- */

  static async #onAddLevel() {
    this.#syncFormToState();
    const nextNum = this.#levels.length + 1;
    this.#levels.push({ folderName: `lv${nextNum}`, points: nextNum });
    this.render();
  }

  static async #onRemoveLevel(event, target) {
    if (this.#levels.length <= 1) return;
    this.#syncFormToState();
    const index = Number(target.closest("[data-level-index]").dataset.levelIndex);
    this.#levels.splice(index, 1);
    this.render();
  }

  /* ---------------------------------------- */
  /*  Submit                                   */
  /* ---------------------------------------- */

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const defaults = ComponentGenerator.DEFAULT_CONFIG;

    const levels = Object.values(data.levels ?? {}).map(v => ({
      folderName: v.folderName?.trim() || "lv",
      points: Math.max(1, Number(v.points) || 1)
    }));

    const config = {
      compendiumLabel: data.compendiumLabel?.trim() || defaults.compendiumLabel,
      componentsFolder: data.componentsFolder?.trim() || defaults.componentsFolder,
      levels: levels.length ? levels : defaults.levels
    };

    await game.settings.set(MODULE_ID, "craftingGeneratorConfig", config);
    ui.notifications.info(game.i18n.localize("CRAFTING.Info.GeneratorSettingsSaved"));
  }
}
