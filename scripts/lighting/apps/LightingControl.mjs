import { MODULE_ID } from "../../shared/constants.mjs";
import { LightingSystem } from "../LightingSystem.mjs";
import { LightingDialogs } from "./LightingDialogs.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Lighting & darkness control panel.
 * Stays open after each action — the user closes it manually.
 */
export class LightingControl extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "lighting-control",
    classes: ["lighting", "lighting-control"],
    window: {
      title: "LIGHTING.ControlTitle",
      icon: "fas fa-lightbulb",
      resizable: true
    },
    position: {
      width: 400,
      height: "auto"
    },
    actions: {
      applyPreset: LightingControl.#onApplyPreset,
      turnOff: LightingControl.#onTurnOff,
      applyCustom: LightingControl.#onApplyCustom,
      applyDarkness: LightingControl.#onApplyDarkness,
      newPreset: LightingControl.#onNewPreset,
      editPreset: LightingControl.#onEditPreset,
      editPresetAccess: LightingControl.#onEditPresetAccess,
      setDarknessQuick: LightingControl.#onSetDarknessQuick
    }
  };

  /** Values typed in the custom inputs, kept across re-renders. */
  #customValues = null;

  static PARTS = {
    control: {
      template: `modules/${MODULE_ID}/templates/lighting/lighting-control.hbs`
    }
  };

  /* ---------------------------------------- */
  /*  Context                                  */
  /* ---------------------------------------- */

  async _prepareContext(options) {
    const presets = LightingSystem.getPresets();
    const darknessLevels = game.settings.get(MODULE_ID, "lightingDarknessLevels");

    return {
      presets: presets.map((p, i) => {
        const access = LightingDialogs.describeAccess(p.id);
        return { ...p, index: i, accessState: access.state, accessText: access.text };
      }),
      hasPresets: presets.length > 0,
      darknessLevels,
      hasDarknessLevels: darknessLevels.length > 0
    };
  }

  /** Presets change while the panel is open (it re-renders on setting change): keep typed values. */
  async _preRender(context, options) {
    await super._preRender(context, options);
    if (!this.element) return;
    this.#customValues = Object.fromEntries(
      ["custom-bright", "custom-dim", "custom-angle", "darkness-select"]
        .map(id => [id, this.element.querySelector(`#${id}`)?.value])
    );
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if (!this.#customValues) return;
    for (const [id, value] of Object.entries(this.#customValues)) {
      const input = this.element.querySelector(`#${id}`);
      if (input && value !== undefined) input.value = value;
    }
  }

  /* ---------------------------------------- */
  /*  Actions                                  */
  /* ---------------------------------------- */

  static async #onApplyPreset(event, target) {
    const el = this.element;
    const index = Number(target.closest("[data-preset-index]").dataset.presetIndex);
    const preset = LightingSystem.getPresets()[index];
    if (!preset) return;

    // Allow custom overrides
    const brightVal = el.querySelector("#custom-bright")?.value;
    const dimVal = el.querySelector("#custom-dim")?.value;
    const angleVal = el.querySelector("#custom-angle")?.value;

    const bright = brightVal !== "" ? Number(brightVal) : preset.bright;
    const dim = dimVal !== "" ? Number(dimVal) : preset.dim;
    const angle = angleVal !== "" ? Number(angleVal) : preset.angle;

    await LightingSystem.updateTokenLight(bright, dim, angle);
  }

  static async #onTurnOff() {
    await LightingSystem.turnOffLight();
  }

  static async #onApplyCustom() {
    const el = this.element;
    const bright = Number(el.querySelector("#custom-bright")?.value) || 0;
    const dim = Number(el.querySelector("#custom-dim")?.value) || 0;
    const angle = Number(el.querySelector("#custom-angle")?.value) || 360;

    await LightingSystem.updateTokenLight(bright, dim, angle);
  }

  /** Create a preset, pre-filled with the custom values when typed. */
  static async #onNewPreset() {
    const el = this.element;
    const defaults = {};
    for (const key of ["bright", "dim", "angle"]) {
      const value = el.querySelector(`#custom-${key}`)?.value;
      if (value !== "" && value !== undefined) defaults[key] = Number(value);
    }
    await LightingDialogs.editPreset(null, defaults);
  }

  static async #onEditPreset(event, target) {
    const preset = LightingControl.#presetFromTarget(target);
    if (preset) await LightingDialogs.editPreset(preset);
  }

  /** Choose which players get the preset in their token HUD. */
  static async #onEditPresetAccess(event, target) {
    const preset = LightingControl.#presetFromTarget(target);
    if (preset?.id) await LightingDialogs.editAccess(preset);
  }

  static #presetFromTarget(target) {
    const index = Number(target.closest("[data-preset-index]").dataset.presetIndex);
    return LightingSystem.getPresets()[index];
  }

  /** Day (0) / night (1) shortcut buttons. */
  static async #onSetDarknessQuick(event, target) {
    await LightingSystem.setDarkness(Number(target.dataset.darkness));
  }

  static async #onApplyDarkness() {
    const el = this.element;
    const value = parseFloat(el.querySelector("#darkness-select")?.value ?? 0);
    await LightingSystem.setDarkness(value);
  }
}
