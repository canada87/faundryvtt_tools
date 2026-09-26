import { MODULE_ID } from "../shared/constants.mjs";

/**
 * Data management for on-screen Resources (counters).
 * Resources are stored as a world-level setting (Array).
 */
export class ResourceSystem {

  /* ---------- Read ---------- */

  static getResources() {
    return game.settings.get(MODULE_ID, "resources") ?? [];
  }

  static getResource(id) {
    return this.getResources().find(r => r.id === id) ?? null;
  }

  /* ---------- Write ---------- */

  static async saveResources(resources) {
    await game.settings.set(MODULE_ID, "resources", resources);
  }

  static async createResource(data = {}) {
    const resources = this.getResources();
    const resource = {
      id: foundry.utils.randomID(),
      label: data.label ?? game.i18n.localize("RESOURCES.DefaultLabel"),
      value: Number.isFinite(data.value) ? data.value : 0,
      icon: data.icon ?? "fas fa-cube",
      color: data.color ?? "#d4af37",
      visibleToPlayers: data.visibleToPlayers ?? false,
      active: data.active ?? true,
      decay: this.#defaultDecay()
    };
    resources.push(resource);
    await this.saveResources(resources);
    return resource;
  }

  static #defaultDecay() {
    return {
      enabled: false,
      interval: 30,
      amount: 1,
      direction: "decrease",
      loop: true,
      initialValue: 0,
      lastTick: 0
    };
  }

  static async updateResource(id, updates) {
    const resources = this.getResources();
    const resource = resources.find(r => r.id === id);
    if (!resource) return null;
    Object.assign(resource, updates);
    await this.saveResources(resources);
    return resource;
  }

  static async deleteResource(id) {
    const resources = this.getResources().filter(r => r.id !== id);
    await this.saveResources(resources);
  }

  static async adjustValue(id, delta) {
    const resource = this.getResource(id);
    if (!resource) return null;
    return this.updateResource(id, { value: (resource.value ?? 0) + delta });
  }

  /* ---------- Decay (scheduled increase/decrease over game time) ---------- */

  /**
   * Update a resource's decay configuration.
   * Enabling decay (false -> true) anchors the countdown to the current
   * game-world time and snapshots the current value as the loop target.
   */
  static async updateResourceDecay(id, updates) {
    const resource = this.getResource(id);
    if (!resource) return null;
    const current = resource.decay ?? this.#defaultDecay();
    const decay = foundry.utils.mergeObject(current, updates, { inplace: false });
    if (decay.enabled && !current.enabled) {
      decay.initialValue = resource.value ?? 0;
      decay.lastTick = game.time.worldTime;
    }
    return this.updateResource(id, { decay });
  }

  /**
   * Apply any pending decay ticks to all resources, based on elapsed game-world time.
   * Should only be invoked by the active GM client (see updateWorldTime hook).
   */
  static async processDecay(worldTime) {
    const resources = this.getResources();
    let changed = false;

    for (const resource of resources) {
      const decay = resource.decay;
      if (!decay?.enabled) continue;

      const intervalSeconds = (Number(decay.interval) || 0) * 60;
      if (intervalSeconds <= 0) continue;

      const lastTick = Number.isFinite(decay.lastTick) ? decay.lastTick : worldTime;
      const elapsed = worldTime - lastTick;
      const ticks = Math.floor(elapsed / intervalSeconds);
      if (ticks <= 0) continue;

      const amount = Math.abs(Number(decay.amount) || 0);
      const initialValue = Number.isFinite(decay.initialValue) ? decay.initialValue : (resource.value ?? 0);
      let value = Number(resource.value) || 0;

      for (let i = 0; i < ticks; i++) {
        if (decay.direction === "increase") {
          value += amount;
        } else {
          value -= amount;
          if (value <= 0) {
            value = decay.loop ? initialValue : 0;
          }
        }
      }

      resource.value = value;
      decay.lastTick = lastTick + (ticks * intervalSeconds);
      changed = true;
    }

    if (changed) await this.saveResources(resources);
  }

  /* ---------- Visibility helpers ---------- */

  static getVisibleResourcesFor(user) {
    const resources = this.getResources().filter(r => r.active);
    if (user?.isGM) return resources;
    return resources.filter(r => r.visibleToPlayers);
  }
}
