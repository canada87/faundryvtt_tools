import { MODULE_ID } from "../shared/constants.mjs";

/**
 * Core logic for the Lighting Control feature.
 * Handles light presets, custom light application, and scene darkness.
 */
export class LightingSystem {

  /**
   * Default light presets.
   */
  static DEFAULT_PRESETS = [
    { id: "torch",      label: "Torcia",     icon: "fas fa-fire",       bright: 3, dim: 6,  angle: 360 },
    { id: "flashlight", label: "Flashlight", icon: "fas fa-flashlight",  bright: 6, dim: 12, angle: 30  },
    { id: "lantern",    label: "Lanterna",   icon: "fas fa-lantern",     bright: 6, dim: 12, angle: 360 },
    { id: "candle",     label: "Candela",    icon: "fas fa-candle-holder", bright: 1, dim: 2,  angle: 360 }
  ];

  /**
   * Default darkness levels.
   */
  static DEFAULT_DARKNESS_LEVELS = [
    { label: "0% (giorno)", value: 0.0 },
    { label: "11.1%",       value: 0.1111 },
    { label: "22.2%",       value: 0.2222 },
    { label: "33.3%",       value: 0.3333 },
    { label: "44.4%",       value: 0.4444 },
    { label: "55.6%",       value: 0.5556 },
    { label: "66.7%",       value: 0.6667 },
    { label: "77.8%",       value: 0.7778 },
    { label: "88.9%",       value: 0.8889 },
    { label: "100% (notte)", value: 1.0 }
  ];

  /**
   * All configured presets.
   * @returns {object[]}
   */
  static getPresets() {
    return game.settings.get(MODULE_ID, "lightingPresets");
  }

  /**
   * IDs of the presets the GM made available to players.
   * @returns {string[]}
   */
  static getPlayerPresetIds() {
    return game.settings.get(MODULE_ID, "lightingPlayerPresets");
  }

  /**
   * Presets shown in the token HUD for the current user:
   * every preset for the GM, only the curated ones for players.
   * @returns {object[]}
   */
  static getHudPresets() {
    const presets = this.getPresets();
    if (game.user.isGM) return presets;
    const allowed = new Set(this.getPlayerPresetIds());
    return presets.filter(p => p.id && allowed.has(p.id));
  }

  /**
   * Give a stable id to presets saved by older versions (which had none).
   * GM only; runs once at ready.
   */
  static async migratePresetIds() {
    if (!game.user.isGM) return;
    const presets = this.getPresets();
    if (presets.every(p => p.id)) return;
    const migrated = presets.map(p => p.id ? p : { ...p, id: foundry.utils.randomID() });
    await game.settings.set(MODULE_ID, "lightingPresets", migrated);
  }

  /**
   * Update light on the given tokens (defaults to the controlled ones).
   * @param {number} bright
   * @param {number} dim
   * @param {number} angle
   * @param {Token[]} [tokens]
   */
  static async updateTokenLight(bright, dim, angle, tokens = canvas.tokens.controlled) {
    if (tokens.length === 0) {
      ui.notifications.warn(game.i18n.localize("LIGHTING.Warn.NoToken"));
      return;
    }
    for (const token of tokens) {
      await token.document.update({ light: { bright, dim, angle } });
    }
    ui.notifications.info(
      game.i18n.format("LIGHTING.Info.LightUpdated", { bright, dim, angle })
    );
  }

  /**
   * Turn off light on the given tokens (defaults to the controlled ones).
   * @param {Token[]} [tokens]
   */
  static async turnOffLight(tokens = canvas.tokens.controlled) {
    await this.updateTokenLight(0, 0, 360, tokens);
  }

  /**
   * Set scene darkness level.
   * @param {number} value  0.0–1.0
   */
  static async setDarkness(value) {
    const scene = game.scenes.current;
    if (!scene) {
      ui.notifications.error(game.i18n.localize("LIGHTING.Error.NoScene"));
      return;
    }
    await scene.update({ "environment.darknessLevel": value });
    ui.notifications.info(
      game.i18n.format("LIGHTING.Info.DarknessSet", { value: Math.round(value * 100) })
    );
  }
}
