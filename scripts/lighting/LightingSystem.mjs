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
    { label: "Torcia",     icon: "fas fa-fire",       bright: 3, dim: 6,  angle: 360 },
    { label: "Flashlight", icon: "fas fa-flashlight",  bright: 6, dim: 12, angle: 30  },
    { label: "Lanterna",   icon: "fas fa-lantern",     bright: 6, dim: 12, angle: 360 },
    { label: "Candela",    icon: "fas fa-candle-holder", bright: 1, dim: 2,  angle: 360 }
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
   * Update light on all controlled tokens.
   * @param {number} bright
   * @param {number} dim
   * @param {number} angle
   */
  static async updateTokenLight(bright, dim, angle) {
    const tokens = canvas.tokens.controlled;
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
   * Turn off light on all controlled tokens.
   */
  static async turnOffLight() {
    await this.updateTokenLight(0, 0, 360);
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
    await scene.update({ darkness: value });
    ui.notifications.info(
      game.i18n.format("LIGHTING.Info.DarknessSet", { value: Math.round(value * 100) })
    );
  }
}
