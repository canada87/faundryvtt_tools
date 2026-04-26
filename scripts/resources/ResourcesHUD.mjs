import { ResourceSystem } from "./ResourceSystem.mjs";

/**
 * On-screen HUD that renders the active resources at the top-center
 * of the viewport. A single fixed div is appended to body and rebuilt
 * whenever the resources setting changes.
 */
export class ResourcesHUD {

  static #containerId = "faundryvtt-resources-hud";

  static init() {
    this.render();
  }

  static getContainer() {
    let el = document.getElementById(this.#containerId);
    if (!el) {
      el = document.createElement("div");
      el.id = this.#containerId;
      el.className = "faundryvtt-resources-hud";
      document.body.appendChild(el);
    }
    return el;
  }

  static render() {
    const container = this.getContainer();
    const resources = ResourceSystem.getVisibleResourcesFor(game.user);

    if (!resources.length) {
      container.innerHTML = "";
      container.style.display = "none";
      return;
    }

    container.style.display = "flex";
    container.innerHTML = resources.map(r => {
      const dim = (!r.visibleToPlayers && game.user.isGM) ? " resource-chip-gm-only" : "";
      const color = r.color || "#d4af37";
      const icon = r.icon || "fas fa-cube";
      const label = foundry.utils.escapeHTML?.(r.label ?? "") ?? (r.label ?? "");
      return `
        <div class="resource-chip${dim}" data-resource-id="${r.id}" style="--resource-color:${color}">
          <i class="${icon}"></i>
          <span class="resource-chip-label">${label}</span>
          <span class="resource-chip-value">${r.value ?? 0}</span>
        </div>
      `;
    }).join("");
  }
}
