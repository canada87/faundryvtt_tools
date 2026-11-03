import { MODULE_ID } from "../shared/constants.mjs";

const DEFAULT_IMG = "icons/svg/mystery-man.svg";

/**
 * Data layer of the players' Notebook.
 *
 * - Board (post-its and links) and creature notes are personal: they live in
 *   each player's own User flags (`notebook.*`), so players can write them
 *   without a GM online. Every client receives every User, which lets the GM
 *   read them and lets players see the notes others chose to share.
 * - Handouts and the bestiary are written by the GM in world settings. Every
 *   element carries a visibility `{ all: boolean, users: string[] }`
 *   (nobody = hidden, prepared by the GM and revealed later).
 *
 * Hidden values still reach player clients (Foundry sends world data to
 * everyone): the secrecy is at the table, not cryptographic.
 */
export class NotebookSystem {

  static NOTE_COLORS = ["#f7e36b", "#f6b26b", "#b5dc8f", "#9fd0ee", "#efb0cf"];

  /** Handout ids received since the handouts tab was last opened. */
  static unseenHandouts = new Set();

  static #knownKeys = null;

  /* ---------------------------------------- */
  /*  Visibility                               */
  /* ---------------------------------------- */

  static hidden() {
    return { all: false, users: [] };
  }

  static normalizeVisibility(vis) {
    return { all: !!vis?.all, users: [...(vis?.users ?? [])] };
  }

  static isHidden(vis) {
    return !vis?.all && !vis?.users?.length;
  }

  static canSee(vis, user = game.user) {
    if (user.isGM) return true;
    return !!vis?.all || !!vis?.users?.includes(user.id);
  }

  /** "hidden" | "all" | "some" */
  static visibilityState(vis) {
    if (vis?.all) return "all";
    return vis?.users?.length ? "some" : "hidden";
  }

  static describeVisibility(vis) {
    const state = this.visibilityState(vis);
    if (state === "all") return game.i18n.localize("NOTEBOOK.Vis.All");
    if (state === "hidden") return game.i18n.localize("NOTEBOOK.Vis.Hidden");
    const names = vis.users.map(id => game.users.get(id)?.name).filter(Boolean);
    return game.i18n.format("NOTEBOOK.Vis.Some", { names: names.join(", ") });
  }

  static #union(a, b) {
    return {
      all: !!a?.all || !!b?.all,
      users: [...new Set([...(a?.users ?? []), ...(b?.users ?? [])])]
    };
  }

  static getPlayers() {
    return game.users.filter(u => !u.isGM).sort((a, b) => a.name.localeCompare(b.name));
  }

  /* ---------------------------------------- */
  /*  Board (User flags)                       */
  /* ---------------------------------------- */

  static getBoard(user = game.user) {
    return foundry.utils.deepClone(user?.getFlag(MODULE_ID, "notebook.board") ?? []);
  }

  /** Players write their own board; the GM may write any player's. */
  static async #saveBoard(items, user = game.user) {
    if (user.id !== game.user.id && !game.user.isGM) return;
    await user.setFlag(MODULE_ID, "notebook.board", items);
  }

  static async addBoardItem(data, user = game.user) {
    const items = this.getBoard(user);
    items.push({
      id: foundry.utils.randomID(),
      kind: data.kind ?? "note",
      title: data.title ?? "",
      text: data.text ?? "",
      color: data.color ?? this.NOTE_COLORS[0],
      uuid: data.uuid ?? null,
      icon: data.icon ?? null,
      createdAt: Date.now()
    });
    await this.#saveBoard(items, user);
  }

  static async updateBoardItem(id, updates, user = game.user) {
    const items = this.getBoard(user);
    const item = items.find(i => i.id === id);
    if (!item) return;
    Object.assign(item, updates);
    await this.#saveBoard(items, user);
  }

  static async deleteBoardItem(id, user = game.user) {
    await this.#saveBoard(this.getBoard(user).filter(i => i.id !== id), user);
  }

  /**
   * Pin any dropped document (journal, item, scene, actor…) to the board.
   * @param {string} uuid
   * @param {User} [user]  owner of the board
   */
  static async addBoardLink(uuid, user = game.user) {
    const doc = await fromUuid(uuid);
    if (!doc) return;
    if (this.getBoard(user).some(i => i.kind === "link" && i.uuid === uuid)) return;
    await this.addBoardItem({
      kind: "link",
      title: doc.name ?? "",
      uuid,
      icon: this.documentIcon(doc.documentName)
    }, user);
  }

  static documentIcon(documentName) {
    return {
      JournalEntry: "fas fa-book-open",
      JournalEntryPage: "fas fa-file-lines",
      Actor: "fas fa-user",
      Item: "fas fa-suitcase",
      Scene: "fas fa-map",
      RollTable: "fas fa-table-list",
      Macro: "fas fa-code",
      Playlist: "fas fa-music",
      Cards: "fas fa-cards"
    }[documentName] ?? "fas fa-link";
  }

  /* ---------------------------------------- */
  /*  Creature notes (User flags)              */
  /* ---------------------------------------- */

  static #ownCreatureNotes(creatureId, user = game.user) {
    return foundry.utils.deepClone(user.getFlag(MODULE_ID, `notebook.creatureNotes.${creatureId}`) ?? []);
  }

  /**
   * Notes on a creature as seen by `viewer`: their own, the ones other players
   * shared, and everything for the GM.
   */
  static getCreatureNotes(creatureId, viewer = game.user) {
    const notes = [];
    for (const user of game.users) {
      for (const note of this.#ownCreatureNotes(creatureId, user)) {
        const mine = user.id === viewer.id;
        if (!mine && !note.shared && !viewer.isGM) continue;
        notes.push({
          ...note,
          userId: user.id,
          author: user.name,
          color: user.color?.css ?? user.color,
          mine
        });
      }
    }
    return notes.sort((a, b) => a.createdAt - b.createdAt);
  }

  static async addCreatureNote(creatureId, text, shared) {
    if (!text?.trim()) return;
    const notes = this.#ownCreatureNotes(creatureId);
    notes.push({ id: foundry.utils.randomID(), text: text.trim(), shared: !!shared, createdAt: Date.now() });
    await game.user.setFlag(MODULE_ID, `notebook.creatureNotes.${creatureId}`, notes);
  }

  /** Authors manage their own notes; the GM may remove anyone's. */
  static async deleteCreatureNote(creatureId, noteId, userId = game.user.id) {
    const user = game.users.get(userId);
    if (!user || (user.id !== game.user.id && !game.user.isGM)) return;
    const notes = this.#ownCreatureNotes(creatureId, user).filter(n => n.id !== noteId);
    await user.setFlag(MODULE_ID, `notebook.creatureNotes.${creatureId}`, notes);
  }

  static async toggleCreatureNoteShared(creatureId, noteId) {
    const notes = this.#ownCreatureNotes(creatureId);
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    note.shared = !note.shared;
    await game.user.setFlag(MODULE_ID, `notebook.creatureNotes.${creatureId}`, notes);
  }

  /* ---------------------------------------- */
  /*  Handouts (world setting, GM)             */
  /* ---------------------------------------- */

  static getHandouts() {
    return foundry.utils.deepClone(game.settings.get(MODULE_ID, "notebookHandouts") ?? []);
  }

  static getHandout(id) {
    return this.getHandouts().find(h => h.id === id) ?? null;
  }

  static getVisibleHandouts(user = game.user) {
    return this.getHandouts().filter(h => this.canSee(h.visibility, user));
  }

  static async #saveHandouts(handouts) {
    await game.settings.set(MODULE_ID, "notebookHandouts", handouts);
  }

  static async saveHandout(data) {
    const handouts = this.getHandouts();
    const existing = data.id && handouts.find(h => h.id === data.id);
    const values = {
      title: data.title?.trim() || game.i18n.localize("NOTEBOOK.Untitled"),
      text: data.text ?? "",
      img: data.img?.trim() || "",
      uuid: data.uuid || null,
      visibility: this.normalizeVisibility(data.visibility ?? existing?.visibility)
    };
    if (existing) Object.assign(existing, values);
    else handouts.push({ id: foundry.utils.randomID(), createdAt: Date.now(), ...values });
    await this.#saveHandouts(handouts);
  }

  static async deleteHandout(id) {
    await this.#saveHandouts(this.getHandouts().filter(h => h.id !== id));
  }

  static async setHandoutVisibility(id, visibility) {
    const handouts = this.getHandouts();
    const handout = handouts.find(h => h.id === id);
    if (!handout) return;
    handout.visibility = this.normalizeVisibility(visibility);
    await this.#saveHandouts(handouts);
  }

  static async cycleHandout(id) {
    const handout = this.getHandout(id);
    if (!handout) return;
    const visibility = this.isHidden(handout.visibility) ? { all: true, users: [] } : this.hidden();
    await this.setHandoutVisibility(id, visibility);
  }

  /**
   * Build a handout from a dropped document: journal pages are copied
   * (text or image) so players can read them without journal permissions;
   * any other document becomes a linked handout.
   */
  static async handoutFromDocument(uuid) {
    const doc = await fromUuid(uuid);
    if (!doc) return null;
    const data = { title: doc.name ?? "", uuid };
    if (doc.documentName === "JournalEntryPage") {
      if (doc.type === "text") data.text = doc.text?.content ?? "";
      if (doc.type === "image") data.img = doc.src ?? "";
    } else if (doc.documentName === "JournalEntry" && doc.pages.size === 1) {
      const page = doc.pages.contents[0];
      if (page.type === "text") data.text = page.text?.content ?? "";
      if (page.type === "image") data.img = page.src ?? "";
    } else if (doc.img && doc.img !== DEFAULT_IMG) {
      data.img = doc.img;
    }
    return data;
  }

  /* ---------------------------------------- */
  /*  Bestiary (world setting, GM)             */
  /* ---------------------------------------- */

  static getTemplate() {
    const stored = game.settings.get(MODULE_ID, "notebookBestiaryTemplate") ?? [];
    if (stored.length) return [...stored];
    return game.i18n.localize("NOTEBOOK.DefaultFields").split("|").map(s => s.trim()).filter(Boolean);
  }

  static async saveTemplate(labels) {
    await game.settings.set(MODULE_ID, "notebookBestiaryTemplate", labels.map(s => s.trim()).filter(Boolean));
  }

  static getCreatures() {
    return foundry.utils.deepClone(game.settings.get(MODULE_ID, "notebookBestiary") ?? []);
  }

  static getCreature(id) {
    return this.getCreatures().find(c => c.id === id) ?? null;
  }

  static getVisibleCreatures(user = game.user) {
    return this.getCreatures().filter(c => this.canSee(c.visibility, user));
  }

  static async #saveCreatures(creatures) {
    await game.settings.set(MODULE_ID, "notebookBestiary", creatures);
  }

  static newField(label = "", value = "", hint = "") {
    return { id: foundry.utils.randomID(), label, value, hint, level: "full", visibility: this.hidden() };
  }

  static async createCreature(data = {}) {
    const creatures = this.getCreatures();
    const creature = {
      id: foundry.utils.randomID(),
      name: data.name || game.i18n.localize("NOTEBOOK.Bestiary.NewName"),
      img: data.img || "",
      actorUuid: data.actorUuid ?? null,
      visibility: this.hidden(),
      nameVisibility: this.hidden(),
      imgVisibility: this.hidden(),
      fields: this.getTemplate().map(label => this.newField(label)),
      createdAt: Date.now()
    };
    creatures.push(creature);
    await this.#saveCreatures(creatures);
    return creature;
  }

  /**
   * Save name, image and fields from the GM editor. Fields keep their
   * visibility when their id is preserved.
   */
  static async updateCreature(id, updates) {
    const creatures = this.getCreatures();
    const creature = creatures.find(c => c.id === id);
    if (!creature) return null;
    if (updates.fields) {
      const previous = new Map(creature.fields.map(f => [f.id, f]));
      updates.fields = updates.fields.map(f => {
        const old = previous.get(f.id);
        return {
          ...(old ?? this.newField()),
          id: old?.id ?? foundry.utils.randomID(),
          label: f.label ?? "",
          value: f.value ?? "",
          hint: f.hint ?? ""
        };
      });
    }
    Object.assign(creature, updates);
    await this.#saveCreatures(creatures);
    return creature;
  }

  static async deleteCreature(id) {
    await this.#saveCreatures(this.getCreatures().filter(c => c.id !== id));
  }

  /**
   * Find the creature for an actor, or create it with the actor's name and
   * image. Tokens resolve to their base actor, so "Goblin 3" lands on "Goblin".
   * @param {Actor} actor
   * @param {TokenDocument} [tokenDoc]
   */
  static async addFromActor(actor, tokenDoc = null) {
    const base = (tokenDoc?.actorId && game.actors.get(tokenDoc.actorId)) || actor;
    if (!base) return null;
    const existing = this.getCreatures().find(c => c.actorUuid && c.actorUuid === base.uuid);
    if (existing) return existing;

    let img = base.img;
    if (!img || img === DEFAULT_IMG) img = tokenDoc?.texture?.src ?? base.prototypeToken?.texture?.src ?? "";
    return this.createCreature({ name: base.name, img, actorUuid: base.uuid });
  }

  /**
   * Set who sees one part of a creature. part: "entry", "name", "img" or a field id.
   * Revealing anything also lists the creature for the same players.
   */
  static async setPartVisibility(creatureId, part, visibility, level = null) {
    const creatures = this.getCreatures();
    const creature = creatures.find(c => c.id === creatureId);
    if (!creature) return;
    const vis = this.normalizeVisibility(visibility);

    if (part === "entry") creature.visibility = vis;
    else if (part === "name") creature.nameVisibility = vis;
    else if (part === "img") creature.imgVisibility = vis;
    else {
      const field = creature.fields.find(f => f.id === part);
      if (!field) return;
      field.visibility = vis;
      if (level) field.level = level;
    }
    if (part !== "entry") creature.visibility = this.#union(creature.visibility, vis);
    await this.#saveCreatures(creatures);
  }

  /**
   * One-click reveal. Fields: hidden → hint (if any) → true value → hidden.
   * Everything else: hidden ↔ all players.
   */
  static async cyclePart(creatureId, part) {
    const creature = this.getCreature(creatureId);
    if (!creature) return;
    const all = { all: true, users: [] };

    if (["entry", "name", "img"].includes(part)) {
      const current = { entry: creature.visibility, name: creature.nameVisibility, img: creature.imgVisibility }[part];
      return this.setPartVisibility(creatureId, part, this.isHidden(current) ? all : this.hidden());
    }

    const field = creature.fields.find(f => f.id === part);
    if (!field) return;
    if (this.isHidden(field.visibility)) {
      return this.setPartVisibility(creatureId, part, all, field.hint?.trim() ? "hint" : "full");
    }
    if (field.level === "hint") return this.setPartVisibility(creatureId, part, field.visibility, "full");
    return this.setPartVisibility(creatureId, part, this.hidden(), "full");
  }

  static async revealAll(creatureId) {
    const creatures = this.getCreatures();
    const creature = creatures.find(c => c.id === creatureId);
    if (!creature) return;
    const all = () => ({ all: true, users: [] });
    creature.visibility = all();
    creature.nameVisibility = all();
    creature.imgVisibility = all();
    for (const field of creature.fields) {
      field.visibility = all();
      field.level = "full";
    }
    await this.#saveCreatures(creatures);
  }

  /** Hide every detail but keep the creature listed (players met it). */
  static async hideAll(creatureId) {
    const creatures = this.getCreatures();
    const creature = creatures.find(c => c.id === creatureId);
    if (!creature) return;
    creature.nameVisibility = this.hidden();
    creature.imgVisibility = this.hidden();
    for (const field of creature.fields) field.visibility = this.hidden();
    await this.#saveCreatures(creatures);
  }

  /* ---------------------------------------- */
  /*  Player notifications                     */
  /* ---------------------------------------- */

  /** Keys of everything the current player can see, to detect new reveals. */
  static #visibleKeys() {
    const keys = new Map();
    for (const h of this.getVisibleHandouts()) keys.set(`h:${h.id}`, h);
    for (const c of this.getVisibleCreatures()) {
      keys.set(`c:${c.id}`, c);
      if (this.canSee(c.nameVisibility)) keys.set(`c:${c.id}:name`, c);
      if (this.canSee(c.imgVisibility)) keys.set(`c:${c.id}:img`, c);
      for (const f of c.fields) {
        if (this.canSee(f.visibility)) keys.set(`c:${c.id}:f:${f.id}:${f.level}`, c);
      }
    }
    return keys;
  }

  /**
   * Called when handouts or bestiary change: tell the player what is new.
   * The first call only records the current state.
   */
  static notifyChanges() {
    if (game.user.isGM) return;
    const next = this.#visibleKeys();
    const previous = this.#knownKeys;
    this.#knownKeys = next;
    if (!previous) return;

    const updatedCreatures = new Map();
    for (const [key, value] of next) {
      if (previous.has(key)) continue;
      if (key.startsWith("h:")) {
        this.unseenHandouts.add(value.id);
        ui.notifications.info(game.i18n.format("NOTEBOOK.Notify.Handout", { title: value.title }));
      } else {
        updatedCreatures.set(value.id, value);
      }
    }
    for (const creature of updatedCreatures.values()) {
      const name = this.canSee(creature.nameVisibility) ? creature.name : game.i18n.localize("NOTEBOOK.Bestiary.Unknown");
      ui.notifications.info(game.i18n.format("NOTEBOOK.Notify.Bestiary", { name }));
    }
  }
}
