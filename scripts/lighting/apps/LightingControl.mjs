import { MODULE_ID } from "../../shared/constants.mjs";
import { LightingSystem } from "../LightingSystem.mjs";

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
      togglePlayerPreset: LightingControl.#onTogglePlayerPreset
    }
  };

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
    const playerIds = new Set(LightingSystem.getPlayerPresetIds());

    return {
      presets: presets.map((p, i) => ({ ...p, index: i, forPlayers: playerIds.has(p.id) })),
      hasPresets: presets.length > 0,
      darknessLevels,
      hasDarknessLevels: darknessLevels.length > 0
    };
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

  /**
   * Toggle whether a preset is offered to players in their token HUD.
   * Updates the button in place so typed custom values are not lost to a re-render.
   */
  static async #onTogglePlayerPreset(event, target) {
    const index = Number(target.closest("[data-preset-index]").dataset.presetIndex);
    const preset = LightingSystem.getPresets()[index];
    if (!preset?.id) return;

    const ids = new Set(LightingSystem.getPlayerPresetIds());
    if (ids.has(preset.id)) ids.delete(preset.id);
    else ids.add(preset.id);

    await game.settings.set(MODULE_ID, "lightingPlayerPresets", [...ids]);

    const enabled = ids.has(preset.id);
    target.classList.toggle("active", enabled);
    target.setAttribute("aria-pressed", String(enabled));
    target.querySelector("i").className = enabled ? "fas fa-eye" : "fas fa-eye-slash";
  }

  static async #onApplyDarkness() {
    const el = this.element;
    const value = parseFloat(el.querySelector("#darkness-select")?.value ?? 0);
    await LightingSystem.setDarkness(value);
  }
}
