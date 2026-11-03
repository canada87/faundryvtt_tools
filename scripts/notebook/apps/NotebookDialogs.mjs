import { NotebookSystem } from "../NotebookSystem.mjs";

const { DialogV2 } = foundry.applications.api;

const esc = (value) => Handlebars.escapeExpression(value ?? "");
const loc = (key) => game.i18n.localize(key);

/**
 * Dialogs of the Notebook: post-it editor, handout editor, creature editor,
 * per-player visibility and the bestiary field template.
 */
export class NotebookDialogs {

  /**
   * Create or edit a post-it.
   * @param {object|null} item
   * @returns {Promise<{title: string, text: string, color: string}|null>}
   */
  static async editNote(item = null) {
    const data = item ?? { title: "", text: "", color: NotebookSystem.NOTE_COLORS[0] };
    const swatches = NotebookSystem.NOTE_COLORS.map(color => `
      <label class="nbd-swatch" style="--swatch:${color}">
        <input type="radio" name="color" value="${color}" ${color === data.color ? "checked" : ""} />
        <span aria-hidden="true"></span>
      </label>`).join("");

    const content = `
      <div class="nbd">
        <label class="nbd-field">
          <span class="nbd-label">${loc("NOTEBOOK.Board.NoteTitle")}</span>
          <input type="text" name="title" value="${esc(data.title)}" autofocus />
        </label>
        <label class="nbd-field">
          <span class="nbd-label">${loc("NOTEBOOK.Board.NoteText")}</span>
          <textarea name="text" rows="6">${esc(data.text)}</textarea>
        </label>
        <div class="nbd-field">
          <span class="nbd-label">${loc("NOTEBOOK.Board.NoteColor")}</span>
          <div class="nbd-swatches">${swatches}</div>
        </div>
      </div>`;

    return this.#wait({
      title: item ? "NOTEBOOK.Board.EditNote" : "NOTEBOOK.Board.AddNote",
      icon: "fas fa-note-sticky",
      width: 420,
      content,
      read: (form) => ({
        title: form.elements.title.value.trim(),
        text: form.elements.text.value,
        color: form.querySelector('input[name="color"]:checked')?.value ?? NotebookSystem.NOTE_COLORS[0]
      })
    });
  }

  /**
   * Create or edit a handout, including who receives it.
   * @param {object|null} handout
   * @returns {Promise<object|null>}
   */
  static async editHandout(handout = null) {
    const data = { title: "", text: "", img: "", uuid: null, visibility: NotebookSystem.hidden(), ...handout };
    const content = `
      <div class="nbd">
        <label class="nbd-field">
          <span class="nbd-label">${loc("NOTEBOOK.Handouts.HandoutTitle")}</span>
          <input type="text" name="title" value="${esc(data.title)}" autofocus />
        </label>
        <div class="nbd-field">
          <span class="nbd-label">${loc("NOTEBOOK.Handouts.Image")}</span>
          <div class="nbd-file">
            <input type="text" name="img" value="${esc(data.img)}" placeholder="worlds/…/handout.webp" />
            <button type="button" class="nbd-browse" data-target="img">
              <i class="fas fa-file-import" aria-hidden="true"></i> ${loc("NOTEBOOK.Browse")}
            </button>
          </div>
        </div>
        <label class="nbd-field">
          <span class="nbd-label">${loc("NOTEBOOK.Handouts.Text")}</span>
          <textarea name="text" rows="8">${esc(data.text)}</textarea>
          <small class="nbd-hint">${loc("NOTEBOOK.Handouts.TextHint")}</small>
        </label>
        ${data.uuid ? `<p class="nbd-hint"><i class="fas fa-link" aria-hidden="true"></i> ${loc("NOTEBOOK.Handouts.Linked")}: <code>${esc(data.uuid)}</code></p>` : ""}
        ${this.#accessFields(data.visibility)}
      </div>`;

    const result = await this.#wait({
      title: handout?.id ? "NOTEBOOK.Handouts.Edit" : "NOTEBOOK.Handouts.Add",
      icon: "fas fa-scroll",
      width: 520,
      content,
      read: (form) => ({
        id: handout?.id,
        title: form.elements.title.value,
        img: form.elements.img.value,
        text: form.elements.text.value,
        uuid: data.uuid,
        visibility: this.#readAccess(form)
      })
    });
    return result;
  }

  /**
   * Edit a creature: true name, image and the fields with their real value
   * and an optional vague hint.
   * @param {object} creature
   * @returns {Promise<{name: string, img: string, fields: object[]}|null>}
   */
  static async editCreature(creature) {
    const rows = creature.fields.map(f => this.#fieldRow(f)).join("");
    const content = `
      <div class="nbd nbd-creature">
        <div class="nbd-creature-head">
          <img class="nbd-portrait" src="${esc(creature.img || "icons/svg/mystery-man.svg")}" alt="" />
          <div class="nbd-creature-id">
            <label class="nbd-field">
              <span class="nbd-label">${loc("NOTEBOOK.Bestiary.Name")}</span>
              <input type="text" name="name" value="${esc(creature.name)}" />
            </label>
            <div class="nbd-field">
              <span class="nbd-label">${loc("NOTEBOOK.Bestiary.Image")}</span>
              <div class="nbd-file">
                <input type="text" name="img" value="${esc(creature.img)}" />
                <button type="button" class="nbd-browse" data-target="img">
                  <i class="fas fa-file-import" aria-hidden="true"></i> ${loc("NOTEBOOK.Browse")}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="nbd-field">
          <div class="nbd-fields-head">
            <span>${loc("NOTEBOOK.Bestiary.FieldLabel")}</span>
            <span>${loc("NOTEBOOK.Bestiary.FieldValue")}</span>
            <span>${loc("NOTEBOOK.Bestiary.FieldHint")}</span>
            <span></span>
          </div>
          <div class="nbd-fields">${rows}</div>
          <button type="button" class="nbd-add-field">
            <i class="fas fa-plus" aria-hidden="true"></i> ${loc("NOTEBOOK.Bestiary.AddField")}
          </button>
          <small class="nbd-hint">${loc("NOTEBOOK.Bestiary.FieldsHint")}</small>
        </div>
      </div>`;

    return this.#wait({
      title: "NOTEBOOK.Bestiary.Edit",
      icon: "fas fa-dragon",
      width: 680,
      content,
      render: (root) => {
        const list = root.querySelector(".nbd-fields");
        root.querySelector(".nbd-add-field")?.addEventListener("click", () => {
          list.insertAdjacentHTML("beforeend", this.#fieldRow({ id: "", label: "", value: "", hint: "" }));
          list.lastElementChild?.querySelector("input")?.focus();
        });
        list.addEventListener("click", (event) => {
          const row = event.target.closest(".nbd-field-row");
          if (!row) return;
          if (event.target.closest(".nbd-remove")) row.remove();
          else if (event.target.closest(".nbd-up") && row.previousElementSibling) row.after(row.previousElementSibling);
          else if (event.target.closest(".nbd-down") && row.nextElementSibling) row.before(row.nextElementSibling);
        });
        const img = root.querySelector('input[name="img"]');
        const portrait = root.querySelector(".nbd-portrait");
        img?.addEventListener("change", () => { portrait.src = img.value || "icons/svg/mystery-man.svg"; });
      },
      read: (form) => ({
        name: form.elements.name.value.trim(),
        img: form.elements.img.value.trim(),
        fields: [...form.querySelectorAll(".nbd-field-row")]
          .map(row => ({
            id: row.dataset.fieldId || null,
            label: row.querySelector('[name="label"]').value.trim(),
            value: row.querySelector('[name="value"]').value,
            hint: row.querySelector('[name="hint"]').value
          }))
          .filter(f => f.label || f.value)
      })
    });
  }

  /**
   * Choose which players see something; fields can also show only their hint.
   * @param {object} options
   * @param {string} options.title       what is being revealed
   * @param {object} options.visibility  current visibility
   * @param {string} [options.level]     "hint" | "full" (fields only)
   * @param {boolean} [options.hasHint]
   * @returns {Promise<{visibility: object, level: string|null}|null>}
   */
  static async editAccess({ title, visibility, level = null, hasHint = false }) {
    const levelFields = level ? `
      <fieldset class="nbd-section">
        <legend class="nbd-label">${loc("NOTEBOOK.Vis.Level")}</legend>
        <label class="nbd-radio">
          <input type="radio" name="level" value="full" ${level !== "hint" ? "checked" : ""} />
          <span>${loc("NOTEBOOK.Vis.LevelFull")}</span>
        </label>
        <label class="nbd-radio ${hasHint ? "" : "disabled"}">
          <input type="radio" name="level" value="hint" ${level === "hint" ? "checked" : ""} ${hasHint ? "" : "disabled"} />
          <span>${loc("NOTEBOOK.Vis.LevelHint")}</span>
        </label>
      </fieldset>` : "";

    const content = `
      <div class="nbd">
        <p class="nbd-subject">${esc(title)}</p>
        ${this.#accessFields(visibility)}
        ${levelFields}
      </div>`;

    return this.#wait({
      title: "NOTEBOOK.Vis.Title",
      icon: "fas fa-eye",
      width: 360,
      content,
      read: (form) => ({
        visibility: this.#readAccess(form),
        level: level ? (form.querySelector('input[name="level"]:checked')?.value ?? "full") : null
      })
    });
  }

  /**
   * Edit the field labels new creatures start with.
   * @returns {Promise<string[]|null>}
   */
  static async editTemplate() {
    const content = `
      <div class="nbd">
        <p class="nbd-hint">${loc("NOTEBOOK.Bestiary.TemplateHint")}</p>
        <textarea name="labels" rows="12">${esc(NotebookSystem.getTemplate().join("\n"))}</textarea>
      </div>`;
    return this.#wait({
      title: "NOTEBOOK.Bestiary.Template",
      icon: "fas fa-list",
      width: 380,
      content,
      read: (form) => form.elements.labels.value.split("\n")
    });
  }

  static async confirm(titleKey, message) {
    return DialogV2.confirm({
      window: { title: loc(titleKey) },
      content: `<p>${message}</p>`,
      rejectClose: false
    });
  }

  /* ---------------------------------------- */
  /*  Helpers                                  */
  /* ---------------------------------------- */

  static async #wait({ title, icon, width, content, read, render }) {
    const result = await DialogV2.wait({
      window: { title: loc(title), icon },
      classes: ["fvtt-notebook-dialog"],
      position: { width },
      content,
      buttons: [{
        action: "save",
        label: loc("NOTEBOOK.Save"),
        icon: "fas fa-save",
        default: true,
        callback: (event, button) => ({ value: read(button.form) })
      }],
      rejectClose: false,
      render: (event, dialog) => {
        const root = dialog?.element ?? dialog;
        this.#activateBrowse(root);
        this.#activateAccessFields(root);
        render?.(root);
      }
    });
    return result && typeof result === "object" ? result.value : null;
  }

  static #fieldRow(field) {
    return `
      <div class="nbd-field-row" data-field-id="${esc(field.id)}">
        <input type="text" name="label" value="${esc(field.label)}" />
        <textarea name="value" rows="1">${esc(field.value)}</textarea>
        <input type="text" name="hint" value="${esc(field.hint)}" placeholder="${loc("NOTEBOOK.Bestiary.FieldHintPlaceholder")}" />
        <div class="nbd-row-actions">
          <button type="button" class="nbd-up" aria-label="${loc("NOTEBOOK.MoveUp")}"><i class="fas fa-arrow-up" aria-hidden="true"></i></button>
          <button type="button" class="nbd-down" aria-label="${loc("NOTEBOOK.MoveDown")}"><i class="fas fa-arrow-down" aria-hidden="true"></i></button>
          <button type="button" class="nbd-remove" aria-label="${loc("NOTEBOOK.Bestiary.RemoveField")}"><i class="fas fa-trash" aria-hidden="true"></i></button>
        </div>
      </div>`;
  }

  static #accessFields(visibility) {
    const vis = NotebookSystem.normalizeVisibility(visibility);
    const players = NotebookSystem.getPlayers();
    const rows = players.length
      ? players.map(u => `
          <label class="nbd-player">
            <input type="checkbox" name="users" value="${u.id}" ${vis.users.includes(u.id) ? "checked" : ""} />
            <span class="nbd-player-color" style="background:${esc(u.color?.css ?? u.color)}"></span>
            <span>${esc(u.name)}</span>
            ${u.character ? `<small>${esc(u.character.name)}</small>` : ""}
          </label>`).join("")
      : `<p class="nbd-hint">${loc("NOTEBOOK.NoPlayers")}</p>`;

    return `
      <fieldset class="nbd-section nbd-access">
        <legend class="nbd-label">${loc("NOTEBOOK.Vis.Who")}</legend>
        <label class="nbd-player nbd-all">
          <input type="checkbox" name="all" ${vis.all ? "checked" : ""} />
          <i class="fas fa-users" aria-hidden="true"></i>
          <span>${loc("NOTEBOOK.Vis.AllPlayers")}</span>
        </label>
        <div class="nbd-players ${vis.all ? "disabled" : ""}">${rows}</div>
        <small class="nbd-hint">${loc("NOTEBOOK.Vis.NobodyHint")}</small>
      </fieldset>`;
  }

  static #readAccess(form) {
    return {
      all: !!form.elements.all?.checked,
      users: [...form.querySelectorAll('input[name="users"]:checked')].map(i => i.value)
    };
  }

  static #activateAccessFields(root) {
    const all = root?.querySelector('input[name="all"]');
    const list = root?.querySelector(".nbd-players");
    if (!all || !list) return;
    all.addEventListener("change", () => list.classList.toggle("disabled", all.checked));
  }

  static #activateBrowse(root) {
    const FilePickerImpl = foundry.applications.apps?.FilePicker?.implementation ?? FilePicker;
    root?.querySelectorAll(".nbd-browse").forEach(button => {
      button.addEventListener("click", () => {
        const input = root.querySelector(`input[name="${button.dataset.target}"]`);
        new FilePickerImpl({
          type: "image",
          current: input.value,
          callback: (path) => {
            input.value = path;
            input.dispatchEvent(new Event("change"));
          }
        }).render(true);
      });
    });
  }
}
