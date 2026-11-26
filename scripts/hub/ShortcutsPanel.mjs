import { MODULE_ID } from "../shared/constants.mjs";
import { HubMenu } from "./HubMenu.mjs";

/**
 * Small on-screen tab, bottom-left halfway between the screen edge and the
 * macro bar, that expands on hover into the list of the active features'
 * shortcuts. Shown only when the user setting "shortcutsPanelEnabled" is on.
 */
export class ShortcutsPanel {

  static #id = "faundryvtt-tools-shortcuts";

  static register() {
    game.settings.register(MODULE_ID, "shortcutsPanelEnabled", {
      name: "FVTT_TOOLS.ShortcutsPanel.Name",
      hint: "FVTT_TOOLS.ShortcutsPanel.Hint",
      scope: "user",
      config: true,
      type: Boolean,
      default: false,
      onChange: () => this.render()
    });
    Hooks.once("ready", () => this.render());
    Hooks.on("renderHotbar", () => this.#place());
    window.addEventListener("resize", () => this.#place());
  }

  static render() {
    let el = document.getElementById(this.#id);
    if (!game.settings.get(MODULE_ID, "shortcutsPanelEnabled")) return el?.remove();
    if (!el) {
      el = document.createElement("div");
      el.id = this.#id;
      el.className = "fvtt-tools-shortcuts";
      el.innerHTML = `<div class="fvtt-tools-shortcuts-tab"><i class="fas fa-keyboard"></i></div>
        <ul class="fvtt-tools-shortcuts-list"></ul>`;
      // Rebuilt on every hover so rebinding in Configure Controls shows up at once
      el.addEventListener("mouseenter", () => this.#fill(el));
      document.body.append(el);
    }
    this.#fill(el);
    this.#place();
  }

  static #fill(el) {
    const esc = foundry.utils.escapeHTML;
    const rows = HubMenu.features.filter(f => f.keybinding).map(f => {
      const action = game.keybindings.actions.get(`${MODULE_ID}.${f.keybinding}`);
      if (action?.restricted && !game.user.isGM) return null;
      const keys = HubMenu.shortcutLabel(f.keybinding);
      if (!keys) return null;
      return `<li><i class="${f.icon}"></i><span>${esc(game.i18n.localize(f.name))}</span><kbd>${esc(keys)}</kbd></li>`;
    }).filter(Boolean);
    el.querySelector(".fvtt-tools-shortcuts-list").innerHTML = rows.join("")
      || `<li class="is-empty">${esc(game.i18n.localize("FVTT_TOOLS.ShortcutsPanel.Empty"))}</li>`;
  }

  /** Center the tab halfway between the left edge and the macro bar. */
  static #place() {
    const el = document.getElementById(this.#id);
    if (!el) return;
    const hotbar = document.getElementById("hotbar")?.getBoundingClientRect();
    el.style.left = `${hotbar?.left ? hotbar.left / 2 : 120}px`;
  }
}
