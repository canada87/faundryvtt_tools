import { MODULE_ID } from "../../shared/constants.mjs";
import { SceneNavSystem, LINK_TYPES, DIRECTIONS } from "../SceneNavSystem.mjs";
import { SceneLinksEditor } from "./SceneLinksEditor.mjs";
import { SceneGraph, computeLayout } from "./SceneGraph.mjs";
import { SceneNavDialogs } from "./SceneNavDialogs.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

const DRAG_TYPE = "faundryvtt-scenenav";

/** Special views that are not folders. */
const VIEWS = {
  ALL: "all",
  FAVORITES: "favorites",
  UNSORTED: "unsorted"
};

/**
 * GM-only full-screen scene navigator: Foundry's scene folders as a tree,
 * thumbnail cards with view / activate / configure actions and scene links.
 * A single instance is kept so the current folder and search survive
 * opening and closing the panel.
 */
export class SceneNavigator extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "faundryvtt-scene-navigator",
    classes: ["faundryvtt-tools", "scene-navigator"],
    window: {
      frame: false,
      positioned: false
    },
    actions: {
      close: SceneNavigator.#onClose,
      selectView: SceneNavigator.#onSelectView,
      toggleFolder: SceneNavigator.#onToggleFolder,
      createFolder: SceneNavigator.#onCreateFolder,
      editFolder: SceneNavigator.#onEditFolder,
      deleteFolder: SceneNavigator.#onDeleteFolder,
      resetData: SceneNavigator.#onResetData,
      setMode: SceneNavigator.#onSetMode,
      clearSearch: SceneNavigator.#onClearSearch,
      viewScene: SceneNavigator.#onViewScene,
      activateScene: SceneNavigator.#onActivateScene,
      configureScene: SceneNavigator.#onConfigureScene,
      toggleFavorite: SceneNavigator.#onToggleFavorite,
      editLinks: SceneNavigator.#onEditLinks,
      openNote: SceneNavigator.#onOpenNote,
      editNote: SceneNavigator.#onEditNote,
      pullPlayers: SceneNavigator.#onPullPlayers,
      focusScene: SceneNavigator.#onFocusScene
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/scene-nav/scene-navigator.hbs`,
      scrollable: [".scenenav-tree", ".scenenav-main"]
    }
  };

  /** @type {SceneNavigator|null} */
  static #instance = null;

  /** Open the navigator, or close it if already open. */
  static toggle() {
    if (!game.user.isGM) return;
    const app = this.#instance;
    if (app?.rendered) app.close();
    else (this.#instance ??= new SceneNavigator()).render(true);
  }

  /** Re-render the open navigator and links editors (debounced). */
  static refresh = foundry.utils.debounce(() => {
    if (SceneNavigator.#instance?.rendered) SceneNavigator.#instance.render();
    for (const app of foundry.applications.instances.values()) {
      if (app instanceof SceneLinksEditor) app.render();
    }
  }, 100);

  #view = VIEWS.ALL;
  #search = "";
  #searchFocused = false;
  #highlightSceneId = null;

  /** Connected players by viewed scene, refreshed on every render. */
  #players = new Map();

  /** Graph pan/zoom per view, so re-renders keep the camera where it was. */
  #graphTransforms = new Map();

  get #isGraphMode() {
    return game.settings.get(MODULE_ID, "scenesNavMode") === "graph";
  }

  /** Esc closes the panel, unless the key is meant for a dialog opened above it. */
  #onKeyDown = (event) => {
    if (event.key !== "Escape" || !this.rendered) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest(".application") && !this.element.contains(target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.close();
  };

  /* ---------------------------------------- */
  /*  Context                                 */
  /* ---------------------------------------- */

  async _prepareContext() {
    const S = SceneNavSystem;
    const data = S.getData();

    const isFolderView = !Object.values(VIEWS).includes(this.#view);
    if (isFolderView && !S.getFolder(this.#view)) this.#view = VIEWS.ALL;

    this.#players = S.getPlayersByScene();
    const playersInFolder = folderId => [...this.#players].reduce((sum, [sceneId, users]) => {
      const fid = game.scenes.get(sceneId)?.folder?.id;
      return fid && S.isFolderWithin(fid, folderId) ? sum + users.length : sum;
    }, 0);

    const collapsed = new Set(game.settings.get(MODULE_ID, "scenesNavCollapsed") ?? []);
    const tree = [];
    const walk = (parentId, depth) => {
      for (const folder of S.getChildFolders(parentId)) {
        const hasChildren = S.getChildFolders(folder.id).length > 0;
        const isCollapsed = collapsed.has(folder.id);
        tree.push({
          id: folder.id,
          name: folder.name,
          color: S.folderColor(folder),
          indent: depth * 14,
          count: S.countScenesDeep(folder.id),
          players: playersInFolder(folder.id),
          hasChildren,
          collapsed: isCollapsed,
          selected: this.#view === folder.id
        });
        if (hasChildren && !isCollapsed) walk(folder.id, depth + 1);
      }
    };
    walk(null, 0);

    const sceneCard = scene => this.#buildSceneCard(scene, data);
    const sectionTitle = folderId => S.getFolderPath(folderId).map(f => f.name).join(" › ");

    const sections = [];
    let breadcrumb = null;
    let subfolders = [];
    let canCreateSubfolder = false;
    const search = this.#search.trim().toLowerCase();

    if (search) {
      const scenes = S.getScenes().filter(s =>
        s.name.toLowerCase().includes(search) || (s.navName ?? "").toLowerCase().includes(search));
      sections.push({
        title: game.i18n.format("SCENENAV.SearchResults", { count: scenes.length }),
        scenes: scenes.map(sceneCard)
      });
    } else if (this.#view === VIEWS.ALL) {
      const collect = parentId => {
        for (const folder of S.getChildFolders(parentId)) {
          const scenes = S.getScenesInFolder(folder.id);
          if (scenes.length) {
            sections.push({
              title: sectionTitle(folder.id),
              color: S.folderColor(folder),
              folderId: folder.id,
              scenes: scenes.map(sceneCard)
            });
          }
          collect(folder.id);
        }
      };
      collect(null);
      const unsorted = S.getScenesInFolder(null);
      if (unsorted.length) {
        sections.push({ title: game.i18n.localize("SCENENAV.Unsorted"), dropUnsorted: true, scenes: unsorted.map(sceneCard) });
      }
    } else if (this.#view === VIEWS.FAVORITES) {
      sections.push({ title: game.i18n.localize("SCENENAV.Favorites"), scenes: S.getFavoriteScenes(data).map(sceneCard) });
    } else if (this.#view === VIEWS.UNSORTED) {
      sections.push({ title: game.i18n.localize("SCENENAV.Unsorted"), dropUnsorted: true, scenes: S.getScenesInFolder(null).map(sceneCard) });
    } else {
      const folder = S.getFolder(this.#view);
      breadcrumb = S.getFolderPath(folder.id).map(f => ({ id: f.id, name: f.name }));
      subfolders = S.getChildFolders(folder.id).map(f => ({
        id: f.id,
        name: f.name,
        color: S.folderColor(f),
        count: S.countScenesDeep(f.id),
        players: playersInFolder(f.id)
      }));
      canCreateSubfolder = S.canCreateSubfolder(folder.id);
      sections.push({
        title: folder.name,
        color: S.folderColor(folder),
        folderId: folder.id,
        scenes: S.getScenesInFolder(folder.id).map(sceneCard)
      });
    }

    return {
      graphMode: this.#isGraphMode,
      tree,
      sections,
      breadcrumb,
      subfolders,
      canCreateSubfolder,
      currentFolderId: isFolderView ? this.#view : null,
      viewAll: this.#view === VIEWS.ALL && !search,
      viewFavorites: this.#view === VIEWS.FAVORITES && !search,
      viewUnsorted: this.#view === VIEWS.UNSORTED && !search,
      countAll: game.scenes.size,
      countFavorites: S.getFavoriteScenes(data).length,
      countUnsorted: S.getScenesInFolder(null).length,
      search: this.#search,
      cardSize: game.settings.get(MODULE_ID, "scenesNavCardSize"),
      isEmpty: sections.every(s => !s.scenes.length) && !subfolders.length
    };
  }

  #buildSceneCard(scene, data) {
    const S = SceneNavSystem;
    const nameOf = id => game.scenes.get(id)?.name ?? "?";
    const parentId = S.getParentId(scene.id, data);

    const children = S.getChildLinks(scene.id, data)
      .map(l => ({ id: l.to, name: nameOf(l.to) }))
      .sort(S.sortByName);

    const continues = S.getContinuations(scene.id, data).map(c => ({
      id: c.sceneId,
      name: nameOf(c.sceneId),
      direction: c.direction ? game.i18n.localize(`SCENENAV.Direction.${c.direction}`) : ""
    }));

    const viewers = this.#players.get(scene.id) ?? [];
    const note = S.getSceneNote(scene);

    return {
      id: scene.id,
      name: scene.name,
      navName: scene.navName && scene.navName !== scene.name ? scene.navName : "",
      thumb: scene.thumb || "",
      active: scene.active,
      isView: scene.isView,
      favorite: !!data.sceneMeta[scene.id]?.favorite,
      folderColor: S.folderColor(scene.folder),
      parent: parentId ? { id: parentId, name: nameOf(parentId) } : null,
      children,
      continues,
      hasLinks: !!parentId || children.length > 0 || continues.length > 0,
      viewers,
      note: note ? { name: note.journal.name, preview: S.getNotePreview(scene) } : null,
      highlight: this.#highlightSceneId === scene.id
    };
  }

  /* ---------------------------------------- */
  /*  Rendering & DOM listeners               */
  /* ---------------------------------------- */

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    window.addEventListener("keydown", this.#onKeyDown, true);
  }

  _onClose(options) {
    window.removeEventListener("keydown", this.#onKeyDown, true);
    super._onClose(options);
  }

  _onRender(context, options) {
    const root = this.element;
    if (!root) return;

    // Search: re-render on input, keeping focus and caret in the field
    const searchInput = root.querySelector(".scenenav-search input");
    if (searchInput) {
      const doSearch = foundry.utils.debounce(value => {
        this.#search = value;
        this.render();
      }, 200);
      searchInput.addEventListener("input", ev => {
        this.#searchFocused = true;
        doSearch(ev.currentTarget.value);
      });
      searchInput.addEventListener("blur", () => { this.#searchFocused = false; });
      if (this.#searchFocused || options.isFirstRender) {
        searchInput.focus();
        const end = searchInput.value.length;
        searchInput.setSelectionRange(end, end);
      }
    }

    // Card size slider (client setting), applied live while dragging
    const sceneRoot = root.querySelector(".scenenav-root");
    const sizeInput = root.querySelector(".scenenav-size input");
    sizeInput?.addEventListener("input", ev => {
      sceneRoot?.style.setProperty("--scenenav-card-size", `${ev.currentTarget.value}px`);
    });
    sizeInput?.addEventListener("change", ev => {
      game.settings.set(MODULE_ID, "scenesNavCardSize", Number(ev.currentTarget.value));
    });

    // Scene cards: drag, double-click to view
    root.querySelectorAll(".scenenav-card[data-scene-id]").forEach(card => {
      const sceneId = card.dataset.sceneId;
      card.addEventListener("drop", ev => this.#onDropJournal(ev, sceneId));
      card.addEventListener("dragstart", ev => {
        ev.dataTransfer.setData("text/plain", JSON.stringify({ type: DRAG_TYPE, kind: "scene", id: sceneId }));
        ev.dataTransfer.effectAllowed = "move";
      });
      card.querySelector(".scenenav-thumb")?.addEventListener("dblclick", ev => {
        if (ev.target.closest("button")) return;
        this.#viewScene(sceneId);
      });
    });

    // Folders in the tree can be dragged onto other folders
    root.querySelectorAll(".scenenav-tree-folder[data-folder-id]").forEach(el => {
      el.addEventListener("dragstart", ev => {
        ev.dataTransfer.setData("text/plain", JSON.stringify({ type: DRAG_TYPE, kind: "folder", id: el.dataset.folderId }));
        ev.dataTransfer.effectAllowed = "move";
      });
    });

    // Drop targets: tree folders, subfolder tiles, folder sections, "unsorted"
    root.querySelectorAll("[data-drop-folder]").forEach(el => {
      el.addEventListener("dragover", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        el.classList.add("drag-over");
      });
      el.addEventListener("dragleave", ev => {
        if (!el.contains(ev.relatedTarget)) el.classList.remove("drag-over");
      });
      el.addEventListener("drop", ev => this.#onDrop(ev, el));
    });

    if (this.#isGraphMode) {
      this.#renderGraph(root.querySelector(".scenenav-graph"));
      this.#highlightSceneId = null;
      return;
    }

    // Scroll to and flash a focused scene
    if (this.#highlightSceneId) {
      const card = root.querySelector(`.scenenav-card[data-scene-id="${this.#highlightSceneId}"]`);
      card?.scrollIntoView({ block: "center", behavior: "smooth" });
      this.#highlightSceneId = null;
    }
  }

  /* ---------------------------------------- */
  /*  Graph                                   */
  /* ---------------------------------------- */

  /** Scenes shown as full nodes in the graph for the current view. */
  #graphSceneIds() {
    const S = SceneNavSystem;
    const scenes = S.getScenes();
    let ids;
    if (this.#view === VIEWS.ALL) ids = scenes.map(s => s.id);
    else if (this.#view === VIEWS.FAVORITES) ids = S.getFavoriteScenes().map(s => s.id);
    else if (this.#view === VIEWS.UNSORTED) ids = S.getScenesInFolder(null).map(s => s.id);
    else ids = scenes.filter(s => s.folder && S.isFolderWithin(s.folder.id, this.#view)).map(s => s.id);
    return new Set(ids);
  }

  #renderGraph(host) {
    if (!host) return;
    const S = SceneNavSystem;
    const data = S.getData();
    const visible = this.#graphSceneIds();
    const search = this.#search.trim().toLowerCase();
    const matches = scene => scene.name.toLowerCase().includes(search)
      || (scene.navName ?? "").toLowerCase().includes(search);

    // Links touching the view; scenes outside it become "ghost" nodes
    const links = S.getLinks(data).filter(l => visible.has(l.from) || visible.has(l.to));
    const ghosts = new Set();
    for (const l of links) {
      if (!visible.has(l.from)) ghosts.add(l.from);
      if (!visible.has(l.to)) ghosts.add(l.to);
    }

    const nodes = [...visible, ...ghosts].map(id => {
      const scene = game.scenes.get(id);
      return {
        id,
        name: scene.name,
        thumb: scene.thumb || "",
        active: scene.active,
        isView: scene.isView,
        ghost: ghosts.has(id),
        dim: !!search && !matches(scene),
        highlight: this.#highlightSceneId === id,
        viewers: this.#players.get(id) ?? [],
        note: S.getSceneNote(scene) ? { name: S.getSceneNote(scene).journal.name, preview: S.getNotePreview(scene, 200) } : null
      };
    }).sort(S.sortByName);

    const edges = links.map(l => ({
      id: l.id,
      type: l.type,
      from: l.from,
      to: l.to,
      direction: l.direction ?? "",
      label: l.type === LINK_TYPES.CONTINUES && l.direction ? game.i18n.localize(`SCENENAV.Direction.${l.direction}`) : ""
    }));

    const viewKey = this.#view;
    const positions = computeLayout(nodes, edges, S.getViewLayout(viewKey, data));

    const graph = new SceneGraph(host, { nodes, edges, positions }, {
      transform: this.#graphTransforms.get(viewKey),
      onTransform: t => this.#graphTransforms.set(viewKey, t),
      snap: game.settings.get(MODULE_ID, "scenesNavGraphSnap"),
      onSnapChange: value => game.settings.set(MODULE_ID, "scenesNavGraphSnap", value),
      // Moving one node freezes the whole view, so the others stay where they are
      onMoveNode: () => S.setViewLayout(viewKey, Object.fromEntries(positions)),
      onViewScene: id => this.#viewScene(id),
      onOpenGhost: id => {
        this.#view = S.getSceneFolderId(id) ?? VIEWS.UNSORTED;
        this.#highlightSceneId = id;
        this.render();
      },
      onLink: (fromId, toId, direction) => this.#promptNewLink(fromId, toId, direction),
      onEdgeClick: linkId => this.#confirmRemoveLink(linkId),
      onAutoLayout: () => this.#autoLayout()
    });

    if (this.#highlightSceneId) graph.focus(this.#highlightSceneId);
  }

  async #promptNewLink(fromId, toId, direction) {
    const esc = Handlebars.escapeExpression;
    const loc = key => game.i18n.localize(key);
    const from = esc(game.scenes.get(fromId)?.name ?? "");
    const to = esc(game.scenes.get(toId)?.name ?? "");
    const directions = DIRECTIONS.map(d => {
      const label = d ? loc(`SCENENAV.Direction.${d}`) : loc("SCENENAV.Direction.none");
      return `<option value="${d}" ${d === direction ? "selected" : ""}>${label}</option>`;
    }).join("");

    const content = `
      <p><b>${from}</b> → <b>${to}</b></p>
      <div class="form-group">
        <label>${loc("SCENENAV.Graph.LinkTypeLabel")}</label>
        <select name="type">
          <option value="continues">${loc("SCENENAV.LinkType.continues")}</option>
          <option value="childOf">${loc("SCENENAV.LinkType.childOf")}</option>
          <option value="parentOf">${loc("SCENENAV.LinkType.parentOf")}</option>
        </select>
      </div>
      <div class="form-group">
        <label>${loc("SCENENAV.DirectionHint")}</label>
        <select name="direction">${directions}</select>
      </div>`;

    const result = await DialogV2.prompt({
      window: { title: loc("SCENENAV.Graph.NewLink") },
      content,
      rejectClose: false,
      ok: {
        label: loc("SCENENAV.Add"),
        icon: "fas fa-link",
        callback: (event, button) => ({
          type: button.form.elements.type.value,
          direction: button.form.elements.direction.value
        })
      }
    });
    if (!result) return;

    let ok;
    if (result.type === "childOf") ok = await SceneNavSystem.setParent(fromId, toId);
    else if (result.type === "parentOf") ok = await SceneNavSystem.setParent(toId, fromId);
    else ok = await SceneNavSystem.addContinuation(fromId, toId, result.direction);
    if (ok === false) ui.notifications.warn(game.i18n.localize("SCENENAV.Warn.LinkCycle"));
  }

  async #confirmRemoveLink(linkId) {
    const link = SceneNavSystem.getLinks().find(l => l.id === linkId);
    if (!link) return;
    const esc = Handlebars.escapeExpression;
    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize("SCENENAV.RemoveLink") },
      content: `<p>${game.i18n.format("SCENENAV.Graph.ConfirmRemoveLink", {
        from: esc(game.scenes.get(link.from)?.name ?? ""),
        to: esc(game.scenes.get(link.to)?.name ?? "")
      })}</p>`
    });
    if (confirmed) await SceneNavSystem.removeLink(linkId);
  }

  async #autoLayout() {
    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize("SCENENAV.Graph.AutoLayout") },
      content: `<p>${game.i18n.localize("SCENENAV.Graph.ConfirmAutoLayout")}</p>`
    });
    if (!confirmed) return;
    this.#graphTransforms.delete(this.#view);
    await SceneNavSystem.clearViewLayout(this.#view);
  }

  /** Dropping a Journal (or page) from the sidebar on a card makes it the scene's note. */
  async #onDropJournal(event, sceneId) {
    let payload;
    try {
      payload = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }
    if (!["JournalEntry", "JournalEntryPage"].includes(payload?.type) || !payload.uuid) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.closest("[data-drop-folder]")?.classList.remove("drag-over");
    const doc = await fromUuid(payload.uuid);
    const scene = game.scenes.get(sceneId);
    if (!doc || !scene) return;
    const isPage = doc.documentName === "JournalEntryPage";
    const journal = isPage ? doc.parent : doc;
    if (journal?.pack) return ui.notifications.warn(game.i18n.localize("SCENENAV.Note.NoCompendium"));
    await scene.update({ journal: journal.id, journalEntryPage: isPage ? doc.id : null });
    ui.notifications.info(game.i18n.format("SCENENAV.Note.Linked", { journal: journal.name, scene: scene.name }));
  }

  async #onDrop(event, target) {
    event.preventDefault();
    event.stopPropagation();
    target.classList.remove("drag-over");
    let payload;
    try {
      payload = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }
    if (payload?.type !== DRAG_TYPE) return;
    const folderId = target.dataset.dropFolder || null;

    if (payload.kind === "scene") {
      await SceneNavSystem.setSceneFolder(payload.id, folderId);
    } else if (payload.kind === "folder") {
      const result = await SceneNavSystem.moveFolder(payload.id, folderId);
      if (result === "cycle") ui.notifications.warn(game.i18n.localize("SCENENAV.Warn.FolderCycle"));
      else if (result === "depth") ui.notifications.warn(game.i18n.format("SCENENAV.Warn.FolderDepth", { max: SceneNavSystem.maxDepth }));
    }
  }

  /** Run a scene action, closing the panel without waiting for its animation. */
  async #sceneAction(sceneId, fn) {
    const scene = game.scenes.get(sceneId);
    if (!scene) return;
    this.close({ animate: false });
    try {
      await fn(scene);
    } catch (err) {
      console.error("Faundryvtt Tools | Scene Navigator", err);
      ui.notifications.error(game.i18n.format("SCENENAV.Error.SceneAction", { name: scene.name }));
    }
  }

  #viewScene(sceneId) {
    return this.#sceneAction(sceneId, scene => scene.view());
  }

  /* ---------------------------------------- */
  /*  Folder dialog                           */
  /* ---------------------------------------- */

  static async #promptFolder({ title, name = "", color = "#6b7a8f" }) {
    const esc = Handlebars.escapeExpression;
    const content = `
      <div class="form-group">
        <label>${game.i18n.localize("SCENENAV.FolderName")}</label>
        <input type="text" name="name" value="${esc(name)}" autofocus />
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("SCENENAV.FolderColor")}</label>
        <input type="color" name="color" value="${esc(color || "#6b7a8f")}" />
      </div>`;
    return DialogV2.prompt({
      window: { title },
      content,
      rejectClose: false,
      ok: {
        label: game.i18n.localize("SCENENAV.Save"),
        icon: "fas fa-save",
        callback: (event, button) => ({
          name: button.form.elements.name.value.trim(),
          color: button.form.elements.color.value
        })
      }
    });
  }

  /* ---------------------------------------- */
  /*  Actions                                 */
  /* ---------------------------------------- */

  static #onClose() {
    this.close();
  }

  static #onSelectView(event, target) {
    this.#view = target.dataset.view;
    this.#search = "";
    this.render();
  }

  static async #onToggleFolder(event, target) {
    const folderId = target.closest("[data-folder-id]").dataset.folderId;
    const collapsed = new Set(game.settings.get(MODULE_ID, "scenesNavCollapsed") ?? []);
    if (collapsed.has(folderId)) collapsed.delete(folderId);
    else collapsed.add(folderId);
    await game.settings.set(MODULE_ID, "scenesNavCollapsed", [...collapsed]);
    this.render();
  }

  static async #onCreateFolder(event, target) {
    const parentId = target.dataset.parentId || null;
    if (parentId && !SceneNavSystem.canCreateSubfolder(parentId)) {
      ui.notifications.warn(game.i18n.format("SCENENAV.Warn.FolderDepth", { max: SceneNavSystem.maxDepth }));
      return;
    }
    const result = await SceneNavigator.#promptFolder({ title: game.i18n.localize("SCENENAV.CreateFolder") });
    if (!result) return;
    const folder = await SceneNavSystem.createFolder({ name: result.name, color: result.color, parentId });
    if (!folder) return;
    this.#view = folder.id;
    this.#search = "";
    this.render();
  }

  static async #onEditFolder(event, target) {
    const folder = SceneNavSystem.getFolder(target.closest("[data-folder-id]").dataset.folderId);
    if (!folder) return;
    const result = await SceneNavigator.#promptFolder({
      title: game.i18n.localize("SCENENAV.EditFolder"),
      name: folder.name,
      color: SceneNavSystem.folderColor(folder)
    });
    if (!result) return;
    await SceneNavSystem.updateFolder(folder.id, { name: result.name || folder.name, color: result.color });
  }

  static async #onDeleteFolder(event, target) {
    const folder = SceneNavSystem.getFolder(target.closest("[data-folder-id]").dataset.folderId);
    if (!folder) return;
    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize("SCENENAV.DeleteFolder") },
      content: `<p>${game.i18n.format("SCENENAV.Confirm.DeleteFolder", { name: Handlebars.escapeExpression(folder.name) })}</p>`
    });
    if (!confirmed) return;
    if (this.#view === folder.id) this.#view = folder.folder?.id ?? VIEWS.ALL;
    await SceneNavSystem.deleteFolder(folder.id);
  }

  static async #onResetData() {
    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize("SCENENAV.ResetData") },
      content: `<p>${game.i18n.localize("SCENENAV.Confirm.ResetData")}</p>`
    });
    if (!confirmed) return;
    await SceneNavSystem.resetData();
    ui.notifications.info(game.i18n.localize("SCENENAV.Info.Reset"));
  }

  static async #onSetMode(event, target) {
    await game.settings.set(MODULE_ID, "scenesNavMode", target.dataset.mode);
    this.render();
  }

  static #onClearSearch() {
    this.#search = "";
    this.render();
  }

  static async #onViewScene(event, target) {
    await this.#viewScene(target.closest("[data-scene-id]").dataset.sceneId);
  }

  static async #onActivateScene(event, target) {
    await this.#sceneAction(target.closest("[data-scene-id]").dataset.sceneId, scene => scene.activate());
  }

  static #onConfigureScene(event, target) {
    const scene = game.scenes.get(target.closest("[data-scene-id]").dataset.sceneId);
    scene?.sheet.render(true);
  }

  static async #onToggleFavorite(event, target) {
    await SceneNavSystem.toggleFavorite(target.closest("[data-scene-id]").dataset.sceneId);
  }

  static #onOpenNote(event, target) {
    const scene = game.scenes.get(target.closest("[data-scene-id]").dataset.sceneId);
    SceneNavDialogs.openOrEditNote(scene);
  }

  static #onEditNote(event, target) {
    const scene = game.scenes.get(target.closest("[data-scene-id]").dataset.sceneId);
    SceneNavDialogs.editNote(scene);
  }

  static #onPullPlayers(event, target) {
    const scene = game.scenes.get(target.closest("[data-scene-id]").dataset.sceneId);
    SceneNavDialogs.pullPlayers(scene);
  }

  static #onEditLinks(event, target) {
    const sceneId = target.closest("[data-scene-id]").dataset.sceneId;
    new SceneLinksEditor({ sceneId }).render(true);
  }

  /** Jump to the folder of a linked scene and highlight its card. */
  static #onFocusScene(event, target) {
    const sceneId = target.dataset.targetScene;
    if (!game.scenes.has(sceneId)) return;
    const folderId = SceneNavSystem.getSceneFolderId(sceneId);
    this.#view = folderId ?? VIEWS.UNSORTED;
    this.#search = "";
    this.#highlightSceneId = sceneId;
    this.render();
  }
}
