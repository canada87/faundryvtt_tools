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
 * Core logic for the Scene Navigator.
 *
 * Folders are Foundry's own Scene folders: creating, renaming, moving
 * and deleting them here changes them in the Scenes sidebar too.
 * Module-only data (favorites, typed links, graph positions) lives in a world setting:
 * {
 *   sceneMeta: { [sceneId]: { favorite } },
 *   links:     [{ id, type, from, to, direction }],
 *   layout:    { [sceneId]: { x, y } }
 * }
 */
export class SceneNavSystem {

  static isEnabled() {
    return game.settings.get(MODULE_ID, "scenesNavEnabled");
  }

  static getData() {
    const raw = game.settings.get(MODULE_ID, DATA_SETTING) ?? {};
    return {
      sceneMeta: raw.sceneMeta ?? {},
      links: Array.isArray(raw.links) ? raw.links : [],
      layout: raw.layout ?? {}
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

  /** Clear all module data (favorites, links, graph positions). Foundry folders are untouched. */
  static async resetData() {
    await game.settings.set(MODULE_ID, DATA_SETTING, { sceneMeta: {}, links: [], layout: {} });
  }

  static sortByName(a, b) {
    return (a.name ?? "").localeCompare(b.name ?? "", undefined, { numeric: true, sensitivity: "base" });
  }

  /* ---------------------------------------- */
  /*  Scenes                                  */
  /* ---------------------------------------- */

  static getScenes() {
    return game.scenes.contents.slice().sort(this.sortByName);
  }

  /** Folder id of a scene, or null when it is not in a folder. */
  static getSceneFolderId(sceneId) {
    return game.scenes.get(sceneId)?.folder?.id ?? null;
  }

  /** Scenes directly inside a folder (null = no folder). */
  static getScenesInFolder(folderId) {
    return this.getScenes().filter(s => (s.folder?.id ?? null) === (folderId ?? null));
  }

  static getFavoriteScenes(data = this.getData()) {
    return this.getScenes().filter(s => data.sceneMeta[s.id]?.favorite);
  }

  static async setSceneFolder(sceneId, folderId) {
    const scene = game.scenes.get(sceneId);
    if (!scene || (scene.folder?.id ?? null) === (folderId ?? null)) return false;
    await scene.update({ folder: folderId ?? null });
    return true;
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
    const hasRefs = data.sceneMeta[sceneId] || data.layout[sceneId]
      || data.links.some(l => l.from === sceneId || l.to === sceneId);
    if (!hasRefs) return;
    return this.#mutate(d => {
      delete d.sceneMeta[sceneId];
      delete d.layout[sceneId];
      d.links = d.links.filter(l => l.from !== sceneId && l.to !== sceneId);
    });
  }

  /* ---------------------------------------- */
  /*  Folders (Foundry Scene folders)         */
  /* ---------------------------------------- */

  static get maxDepth() {
    return CONST.FOLDER_MAX_DEPTH ?? 4;
  }

  static getFolder(folderId) {
    if (!folderId) return null;
    const folder = game.folders.get(folderId);
    return folder?.type === "Scene" ? folder : null;
  }

  static getChildFolders(parentId) {
    return game.folders
      .filter(f => f.type === "Scene" && (f.folder?.id ?? null) === (parentId ?? null))
      .sort(this.sortByName);
  }

  static folderColor(folder) {
    return folder?.color ? String(folder.color) : "";
  }

  /** Folders from the root down to (and including) the given folder. */
  static getFolderPath(folderId) {
    const path = [];
    const seen = new Set();
    let folder = this.getFolder(folderId);
    while (folder && !seen.has(folder.id)) {
      seen.add(folder.id);
      path.unshift(folder);
      folder = folder.folder ?? null;
    }
    return path;
  }

  /** True if `folderId` is `ancestorId` or one of its descendants. */
  static isFolderWithin(folderId, ancestorId) {
    return this.getFolderPath(folderId).some(f => f.id === ancestorId);
  }

  /** Depth of a folder (1 = top level). */
  static getFolderDepth(folderId) {
    return this.getFolderPath(folderId).length;
  }

  /** Number of nested levels of a folder, itself included. */
  static #subtreeHeight(folderId) {
    const children = this.getChildFolders(folderId);
    if (!children.length) return 1;
    return 1 + Math.max(...children.map(c => this.#subtreeHeight(c.id)));
  }

  /** Whether a new subfolder can be created inside this folder. */
  static canCreateSubfolder(folderId) {
    return this.getFolderDepth(folderId) < this.maxDepth;
  }

  /** Number of scenes in a folder and all its subfolders. */
  static countScenesDeep(folderId) {
    return game.scenes.filter(s => s.folder && this.isFolderWithin(s.folder.id, folderId)).length;
  }

  static async createFolder({ name, parentId = null, color = "" } = {}) {
    if (parentId && !this.canCreateSubfolder(parentId)) return null;
    return Folder.create({
      name: name || game.i18n.localize("SCENENAV.NewFolder"),
      type: "Scene",
      folder: parentId ?? null,
      color: color || null
    });
  }

  static async updateFolder(folderId, changes) {
    const folder = this.getFolder(folderId);
    if (!folder) return false;
    await folder.update(changes);
    return true;
  }

  /**
   * Move a folder under a new parent.
   * @returns {Promise<"ok"|"cycle"|"depth"|false>}
   */
  static async moveFolder(folderId, newParentId) {
    const folder = this.getFolder(folderId);
    if (!folder) return false;
    if ((folder.folder?.id ?? null) === (newParentId ?? null)) return false;
    if (newParentId && this.isFolderWithin(newParentId, folderId)) return "cycle";
    const parentDepth = newParentId ? this.getFolderDepth(newParentId) : 0;
    if (parentDepth + this.#subtreeHeight(folderId) > this.maxDepth) return "depth";
    await folder.update({ folder: newParentId ?? null });
    return "ok";
  }

  /** Delete a folder: its subfolders and scenes move up to its parent. */
  static async deleteFolder(folderId) {
    const folder = this.getFolder(folderId);
    if (!folder) return false;
    const parentId = folder.folder?.id ?? null;

    const sceneUpdates = game.scenes
      .filter(s => s.folder?.id === folderId)
      .map(s => ({ _id: s.id, folder: parentId }));
    if (sceneUpdates.length) await Scene.updateDocuments(sceneUpdates);

    const folderUpdates = this.getChildFolders(folderId).map(f => ({ _id: f.id, folder: parentId }));
    if (folderUpdates.length) await Folder.updateDocuments(folderUpdates);

    await folder.delete();
    return true;
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

  /** Direction of a "continues" link given from the other side. */
  static oppositeDirection(direction) {
    return OPPOSITE[direction ?? ""] ?? "";
  }

  static async removeLink(linkId) {
    return this.#mutate(data => {
      const before = data.links.length;
      data.links = data.links.filter(l => l.id !== linkId);
      if (data.links.length === before) return false;
    });
  }

  /* ---------------------------------------- */
  /*  Graph layout                            */
  /* ---------------------------------------- */

  static async setNodePosition(sceneId, x, y) {
    return this.#mutate(data => {
      data.layout[sceneId] = { x: Math.round(x), y: Math.round(y) };
    });
  }

  /** Forget saved positions so the automatic layout takes over again. */
  static async clearLayout(sceneIds) {
    return this.#mutate(data => {
      for (const id of sceneIds) delete data.layout[id];
    });
  }
}
