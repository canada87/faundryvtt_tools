import { MODULE_ID } from "../../shared/constants.mjs";
import { NotebookSystem } from "../NotebookSystem.mjs";
import { NotebookDialogs } from "./NotebookDialogs.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const APP_ID = "fvtt-notebook";

const TABS = [
  { id: "board", icon: "fas fa-note-sticky", label: "NOTEBOOK.Tabs.Board" },
  { id: "bestiary", icon: "fas fa-dragon", label: "NOTEBOOK.Tabs.Bestiary" },
  { id: "handouts", icon: "fas fa-scroll", label: "NOTEBOOK.Tabs.Handouts" }
];

const VIS_ICONS = {
  hidden: "fas fa-eye-slash",
  hint: "fas fa-circle-half-stroke",
  all: "fas fa-eye",
  some: "fas fa-user-group"
};

/**
 * The players' Notebook: a book with bookmark tabs on its edge for the
 * personal board, the bestiary and the GM's handouts.
 *
 * Players see their own notebook. The GM edits bestiary and handouts and,
 * through "View as", reads a player's board or previews what they see.
 */
export class NotebookApp extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: APP_ID,
    classes: ["faundryvtt-tools", "fvtt-notebook"],
    window: {
      icon: "fas fa-book",
      title: "NOTEBOOK.Title",
      resizable: true
    },
    position: {
      width: 900,
      height: 660
    },
    actions: {
      switchTab: NotebookApp.#onSwitchTab,
      addNote: NotebookApp.#onAddNote,
      editBoardItem: NotebookApp.#onEditBoardItem,
      deleteBoardItem: NotebookApp.#onDeleteBoardItem,
      openLink: NotebookApp.#onOpenLink,
      viewPlayer: NotebookApp.#onViewPlayer,
      selectCreature: NotebookApp.#onSelectCreature,
      addCreature: NotebookApp.#onAddCreature,
      addSelectedTokens: NotebookApp.#onAddSelectedTokens,
      editCreature: NotebookApp.#onEditCreature,
      deleteCreature: NotebookApp.#onDeleteCreature,
      openActor: NotebookApp.#onOpenActor,
      cyclePart: NotebookApp.#onCyclePart,
      revealAll: NotebookApp.#onRevealAll,
      hideAll: NotebookApp.#onHideAll,
      editTemplate: NotebookApp.#onEditTemplate,
      addCreatureNote: NotebookApp.#onAddCreatureNote,
      deleteCreatureNote: NotebookApp.#onDeleteCreatureNote,
      toggleNoteShared: NotebookApp.#onToggleNoteShared,
      addHandout: NotebookApp.#onAddHandout,
      openHandout: NotebookApp.#onOpenHandout,
      closeHandout: NotebookApp.#onCloseHandout,
      editHandout: NotebookApp.#onEditHandout,
      deleteHandout: NotebookApp.#onDeleteHandout,
      cycleHandout: NotebookApp.#onCycleHandout,
      showImage: NotebookApp.#onShowImage
    }
  };

  static PARTS = {
    book: {
      template: `modules/${MODULE_ID}/templates/notebook/notebook.hbs`
    }
  };

  /** @type {"board"|"bestiary"|"handouts"} */
  tab = "board";

  /** GM only: the player whose notebook is shown (null = GM editing). */
  viewAs = null;

  creatureId = null;

  handoutId = null;

  #search = "";

  /** Text being typed in the creature note box, kept across re-renders. */
  #noteDraft = { creatureId: null, text: "", shared: true };

  /** Class of the text input focused when a re-render started. */
  #focused = null;

  /* ---------------------------------------- */
  /*  Static entry points                      */
  /* ---------------------------------------- */

  static get instance() {
    return foundry.applications.instances.get(APP_ID) ?? null;
  }

  /**
   * @param {object} [options]
   * @param {string} [options.tab]
   * @param {string} [options.creatureId]
   */
  static open({ tab, creatureId } = {}) {
    const app = this.instance ?? new NotebookApp();
    if (tab) app.tab = tab;
    if (creatureId) {
      app.creatureId = creatureId;
      app.viewAs = null;
    }
    app.render({ force: true });
    return app;
  }

  static toggle() {
    const app = this.instance;
    if (app?.rendered) app.close();
    else this.open();
  }

  static refresh() {
    const app = this.instance;
    if (app?.rendered) app.render();
  }

  /* ---------------------------------------- */
  /*  Context                                  */
  /* ---------------------------------------- */

  /** The user whose perspective is shown. */
  get #viewer() {
    if (!game.user.isGM) return game.user;
    return (this.viewAs && game.users.get(this.viewAs)) || game.user;
  }

  /** GM editing (not previewing a player). */
  get #editing() {
    return game.user.isGM && !this.viewAs;
  }

  async _prepareContext() {
    const isGM = game.user.isGM;
    const viewer = this.#viewer;
    const unseen = isGM ? 0 : NotebookSystem.getVisibleHandouts().filter(h => NotebookSystem.unseenHandouts.has(h.id)).length;

    const context = {
      isGM,
      editing: this.#editing,
      previewing: isGM && !!this.viewAs,
      viewerName: viewer.name,
      tab: this.tab,
      tabs: TABS.map(t => ({
        ...t,
        label: game.i18n.localize(t.label),
        active: t.id === this.tab,
        badge: t.id === "handouts" ? unseen : 0
      })),
      players: isGM ? NotebookSystem.getPlayers().map(u => ({
        id: u.id,
        name: u.name,
        selected: u.id === this.viewAs
      })) : []
    };

    if (this.tab === "board") Object.assign(context, this.#prepareBoard(viewer));
    else if (this.tab === "bestiary") Object.assign(context, await this.#prepareBestiary(viewer));
    else Object.assign(context, await this.#prepareHandouts(viewer));
    return context;
  }

  #prepareBoard(viewer) {
    const isGM = game.user.isGM;
    if (isGM && !this.viewAs) {
      return {
        isBoard: true,
        boardOwnerMissing: true,
        playerCards: NotebookSystem.getPlayers().map(u => ({
          id: u.id,
          name: u.name,
          color: u.color?.css ?? u.color,
          avatar: u.character?.img ?? u.avatar,
          count: NotebookSystem.getBoard(u).length
        }))
      };
    }
    const items = NotebookSystem.getBoard(viewer)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(item => ({ ...item, isLink: item.kind === "link" }));
    return { isBoard: true, boardItems: items, boardReadOnly: isGM };
  }

  async #prepareBestiary(viewer) {
    const editing = this.#editing;
    const creatures = editing ? NotebookSystem.getCreatures() : NotebookSystem.getVisibleCreatures(viewer);
    if (!creatures.some(c => c.id === this.creatureId)) this.creatureId = creatures[0]?.id ?? null;
    const unknown = game.i18n.localize("NOTEBOOK.Bestiary.Unknown");

    const list = creatures
      .map(c => {
        const nameKnown = NotebookSystem.canSee(c.nameVisibility, viewer);
        return {
          id: c.id,
          name: editing || nameKnown ? c.name : unknown,
          img: c.img,
          silhouette: !editing && !NotebookSystem.canSee(c.imgVisibility, viewer),
          active: c.id === this.creatureId,
          hiddenEntry: editing && NotebookSystem.isHidden(c.visibility),
          nameHidden: editing && NotebookSystem.isHidden(c.nameVisibility)
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const selected = creatures.find(c => c.id === this.creatureId);
    return {
      isBestiary: true,
      creatures: list,
      search: this.#search,
      creature: selected ? this.#prepareCreature(selected, viewer) : null
    };
  }

  #prepareCreature(c, viewer) {
    const editing = this.#editing;
    const nameKnown = NotebookSystem.canSee(c.nameVisibility, viewer);
    const imgKnown = NotebookSystem.canSee(c.imgVisibility, viewer);

    const fields = c.fields.map(f => {
      const visible = NotebookSystem.canSee(f.visibility, viewer);
      const showHint = f.level === "hint" && f.hint?.trim();
      let state = "hidden";
      let text = "";
      if (editing) {
        state = NotebookSystem.isHidden(f.visibility) ? "hidden" : (showHint ? "hint" : "full");
        text = f.value;
      } else if (visible) {
        state = showHint ? "hint" : "full";
        text = showHint ? f.hint : f.value;
      }
      return {
        id: f.id,
        label: f.label,
        state,
        text,
        hint: editing ? f.hint : "",
        empty: !text?.trim(),
        vis: editing ? this.#visButton(f.visibility, showHint ? "hint" : null) : null
      };
    });

    const notes = NotebookSystem.getCreatureNotes(c.id, viewer).map(n => ({
      ...n,
      canDelete: n.mine || game.user.isGM
    }));

    return {
      id: c.id,
      name: editing || nameKnown ? c.name : game.i18n.localize("NOTEBOOK.Bestiary.Unknown"),
      nameUnknown: !editing && !nameKnown,
      img: c.img,
      silhouette: !editing && !imgKnown,
      hasActor: editing && !!c.actorUuid,
      parts: editing ? {
        entry: this.#visButton(c.visibility),
        name: this.#visButton(c.nameVisibility),
        img: this.#visButton(c.imgVisibility)
      } : null,
      fields,
      notes,
      canWriteNotes: !game.user.isGM
    };
  }

  #visButton(visibility, level = null) {
    const state = NotebookSystem.visibilityState(visibility);
    const shown = state !== "hidden" && level === "hint" ? "hint" : state;
    let tooltip = NotebookSystem.describeVisibility(visibility);
    if (shown === "hint") tooltip += ` · ${game.i18n.localize("NOTEBOOK.Vis.HintOnly")}`;
    return { state: shown, icon: VIS_ICONS[shown], tooltip };
  }

  async #prepareHandouts(viewer) {
    const editing = this.#editing;
    const handouts = (editing ? NotebookSystem.getHandouts() : NotebookSystem.getVisibleHandouts(viewer))
      .sort((a, b) => b.createdAt - a.createdAt);

    const cards = handouts.map(h => ({
      id: h.id,
      title: h.title,
      img: h.img,
      excerpt: this.#plainText(h.text).slice(0, 140),
      isNew: !game.user.isGM && NotebookSystem.unseenHandouts.has(h.id),
      hidden: editing && NotebookSystem.isHidden(h.visibility),
      vis: editing ? this.#visButton(h.visibility) : null
    }));

    let handout = null;
    const open = this.handoutId && handouts.find(h => h.id === this.handoutId);
    if (open) {
      handout = {
        id: open.id,
        title: open.title,
        img: open.img,
        uuid: open.uuid,
        html: await this.#enrich(open.text),
        vis: editing ? this.#visButton(open.visibility) : null
      };
    } else {
      this.handoutId = null;
    }
    return { isHandouts: true, handouts: cards, handout };
  }

  #plainText(html) {
    const div = document.createElement("div");
    div.innerHTML = html ?? "";
    return (div.textContent ?? "").trim();
  }

  async #enrich(text) {
    if (!text?.trim()) return "";
    // Plain text keeps its line breaks; HTML (e.g. a copied journal page) is used as is.
    const html = /<[a-z][\s\S]*>/i.test(text)
      ? text
      : Handlebars.escapeExpression(text).replace(/\n/g, "<br>");
    const TE = foundry.applications.ux?.TextEditor?.implementation ?? TextEditor;
    return TE.enrichHTML(html, { secrets: game.user.isGM });
  }

  /* ---------------------------------------- */
  /*  Rendering                                */
  /* ---------------------------------------- */

  /**
   * Other users' changes re-render the notebook while a player may be
   * typing: remember the draft note and which input had focus.
   */
  async _preRender(context, options) {
    await super._preRender(context, options);
    const active = document.activeElement;
    this.#focused = null;
    if (active && this.element?.contains(active)) {
      this.#focused = [".nb-note-input", ".nb-search"].find(sel => active.matches(sel)) ?? null;
    }
  }

  _onRender(context, options) {
    const root = this.element;
    if (!root) return;

    const noteInput = root.querySelector(".nb-note-input");
    const noteShared = root.querySelector(".nb-note-shared");
    if (noteInput) {
      if (this.#noteDraft.creatureId === this.creatureId) {
        noteInput.value = this.#noteDraft.text;
        noteShared.checked = this.#noteDraft.shared;
      } else {
        this.#noteDraft = { creatureId: this.creatureId, text: "", shared: true };
      }
      noteInput.addEventListener("input", () => { this.#noteDraft.text = noteInput.value; });
      noteShared?.addEventListener("change", () => { this.#noteDraft.shared = noteShared.checked; });
    }

    if (this.#focused) {
      const input = root.querySelector(this.#focused);
      input?.focus();
      input?.setSelectionRange?.(input.value.length, input.value.length);
    }

    root.querySelector(".nb-view-as")?.addEventListener("change", (event) => {
      this.viewAs = event.currentTarget.value || null;
      this.render();
    });

    // Right-click on a visibility button: choose the players
    root.querySelectorAll("[data-action='cyclePart'], [data-action='cycleHandout']").forEach(button => {
      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        this.#editAccess(button);
      });
    });

    // Bestiary list filter (no re-render while typing)
    const search = root.querySelector(".nb-search");
    search?.addEventListener("input", () => {
      this.#search = search.value;
      this.#applySearch();
    });
    this.#applySearch();

    // Creature note: Enter adds, Shift+Enter breaks the line
    root.querySelector(".nb-note-input")?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      root.querySelector("[data-action='addCreatureNote']")?.click();
    });

    const page = root.querySelector(".nb-page");
    page?.addEventListener("dragover", (event) => {
      if (!this.#acceptsDrop) return;
      event.preventDefault();
      page.classList.add("drag-over");
    });
    page?.addEventListener("dragleave", (event) => {
      if (!page.contains(event.relatedTarget)) page.classList.remove("drag-over");
    });
    page?.addEventListener("drop", (event) => {
      page.classList.remove("drag-over");
      this.#onDrop(event);
    });
  }

  #applySearch() {
    const term = this.#search.trim().toLowerCase();
    this.element?.querySelectorAll(".nb-creature-item").forEach(item => {
      item.hidden = !!term && !item.dataset.name.toLowerCase().includes(term);
    });
  }

  /* ---------------------------------------- */
  /*  Drag and drop                            */
  /* ---------------------------------------- */

  get #acceptsDrop() {
    if (this.tab === "board") return !game.user.isGM;
    return this.#editing;
  }

  async #onDrop(event) {
    if (!this.#acceptsDrop) return;
    event.preventDefault();
    const TE = foundry.applications.ux?.TextEditor?.implementation ?? TextEditor;
    const data = TE.getDragEventData(event);
    const uuid = data?.uuid;
    if (!uuid) return;

    if (this.tab === "board") {
      await NotebookSystem.addBoardLink(uuid);
      return;
    }

    if (this.tab === "bestiary") {
      const doc = await fromUuid(uuid);
      const actor = doc?.documentName === "Actor" ? doc : doc?.actor;
      if (!actor) {
        ui.notifications.warn(game.i18n.localize("NOTEBOOK.Warn.DropActor"));
        return;
      }
      const tokenDoc = doc.documentName === "Token" ? doc : null;
      const creature = await NotebookSystem.addFromActor(actor, tokenDoc);
      if (creature) {
        this.creatureId = creature.id;
        this.render();
      }
      return;
    }

    const handoutData = await NotebookSystem.handoutFromDocument(uuid);
    if (!handoutData) return;
    const result = await NotebookDialogs.editHandout(handoutData);
    if (result) await NotebookSystem.saveHandout(result);
  }

  /* ---------------------------------------- */
  /*  Visibility dialog                        */
  /* ---------------------------------------- */

  async #editAccess(button) {
    if (!this.#editing) return;

    if (button.dataset.action === "cycleHandout") {
      const handout = NotebookSystem.getHandout(button.dataset.id);
      if (!handout) return;
      const result = await NotebookDialogs.editAccess({ title: handout.title, visibility: handout.visibility });
      if (result) await NotebookSystem.setHandoutVisibility(handout.id, result.visibility);
      return;
    }

    const creature = NotebookSystem.getCreature(this.creatureId);
    if (!creature) return;
    const part = button.dataset.part;
    const partLabels = {
      entry: "NOTEBOOK.Vis.Entry",
      name: "NOTEBOOK.Vis.Name",
      img: "NOTEBOOK.Vis.Image"
    };
    let options;
    if (partLabels[part]) {
      const visibility = { entry: creature.visibility, name: creature.nameVisibility, img: creature.imgVisibility }[part];
      options = { title: `${creature.name} · ${game.i18n.localize(partLabels[part])}`, visibility };
    } else {
      const field = creature.fields.find(f => f.id === part);
      if (!field) return;
      options = {
        title: `${creature.name} · ${field.label}`,
        visibility: field.visibility,
        level: field.level ?? "full",
        hasHint: !!field.hint?.trim()
      };
    }
    const result = await NotebookDialogs.editAccess(options);
    if (result) await NotebookSystem.setPartVisibility(creature.id, part, result.visibility, result.level);
  }

  /* ---------------------------------------- */
  /*  Actions: general                         */
  /* ---------------------------------------- */

  static #onSwitchTab(event, target) {
    this.tab = target.dataset.tab;
    this.handoutId = null;
    this.render();
  }

  static #onViewPlayer(event, target) {
    this.viewAs = target.dataset.userId;
    this.render();
  }

  /* ---------------------------------------- */
  /*  Actions: board                           */
  /* ---------------------------------------- */

  static async #onAddNote() {
    const data = await NotebookDialogs.editNote();
    if (data) await NotebookSystem.addBoardItem({ kind: "note", ...data });
  }

  static async #onEditBoardItem(event, target) {
    const item = NotebookSystem.getBoard().find(i => i.id === target.dataset.id);
    if (!item || item.kind !== "note") return;
    const data = await NotebookDialogs.editNote(item);
    if (data) await NotebookSystem.updateBoardItem(item.id, data);
  }

  static async #onDeleteBoardItem(event, target) {
    await NotebookSystem.deleteBoardItem(target.dataset.id);
  }

  static async #onOpenLink(event, target) {
    const doc = await fromUuid(target.dataset.uuid);
    if (!doc || (!game.user.isGM && !doc.testUserPermission?.(game.user, "LIMITED"))) {
      ui.notifications.warn(game.i18n.localize("NOTEBOOK.Warn.LinkMissing"));
      return;
    }
    if (doc.documentName === "Scene") doc.view();
    else if (doc.documentName === "JournalEntryPage") doc.parent.sheet.render(true, { pageId: doc.id });
    else doc.sheet?.render(true);
  }

  /* ---------------------------------------- */
  /*  Actions: bestiary                        */
  /* ---------------------------------------- */

  static #onSelectCreature(event, target) {
    this.creatureId = target.dataset.id;
    this.render();
  }

  static async #onAddCreature() {
    const creature = await NotebookSystem.createCreature();
    this.creatureId = creature.id;
    const data = await NotebookDialogs.editCreature(creature);
    if (data) await NotebookSystem.updateCreature(creature.id, data);
  }

  static async #onAddSelectedTokens() {
    const tokens = canvas?.tokens?.controlled ?? [];
    if (!tokens.length) {
      ui.notifications.warn(game.i18n.localize("NOTEBOOK.Warn.NoTokens"));
      return;
    }
    let last = null;
    for (const token of tokens) {
      if (token.actor) last = await NotebookSystem.addFromActor(token.actor, token.document);
    }
    if (last) {
      this.creatureId = last.id;
      this.render();
    }
  }

  static async #onEditCreature() {
    const creature = NotebookSystem.getCreature(this.creatureId);
    if (!creature) return;
    const data = await NotebookDialogs.editCreature(creature);
    if (data) await NotebookSystem.updateCreature(creature.id, data);
  }

  static async #onDeleteCreature() {
    const creature = NotebookSystem.getCreature(this.creatureId);
    if (!creature) return;
    const message = game.i18n.format("NOTEBOOK.Bestiary.ConfirmDelete", { name: Handlebars.escapeExpression(creature.name) });
    if (!await NotebookDialogs.confirm("NOTEBOOK.Bestiary.Delete", message)) return;
    await NotebookSystem.deleteCreature(creature.id);
  }

  static async #onOpenActor() {
    const creature = NotebookSystem.getCreature(this.creatureId);
    const actor = creature?.actorUuid && await fromUuid(creature.actorUuid);
    actor?.sheet?.render(true);
  }

  static async #onCyclePart(event, target) {
    if (!this.#editing) return;
    await NotebookSystem.cyclePart(this.creatureId, target.dataset.part);
  }

  static async #onRevealAll() {
    await NotebookSystem.revealAll(this.creatureId);
  }

  static async #onHideAll() {
    await NotebookSystem.hideAll(this.creatureId);
  }

  static async #onEditTemplate() {
    const labels = await NotebookDialogs.editTemplate();
    if (labels) await NotebookSystem.saveTemplate(labels);
  }

  static async #onAddCreatureNote() {
    const input = this.element.querySelector(".nb-note-input");
    const shared = this.element.querySelector(".nb-note-shared")?.checked;
    if (!input?.value.trim()) return;
    const text = input.value;
    this.#noteDraft.text = "";
    await NotebookSystem.addCreatureNote(this.creatureId, text, shared);
  }

  static async #onDeleteCreatureNote(event, target) {
    await NotebookSystem.deleteCreatureNote(this.creatureId, target.dataset.id, target.dataset.userId);
  }

  static async #onToggleNoteShared(event, target) {
    await NotebookSystem.toggleCreatureNoteShared(this.creatureId, target.dataset.id);
  }

  /* ---------------------------------------- */
  /*  Actions: handouts                        */
  /* ---------------------------------------- */

  static async #onAddHandout() {
    const data = await NotebookDialogs.editHandout();
    if (data) await NotebookSystem.saveHandout(data);
  }

  static #onOpenHandout(event, target) {
    this.handoutId = target.dataset.id;
    NotebookSystem.unseenHandouts.delete(this.handoutId);
    this.render();
  }

  static #onCloseHandout() {
    this.handoutId = null;
    this.render();
  }

  static async #onEditHandout(event, target) {
    const handout = NotebookSystem.getHandout(target.dataset.id);
    if (!handout) return;
    const data = await NotebookDialogs.editHandout(handout);
    if (data) await NotebookSystem.saveHandout(data);
  }

  static async #onDeleteHandout(event, target) {
    const handout = NotebookSystem.getHandout(target.dataset.id);
    if (!handout) return;
    const message = game.i18n.format("NOTEBOOK.Handouts.ConfirmDelete", { title: Handlebars.escapeExpression(handout.title) });
    if (!await NotebookDialogs.confirm("NOTEBOOK.Handouts.Delete", message)) return;
    if (this.handoutId === handout.id) this.handoutId = null;
    await NotebookSystem.deleteHandout(handout.id);
  }

  static async #onCycleHandout(event, target) {
    event.stopPropagation();
    if (!this.#editing) return;
    await NotebookSystem.cycleHandout(target.dataset.id);
  }

  static #onShowImage(event, target) {
    const src = target.dataset.src;
    if (!src) return;
    const title = target.dataset.title ?? "";
    const IP = foundry.applications.apps?.ImagePopout;
    if (IP) new IP({ src, window: { title } }).render(true);
    else new ImagePopout(src, { title }).render(true);
  }
}
