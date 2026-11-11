/**
 * Pure computation of the cells a token can reach.
 *
 * Three precision levels (chosen by every player in the client settings):
 * - "free": grid distance only, walls ignored;
 * - "line": same cells as "free", minus those whose straight line from the
 *   token crosses a wall (cheap, but it never "goes around the corner");
 * - "path": real shortest path cell by cell (Dijkstra), walls and doors are
 *   respected, so it reaches behind corners exactly as a walking token would.
 *
 * Performance notes (old PCs):
 * - runs only on the client that asked for it, only when something changes;
 * - every wall test first goes through a local index of the nearby edges
 *   (plain segment math), so the authoritative core collision test runs only
 *   for the few steps that actually touch a wall;
 * - the search radius is capped (MAX_SPACES).
 */

/** Hard cap on the search radius, in grid spaces. */
const MAX_SPACES = 60;

/** Tolerance used when comparing distances. */
const EPSILON = 1e-6;

export class ReachCalculator {

  /**
   * Cells reachable by the token within the largest budget.
   * @param {Token} token              Token placeable
   * @param {number} maxDistance       Largest budget, in scene distance units
   * @param {"free"|"line"|"path"} mode
   * @returns {{cells: {offset: {i:number,j:number}, cost:number}[]}}
   *          cost is expressed in scene distance units
   */
  static computeCells(token, maxDistance, mode) {
    const grid = canvas.grid;
    const unit = grid.distance || 1;
    const maxSpaces = Math.min(MAX_SPACES, maxDistance / unit);
    if (!(maxSpaces > 0)) return { cells: [] };

    const origins = this.#originOffsets(token);
    const bounds = this.#offsetBounds();
    const center = token.document.getCenterPoint?.() ?? token.center;
    const edges = mode === "free" ? null : new EdgeIndex(center, maxSpaces + 2);
    const blocked = edges ? (a, b) => edges.blocks(token, a, b) : null;

    const costs = this.#dijkstra(origins, maxSpaces, bounds, mode === "path" ? blocked : null);

    const originKeys = new Set(origins.map(o => keyOf(o)));
    const cells = [];
    for (const [key, { offset, cost }] of costs) {
      if (originKeys.has(key)) continue;
      if (mode === "line" && blocked(center, grid.getCenterPoint(offset))) continue;
      cells.push({ offset, cost: cost * unit });
    }
    return { cells };
  }

  /**
   * Polygon reachable on a gridless scene (no cells to color).
   * "free" is a circle; "line" and "path" are the core movement polygon
   * clipped by walls (true pathfinding around corners is not available
   * without cells, so "path" behaves like "line" here).
   * @returns {PIXI.Polygon}
   */
  static computeGridlessShape(token, distance, mode) {
    const grid = canvas.grid;
    const radius = (distance / (grid.distance || 1)) * grid.size;
    const center = token.document.getCenterPoint?.() ?? token.center;
    if (!(radius > 0)) return null;

    if (mode !== "free") {
      try {
        const backend = CONFIG.Canvas.polygonBackends?.move;
        const poly = backend?.create(center, { type: "move", radius, density: 48 });
        if (poly?.points?.length) return poly;
      } catch (err) {
        console.warn("Faundryvtt Tools | Movement reach: movement polygon failed, using a circle", err);
      }
    }

    const points = [];
    const steps = 64;
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      points.push(center.x + Math.cos(a) * radius, center.y + Math.sin(a) * radius);
    }
    return new PIXI.Polygon(points);
  }

  /* ---------------------------------------- */
  /*  Grid search                              */
  /* ---------------------------------------- */

  /**
   * Dijkstra over grid offsets. Costs are in grid spaces.
   * For the alternating diagonal rules the state also tracks the parity of
   * the diagonals already walked (5/10/5 needs the path history).
   * @returns {Map<string, {offset, cost}>} best cost per cell
   */
  static #dijkstra(origins, maxSpaces, bounds, blocked) {
    const grid = canvas.grid;
    const neighbors = this.#neighborFunction();
    const best = new Map();       // cellKey -> {offset, cost}
    const settled = new Map();    // stateKey -> cost
    const stepCache = new Map();  // "from|to" -> blocked?
    const heap = new MinHeap();

    for (const o of origins) heap.push(0, { offset: o, parity: 0 });

    while (heap.size) {
      const { cost, value: { offset, parity } } = heap.pop();
      const cellKey = keyOf(offset);
      const stateKey = `${cellKey}|${parity}`;
      if (settled.has(stateKey)) continue;
      settled.set(stateKey, cost);

      const prev = best.get(cellKey);
      if (!prev || cost < prev.cost) best.set(cellKey, { offset, cost });

      for (const step of neighbors(offset, parity)) {
        const next = step.offset;
        if (!inBounds(next, bounds)) continue;
        const nextCost = cost + step.cost;
        if (nextCost > maxSpaces + EPSILON) continue;
        const nextState = `${keyOf(next)}|${step.parity}`;
        if (settled.has(nextState)) continue;

        if (blocked) {
          const stepKey = `${cellKey}|${keyOf(next)}`;
          let isBlocked = stepCache.get(stepKey);
          if (isBlocked === undefined) {
            isBlocked = blocked(grid.getCenterPoint(offset), grid.getCenterPoint(next));
            stepCache.set(stepKey, isBlocked);
          }
          if (isBlocked) continue;
        }
        heap.push(nextCost, { offset: next, parity: step.parity });
      }
    }
    return best;
  }

  /**
   * Builds the neighbor generator for the current grid.
   * Returns steps {offset, cost (spaces), parity}.
   */
  static #neighborFunction() {
    const grid = canvas.grid;

    // Hexagonal grids: six neighbors, every step costs one space
    if (!grid.isSquare) {
      return (offset, parity) => grid.getAdjacentOffsets(offset).map(o => ({ offset: o, cost: 1, parity }));
    }

    const D = CONST.GRID_DIAGONALS ?? {};
    const rule = grid.diagonals;
    const orthogonal = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const diagonal = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

    let diagonalCost; // (parity) => [cost, nextParity] | null
    switch (rule) {
      case D.EXACT: diagonalCost = (p) => [Math.SQRT2, p]; break;
      case D.APPROXIMATE: diagonalCost = (p) => [1.5, p]; break;
      case D.ALTERNATING_1: diagonalCost = (p) => [p ? 2 : 1, 1 - p]; break;
      case D.ALTERNATING_2: diagonalCost = (p) => [p ? 1 : 2, 1 - p]; break;
      case D.RECTILINEAR:
      case D.ILLEGAL: diagonalCost = null; break;
      default: diagonalCost = (p) => [1, p]; // EQUIDISTANT
    }

    return (offset, parity) => {
      const out = [];
      for (const [di, dj] of orthogonal) {
        out.push({ offset: { i: offset.i + di, j: offset.j + dj }, cost: 1, parity });
      }
      if (diagonalCost) {
        const [cost, nextParity] = diagonalCost(parity);
        for (const [di, dj] of diagonal) {
          out.push({ offset: { i: offset.i + di, j: offset.j + dj }, cost, parity: nextParity });
        }
      }
      return out;
    };
  }

  /** Grid offsets currently occupied by the token (bigger tokens: several). */
  static #originOffsets(token) {
    const doc = token.document;
    try {
      const occupied = doc.getOccupiedGridSpaceOffsets?.();
      if (occupied?.length) return occupied.map(o => ({ i: o.i, j: o.j }));
    } catch { /* fall back to the center cell */ }
    const center = doc.getCenterPoint?.() ?? token.center;
    const o = canvas.grid.getOffset(center);
    return [{ i: o.i, j: o.j }];
  }

  /** Offset range covered by the canvas (cells outside are never reached). */
  static #offsetBounds() {
    const rect = canvas.dimensions.rect;
    const [i0, j0, i1, j1] = canvas.grid.getOffsetRange(rect);
    return { i0, j0, i1, j1 };
  }
}

/* ---------------------------------------- */
/*  Helpers                                  */
/* ---------------------------------------- */

function keyOf(o) {
  return `${o.i},${o.j}`;
}

function inBounds(o, b) {
  return o.i >= b.i0 && o.i < b.i1 && o.j >= b.j0 && o.j < b.j1;
}

/**
 * Local index of the movement-blocking edges around the token.
 * Edges are bucketed into square tiles of one grid space, so a step only
 * checks the few edges near it. A segment that touches no edge is free;
 * otherwise the core collision test decides (doors, one-way walls, etc.).
 */
class EdgeIndex {

  #tiles = new Map();
  #tile;
  #stamp = 0;

  constructor(center, radiusSpaces) {
    const grid = canvas.grid;
    this.#tile = Math.max(grid.sizeX ?? grid.size, grid.sizeY ?? grid.size, 1);
    const pad = radiusSpaces * this.#tile;
    const area = { x0: center.x - pad, y0: center.y - pad, x1: center.x + pad, y1: center.y + pad };

    for (const edge of this.#collectEdges()) {
      const x0 = Math.max(Math.min(edge.a.x, edge.b.x), area.x0);
      const x1 = Math.min(Math.max(edge.a.x, edge.b.x), area.x1);
      const y0 = Math.max(Math.min(edge.a.y, edge.b.y), area.y0);
      const y1 = Math.min(Math.max(edge.a.y, edge.b.y), area.y1);
      if (x0 > x1 || y0 > y1) continue;
      const item = { a: edge.a, b: edge.b, stamp: 0 };
      for (let tx = this.#t(x0); tx <= this.#t(x1); tx++) {
        for (let ty = this.#t(y0); ty <= this.#t(y1); ty++) {
          const key = `${tx},${ty}`;
          let list = this.#tiles.get(key);
          if (!list) this.#tiles.set(key, list = []);
          list.push(item);
        }
      }
    }
  }

  /** True when the movement from a to b is blocked. */
  blocks(token, a, b) {
    if (!this.#touchesEdge(a, b)) return false;
    try {
      if (typeof token.checkCollision === "function") {
        return !!token.checkCollision(b, { origin: a, type: "move", mode: "any" });
      }
      const backend = CONFIG.Canvas.polygonBackends?.move;
      return !!backend?.testCollision(a, b, { type: "move", mode: "any" });
    } catch (err) {
      console.warn("Faundryvtt Tools | Movement reach: collision test failed", err);
      return true;
    }
  }

  #t(v) {
    return Math.floor(v / this.#tile);
  }

  #touchesEdge(a, b) {
    if (!this.#tiles.size) return false;
    const stamp = ++this.#stamp;
    for (let tx = this.#t(Math.min(a.x, b.x)); tx <= this.#t(Math.max(a.x, b.x)); tx++) {
      for (let ty = this.#t(Math.min(a.y, b.y)); ty <= this.#t(Math.max(a.y, b.y)); ty++) {
        const list = this.#tiles.get(`${tx},${ty}`);
        if (!list) continue;
        for (const e of list) {
          if (e.stamp === stamp) continue;
          e.stamp = stamp;
          if (segmentsTouch(a, b, e.a, e.b)) return true;
        }
      }
    }
    return false;
  }

  /** Movement-blocking edges of the scene (walls, closed doors, bounds). */
  #collectEdges() {
    const out = [];
    const edges = canvas.edges;
    if (edges?.values) {
      for (const edge of edges.values()) {
        if (!edge?.a || !edge?.b) continue;
        if (edge.move === 0) continue; // EDGE_SENSE_TYPES.NONE
        out.push(edge);
      }
      return out;
    }
    // Fallback: raw walls
    for (const wall of canvas.walls?.placeables ?? []) {
      const [x0, y0, x1, y1] = wall.document.c;
      if (wall.document.move === 0) continue;
      out.push({ a: { x: x0, y: y0 }, b: { x: x1, y: y1 } });
    }
    return out;
  }
}

/** Inclusive segment intersection (touching counts: the core test decides). */
function segmentsTouch(a, b, c, d) {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (((o1 >= 0 && o2 <= 0) || (o1 <= 0 && o2 >= 0)) && ((o3 >= 0 && o4 <= 0) || (o3 <= 0 && o4 >= 0))) {
    // Collinear: check overlap of the projections
    if (o1 === 0 && o2 === 0) {
      return Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x))
        && Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));
    }
    return true;
  }
  return false;
}

function orient(a, b, c) {
  const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return Math.abs(v) < 1e-9 ? 0 : Math.sign(v);
}

/** Minimal binary heap keyed by cost. */
class MinHeap {
  #items = [];

  get size() {
    return this.#items.length;
  }

  push(cost, value) {
    const items = this.#items;
    items.push({ cost, value });
    let i = items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (items[p].cost <= items[i].cost) break;
      [items[p], items[i]] = [items[i], items[p]];
      i = p;
    }
  }

  pop() {
    const items = this.#items;
    const top = items[0];
    const last = items.pop();
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < items.length && items[l].cost < items[m].cost) m = l;
        if (r < items.length && items[r].cost < items[m].cost) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i], items[m]];
        i = m;
      }
    }
    return top;
  }
}
