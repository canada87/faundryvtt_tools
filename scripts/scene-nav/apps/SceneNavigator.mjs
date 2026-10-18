import { MODULE_ID } from "../../shared/constants.mjs";
import { SceneNavSystem } from "../SceneNavSystem.mjs";
import { SceneLinksEditor } from "./SceneLinksEditor.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

const DRAG_TYPE = "faundryvtt-scenenav";

/** Special views that are not folders. */
const VIEWS = {
  ALL: "all",
  FAVORITES: "favorites",
  UNSORTED: "unsorted"
};

/**
 * GM-only full-screen scene navigator: custom folder tree, thumbnail
 * cards with view / activate / configure actions and scene links.
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
      importFolders: SceneNavigator.#onImportFolders,
      clearSearch: SceneNavigator.#onClearSearch,
      viewScene: SceneNavigator.#onViewScene,
      activateScene: SceneNavigator.#onActivateScene,
      configureScene: SceneNavigator.#onConfigureScene,
      toggleFavorite: SceneNavigator.#onToggleFavorite,
      editLinks: SceneNavigator.#onEditLinks,
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
  #preloaded = new Set();

  /* ---------------------------------------- */
  /*  Context                                 */
  /* ---------------------------------------- */

  async _prepareContext() {
    const S = SceneNavSystem;
    const data = S.getData();

    const isFolderView = !Object.values(VIEWS).includes(this.#view);
    if (isFolderView && !S.getFolder(this.#view, data)) this.#view = VIEWS.ALL;

    const collapsed = new Set(game.settings.get(MODULE_ID, "scenesNavCollapsed") ?? []);
    const tree = [];
    const walk = (parentId, depth) => {
      for (const folder of S.getChildFolders(parentId, data)) {
        const hasChildren = data.folders.some(f => f.parentId === folder.id);
        const isCollapsed = collapsed.has(folder.id);
        tree.push({
          id: folder.id,
          name: folder.name,
          color: folder.color,
          depth,
          indent: depth * 14,
          count: S.countScenesDeep(folder.id, data),
          hasChildren,
          collapsed: isCollapsed,
          selected: this.#view === folder.id
        });
        if (hasChildren && !isCollapsed) walk(folder.id, depth + 1);
      }
    };
    walk(null, 0);

    const sceneCard = scene => this.#buildSceneCard(scene, data);
    const sectionTitle = folderId => S.getFolderPath(folderId, data).map(f => f.name).join(" › ");

    let sections = [];
    let breadcrumb = null;
    let subfolders = [];
    const search = this.#search.trim().toLowerCase();

    if (search) {
      const scenes = S.getScenes().filter(s =>
        s.name.toLowerCase().includes(search) || (s.navName ?? "").toLowerCase().includes(search));
      sections.push({
        title: game.i18n.format("SCENENAV.SearchResults", { count: scenes.length }),
        scenes: scenes.map(sceneCard)
      });
    } else if (this.#view === VIEWS.ALL) {
      const ordered = [];
      const collect = parentId => {
        for (const folder of S.getChildFolders(parentId, data)) {
          ordered.push(folder);
          collect(folder.id);
        }
      };
      collect(null);
      for (const folder of ordered) {
        const scenes = S.getScenesInFolder(folder.id, data);
        if (!scenes.length) continue;
        sections.push({ title: sectionTitle(folder.id), color: folder.color, folderId: folder.id, scenes: scenes.map(sceneCard) });
      }
      const unsorted = S.getScenesInFolder(null, data);
      if (unsorted.length) {
        sections.push({ title: game.i18n.localize("SCENENAV.Unsorted"), scenes: unsorted.map(sceneCard) });
      }
    } else if (this.#view === VIEWS.FAVORITES) {
      sections.push({ title: game.i18n.localize("SCENENAV.Favorites"), scenes: S.getFavoriteScenes(data).map(sceneCard) });
    } else if (this.#view === VIEWS.UNSORTED) {
      sections.push({ title: game.i18n.localize("SCENENAV.Unsorted"), scenes: S.getScenesInFolder(null, data).map(sceneCard) });
    } else {
      const folder = S.getFolder(this.#view, data);
      breadcrumb = S.getFolderPath(folder.id, data).map(f => ({ id: f.id, name: f.name, color: f.color }));
      subfolders = S.getChildFolders(folder.id, data).map(f => ({
        id: f.id,
        name: f.name,
        color: f.color,
        count: S.countScenesDeep(f.id, data)
      }));
      sections.push({ title: folder.name, color: folder.color, folderId: folder.id, scenes: S.getScenesInFolder(folder.id, data).map(sceneCard) });
    }

    sections = sections.filter(s => s.scenes.length || !search);

    return {
      tree,
      sections,
      breadcrumb,
      subfolders,
      currentFolderId: isFolderView ? this.#view : null,
      viewAll: this.#view === VIEWS.ALL && !search,
      viewFavorites: this.#view === VIEWS.FAVORITES && !search,
      viewUnsorted: this.#view === VIEWS.UNSORTED && !search,
      countAll: game.scenes.size,
      countFavorites: S.getFavoriteScenes(data).length,
      countUnsorted: S.getScenesInFolder(null, data).length,
      search: this.#search,
      cardSize: game.settings.get(MODULE_ID, "scenesNavCardSize"),
      isEmpty: sections.every(s => !s.scenes.length) && !subfolders.length
    };
  }

  #buildSceneCard(scene, data) {
    const S = SceneNavSystem;
    const nameOf = id => game.scenes.get(id)?.name ?? "?";
    const folderId = S.getSceneFolderId(scene.id, data);
    const parentId = S.getParentId(scene.id, data);

    const children = S.getChildLinks(scene.id, data)
      .map(l => ({ id: l.to, name: nameOf(l.to) }))
      .sort(S.sortByName);

    const continues = S.getContinuations(scene.id, data).map(c => ({
      id: c.sceneId,
      name: nameOf(c.sceneId),
      direction: c.direction ? game.i18n.localize(`SCENENAV.Direction.${c.direction}`) : ""
    }));

    const viewers = game.users
      .filter(u => u.active && !u.isGM && u.viewedScene === scene.id)
      .map(u => ({ name: u.name, color: String(u.color ?? "#999") }));

    return {
      id: scene.id,
      name: scene.name,
      navName: scene.navName && scene.navName !== scene.name ? scene.navName : "",
      thumb: scene.thumb || "",
      active: scene.active,
      isView: scene.isView,
      favorite: !!data.sceneMeta[scene.id]?.favorite,
      folderColor: S.getFolder(folderId, data)?.color ?? "",
      parent: parentId ? { id: parentId, name: nameOf(parentId) } : null,
      children,
      continues,
      hasLinks: !!parentId || children.length > 0 || continues.length > 0,
      viewers,
      highlight: this.#highlightSceneId === scene.id
    };
  }

  /* ---------------------------------------- */
  /*  Rendering & DOM listeners               */
  /* ---------------------------------------- */

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

    // Card size slider (client setting)
    const sizeInput = root.querySelector(".scenenav-size input");
    sizeInput?.addEventListener("input", ev => {
      root.style.setProperty("--scenenav-card-size", `${ev.currentTarget.value}px`);
    });
    sizeInput?.addEventListener("change", ev => {
      game.settings.set(MODULE_ID, "scenesNavCardSize", Number(ev.currentTarget.value));
    });

    // Scene cards: drag, preload on hover, double-click to view
    root.querySelectorAll(".scenenav-card[data-scene-id]").forEach(card => {
      const sceneId = card.dataset.sceneId;
      card.addEventListener("dragstart", ev => {
        ev.dataTransfer.setData("text/plain", JSON.stringify({ type: DRAG_TYPE, kind: "scene", id: sceneId }));
        ev.dataTransfer.effectAllowed = "move";
      });
      let timer = null;
      card.addEventListener("mouseenter", () => {
        if (this.#preloaded.has(sceneId)) return;
        timer = setTimeout(() => {
          this.#preloaded.add(sceneId);
          game.scenes.preload(sceneId);
        }, 600);
      });
      card.addEventListener("mouseleave", () => clearTimeout(timer));
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

    // Drop targets: tree folders, subfolder tiles, "unsorted"
    root.querySelectorAll("[data-drop-folder]").forEach(el => {
      el.addEventListener("dragover", ev => {
        ev.preventDefault();
        el.classList.add("drag-over");
      });
      el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
      el.addEventListener("drop", ev => this.#onDrop(ev, el));
    });

    // Scroll to and flash a focused scene
    if (this.#highlightSceneId) {
      const card = root.querySelector(`.scenenav-card[data-scene-id="${this.#highlightSceneId}"]`);
      card?.scrollIntoView({ block: "center", behavior: "smooth" });
      this.#highlightSceneId = null;
    }
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
      const moved = await SceneNavSystem.moveFolder(payload.id, folderId);
      if (moved === false) ui.notifications.warn(game.i18n.localize("SCENENAV.Warn.FolderCycle"));
    }
  }

  async #viewScene(sceneId) {
    const scene = game.scenes.get(sceneId);
    if (!scene) return;
    await this.close();
    await scene.view();
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
    event.stopPropagation();
    const folderId = target.closest("[data-folder-id]").dataset.folderId;
    const collapsed = new Set(game.settings.get(MODULE_ID, "scenesNavCollapsed") ?? []);
    if (collapsed.has(folderId)) collapsed.delete(folderId);
    else collapsed.add(folderId);
    await game.settings.set(MODULE_ID, "scenesNavCollapsed", [...collapsed]);
    this.render();
  }

  static async #onCreateFolder(event, target) {
    const parentId = target.dataset.parentId || null;
    const result = await SceneNavigator.#promptFolder({ title: game.i18n.localize("SCENENAV.CreateFolder") });
    if (!result) return;
    const folder = await SceneNavSystem.createFolder({ name: result.name, color: result.color, parentId });
    this.#view = folder.id;
    this.#search = "";
  }

  static async #onEditFolder(event, target) {
    event.stopPropagation();
    const folder = SceneNavSystem.getFolder(target.closest("[data-folder-id]").dataset.folderId);
    if (!folder) return;
    const result = await SceneNavigator.#promptFolder({
      title: game.i18n.localize("SCENENAV.EditFolder"),
      name: folder.name,
      color: folder.color
    });
    if (!result) return;
    await SceneNavSystem.updateFolder(folder.id, { name: result.name || folder.name, color: result.color });
  }

  static async #onDeleteFolder(event, target) {
    event.stopPropagation();
    const folder = SceneNavSystem.getFolder(target.closest("[data-folder-id]").dataset.folderId);
    if (!folder) return;
    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize("SCENENAV.DeleteFolder") },
      content: `<p>${game.i18n.format("SCENENAV.Confirm.DeleteFolder", { name: Handlebars.escapeExpression(folder.name) })}</p>`
    });
    if (!confirmed) return;
    if (this.#view === folder.id) this.#view = folder.parentId ?? VIEWS.ALL;
    await SceneNavSystem.deleteFolder(folder.id);
  }

  static async #onImportFolders() {
    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize("SCENENAV.ImportFolders") },
      content: `<p>${game.i18n.localize("SCENENAV.Confirm.ImportFolders")}</p>`
    });
    if (!confirmed) return;
    const result = await SceneNavSystem.importFoundryFolders();
    ui.notifications.info(game.i18n.format("SCENENAV.Info.Imported", result));
  }

  static #onClearSearch() {
    this.#search = "";
    this.render();
  }

  static async #onViewScene(event, target) {
    await this.#viewScene(target.closest("[data-scene-id]").dataset.sceneId);
  }

  static async #onActivateScene(event, target) {
    const scene = game.scenes.get(target.closest("[data-scene-id]").dataset.sceneId);
    if (!scene) return;
    await this.close();
    await scene.activate();
  }

  static #onConfigureScene(event, target) {
    const scene = game.scenes.get(target.closest("[data-scene-id]").dataset.sceneId);
    scene?.sheet.render(true);
  }

  static async #onToggleFavorite(event, target) {
    await SceneNavSystem.toggleFavorite(target.closest("[data-scene-id]").dataset.sceneId);
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
