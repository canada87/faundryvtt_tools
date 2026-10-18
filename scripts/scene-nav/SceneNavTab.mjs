import { SceneNavigator } from "./apps/SceneNavigator.mjs";

/**
 * Small tab fixed on the left edge of the screen (GM only)
 * that slides the Scene Navigator in and out.
 */
export class SceneNavTab {

  static #id = "faundryvtt-scenenav-tab";

  static init() {
    if (!game.user.isGM || document.getElementById(this.#id)) return;
    const tab = document.createElement("button");
    tab.id = this.#id;
    tab.type = "button";
    tab.className = "faundryvtt-scenenav-tab";
    tab.dataset.tooltip = game.i18n.localize("SCENENAV.Toggle");
    tab.innerHTML = `<i class="fas fa-map"></i><span>${game.i18n.localize("SCENENAV.TabLabel")}</span>`;
    tab.addEventListener("click", () => SceneNavigator.toggle());
    document.body.appendChild(tab);
  }
}
