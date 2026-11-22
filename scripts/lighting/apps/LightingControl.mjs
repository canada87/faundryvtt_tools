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
      width: 460,
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
      hasDarknessLevels: darknessLevels.length > 0,
      animations: LightingSystem.getAnimationChoices()
    };
  }

  /** Presets change while the panel is open (it re-renders on setting change): keep typed values. */
  async _preRender(context, options) {
    await super._preRender(context, options);
    if (!this.element) return;
    this.#customValues = Object.fromEntries(
      ["custom-bright", "custom-dim", "custom-angle", "custom-color", "custom-color-on", "custom-animation", "darkness-select"]
        .map(id => {
          const input = this.element.querySelector(`#${id}`);
          return [id, input?.type === "checkbox" ? input.checked : input?.value];
        })
    );
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const el = this.element;
    // Picking a color means "use it"
    el.querySelector("#custom-color")?.addEventListener("input", () => {
      el.querySelector("#custom-color-on").checked = true;
    });
    if (!this.#customValues) return;
    for (const [id, value] of Object.entries(this.#customValues)) {
      const input = el.querySelector(`#${id}`);
      if (!input || value === undefined) continue;
      if (input.type === "checkbox") input.checked = value;
      else input.value = value;
    }
  }

  /**
   * Custom fields the user filled in, as partial light data: empty fields are left out.
   * Animation "" keeps the current one, "none" removes it.
   * @returns {object}
   */
  #readOverrides() {
    const el = this.element;
    const light = {};
    for (const key of ["bright", "dim", "angle"]) {
      const value = el.querySelector(`#custom-${key}`)?.value;
      if (value !== "" && value !== undefined) light[key] = Number(value);
    }
    if (el.querySelector("#custom-color-on")?.checked) light.color = el.querySelector("#custom-color").value;
    const animation = el.querySelector("#custom-animation")?.value;
    if (animation) light.animation = { type: animation === "none" ? null : animation };
    return light;
  }

  /* ---------------------------------------- */
  /*  Actions                                  */
  /* ---------------------------------------- */

  static async #onApplyPreset(event, target) {
    const index = Number(target.closest("[data-preset-index]").dataset.presetIndex);
    const preset = LightingSystem.getPresets()[index];
    if (!preset) return;

    // Filled custom fields override the preset
    const light = foundry.utils.mergeObject(LightingSystem.lightFromPreset(preset), this.#readOverrides());
    await LightingSystem.updateTokenLight(light);
  }

  static async #onTurnOff() {
    await LightingSystem.turnOffLight();
  }

  /** Empty radius fields mean 0 (angle 360); empty color/animation keep the token's current ones. */
  static async #onApplyCustom() {
    const light = { bright: 0, dim: 0, angle: 360, ...this.#readOverrides() };
    if (!light.angle) light.angle = 360;
    await LightingSystem.updateTokenLight(light);
  }

  /** Create a preset, pre-filled with the custom values when typed. */
  static async #onNewPreset() {
    await LightingDialogs.editPreset(null, this.#readOverrides());
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
