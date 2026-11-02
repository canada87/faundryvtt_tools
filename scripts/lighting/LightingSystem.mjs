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
   * Normalize raw preset data (from a form or dialog) into a stored preset.
   * @param {object} data
   * @returns {object}
   */
  static normalizePreset(data) {
    return {
      id: data.id || foundry.utils.randomID(),
      label: String(data.label ?? "").trim(),
      icon: String(data.icon ?? "").trim() || "fas fa-lightbulb",
      bright: Number(data.bright) || 0,
      dim: Number(data.dim) || 0,
      angle: Number(data.angle) || 360
    };
  }

  /**
   * Create a preset, or replace the one with the same id.
   * @param {object} data
   * @returns {Promise<object>} the saved preset
   */
  static async savePreset(data) {
    const preset = this.normalizePreset(data);
    const presets = foundry.utils.deepClone(this.getPresets());
    const index = presets.findIndex(p => p.id === preset.id);
    if (index >= 0) presets[index] = preset;
    else presets.push(preset);
    await game.settings.set(MODULE_ID, "lightingPresets", presets);
    return preset;
  }

  /**
   * Delete a preset and its player access entry.
   * @param {string} id
   */
  static async deletePreset(id) {
    const presets = this.getPresets().filter(p => p.id !== id);
    await game.settings.set(MODULE_ID, "lightingPresets", presets);
    await this.pruneAccess(presets.map(p => p.id));
  }

  /* ---------------------------------------- */
  /*  Player access                            */
  /* ---------------------------------------- */

  /**
   * Which players can use a preset from their token HUD.
   * `users` is kept even while `all` is on, so turning "all" off restores the selection.
   * @param {string} id
   * @returns {{all: boolean, users: string[]}}
   */
  static getPresetAccess(id) {
    const entry = game.settings.get(MODULE_ID, "lightingPresetAccess")[id];
    return { all: !!entry?.all, users: entry?.users ?? [] };
  }

  /**
   * @param {string} id
   * @param {{all: boolean, users: string[]}} access
   */
  static async setPresetAccess(id, { all, users }) {
    const map = foundry.utils.deepClone(game.settings.get(MODULE_ID, "lightingPresetAccess"));
    if (all || users.length) map[id] = { all: !!all, users: [...users] };
    else delete map[id];
    await game.settings.set(MODULE_ID, "lightingPresetAccess", map);
  }

  /**
   * Drop access entries for presets that no longer exist.
   * @param {string[]} validIds
   */
  static async pruneAccess(validIds) {
    const valid = new Set(validIds);
    const map = game.settings.get(MODULE_ID, "lightingPresetAccess");
    const kept = Object.fromEntries(Object.entries(map).filter(([id]) => valid.has(id)));
    if (Object.keys(kept).length !== Object.keys(map).length) {
      await game.settings.set(MODULE_ID, "lightingPresetAccess", kept);
    }
  }

  /**
   * @param {object} preset
   * @param {User} [user]
   * @returns {boolean}
   */
  static canUserSeePreset(preset, user = game.user) {
    if (user.isGM) return true;
    if (!preset.id) return false;
    const access = this.getPresetAccess(preset.id);
    return access.all || access.users.includes(user.id);
  }

  /**
   * Non-GM users, sorted by name — the people a preset can be given to.
   * @returns {User[]}
   */
  static getPlayers() {
    return game.users.filter(u => !u.isGM).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Presets shown in the token HUD for the current user:
   * every preset for the GM, only the ones assigned to them for players.
   * @returns {object[]}
   */
  static getHudPresets() {
    return this.getPresets().filter(p => this.canUserSeePreset(p));
  }

  /**
   * One-time data fixes, GM only; runs at ready:
   * - give a stable id to presets saved by older versions (which had none);
   * - turn the old "visible to all players" id list into per-preset access.
   */
  static async migratePresets() {
    if (!game.user.isGM) return;
    const presets = this.getPresets();
    if (!presets.every(p => p.id)) {
      const migrated = presets.map(p => p.id ? p : { ...p, id: foundry.utils.randomID() });
      await game.settings.set(MODULE_ID, "lightingPresets", migrated);
    }

    const legacy = game.settings.get(MODULE_ID, "lightingPlayerPresets");
    if (legacy.length) {
      const map = foundry.utils.deepClone(game.settings.get(MODULE_ID, "lightingPresetAccess"));
      for (const id of legacy) map[id] ??= { all: true, users: [] };
      await game.settings.set(MODULE_ID, "lightingPresetAccess", map);
      await game.settings.set(MODULE_ID, "lightingPlayerPresets", []);
    }
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
