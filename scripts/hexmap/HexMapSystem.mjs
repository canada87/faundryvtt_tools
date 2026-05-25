import { MODULE_ID } from "../shared/constants.mjs";

export const TERRAIN_TYPES = [
  { id: "grass",      labelKey: "HEXMAP.Terrain.Grass" },
  { id: "forest",     labelKey: "HEXMAP.Terrain.Forest" },
  { id: "hills",      labelKey: "HEXMAP.Terrain.Hills" },
  { id: "mountains",  labelKey: "HEXMAP.Terrain.Mountains" },
  { id: "fields",     labelKey: "HEXMAP.Terrain.Fields" },
  { id: "desert",     labelKey: "HEXMAP.Terrain.Desert" },
  { id: "deadlands",  labelKey: "HEXMAP.Terrain.Deadlands" },
  { id: "wetlands",   labelKey: "HEXMAP.Terrain.Wetlands" },
  { id: "sea",        labelKey: "HEXMAP.Terrain.Sea" },
  { id: "rivers",     labelKey: "HEXMAP.Terrain.Rivers" },
  { id: "paths",      labelKey: "HEXMAP.Terrain.Paths" },
];

export const BIOME_PRESETS = {
  temperate: {
    labelKey: "HEXMAP.Biome.Temperate",
    distribution: { grass: 35, forest: 25, hills: 15, fields: 15, wetlands: 10 }
  },
  desert: {
    labelKey: "HEXMAP.Biome.Desert",
    distribution: { desert: 50, deadlands: 30, hills: 20 }
  },
  coastal: {
    labelKey: "HEXMAP.Biome.Coastal",
    distribution: { sea: 30, grass: 25, fields: 20, hills: 15, forest: 10 }
  },
  mountain: {
    labelKey: "HEXMAP.Biome.Mountain",
    distribution: { mountains: 35, hills: 25, forest: 20, grass: 20 }
  },
  swamp: {
    labelKey: "HEXMAP.Biome.Swamp",
    distribution: { wetlands: 40, forest: 25, grass: 20, rivers: 15 }
  }
};

export class HexMapSystem {

  static getSettings() {
    return game.settings.get(MODULE_ID, "hexmapSettings");
  }

  static async saveSettings(data) {
    await game.settings.set(MODULE_ID, "hexmapSettings", data);
  }

  static getDefaultSettings() {
    const folders = {};
    for (const t of TERRAIN_TYPES) folders[t.id] = "";
    return { terrainFolders: folders, poiFolder: "" };
  }

  /** Integer hash → [0, 1) */
  static _hash(x, y, seed) {
    let h = ((seed ^ Math.imul(x, 374761393)) ^ Math.imul(y, 1103515245)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1664525) >>> 0;
    return (h ^ (h >>> 16)) / 0xFFFFFFFF;
  }

  /** Smooth value noise [0, 1], scale controls blob size (lower = larger blobs) */
  static _valueNoise(x, y, seed, scale = 0.28) {
    const sx = x * scale, sy = y * scale;
    const ix = Math.floor(sx), iy = Math.floor(sy);
    const fx = sx - ix, fy = sy - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = this._hash(ix,     iy,     seed);
    const b = this._hash(ix + 1, iy,     seed);
    const c = this._hash(ix,     iy + 1, seed);
    const d = this._hash(ix + 1, iy + 1, seed);
    return a * (1 - ux) * (1 - uy)
         + b * ux       * (1 - uy)
         + c * (1 - ux) * uy
         + d * ux       * uy;
  }

  /** Map a noise value [0,1] to a terrain type via cumulative weight thresholds */
  static _noiseToTerrain(value, distribution) {
    const entries = Object.entries(distribution);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let cumulative = 0;
    for (const [terrain, weight] of entries) {
      cumulative += weight / total;
      if (value <= cumulative) return terrain;
    }
    return entries[entries.length - 1][0];
  }

  /** Approximate hex distance via pixel distance / grid size */
  static _hexDistance(a, b) {
    const ca = canvas.grid.getCenterPoint({ i: a.gridI, j: a.gridJ });
    const cb = canvas.grid.getCenterPoint({ i: b.gridI, j: b.gridJ });
    return Math.sqrt((ca.x - cb.x) ** 2 + (ca.y - cb.y) ** 2) / canvas.grid.size;
  }

  /** Shuffle-then-pick cities with minimum distance constraint */
  static _placeCities(validCells, cityCount, minDist) {
    const candidates = [...validCells].sort(() => Math.random() - 0.5);
    const placed = [];
    for (const candidate of candidates) {
      if (placed.length >= cityCount) break;
      const tooClose = placed.some(c => this._hexDistance(candidate, c) < minDist);
      if (!tooClose) {
        candidate.isCity = true;
        placed.push(candidate);
      }
    }
  }

  /** Delete any existing tiles whose top-left matches one of our target cells */
  static async _clearArea(validCells) {
    const keys = new Set();
    for (const cell of validCells) {
      const pt = canvas.grid.getTopLeftPoint({ i: cell.gridI, j: cell.gridJ });
      keys.add(`${Math.round(pt.x)}_${Math.round(pt.y)}`);
    }
    const toDelete = canvas.tiles.placeables
      .filter(t => keys.has(`${Math.round(t.x)}_${Math.round(t.y)}`))
      .map(t => t.id);
    if (toDelete.length) {
      await canvas.scene.deleteEmbeddedDocuments("Tile", toDelete);
    }
  }

  /** Main entry point — generates and places the hex map on the active scene */
  static async generateMap(options) {
    const { width, height, mode, biome, manualWeights, cityCount, minCityDistance } = options;

    if (!canvas.scene) {
      ui.notifications.warn(game.i18n.localize("HEXMAP.Warn.NoScene"));
      return;
    }

    const settings = this.getSettings();

    // Build terrain distribution, filtering to configured folders only
    let distribution = {};
    if (mode === "biome") {
      const preset = BIOME_PRESETS[biome]?.distribution ?? {};
      for (const [terrain, weight] of Object.entries(preset)) {
        if (settings.terrainFolders[terrain]) distribution[terrain] = weight;
      }
    } else {
      for (const [terrain, weight] of Object.entries(manualWeights)) {
        if (weight > 0 && settings.terrainFolders[terrain]) distribution[terrain] = weight;
      }
    }

    if (Object.keys(distribution).length === 0) {
      ui.notifications.warn(game.i18n.localize("HEXMAP.Warn.NoTerrains"));
      return;
    }

    // Center of scene in grid coordinates
    const scene = canvas.scene;
    const centerOffset = canvas.grid.getOffset({ x: scene.width / 2, y: scene.height / 2 });
    const startI = centerOffset.i - Math.floor(height / 2);
    const startJ = centerOffset.j - Math.floor(width / 2);
    const maxOffset = canvas.grid.getOffset({ x: scene.width - 1, y: scene.height - 1 });

    // Generate cell grid
    const seed = Math.floor(Math.random() * 1_000_000);
    const validCells = [];

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const gi = startI + row;
        const gj = startJ + col;
        if (gi < 0 || gj < 0 || gi > maxOffset.i || gj > maxOffset.j) continue;
        const noise = this._valueNoise(col, row, seed);
        const terrain = this._noiseToTerrain(noise, distribution);
        validCells.push({ row, col, gridI: gi, gridJ: gj, terrain, isCity: false });
      }
    }

    if (validCells.length === 0) {
      ui.notifications.warn(game.i18n.localize("HEXMAP.Warn.NoScene"));
      return;
    }

    // Place cities
    if (cityCount > 0 && settings.poiFolder) {
      this._placeCities(validCells, cityCount, minCityDistance);
    }

    // Load tile file lists per terrain type
    const fileCache = {};
    const terrainKeys = new Set(validCells.map(c => c.isCity ? "__poi__" : c.terrain));
    for (const key of terrainKeys) {
      const folder = key === "__poi__" ? settings.poiFolder : settings.terrainFolders[key];
      if (!folder) continue;
      try {
        const result = await FilePicker.browse("public", folder);
        fileCache[key] = result.files.filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
      } catch (e) {
        console.warn(`HexMap | Could not browse folder "${folder}":`, e);
        fileCache[key] = [];
      }
    }

    // Delete tiles already in the target area
    await this._clearArea(validCells);

    // Build tile create data
    const tileSize = canvas.grid.size;
    const tileDefs = [];
    for (const cell of validCells) {
      const key = cell.isCity ? "__poi__" : cell.terrain;
      const files = fileCache[key] ?? [];
      if (files.length === 0) continue;
      const src = files[Math.floor(Math.random() * files.length)];
      const pt = canvas.grid.getTopLeftPoint({ i: cell.gridI, j: cell.gridJ });
      tileDefs.push({
        texture: { src },
        x: pt.x,
        y: pt.y,
        width: tileSize,
        height: tileSize,
        overhead: false,
        locked: false,
        hidden: false
      });
    }

    await canvas.scene.createEmbeddedDocuments("Tile", tileDefs);
    ui.notifications.info(game.i18n.format("HEXMAP.Info.Generated", { count: tileDefs.length }));
  }
}
