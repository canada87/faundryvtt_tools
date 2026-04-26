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
      active: data.active ?? true
    };
    resources.push(resource);
    await this.saveResources(resources);
    return resource;
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

  /* ---------- Visibility helpers ---------- */

  static getVisibleResourcesFor(user) {
    const resources = this.getResources().filter(r => r.active);
    if (user?.isGM) return resources;
    return resources.filter(r => r.visibleToPlayers);
  }
}
