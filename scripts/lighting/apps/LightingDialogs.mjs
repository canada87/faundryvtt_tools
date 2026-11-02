import { LightingSystem } from "../LightingSystem.mjs";

const { DialogV2 } = foundry.applications.api;

/** Icons offered as one-click choices in the preset editor. */
const ICON_SUGGESTIONS = [
  "fas fa-fire", "fas fa-fire-flame-curved", "fas fa-candle-holder", "fas fa-flashlight",
  "fas fa-lightbulb", "fas fa-sun", "fas fa-moon", "fas fa-star",
  "fas fa-wand-sparkles", "fas fa-gem", "fas fa-bolt", "fas fa-eye"
];

/**
 * In-game dialogs of the Lighting Control: create/edit/delete a preset
 * and choose which players get it in their token HUD.
 */
export class LightingDialogs {

  /**
   * Create or edit a preset, including who can use it.
   * @param {object|null} preset  existing preset, or null to create one
   * @param {object} [defaults]   initial values for a new preset
   */
  static async editPreset(preset, defaults = {}) {
    const esc = Handlebars.escapeExpression;
    const loc = key => game.i18n.localize(key);
    const isNew = !preset;
    const data = preset ?? { label: "", icon: "fas fa-lightbulb", bright: 3, dim: 6, angle: 360, ...defaults };
    const access = isNew ? { all: false, users: [] } : LightingSystem.getPresetAccess(preset.id);

    const icons = ICON_SUGGESTIONS.map(icon => `
      <button type="button" class="icon-choice" data-icon="${icon}" aria-label="${icon}"
              aria-pressed="${icon === data.icon}"><i class="${icon}" aria-hidden="true"></i></button>`)
      .join("");

    const content = `
      <div class="lighting-dialog">
        <div class="ld-identity">
          <span class="ld-icon-preview"><i class="${esc(data.icon)}" aria-hidden="true"></i></span>
          <label class="ld-field">
            <span class="ld-label">${loc("LIGHTING.PresetLabel")}</span>
            <input type="text" name="label" value="${esc(data.label)}" placeholder="${loc("LIGHTING.PresetLabelPlaceholder")}" autofocus />
          </label>
        </div>

        <section class="ld-section">
          <span class="ld-label">${loc("LIGHTING.PresetIcon")}</span>
          <div class="icon-choices">${icons}</div>
          <input type="text" name="icon" class="ld-icon-input" value="${esc(data.icon)}"
                 placeholder="fas fa-fire" aria-label="${loc("LIGHTING.PresetIconClass")}" />
        </section>

        <section class="ld-section">
          <span class="ld-label">${loc("LIGHTING.PresetValues")}</span>
          <div class="light-values">
            <label class="ld-field">
              <span class="ld-sublabel">Bright</span>
              <input type="number" name="bright" value="${Number(data.bright)}" min="0" step="0.5" />
            </label>
            <label class="ld-field">
              <span class="ld-sublabel">Dim</span>
              <input type="number" name="dim" value="${Number(data.dim)}" min="0" step="0.5" />
            </label>
            <label class="ld-field">
              <span class="ld-sublabel">Angle</span>
              <input type="number" name="angle" value="${Number(data.angle)}" min="1" max="360" step="1" />
            </label>
          </div>
        </section>

        ${this.#accessFields(access)}
      </div>`;

    const buttons = [{
      action: "save",
      label: loc("LIGHTING.Save"),
      icon: "fas fa-save",
      default: true,
      callback: (event, button) => {
        const f = button.form.elements;
        return {
          action: "save",
          preset: {
            id: preset?.id,
            label: f.label.value,
            icon: f.icon.value,
            bright: f.bright.value,
            dim: f.dim.value,
            angle: f.angle.value
          },
          access: this.#readAccess(button.form)
        };
      }
    }];
    if (!isNew) {
      buttons.push({
        action: "delete",
        label: loc("LIGHTING.RemovePreset"),
        icon: "fas fa-trash",
        callback: () => ({ action: "delete" })
      });
    }

    const result = await DialogV2.wait({
      window: {
        title: loc(isNew ? "LIGHTING.NewPresetTitle" : "LIGHTING.EditPresetTitle"),
        icon: "fas fa-lightbulb"
      },
      classes: ["lighting", "lighting-dialog-window"],
      position: { width: 440 },
      content,
      buttons,
      rejectClose: false,
      render: (event, dialog) => {
        const root = dialog?.element ?? dialog;
        this.#activateIconPicker(root);
        this.#activateAccessFields(root);
      }
    });
    if (!result || typeof result !== "object") return;

    if (result.action === "delete") {
      const confirmed = await DialogV2.confirm({
        window: { title: loc("LIGHTING.RemovePreset") },
        content: `<p>${game.i18n.format("LIGHTING.ConfirmDelete", { name: esc(preset.label) })}</p>`,
        rejectClose: false
      });
      if (confirmed) await LightingSystem.deletePreset(preset.id);
      return;
    }

    if (!result.preset.label.trim()) {
      ui.notifications.warn(loc("LIGHTING.Warn.NoLabel"));
      return;
    }
    const saved = await LightingSystem.savePreset(result.preset);
    await LightingSystem.setPresetAccess(saved.id, result.access);
  }

  /**
   * Choose which players see a preset in their token HUD.
   * @param {object} preset
   */
  static async editAccess(preset) {
    const loc = key => game.i18n.localize(key);
    const content = `
      <div class="lighting-dialog">
        <p>${game.i18n.format("LIGHTING.AccessDialogHint", { name: Handlebars.escapeExpression(preset.label) })}</p>
        ${this.#accessFields(LightingSystem.getPresetAccess(preset.id))}
      </div>`;

    const access = await DialogV2.wait({
      window: { title: loc("LIGHTING.AccessTitle"), icon: "fas fa-users" },
      classes: ["lighting", "lighting-dialog-window"],
      position: { width: 360 },
      content,
      buttons: [{
        action: "save",
        label: loc("LIGHTING.Save"),
        icon: "fas fa-save",
        default: true,
        callback: (event, button) => this.#readAccess(button.form)
      }],
      rejectClose: false,
      render: (event, dialog) => this.#activateAccessFields(dialog?.element ?? dialog)
    });
    if (!access || typeof access !== "object") return;
    await LightingSystem.setPresetAccess(preset.id, access);
  }

  /**
   * Short description of who can use a preset, for tooltips.
   * @param {string} id
   * @returns {{state: "none"|"all"|"some", text: string}}
   */
  static describeAccess(id) {
    const access = LightingSystem.getPresetAccess(id);
    if (access.all) return { state: "all", text: game.i18n.localize("LIGHTING.AccessAll") };
    const names = access.users.map(uid => game.users.get(uid)?.name).filter(Boolean);
    if (!names.length) return { state: "none", text: game.i18n.localize("LIGHTING.AccessNone") };
    return { state: "some", text: game.i18n.format("LIGHTING.AccessSome", { names: names.join(", ") }) };
  }

  /* ---------------------------------------- */
  /*  Helpers                                  */
  /* ---------------------------------------- */

  static #accessFields(access) {
    const esc = Handlebars.escapeExpression;
    const loc = key => game.i18n.localize(key);
    const players = LightingSystem.getPlayers();

    const rows = players.length
      ? players.map(u => `
          <label class="player-choice">
            <input type="checkbox" name="users" value="${u.id}" ${access.users.includes(u.id) ? "checked" : ""} />
            <span class="player-color" style="background:${esc(u.color?.css ?? u.color)}"></span>
            <span class="player-name">${esc(u.name)}</span>
            ${u.character ? `<small>${esc(u.character.name)}</small>` : ""}
          </label>`).join("")
      : `<p class="ld-hint">${loc("LIGHTING.NoPlayers")}</p>`;

    return `
      <fieldset class="ld-section access-fields">
        <legend class="ld-label">${loc("LIGHTING.AccessLegend")}</legend>
        <div class="player-box">
          <label class="player-choice all-choice">
            <input type="checkbox" name="all" ${access.all ? "checked" : ""} />
            <i class="fas fa-users" aria-hidden="true"></i>
            <span class="player-name">${loc("LIGHTING.AccessAllPlayers")}</span>
          </label>
          <div class="player-list ${access.all ? "disabled" : ""}">${rows}</div>
        </div>
      </fieldset>`;
  }

  static #readAccess(form) {
    return {
      all: !!form.elements.all?.checked,
      users: [...form.querySelectorAll('input[name="users"]:checked')].map(i => i.value)
    };
  }

  /** "All players" greys out the individual choices (kept, so unchecking restores them). */
  static #activateAccessFields(root) {
    const all = root?.querySelector('input[name="all"]');
    const list = root?.querySelector(".player-list");
    if (!all || !list) return;
    all.addEventListener("change", () => list.classList.toggle("disabled", all.checked));
  }

  static #activateIconPicker(root) {
    const input = root?.querySelector('input[name="icon"]');
    const preview = root?.querySelector(".ld-icon-preview i");
    if (!input || !preview) return;
    const choices = root.querySelectorAll(".icon-choice");
    const update = () => {
      const icon = input.value.trim() || "fas fa-lightbulb";
      preview.className = icon;
      choices.forEach(btn => btn.setAttribute("aria-pressed", String(btn.dataset.icon === icon)));
    };
    input.addEventListener("input", update);
    choices.forEach(btn => btn.addEventListener("click", () => {
      input.value = btn.dataset.icon;
      update();
    }));
  }
}
