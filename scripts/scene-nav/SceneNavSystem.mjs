import { MODULE_ID } from "../shared/constants.mjs";

const DATA_SETTING = "scenesNavData";

/** Relation types between scenes. */
export const LINK_TYPES = {
  CHILD: "child",        // from = parent, to = child (sub-map)
  CONTINUES: "continues" // from continues into to (adjacent map)
};

/** Directions available for "continues" links ("" = unspecified). */
export const DIRECTIONS = ["", "n", "ne", "e", "se", "s", "sw", "w", "nw", "up", "down"];

const OPPOSITE = {
  n: "s", s: "n", e: "w", w: "e",
  ne: "sw", sw: "ne", nw: "se", se: "nw",
  up: "down", down: "up", "": ""
};

/**
 * Core logic for the Scene Navigator: custom folder tree, per-scene
 * metadata (folder, favorite) and typed links between scenes.
 *
 * Everything is stored in a single world setting:
 * {
 *   folders:   [{ id, name, parentId, color, sourceId }],
 *   sceneMeta: { [sceneId]: { folderId, favorite } },
 *   links:     [{ id, type, from, to, direction }]
 * }
 */
export class SceneNavSystem {

  static isEnabled() {
    return game.settings.get(MODULE_ID, "scenesNavEnabled");
  }

  static getData() {
    const raw = game.settings.get(MODULE_ID, DATA_SETTING) ?? {};
    return {
      folders: Array.isArray(raw.folders) ? raw.folders : [],
      sceneMeta: raw.sceneMeta ?? {},
      links: Array.isArray(raw.links) ? raw.links : []
    };
  }

  /** Apply a mutation to a cloned copy of the data and persist it. */
  static async #mutate(fn) {
    const data = foundry.utils.deepClone(this.getData());
    const result = fn(data);
    if (result === false) return false;
    await game.settings.set(MODULE_ID, DATA_SETTING, data);
    return result ?? true;
  }

  /* ---------------------------------------- */
  /*  Scenes                                  */
  /* ---------------------------------------- */

  static sortByName(a, b) {
    return (a.name ?? "").localeCompare(b.name ?? "", undefined, { numeric: true, sensitivity: "base" });
  }

  static getScenes() {
    return game.scenes.contents.slice().sort(this.sortByName);
  }

  static getSceneMeta(sceneId) {
    return { folderId: null, favorite: false, ...(this.getData().sceneMeta[sceneId] ?? {}) };
  }

  /** Folder id of a scene, or null when unsorted (or its folder was deleted). */
  static getSceneFolderId(sceneId, data = this.getData()) {
    const folderId = data.sceneMeta[sceneId]?.folderId ?? null;
    if (!folderId) return null;
    return data.folders.some(f => f.id === folderId) ? folderId : null;
  }

  /** Scenes directly inside a folder (null = unsorted). */
  static getScenesInFolder(folderId, data = this.getData()) {
    return this.getScenes().filter(s => this.getSceneFolderId(s.id, data) === (folderId ?? null));
  }

  static getFavoriteScenes(data = this.getData()) {
    return this.getScenes().filter(s => data.sceneMeta[s.id]?.favorite);
  }

  static async setSceneFolder(sceneId, folderId) {
    return this.#mutate(data => {
      data.sceneMeta[sceneId] = { ...(data.sceneMeta[sceneId] ?? {}), folderId: folderId ?? null };
    });
  }

  static async toggleFavorite(sceneId) {
    return this.#mutate(data => {
      const meta = data.sceneMeta[sceneId] ?? {};
      data.sceneMeta[sceneId] = { ...meta, favorite: !meta.favorite };
    });
  }

  /** Remove every reference to a deleted scene. */
  static async pruneScene(sceneId) {
    const data = this.getData();
    const hasRefs = data.sceneMeta[sceneId] || data.links.some(l => l.from === sceneId || l.to === sceneId);
    if (!hasRefs) return;
    return this.#mutate(d => {
      delete d.sceneMeta[sceneId];
      d.links = d.links.filter(l => l.from !== sceneId && l.to !== sceneId);
    });
  }

  /* ---------------------------------------- */
  /*  Folders                                 */
  /* ---------------------------------------- */

  static getFolder(folderId, data = this.getData()) {
    return data.folders.find(f => f.id === folderId) ?? null;
  }

  static getChildFolders(parentId, data = this.getData()) {
    return data.folders.filter(f => (f.parentId ?? null) === (parentId ?? null)).sort(this.sortByName);
  }

  /** Folders from the root down to (and including) the given folder. */
  static getFolderPath(folderId, data = this.getData()) {
    const path = [];
    const seen = new Set();
    let folder = this.getFolder(folderId, data);
    while (folder && !seen.has(folder.id)) {
      seen.add(folder.id);
      path.unshift(folder);
      folder = this.getFolder(folder.parentId, data);
    }
    return path;
  }

  /** True if `folderId` is `ancestorId` or one of its descendants. */
  static isFolderWithin(folderId, ancestorId, data = this.getData()) {
    return this.getFolderPath(folderId, data).some(f => f.id === ancestorId);
  }

  /** Number of scenes in a folder and all its subfolders. */
  static countScenesDeep(folderId, data = this.getData()) {
    const scenes = game.scenes.contents;
    return scenes.filter(s => {
      const fid = this.getSceneFolderId(s.id, data);
      return fid && this.isFolderWithin(fid, folderId, data);
    }).length;
  }

  static async createFolder({ name, parentId = null, color = "" } = {}) {
    const folder = {
      id: foundry.utils.randomID(),
      name: name || game.i18n.localize("SCENENAV.NewFolder"),
      parentId,
      color
    };
    await this.#mutate(data => { data.folders.push(folder); });
    return folder;
  }

  static async updateFolder(folderId, changes) {
    return this.#mutate(data => {
      const folder = data.folders.find(f => f.id === folderId);
      if (!folder) return false;
      Object.assign(folder, changes);
    });
  }

  /** Move a folder under a new parent, refusing cycles. */
  static async moveFolder(folderId, newParentId) {
    if (folderId === newParentId) return false;
    if (newParentId && this.isFolderWithin(newParentId, folderId)) return false;
    return this.updateFolder(folderId, { parentId: newParentId ?? null });
  }

  /** Delete a folder: its subfolders and scenes move up to its parent. */
  static async deleteFolder(folderId) {
    return this.#mutate(data => {
      const folder = data.folders.find(f => f.id === folderId);
      if (!folder) return false;
      const parentId = folder.parentId ?? null;
      for (const f of data.folders) {
        if (f.parentId === folderId) f.parentId = parentId;
      }
      for (const meta of Object.values(data.sceneMeta)) {
        if (meta.folderId === folderId) meta.folderId = parentId;
      }
      data.folders = data.folders.filter(f => f.id !== folderId);
    });
  }

  /**
   * Mirror Foundry's Scene folders into the navigator's folder tree.
   * Already imported folders are reused; scenes already placed in a
   * navigator folder are left where they are.
   * @returns {{folders: number, scenes: number}}
   */
  static async importFoundryFolders() {
    const sourceFolders = game.folders.filter(f => f.type === "Scene");
    return this.#mutate(data => {
      const map = new Map();
      let createdFolders = 0;
      let placedScenes = 0;

      for (const src of sourceFolders) {
        let folder = data.folders.find(f => f.sourceId === src.id);
        if (!folder) {
          folder = {
            id: foundry.utils.randomID(),
            name: src.name,
            parentId: null,
            color: src.color ? String(src.color) : "",
            sourceId: src.id
          };
          data.folders.push(folder);
          createdFolders++;
        }
        map.set(src.id, folder);
      }

      for (const src of sourceFolders) {
        const folder = map.get(src.id);
        const parentSrcId = src.folder?.id;
        if (parentSrcId && map.has(parentSrcId)) folder.parentId = map.get(parentSrcId).id;
      }

      for (const scene of game.scenes) {
        const srcId = scene.folder?.id;
        if (!srcId || !map.has(srcId)) continue;
        const meta = data.sceneMeta[scene.id] ?? {};
        if (meta.folderId && data.folders.some(f => f.id === meta.folderId)) continue;
        data.sceneMeta[scene.id] = { ...meta, folderId: map.get(srcId).id };
        placedScenes++;
      }

      return { folders: createdFolders, scenes: placedScenes };
    });
  }

  /* ---------------------------------------- */
  /*  Links                                   */
  /* ---------------------------------------- */

  /** Links whose scenes both still exist. */
  static getLinks(data = this.getData()) {
    return data.links.filter(l => game.scenes.has(l.from) && game.scenes.has(l.to));
  }

  static getParentId(sceneId, data = this.getData()) {
    return this.getLinks(data).find(l => l.type === LINK_TYPES.CHILD && l.to === sceneId)?.from ?? null;
  }

  static getChildLinks(sceneId, data = this.getData()) {
    return this.getLinks(data).filter(l => l.type === LINK_TYPES.CHILD && l.from === sceneId);
  }

  /**
   * "Continues" links seen from a scene: outgoing links keep their direction,
   * incoming ones get the opposite direction.
   * @returns {Array<{link: object, sceneId: string, direction: string, incoming: boolean}>}
   */
  static getContinuations(sceneId, data = this.getData()) {
    const result = [];
    for (const link of this.getLinks(data)) {
      if (link.type !== LINK_TYPES.CONTINUES) continue;
      if (link.from === sceneId) {
        result.push({ link, sceneId: link.to, direction: link.direction ?? "", incoming: false });
      } else if (link.to === sceneId) {
        result.push({ link, sceneId: link.from, direction: OPPOSITE[link.direction ?? ""] ?? "", incoming: true });
      }
    }
    return result;
  }

  /** Scene ids of all ancestors (parent, grandparent, ...) of a scene. */
  static getAncestorIds(sceneId, data = this.getData()) {
    const ids = [];
    let current = this.getParentId(sceneId, data);
    while (current && !ids.includes(current)) {
      ids.push(current);
      current = this.getParentId(current, data);
    }
    return ids;
  }

  /**
   * Set the parent of a scene (a scene has at most one parent).
   * @returns {Promise<boolean>} false if the link would create a cycle
   */
  static async setParent(childId, parentId) {
    if (!childId || !parentId || childId === parentId) return false;
    if (this.getAncestorIds(parentId).includes(childId)) return false;
    return this.#mutate(data => {
      data.links = data.links.filter(l => !(l.type === LINK_TYPES.CHILD && l.to === childId));
      data.links.push({ id: foundry.utils.randomID(), type: LINK_TYPES.CHILD, from: parentId, to: childId });
    });
  }

  /** Add (or replace) a "continues" link between two scenes. */
  static async addContinuation(fromId, toId, direction = "") {
    if (!fromId || !toId || fromId === toId) return false;
    return this.#mutate(data => {
      data.links = data.links.filter(l => !(l.type === LINK_TYPES.CONTINUES
        && ((l.from === fromId && l.to === toId) || (l.from === toId && l.to === fromId))));
      data.links.push({ id: foundry.utils.randomID(), type: LINK_TYPES.CONTINUES, from: fromId, to: toId, direction });
    });
  }

  static async removeLink(linkId) {
    return this.#mutate(data => {
      const before = data.links.length;
      data.links = data.links.filter(l => l.id !== linkId);
      if (data.links.length === before) return false;
    });
  }
}
