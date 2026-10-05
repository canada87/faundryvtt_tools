import { LightingSystem } from "./LightingSystem.mjs";

/**
 * Adds a "light presets" button to the Token HUD (the context menu shown
 * around a token on right-click). Players only see the presets the GM
 * selected in the Lighting Control; the GM sees all of them.
 */
export class TokenHudLighting {

  /**
   * Hook callback for `renderTokenHUD`.
   * @param {TokenHUD} hud
   * @param {HTMLElement} html
   */
  static onRender(hud, html) {
    const token = hud.object;
    if (!token?.document?.isOwner) return;

    const presets = LightingSystem.getHudPresets();
    if (presets.length === 0) return;

    const column = html.querySelector(".col.right");
    if (!column) return;

    column.append(TokenHudLighting.#buildControl(token, presets));
  }

  static #buildControl(token, presets) {
    const light = token.document.light;
    const wrap = document.createElement("div");
    wrap.className = "faundryvtt-light-hud";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "control-icon";
    button.dataset.tooltip = game.i18n.localize("LIGHTING.HudTooltip");
    button.innerHTML = `<i class="fas fa-lightbulb"></i>`;
    wrap.append(button);

    const palette = document.createElement("div");
    palette.className = "faundryvtt-light-palette";

    for (const preset of presets) {
      const active = light.bright === preset.bright && light.dim === preset.dim && light.angle === preset.angle;
      palette.append(TokenHudLighting.#buildEntry({
        icon: preset.icon,
        label: preset.label,
        detail: `${preset.bright}/${preset.dim}/${preset.angle}°`,
        active,
        onClick: () => LightingSystem.updateTokenLight(preset.bright, preset.dim, preset.angle, [token])
      }));
    }

    palette.append(TokenHudLighting.#buildEntry({
      icon: "fas fa-power-off",
      label: game.i18n.localize("LIGHTING.TurnOff"),
      off: true,
      onClick: () => LightingSystem.turnOffLight([token])
    }));

    wrap.append(palette);

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      wrap.classList.toggle("open");
    });

    palette.addEventListener("click", (event) => {
      if (event.target.closest(".faundryvtt-light-entry")) wrap.classList.remove("open");
    });

    return wrap;
  }

  static #buildEntry({ icon, label, detail = "", active = false, off = false, onClick }) {
    const entry = document.createElement("button");
    entry.type = "button";
    entry.className = "faundryvtt-light-entry";
    if (active) entry.classList.add("active");
    if (off) entry.classList.add("off");

    const i = document.createElement("i");
    i.className = icon;
    const name = document.createElement("span");
    name.textContent = label;
    entry.append(i, name);

    if (detail) {
      const small = document.createElement("small");
      small.textContent = detail;
      entry.append(small);
    }

    entry.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return entry;
  }
}
