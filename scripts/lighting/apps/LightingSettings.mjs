import { MODULE_ID } from "../../shared/constants.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM form for configuring lighting presets and darkness levels.
 */
export class LightingSettings extends HandlebarsApplicationMixin(ApplicationV2) {

  #presets;
  #darknessLevels;

  static DEFAULT_OPTIONS = {
    id: "lighting-settings",
    classes: ["lighting", "lighting-settings"],
    tag: "form",
    window: {
      title: "LIGHTING.SettingsTitle",
      icon: "fas fa-cog",
      resizable: true
    },
    position: {
      width: 520,
      height: "auto"
    },
    form: {
      submitOnChange: false,
      closeOnSubmit: true,
      handler: LightingSettings.#onSubmit
    },
    actions: {
      addPreset: LightingSettings.#onAddPreset,
      removePreset: LightingSettings.#onRemovePreset,
      addDarkness: LightingSettings.#onAddDarkness,
      removeDarkness: LightingSettings.#onRemoveDarkness
    }
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/lighting/lighting-settings.hbs`
    }
  };

  constructor(options = {}) {
    super(options);
    this.#presets = foundry.utils.deepClone(game.settings.get(MODULE_ID, "lightingPresets"));
    this.#darknessLevels = foundry.utils.deepClone(game.settings.get(MODULE_ID, "lightingDarknessLevels"));
  }

  /* ---------------------------------------- */
  /*  Context                                  */
  /* ---------------------------------------- */

  async _prepareContext(options) {
    return {
      presets: this.#presets,
      darknessLevels: this.#darknessLevels
    };
  }

  /* ---------------------------------------- */
  /*  State sync                               */
  /* ---------------------------------------- */

  #syncFormToState() {
    const el = this.element;

    const presets = [];
    el.querySelectorAll(".preset-entry").forEach(entry => {
      presets.push({
        label: entry.querySelector('input[name$=".label"]')?.value || "",
        icon: entry.querySelector('input[name$=".icon"]')?.value || "fas fa-lightbulb",
        bright: Number(entry.querySelector('input[name$=".bright"]')?.value) || 0,
        dim: Number(entry.querySelector('input[name$=".dim"]')?.value) || 0,
        angle: Number(entry.querySelector('input[name$=".angle"]')?.value) || 360
      });
    });
    this.#presets = presets;

    const darknessLevels = [];
    el.querySelectorAll(".darkness-entry").forEach(entry => {
      darknessLevels.push({
        label: entry.querySelector('input[name$=".label"]')?.value || "",
        value: parseFloat(entry.querySelector('input[name$=".value"]')?.value) || 0
      });
    });
    this.#darknessLevels = darknessLevels;
  }

  /* ---------------------------------------- */
  /*  Actions                                  */
  /* ---------------------------------------- */

  static async #onAddPreset() {
    this.#syncFormToState();
    this.#presets.push({ label: "", icon: "fas fa-lightbulb", bright: 0, dim: 0, angle: 360 });
    this.render();
  }

  static async #onRemovePreset(event, target) {
    this.#syncFormToState();
    const index = Number(target.closest("[data-preset-index]").dataset.presetIndex);
    this.#presets.splice(index, 1);
    this.render();
  }

  static async #onAddDarkness() {
    this.#syncFormToState();
    this.#darknessLevels.push({ label: "", value: 0 });
    this.render();
  }

  static async #onRemoveDarkness(event, target) {
    this.#syncFormToState();
    const index = Number(target.closest("[data-darkness-index]").dataset.darknessIndex);
    this.#darknessLevels.splice(index, 1);
    this.render();
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);

    const presets = Object.values(data.presets || {})
      .filter(p => p.label?.trim())
      .map(p => ({
        label: p.label.trim(),
        icon: p.icon?.trim() || "fas fa-lightbulb",
        bright: Number(p.bright) || 0,
        dim: Number(p.dim) || 0,
        angle: Number(p.angle) || 360
      }));
    await game.settings.set(MODULE_ID, "lightingPresets", presets);

    const darknessLevels = Object.values(data.darknessLevels || {})
      .filter(d => d.label?.trim())
      .map(d => ({
        label: d.label.trim(),
        value: parseFloat(d.value) || 0
      }));
    await game.settings.set(MODULE_ID, "lightingDarknessLevels", darknessLevels);

    ui.notifications.info(game.i18n.localize("LIGHTING.Info.SettingsSaved"));
  }
}
