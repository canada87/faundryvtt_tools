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
      focusScene: SceneNavigator.#onFocusScene,
      selectActor: SceneNavigator.#onSelectActor,
      castBubble: SceneNavigator.#onCastBubble,
      clearActor: SceneNavigator.#onClearActor,
      toggleActorFolder: SceneNavigator.#onToggleActorFolder,
      openActorSheet: SceneNavigator.#onOpenActorSheet,
      assignActor: SceneNavigator.#onAssignActor,
      unassignActor: SceneNavigator.#onUnassignActor
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/scene-nav/scene-navigator.hbs`,
      scrollable: [".scenenav-tree", ".scenenav-main", ".scenenav-actors"]
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
  /** Which search field ("scenes" | "actors") keeps focus across re-renders. */
  #focusedSearch = null;
  #highlightSceneId = null;

  /** Selected actor: the main area shows only the scenes where it is. */
  #actorId = null;
  #actorSearch = "";
  #openActorFolders = new Set();

  /** Scene whose cast bubble is open. */
  #castBubbleSceneId = null;

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

    if (this.#actorId && !game.actors.has(this.#actorId)) this.#actorId = null;
    const actor = game.actors.get(this.#actorId) ?? null;

    if (actor) {
      const scenes = S.getActorScenes(actor.id, data).map(e => sceneCard(e.scene));
      sections.push({
        title: game.i18n.format("SCENENAV.Cast.ScenesOf", { name: actor.name, count: scenes.length }),
        scenes
      });
    } else if (search) {
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
      viewAll: this.#view === VIEWS.ALL && !search && !actor,
      viewFavorites: this.#view === VIEWS.FAVORITES && !search && !actor,
      viewUnsorted: this.#view === VIEWS.UNSORTED && !search && !actor,
      selectedActor: actor ? { id: actor.id, name: actor.name, img: actor.img } : null,
      actorTree: this.#buildActorTree(S.getActorSceneCounts(data)),
      actorSearch: this.#actorSearch,
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

    const cast = S.getSceneCast(scene, data);
    const selected = this.#actorId ? cast.find(c => c.id === this.#actorId) : null;

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
      cast: SceneNavigator.#castCounts(cast),
      // State of the selected actor on this scene (only in the actor view)
      actorState: this.#actorId ? {
        assigned: !!selected?.assigned,
        label: selected?.count
          ? game.i18n.format("SCENENAV.Cast.OnMapCount", { count: selected.count })
          : game.i18n.localize("SCENENAV.Cast.OffMap"),
        onMap: !!selected?.count
      } : null,
      highlight: this.#highlightSceneId === scene.id
    };
  }

  /** Cast as two small counters (assigned, on the map); the names are in the cast bubble. */
  static #castCounts(cast) {
    if (!cast.length) return null;
    return { assigned: cast.filter(c => c.assigned).length, onMap: cast.filter(c => c.count).length };
  }

  /* ---------------------------------------- */
  /*  Cast bubble (click the counters)        */
  /* ---------------------------------------- */

  /** Show, refresh or remove the bubble anchored to the open scene's cast counters. */
  #updateCastBubble() {
    const old = this.element?.querySelector(":scope > .scenenav-cast-bubble");
    const scene = game.scenes.get(this.#castBubbleSceneId);
    const anchor = scene && this.element.querySelector(`[data-cast-scene="${scene.id}"]`);
    if (!anchor) {
      old?.remove();
      this.#castBubbleSceneId = null;
      return;
    }
    const bubble = old ?? document.createElement("div");
    bubble.className = "scenenav-cast-bubble";
    bubble.dataset.sceneId = scene.id;
    bubble.innerHTML = this.#castBubbleHtml(scene);
    if (!old) this.element.appendChild(bubble);
    this.#positionCastBubble();
  }

  /** Place the bubble below its counters (above if there is no room), inside the window. */
  #positionCastBubble() {
    const bubble = this.element?.querySelector(":scope > .scenenav-cast-bubble");
    const anchor = bubble && this.element.querySelector(`[data-cast-scene="${bubble.dataset.sceneId}"]`);
    if (!anchor) return;
    const a = anchor.getBoundingClientRect();
    const w = bubble.offsetWidth;
    const h = bubble.offsetHeight;
    const left = Math.min(Math.max(8, a.left + a.width / 2 - w / 2), window.innerWidth - w - 8);
    const below = a.bottom + 8 + h <= window.innerHeight;
    bubble.style.left = `${left}px`;
    bubble.style.top = `${below ? a.bottom + 8 : Math.max(8, a.top - h - 8)}px`;
  }

  #castBubbleHtml(scene) {
    const esc = Handlebars.escapeExpression;
    const loc = key => game.i18n.localize(key);
    const cast = SceneNavSystem.getSceneCast(scene);

    const chip = c => `
      <div class="scenenav-cast-actor ${c.count ? "is-present" : "is-offmap"} ${c.hostile ? "is-hostile" : ""}"
           data-action="selectActor" data-actor-id="${c.id}"
           data-tooltip="${esc(c.count ? game.i18n.format("SCENENAV.Cast.OnMapCount", { count: c.count }) : loc("SCENENAV.Cast.OffMap"))} — ${loc("SCENENAV.Cast.ShowMaps")}">
        <img src="${esc(c.img)}" alt="" />
        <span class="scenenav-cast-name">${esc(c.name)}</span>
        ${c.count > 1 ? `<span class="scenenav-cast-count">×${c.count}</span>` : ""}
        <button type="button" class="scenenav-icon-btn" data-action="${c.assigned ? "unassignActor" : "assignActor"}"
                data-tooltip="${loc(c.assigned ? "SCENENAV.Cast.Unassign" : "SCENENAV.Cast.Assign")}">
          <i class="fas ${c.assigned ? "fa-times" : "fa-thumbtack"}"></i>
        </button>
      </div>`;

    const section = (title, items) => items.length
      ? `<h4>${title} <span class="scenenav-cast-total">${items.length}</span></h4>
         <div class="scenenav-cast-list">${items.map(chip).join("")}</div>`
      : "";

    return `
      <div class="scenenav-cast-bubble-title">${esc(scene.name)}</div>
      ${section(loc("SCENENAV.Cast.Assigned"), cast.filter(c => c.assigned))}
      ${section(loc("SCENENAV.Cast.OnMap"), cast.filter(c => !c.assigned))}`;
  }

  /** Actor folders and actors as a flat indented list; a search shows matching actors only. */
  #buildActorTree(sceneCounts) {
    const S = SceneNavSystem;
    const row = (actor, depth) => ({
      id: actor.id,
      name: actor.name,
      img: actor.img,
      indent: depth * 14,
      scenes: sceneCounts.get(actor.id) ?? 0,
      selected: actor.id === this.#actorId
    });

    const search = this.#actorSearch.trim().toLowerCase();
    if (search) {
      return game.actors.filter(a => a.name.toLowerCase().includes(search)).sort(S.sortByName).map(a => row(a, 0));
    }

    const rows = [];
    const walk = (parentId, depth) => {
      for (const folder of S.getChildActorFolders(parentId)) {
        const open = this.#openActorFolders.has(folder.id);
        rows.push({ isFolder: true, id: folder.id, name: folder.name, color: S.folderColor(folder), indent: depth * 14, open });
        if (open) walk(folder.id, depth + 1);
      }
      for (const actor of S.getActorsInFolder(parentId)) rows.push(row(actor, depth));
    };
    walk(null, 0);
    return rows;
  }

  /* ---------------------------------------- */
  /*  Rendering & DOM listeners               */
  /* ---------------------------------------- */

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    window.addEventListener("keydown", this.#onKeyDown, true);
    // The cast bubble closes on any click or wheel (scroll, graph zoom) outside it
    const closeBubble = ev => {
      if (!this.#castBubbleSceneId || ev.target.closest?.(".scenenav-cast-bubble, [data-action=castBubble]")) return;
      this.#castBubbleSceneId = null;
      this.#updateCastBubble();
    };
    this.element.addEventListener("pointerdown", closeBubble, true);
    this.element.addEventListener("wheel", closeBubble, { capture: true, passive: true });
    // Re-renders restore scroll positions: follow the counters instead of closing
    this.element.addEventListener("scroll", () => this.#positionCastBubble(), true);
  }

  _onClose(options) {
    window.removeEventListener("keydown", this.#onKeyDown, true);
    this.#castBubbleSceneId = null;
    super._onClose(options);
  }

  _onRender(context, options) {
    const root = this.element;
    if (!root) return;

    // Searches (scenes, actors): re-render on input, keeping focus and caret in the field
    root.querySelectorAll("input[data-search]").forEach(input => {
      const key = input.dataset.search;
      const doSearch = foundry.utils.debounce(value => {
        if (key === "actors") this.#actorSearch = value;
        else {
          this.#search = value;
          this.#actorId = null;
        }
        this.render();
      }, 200);
      input.addEventListener("input", ev => {
        this.#focusedSearch = key;
        doSearch(ev.currentTarget.value);
      });
      input.addEventListener("blur", () => {
        if (this.#focusedSearch === key) this.#focusedSearch = null;
      });
      if (this.#focusedSearch === key || (options.isFirstRender && key === "scenes")) {
        input.focus();
        const end = input.value.length;
        input.setSelectionRange(end, end);
      }
    });

    // Actors drag as standard Actor data: onto a scene card (assign) or Foundry's canvas
    root.querySelectorAll(".scenenav-actor[data-actor-id]").forEach(el => {
      el.addEventListener("dragstart", ev => {
        const actor = game.actors.get(el.dataset.actorId);
        if (actor) ev.dataTransfer.setData("text/plain", JSON.stringify({ type: "Actor", uuid: actor.uuid }));
      });
    });

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
      // Cards accept drops in every view, also where the section is not a drop target
      card.addEventListener("dragover", ev => ev.preventDefault());
      card.addEventListener("drop", ev => this.#onDropOnCard(ev, sceneId));
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
      // Graph nodes accept the same drops as the cards (actors, journals)
      root.querySelectorAll(".scenenav-gnode[data-scene-id]:not(.is-ghost)").forEach(node => {
        node.addEventListener("dragover", ev => {
          ev.preventDefault();
          node.classList.add("drag-over");
        });
        node.addEventListener("dragleave", ev => {
          if (!node.contains(ev.relatedTarget)) node.classList.remove("drag-over");
        });
        node.addEventListener("drop", ev => {
          node.classList.remove("drag-over");
          this.#onDropOnCard(ev, node.dataset.sceneId);
        });
      });
      this.#updateCastBubble();
      return;
    }

    // Scroll to and flash a focused scene
    if (this.#highlightSceneId) {
      const card = root.querySelector(`.scenenav-card[data-scene-id="${this.#highlightSceneId}"]`);
      card?.scrollIntoView({ block: "center", behavior: "smooth" });
      this.#highlightSceneId = null;
    }
    this.#updateCastBubble();
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
    // With an actor selected, scenes without it are dimmed
    const actorScenes = this.#actorId ? new Set(S.getActorScenes(this.#actorId, data).map(e => e.scene.id)) : null;

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
        dim: (!!search && !matches(scene)) || (!!actorScenes && !actorScenes.has(id)),
        highlight: this.#highlightSceneId === id,
        viewers: this.#players.get(id) ?? [],
        cast: SceneNavigator.#castCounts(S.getSceneCast(scene, data)),
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
    const groups = this.#graphFolderGroups(visible);

    const graph = new SceneGraph(host, { nodes, edges, positions, groups }, {
      showGroups: game.settings.get(MODULE_ID, "scenesNavGraphGroups"),
      onGroupsChange: value => game.settings.set(MODULE_ID, "scenesNavGraphGroups", value),
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

  /**
   * Nested folder boxes for the graph: every folder below the current view
   * that contains visible scenes, with all the scenes inside it (subfolders included).
   * @returns {Array<{id, name, color, parentId, sceneIds: string[]}>}
   */
  #graphFolderGroups(visible) {
    const S = SceneNavSystem;
    const isFolderView = !Object.values(VIEWS).includes(this.#view);
    // In a folder view, that folder and its ancestors are the whole view: no box for them
    const baseDepth = isFolderView ? S.getFolderDepth(this.#view) : 0;
    const groups = new Map();
    for (const id of visible) {
      const path = S.getFolderPath(game.scenes.get(id)?.folder?.id);
      path.forEach((folder, i) => {
        if (i < baseDepth) return;
        if (!groups.has(folder.id)) {
          groups.set(folder.id, {
            id: folder.id,
            name: folder.name,
            color: S.folderColor(folder),
            parentId: i > baseDepth ? path[i - 1].id : null,
            sceneIds: []
          });
        }
        groups.get(folder.id).sceneIds.push(id);
      });
    }
    return [...groups.values()];
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

  /**
   * Dropping on a card: a Journal (or page) becomes the scene's note,
   * an Actor is assigned to the scene.
   */
  async #onDropOnCard(event, sceneId) {
    let payload;
    try {
      payload = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }
    if (!["JournalEntry", "JournalEntryPage", "Actor"].includes(payload?.type) || !payload.uuid) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.closest("[data-drop-folder]")?.classList.remove("drag-over");
    const doc = await fromUuid(payload.uuid);
    const scene = game.scenes.get(sceneId);
    if (!doc || !scene) return;
    if (doc.documentName === "Actor") {
      if (doc.pack) return ui.notifications.warn(game.i18n.localize("SCENENAV.Cast.NoCompendium"));
      if (await SceneNavSystem.assignActor(sceneId, doc.id)) {
        ui.notifications.info(game.i18n.format("SCENENAV.Cast.AssignedTo", { actor: doc.name, scene: scene.name }));
      }
      return;
    }
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
    this.#actorId = null;
    this.render();
  }

  /** Click an actor: show only its scenes (click again to go back). */
  static #onSelectActor(event, target) {
    const actorId = target.closest("[data-actor-id]").dataset.actorId;
    this.#actorId = this.#actorId === actorId ? null : actorId;
    this.#castBubbleSceneId = null;
    this.render();
  }

  /** Click the cast counters of a scene: open its bubble (click again to close). */
  static #onCastBubble(event, target) {
    const sceneId = target.dataset.castScene;
    this.#castBubbleSceneId = this.#castBubbleSceneId === sceneId ? null : sceneId;
    this.#updateCastBubble();
  }

  static #onClearActor() {
    this.#actorId = null;
    this.render();
  }

  static #onToggleActorFolder(event, target) {
    const folderId = target.closest("[data-actor-folder-id]").dataset.actorFolderId;
    if (!this.#openActorFolders.delete(folderId)) this.#openActorFolders.add(folderId);
    this.render();
  }

  static #onOpenActorSheet() {
    game.actors.get(this.#actorId)?.sheet.render(true);
  }

  /** Actor from the cast bubble chip, or the selected actor on a card. */
  #castTarget(target) {
    return {
      sceneId: target.closest("[data-scene-id]")?.dataset.sceneId,
      actorId: target.closest("[data-actor-id]")?.dataset.actorId ?? this.#actorId
    };
  }

  static async #onAssignActor(event, target) {
    const { sceneId, actorId } = this.#castTarget(target);
    if (sceneId && actorId) await SceneNavSystem.assignActor(sceneId, actorId);
  }

  static async #onUnassignActor(event, target) {
    const { sceneId, actorId } = this.#castTarget(target);
    if (sceneId && actorId) await SceneNavSystem.unassignActor(sceneId, actorId);
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
    this.#actorId = null;
    this.#highlightSceneId = sceneId;
    this.render();
  }
}
