import { LINK_TYPES } from "../SceneNavSystem.mjs";

/** Node box size and layout grid cell size, in world pixels. */
const NODE_W = 170;
const NODE_H = 132;
const CELL_W = 230;
const CELL_H = 190;

/** Snap step: half a layout cell, so snapped nodes line up with the automatic layout. */
const SNAP_X = CELL_W / 2;
const SNAP_Y = CELL_H / 2;

/** Spacing of the background dots when snapping is off. */
const DOT_STEP = 24;

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2.5;

/** Grid offsets for each "continues" direction. */
const DIRECTION_VECTORS = {
  n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1],
  s: [0, 1], sw: [-1, 1], w: [-1, 0], nw: [-1, -1],
  up: [0, -1], down: [0, 1], "": [1, 0]
};

/** 8-way directions ordered by angle, starting East and going clockwise (screen y grows down). */
const COMPASS = ["e", "se", "s", "sw", "w", "nw", "n", "ne"];

/**
 * Compute node positions for the graph.
 * Saved positions are kept; the other linked scenes are placed on a grid by
 * walking the links (children below their parent, adjacent maps in their
 * direction); unlinked scenes are laid out in rows below everything else.
 * @param {Array<{id: string}>} nodes
 * @param {Array<{from: string, to: string, type: string, direction?: string}>} edges
 * @param {Object<string, {x: number, y: number}>} saved
 * @returns {Map<string, {x: number, y: number}>}
 */
export function computeLayout(nodes, edges, saved) {
  const positions = new Map();
  const occupied = new Set();
  const cellKey = (cx, cy) => `${cx},${cy}`;
  const occupy = (id, cx, cy) => {
    occupied.add(cellKey(cx, cy));
    positions.set(id, { x: cx * CELL_W, y: cy * CELL_H, cx, cy });
  };

  for (const node of nodes) {
    const pos = saved[node.id];
    if (!pos) continue;
    const cx = Math.round(pos.x / CELL_W);
    const cy = Math.round(pos.y / CELL_H);
    occupied.add(cellKey(cx, cy));
    positions.set(node.id, { x: pos.x, y: pos.y, cx, cy });
  }

  /** Nearest free cell to the desired one. */
  const freeCell = (cx, cy) => {
    if (!occupied.has(cellKey(cx, cy))) return [cx, cy];
    for (let r = 1; r < 200; r++) {
      const ring = [];
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          ring.push([cx + dx, cy + dy, dx * dx + dy * dy]);
        }
      }
      ring.sort((a, b) => a[2] - b[2]);
      const hit = ring.find(([x, y]) => !occupied.has(cellKey(x, y)));
      if (hit) return [hit[0], hit[1]];
    }
    return [cx, cy];
  };

  // Adjacency with the grid offset to go from a node to its neighbour
  const ids = new Set(nodes.map(n => n.id));
  const adjacency = new Map(nodes.map(n => [n.id, []]));
  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) continue;
    const vec = edge.type === LINK_TYPES.CHILD ? [0, 1] : (DIRECTION_VECTORS[edge.direction ?? ""] ?? [1, 0]);
    adjacency.get(edge.from).push({ id: edge.to, vec });
    adjacency.get(edge.to).push({ id: edge.from, vec: [-vec[0], -vec[1]] });
  }

  const hasParent = new Set(edges.filter(e => e.type === LINK_TYPES.CHILD).map(e => e.to));
  const linked = nodes.filter(n => adjacency.get(n.id).length)
    .sort((a, b) => (hasParent.has(a.id) - hasParent.has(b.id))
      || (adjacency.get(b.id).length - adjacency.get(a.id).length));

  const maxCx = () => Math.max(-2, ...[...positions.values()].map(p => p.cx));
  const maxCy = () => Math.max(-2, ...[...positions.values()].map(p => p.cy));

  const walk = startId => {
    const queue = [startId];
    while (queue.length) {
      const id = queue.shift();
      const from = positions.get(id);
      for (const { id: next, vec } of adjacency.get(id)) {
        if (!positions.has(next)) {
          const [cx, cy] = freeCell(from.cx + vec[0], from.cy + vec[1]);
          occupy(next, cx, cy);
        }
        if (!queue.includes(next) && !walk.visited.has(next)) queue.push(next);
      }
      walk.visited.add(id);
    }
  };
  walk.visited = new Set();

  // Grow from nodes that already have a position (saved ones) first
  for (const node of linked) {
    if (positions.has(node.id) && !walk.visited.has(node.id)) walk(node.id);
  }
  // Then each remaining component, side by side
  for (const node of linked) {
    if (positions.has(node.id)) continue;
    const [cx, cy] = freeCell(positions.size ? maxCx() + 2 : 0, 0);
    occupy(node.id, cx, cy);
    walk(node.id);
  }

  // Unlinked scenes in rows below
  const loose = nodes.filter(n => !positions.has(n.id));
  if (loose.length) {
    const columns = Math.max(6, Math.ceil(Math.sqrt(loose.length * 2)));
    const startCy = positions.size ? maxCy() + 2 : 0;
    loose.forEach((node, i) => {
      const [cx, cy] = freeCell(i % columns, startCy + Math.floor(i / columns));
      occupy(node.id, cx, cy);
    });
  }

  return positions;
}

/** 8-way direction from one point to another. */
export function directionBetween(from, to) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const sector = Math.round(angle / (Math.PI / 4));
  return COMPASS[(sector + 8) % 8];
}

/**
 * Interactive graph view: pan (drag the background), zoom (wheel),
 * drag nodes to move them, drag a node's handle onto another node to link them,
 * click an edge to remove it.
 */
export class SceneGraph {

  /**
   * @param {HTMLElement} host
   * @param {object} model
   * @param {Array<object>} model.nodes   {id, name, thumb, active, isView, ghost, dim, highlight}
   * @param {Array<object>} model.edges   {id, type, from, to, label}
   * @param {Map<string, {x, y}>} model.positions
   * @param {object} options
   */
  constructor(host, model, options) {
    this.host = host;
    this.model = model;
    this.options = options;
    this.transform = options.transform ? { ...options.transform } : null;
    this.snap = !!options.snap;
    this.showGroups = options.showGroups !== false;
    this.#build();
    this.host.classList.toggle("is-snap", this.snap);
    if (!this.transform) this.fit();
    else this.#applyTransform();
  }

  /* ---------------------------------------- */
  /*  DOM                                     */
  /* ---------------------------------------- */

  #build() {
    const esc = Handlebars.escapeExpression;
    const loc = key => game.i18n.localize(key);

    this.host.innerHTML = `
      <div class="scenenav-graph-world">
        <div class="scenenav-graph-groups"></div>
        <svg class="scenenav-graph-edges" width="1" height="1">
          <defs>
            <marker id="scenenav-arrow-child" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" class="arrow-child"></path>
            </marker>
            <marker id="scenenav-arrow-continues" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" class="arrow-continues"></path>
            </marker>
          </defs>
          <g class="scenenav-graph-edge-layer"></g>
          <line class="scenenav-graph-temp" visibility="hidden"></line>
        </svg>
        <div class="scenenav-graph-nodes"></div>
      </div>
      <div class="scenenav-graph-toolbar">
        <button type="button" data-graph="zoomIn" data-tooltip="${loc("SCENENAV.Graph.ZoomIn")}"><i class="fas fa-search-plus"></i></button>
        <button type="button" data-graph="zoomOut" data-tooltip="${loc("SCENENAV.Graph.ZoomOut")}"><i class="fas fa-search-minus"></i></button>
        <button type="button" data-graph="fit" data-tooltip="${loc("SCENENAV.Graph.Fit")}"><i class="fas fa-expand"></i></button>
        <button type="button" data-graph="groups" class="${this.showGroups ? "is-active" : ""}" data-tooltip="${loc("SCENENAV.Graph.Groups")}"><i class="fas fa-object-group"></i></button>
        <button type="button" data-graph="snap" class="${this.snap ? "is-active" : ""}" data-tooltip="${loc("SCENENAV.Graph.Snap")}"><i class="fas fa-border-all"></i></button>
        <button type="button" data-graph="autoLayout" data-tooltip="${loc("SCENENAV.Graph.AutoLayout")}"><i class="fas fa-magic"></i></button>
      </div>
      <div class="scenenav-graph-legend">
        <span class="legend-child"><i></i> ${loc("SCENENAV.Graph.LegendChild")}</span>
        <span class="legend-continues"><i></i> ${loc("SCENENAV.Graph.LegendContinues")}</span>
        <span class="legend-help">${loc("SCENENAV.Graph.Help")}</span>
      </div>
    `;

    this.world = this.host.querySelector(".scenenav-graph-world");
    this.edgeLayer = this.host.querySelector(".scenenav-graph-edge-layer");
    this.groupLayer = this.host.querySelector(".scenenav-graph-groups");
    this.host.classList.toggle("show-groups", this.showGroups);
    this.tempLine = this.host.querySelector(".scenenav-graph-temp");
    const nodeLayer = this.host.querySelector(".scenenav-graph-nodes");

    if (!this.model.nodes.length) {
      nodeLayer.innerHTML = "";
      this.host.insertAdjacentHTML("beforeend", `<p class="scenenav-graph-empty">${loc("SCENENAV.Graph.Empty")}</p>`);
    }

    nodeLayer.innerHTML = this.model.nodes.map(node => {
      const pos = this.model.positions.get(node.id);
      const classes = [
        "scenenav-gnode",
        node.ghost ? "is-ghost" : "",
        node.dim ? "is-dim" : "",
        node.active ? "is-active" : "",
        node.isView ? "is-view" : "",
        node.highlight ? "is-highlight" : ""
      ].filter(Boolean).join(" ");
      const thumb = node.thumb
        ? `<img src="${esc(node.thumb)}" alt="" loading="lazy" draggable="false" />`
        : `<div class="scenenav-gnode-empty"><i class="fas fa-image"></i></div>`;
      const actions = node.ghost ? "" : `
        <div class="scenenav-gnode-actions">
          <button type="button" data-action="viewScene" data-tooltip="${loc("SCENENAV.ViewHint")}"><i class="fas fa-eye"></i></button>
          <button type="button" data-action="activateScene" data-tooltip="${loc("SCENENAV.ActivateHint")}"><i class="fas fa-bullseye"></i></button>
          <button type="button" data-action="pullPlayers" data-tooltip="${loc("SCENENAV.Pull.Title")}"><i class="fas fa-people-arrows"></i></button>
          <button type="button" data-action="editNote" data-tooltip="${loc("SCENENAV.Note.Title")}"><i class="fas fa-book"></i></button>
          <button type="button" data-action="editLinks" data-tooltip="${loc("SCENENAV.EditLinks")}"><i class="fas fa-link"></i></button>
          <button type="button" data-action="configureScene" data-tooltip="${loc("SCENENAV.Configure")}"><i class="fas fa-cogs"></i></button>
        </div>`;
      const viewers = node.viewers?.length ? `
        <div class="scenenav-gnode-players">
          ${node.viewers.map(v => `
            <span class="scenenav-viewer" style="--player-color:${esc(v.color)}"
                  data-tooltip="${esc(v.character ? `${v.name} (${v.character})` : v.name)}"><i class="fas fa-user"></i> ${esc(v.name)}</span>`).join("")}
        </div>` : "";
      const note = node.note && !node.ghost
        ? `<button type="button" class="scenenav-gnode-note" data-action="openNote"
             data-tooltip="${esc(node.note.preview || node.note.name)}"><i class="fas fa-book-open"></i></button>`
        : "";
      return `
        <div class="${classes}" data-scene-id="${node.id}" style="left:${pos.x}px; top:${pos.y}px; width:${NODE_W}px; height:${NODE_H}px"
             ${node.ghost ? `data-tooltip="${loc("SCENENAV.Graph.External")}"` : ""}>
          ${viewers}
          <div class="scenenav-gnode-thumb">${thumb}${actions}</div>
          <div class="scenenav-gnode-name" title="${esc(node.name)}">
            ${node.active ? `<i class="fas fa-bullseye"></i>` : ""}<span>${esc(node.name)}</span>${note}
          </div>
          ${node.ghost ? "" : `<span class="scenenav-gnode-handle" data-tooltip="${loc("SCENENAV.Graph.LinkHandle")}"></span>`}
        </div>`;
    }).join("");

    this.nodeEls = new Map([...nodeLayer.querySelectorAll(".scenenav-gnode")].map(el => [el.dataset.sceneId, el]));
    this.#drawEdges();
    this.#drawGroups();
    this.#bindEvents();
  }

  #center(id) {
    const pos = this.model.positions.get(id);
    return { x: pos.x + NODE_W / 2, y: pos.y + NODE_H / 2 };
  }

  /** Point where the segment from the node centre towards (tx, ty) leaves the node box. */
  #clip(id, tx, ty, pad = 4) {
    const c = this.#center(id);
    const dx = tx - c.x;
    const dy = ty - c.y;
    if (!dx && !dy) return c;
    const scale = Math.min(
      dx ? (NODE_W / 2 + pad) / Math.abs(dx) : Infinity,
      dy ? (NODE_H / 2 + pad) / Math.abs(dy) : Infinity
    );
    return { x: c.x + dx * scale, y: c.y + dy * scale };
  }

  /**
   * Folder boxes around their scenes. A folder's padding grows with the
   * number of nested folder levels inside it, so parent boxes enclose
   * their children's boxes and labels.
   */
  #drawGroups() {
    const groups = (this.model.groups ?? []).filter(g => g.sceneIds.some(id => this.model.positions.has(id)));
    if (!groups.length) {
      this.groupLayer.innerHTML = "";
      return;
    }
    const esc = Handlebars.escapeExpression;
    const byId = new Map(groups.map(g => [g.id, g]));
    const depth = g => (g.parentId && byId.has(g.parentId) ? depth(byId.get(g.parentId)) + 1 : 0);
    const levelsBelow = new Map(groups.map(g => [g.id, 0]));
    for (const g of [...groups].sort((a, b) => depth(b) - depth(a))) {
      if (g.parentId && byId.has(g.parentId)) {
        levelsBelow.set(g.parentId, Math.max(levelsBelow.get(g.parentId), levelsBelow.get(g.id) + 1));
      }
    }

    this.groupLayer.innerHTML = [...groups].sort((a, b) => depth(a) - depth(b)).map(g => {
      const rects = g.sceneIds.map(id => this.model.positions.get(id)).filter(Boolean);
      const lv = levelsBelow.get(g.id);
      const padX = 14 + lv * 14;
      const padTop = 30 + lv * 24;
      const padBottom = 14 + lv * 14;
      const left = Math.min(...rects.map(r => r.x)) - padX;
      const top = Math.min(...rects.map(r => r.y)) - padTop;
      const right = Math.max(...rects.map(r => r.x)) + NODE_W + padX;
      const bottom = Math.max(...rects.map(r => r.y)) + NODE_H + padBottom;
      const color = g.color || "#8a8a92";
      return `
        <div class="scenenav-group" style="left:${left}px; top:${top}px; width:${right - left}px; height:${bottom - top}px; --group-color:${esc(color)}">
          <span class="scenenav-group-label"><i class="fas fa-folder"></i> ${esc(g.name)}</span>
        </div>`;
    }).join("");
  }

  #drawEdges() {
    const esc = Handlebars.escapeExpression;
    this.edgeLayer.innerHTML = this.model.edges.map(edge => {
      const a = this.#center(edge.from);
      const b = this.#center(edge.to);
      const p1 = this.#clip(edge.from, b.x, b.y);
      const p2 = this.#clip(edge.to, a.x, a.y);
      const cls = edge.type === LINK_TYPES.CHILD ? "edge-child" : "edge-continues";
      const marker = edge.type === LINK_TYPES.CHILD ? "scenenav-arrow-child" : "scenenav-arrow-continues";
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const label = edge.label
        ? `<text class="scenenav-edge-label" x="${mid.x}" y="${mid.y - 6}" text-anchor="middle">${esc(edge.label)}</text>`
        : "";
      return `
        <g class="scenenav-edge ${cls}" data-link-id="${edge.id}" data-from="${edge.from}" data-to="${edge.to}">
          <line class="scenenav-edge-hit" x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}"></line>
          <line class="scenenav-edge-line" x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" marker-end="url(#${marker})"></line>
          ${label}
        </g>`;
    }).join("");
  }

  /* ---------------------------------------- */
  /*  Transform                               */
  /* ---------------------------------------- */

  #applyTransform() {
    const { x, y, k } = this.transform;
    this.world.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
    this.host.style.setProperty("--graph-zoom", k);
    // Background grid follows pan and zoom; it shows the snap grid when snapping is on
    const [gx, gy] = this.snap ? [SNAP_X, SNAP_Y] : [DOT_STEP, DOT_STEP];
    this.host.style.backgroundSize = `${gx * k}px ${gy * k}px`;
    this.host.style.backgroundPosition = `${x}px ${y}px`;
    this.options.onTransform?.({ ...this.transform });
  }

  #toWorld(clientX, clientY) {
    const rect = this.host.getBoundingClientRect();
    const { x, y, k } = this.transform;
    return { x: (clientX - rect.left - x) / k, y: (clientY - rect.top - y) / k };
  }

  zoomAt(factor, clientX, clientY) {
    const rect = this.host.getBoundingClientRect();
    const px = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const py = (clientY ?? rect.top + rect.height / 2) - rect.top;
    const { x, y, k } = this.transform;
    const nk = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k * factor));
    this.transform = { k: nk, x: px - (px - x) * (nk / k), y: py - (py - y) * (nk / k) };
    this.#applyTransform();
  }

  /** Fit all nodes in view. */
  fit() {
    const rect = this.host.getBoundingClientRect();
    const positions = [...this.model.positions.values()];
    if (!positions.length || !rect.width) {
      this.transform = { x: 40, y: 40, k: 1 };
      return this.#applyTransform();
    }
    const minX = Math.min(...positions.map(p => p.x));
    const minY = Math.min(...positions.map(p => p.y));
    const maxX = Math.max(...positions.map(p => p.x)) + NODE_W;
    const maxY = Math.max(...positions.map(p => p.y)) + NODE_H;
    const pad = 60;
    const k = Math.min(1.2, Math.max(MIN_ZOOM, Math.min(
      (rect.width - pad * 2) / (maxX - minX),
      (rect.height - pad * 2) / (maxY - minY)
    )));
    this.transform = {
      k,
      x: (rect.width - (maxX - minX) * k) / 2 - minX * k,
      y: (rect.height - (maxY - minY) * k) / 2 - minY * k
    };
    this.#applyTransform();
  }

  /** Center the view on a node. */
  focus(id) {
    if (!this.model.positions.has(id)) return;
    const rect = this.host.getBoundingClientRect();
    const c = this.#center(id);
    const k = Math.max(this.transform.k, 0.8);
    this.transform = { k, x: rect.width / 2 - c.x * k, y: rect.height / 2 - c.y * k };
    this.#applyTransform();
  }

  /* ---------------------------------------- */
  /*  Events                                  */
  /* ---------------------------------------- */

  #bindEvents() {
    const host = this.host;

    host.addEventListener("wheel", ev => {
      ev.preventDefault();
      this.zoomAt(Math.exp(-ev.deltaY * 0.0015), ev.clientX, ev.clientY);
    }, { passive: false });

    host.querySelector(".scenenav-graph-toolbar").addEventListener("click", ev => {
      const btn = ev.target.closest("[data-graph]");
      if (!btn) return;
      switch (btn.dataset.graph) {
        case "zoomIn": return this.zoomAt(1.25);
        case "zoomOut": return this.zoomAt(0.8);
        case "fit": return this.fit();
        case "autoLayout": return this.options.onAutoLayout?.();
        case "snap": return this.#toggleSnap(btn);
        case "groups": return this.#toggleGroups(btn);
      }
    });

    host.addEventListener("pointerdown", ev => this.#onPointerDown(ev));

    // Highlight the edges of the hovered node
    for (const [id, el] of this.nodeEls) {
      el.addEventListener("mouseenter", () => this.#highlightEdges(id));
      el.addEventListener("mouseleave", () => this.#highlightEdges(null));
      el.addEventListener("dblclick", ev => {
        if (ev.target.closest("button")) return;
        if (el.classList.contains("is-ghost")) this.options.onOpenGhost?.(id);
        else this.options.onViewScene?.(id);
      });
    }

    this.edgeLayer.addEventListener("click", ev => {
      const edge = ev.target.closest(".scenenav-edge");
      if (edge) this.options.onEdgeClick?.(edge.dataset.linkId);
    });
  }

  #toggleGroups(button) {
    this.showGroups = !this.showGroups;
    button.classList.toggle("is-active", this.showGroups);
    this.host.classList.toggle("show-groups", this.showGroups);
    this.options.onGroupsChange?.(this.showGroups);
  }

  #toggleSnap(button) {
    this.snap = !this.snap;
    button.classList.toggle("is-active", this.snap);
    this.host.classList.toggle("is-snap", this.snap);
    this.#applyTransform();
    this.options.onSnapChange?.(this.snap);
  }

  #highlightEdges(id) {
    this.host.classList.toggle("has-hover", !!id);
    for (const g of this.edgeLayer.querySelectorAll(".scenenav-edge")) {
      g.classList.toggle("is-hl", !!id && (g.dataset.from === id || g.dataset.to === id));
    }
  }

  #onPointerDown(ev) {
    if (ev.button !== 0) return;
    const target = ev.target;
    if (target.closest(".scenenav-graph-toolbar, button, .scenenav-edge")) return;

    const handle = target.closest(".scenenav-gnode-handle");
    const nodeEl = target.closest(".scenenav-gnode");
    if (handle && nodeEl) return this.#startLinkDrag(ev, nodeEl.dataset.sceneId);
    if (nodeEl) return this.#startNodeDrag(ev, nodeEl);
    this.#startPan(ev);
  }

  #track(ev, onMove, onUp) {
    ev.preventDefault();
    const move = e => onMove(e);
    const up = e => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onUp(e);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  #startPan(ev) {
    const start = { cx: ev.clientX, cy: ev.clientY, x: this.transform.x, y: this.transform.y };
    this.host.classList.add("is-panning");
    this.#track(ev, e => {
      this.transform.x = start.x + (e.clientX - start.cx);
      this.transform.y = start.y + (e.clientY - start.cy);
      this.#applyTransform();
    }, () => this.host.classList.remove("is-panning"));
  }

  #startNodeDrag(ev, el) {
    const id = el.dataset.sceneId;
    const pos = this.model.positions.get(id);
    const startWorld = this.#toWorld(ev.clientX, ev.clientY);
    const origin = { x: pos.x, y: pos.y };
    let moved = false;
    this.#track(ev, e => {
      const w = this.#toWorld(e.clientX, e.clientY);
      const dx = w.x - startWorld.x;
      const dy = w.y - startWorld.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      el.classList.add("is-dragging");
      pos.x = origin.x + dx;
      pos.y = origin.y + dy;
      if (this.snap) {
        pos.x = Math.round(pos.x / SNAP_X) * SNAP_X;
        pos.y = Math.round(pos.y / SNAP_Y) * SNAP_Y;
      }
      el.style.left = `${pos.x}px`;
      el.style.top = `${pos.y}px`;
      this.#drawEdges();
      this.#drawGroups();
    }, () => {
      el.classList.remove("is-dragging");
      if (moved) this.options.onMoveNode?.(id, pos.x, pos.y);
    });
  }

  #startLinkDrag(ev, fromId) {
    const c = this.#center(fromId);
    const line = this.tempLine;
    line.setAttribute("x1", c.x);
    line.setAttribute("y1", c.y);
    line.setAttribute("x2", c.x);
    line.setAttribute("y2", c.y);
    line.setAttribute("visibility", "visible");
    this.host.classList.add("is-linking");
    this.#track(ev, e => {
      const w = this.#toWorld(e.clientX, e.clientY);
      line.setAttribute("x2", w.x);
      line.setAttribute("y2", w.y);
    }, e => {
      line.setAttribute("visibility", "hidden");
      this.host.classList.remove("is-linking");
      const toEl = document.elementFromPoint(e.clientX, e.clientY)?.closest(".scenenav-gnode");
      const toId = toEl?.dataset.sceneId;
      if (!toId || toId === fromId) return;
      const direction = directionBetween(this.#center(fromId), this.#center(toId));
      this.options.onLink?.(fromId, toId, direction);
    });
  }
}
