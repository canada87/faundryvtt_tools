import { MODULE_ID } from "../../shared/constants.mjs";
import { MindMapSystem } from "../MindMapSystem.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const SVG_NS = "http://www.w3.org/2000/svg";

export class MindMapApp extends HandlebarsApplicationMixin(ApplicationV2) {

  /* ---- State ---- */

  /** @type {string|null} Current board ID */
  #boardId = null;
  #viewport = { x: 0, y: 0, zoom: 1 };
  #connectMode = false;
  #connectSourceId = null;
  #nodeColor = "#4a90d9";
  #dragState = null;

  /* ---- ApplicationV2 config ---- */

  static DEFAULT_OPTIONS = {
    id: "mindmap-app",
    classes: ["mindmap"],
    window: {
      title: "MINDMAP.AppTitle",
      icon: "fas fa-project-diagram",
      resizable: true
    },
    position: {
      width: 900,
      height: 650
    },
    actions: {
      newBoard: MindMapApp.#onNewBoard,
      renameBoard: MindMapApp.#onRenameBoard,
      deleteBoard: MindMapApp.#onDeleteBoard,
      toggleConnect: MindMapApp.#onToggleConnect,
      zoomIn: MindMapApp.#onZoomIn,
      zoomOut: MindMapApp.#onZoomOut,
      fitView: MindMapApp.#onFitView,
      addNote: MindMapApp.#onAddNote
    }
  };

  static PARTS = {
    mindmap: {
      template: `modules/${MODULE_ID}/templates/mindmap/mindmap.hbs`
    }
  };

  async _prepareContext() {
    return {};
  }

  /* ================================================
   *  Lifecycle
   * ============================================= */

  _onRender(context, options) {
    super._onRender(context, options);

    const boards = MindMapSystem.getBoards();
    if (boards.length && !this.#boardId) {
      this.#boardId = boards[0].id;
      const b = boards[0];
      if (b.viewport) this.#viewport = { ...b.viewport };
    }

    this.#populateBoardSelector();
    this.#setupCanvasListeners();
    this.#rebuildCanvas();
  }

  async _onClose(options) {
    if (this._boundDragMove) {
      window.removeEventListener("mousemove", this._boundDragMove);
      window.removeEventListener("mouseup", this._boundDragEnd);
    }
    return super._onClose(options);
  }

  /* ================================================
   *  Toolbar — board selector
   * ============================================= */

  #populateBoardSelector() {
    const selector = this.element.querySelector(".board-selector");
    if (!selector) return;
    const boards = MindMapSystem.getBoards();
    selector.innerHTML = "";
    for (const board of boards) {
      const opt = document.createElement("option");
      opt.value = board.id;
      opt.textContent = board.name;
      if (board.id === this.#boardId) opt.selected = true;
      selector.appendChild(opt);
    }
    selector.addEventListener("change", () => {
      this.#boardId = selector.value;
      const board = MindMapSystem.getBoard(this.#boardId);
      this.#viewport = board?.viewport ? { ...board.viewport } : { x: 0, y: 0, zoom: 1 };
      this.#rebuildCanvas();
    });

    const colorPicker = this.element.querySelector(".node-color-picker");
    if (colorPicker) {
      colorPicker.value = this.#nodeColor;
      colorPicker.addEventListener("input", () => { this.#nodeColor = colorPicker.value; });
    }
  }

  /* ================================================
   *  Canvas event listeners (delegation)
   * ============================================= */

  #setupCanvasListeners() {
    const canvas = this.element.querySelector(".mindmap-canvas");
    if (!canvas) return;

    canvas.addEventListener("mousedown", (e) => this.#onCanvasMouseDown(e));
    canvas.addEventListener("dblclick", (e) => this.#onCanvasDblClick(e));
    canvas.addEventListener("wheel", (e) => this.#onCanvasWheel(e), { passive: false });
    canvas.addEventListener("contextmenu", (e) => this.#onCanvasContextMenu(e));
    canvas.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
    canvas.addEventListener("drop", (e) => this.#onDrop(e));
  }

  /* ---- mousedown ---- */

  #onCanvasMouseDown(e) {
    // Let context-menu item clicks propagate naturally to their own click handlers
    if (e.target.closest(".mindmap-context-menu")) return;
    this.#hideContextMenu();
    if (e.button !== 0) return;

    const canvas = this.element.querySelector(".mindmap-canvas");
    const nodeEl = e.target.closest(".mindmap-node");

    if (nodeEl) {
      e.preventDefault();
      const nodeId = nodeEl.dataset.nodeId;

      if (this.#connectMode) {
        this.#handleConnectClick(nodeId);
        return;
      }

      // Start node drag
      const rect = nodeEl.getBoundingClientRect();
      this.#dragState = {
        type: "node",
        nodeId,
        offsetX: (e.clientX - rect.left) / this.#viewport.zoom,
        offsetY: (e.clientY - rect.top) / this.#viewport.zoom
      };
      nodeEl.classList.add("dragging");
    } else {
      // Empty area click
      if (this.#connectMode && this.#connectSourceId) {
        this.#connectSourceId = null;
        this.element.querySelectorAll(".mindmap-node.connect-source")
          .forEach(n => n.classList.remove("connect-source"));
        return;
      }

      // Start pan
      this.#dragState = {
        type: "pan",
        startX: e.clientX,
        startY: e.clientY,
        origX: this.#viewport.x,
        origY: this.#viewport.y
      };
      canvas.style.cursor = "grabbing";
      e.preventDefault();
    }

    // Track drag at window level so it works even if mouse leaves the canvas
    this._boundDragMove = (ev) => this.#onDragMove(ev);
    this._boundDragEnd = (ev) => this.#onDragEnd(ev);
    window.addEventListener("mousemove", this._boundDragMove);
    window.addEventListener("mouseup", this._boundDragEnd);
  }

  /* ---- drag move / end ---- */

  #onDragMove(e) {
    if (!this.#dragState) return;

    if (this.#dragState.type === "pan") {
      this.#viewport.x = this.#dragState.origX + (e.clientX - this.#dragState.startX);
      this.#viewport.y = this.#dragState.origY + (e.clientY - this.#dragState.startY);
      this.#applyViewport();
      return;
    }

    if (this.#dragState.type === "node") {
      const canvas = this.element.querySelector(".mindmap-canvas");
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left - this.#viewport.x) / this.#viewport.zoom - this.#dragState.offsetX;
      const y = (e.clientY - rect.top - this.#viewport.y) / this.#viewport.zoom - this.#dragState.offsetY;

      const nodeEl = this.element.querySelector(`.mindmap-node[data-node-id="${this.#dragState.nodeId}"]`);
      if (nodeEl) {
        nodeEl.style.left = `${x}px`;
        nodeEl.style.top = `${y}px`;
        this.#dragState.currentX = x;
        this.#dragState.currentY = y;
        this.#updateNodeConnections(this.#dragState.nodeId);
      }
    }
  }

  #onDragEnd(_e) {
    if (!this.#dragState) return;
    const canvas = this.element.querySelector(".mindmap-canvas");

    if (this.#dragState.type === "node") {
      const nodeEl = this.element.querySelector(`.mindmap-node[data-node-id="${this.#dragState.nodeId}"]`);
      nodeEl?.classList.remove("dragging");
      if (this.#dragState.currentX !== undefined) {
        MindMapSystem.updateNode(this.#boardId, this.#dragState.nodeId, {
          x: this.#dragState.currentX,
          y: this.#dragState.currentY
        });
      }
    } else if (this.#dragState.type === "pan") {
      canvas.style.cursor = this.#connectMode ? "crosshair" : "grab";
      this.#saveViewport();
    }

    this.#dragState = null;
    window.removeEventListener("mousemove", this._boundDragMove);
    window.removeEventListener("mouseup", this._boundDragEnd);
    this._boundDragMove = null;
    this._boundDragEnd = null;
  }

  /* ---- double-click ---- */

  async #onCanvasDblClick(e) {
    const nodeEl = e.target.closest(".mindmap-node");
    if (!nodeEl) return;
    const board = MindMapSystem.getBoard(this.#boardId);
    const node = board?.nodes.find(n => n.id === nodeEl.dataset.nodeId);
    if (!node) return;

    if (node.type === "journal" && node.journalUuid) {
      const doc = await fromUuid(node.journalUuid);
      doc?.sheet?.render(true);
    } else if (node.type === "note") {
      this.#editNodeNote(node.id);
    }
  }

  /* ---- wheel (zoom) ---- */

  #onCanvasWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = Math.max(0.2, Math.min(3, this.#viewport.zoom + delta));

    const canvas = this.element.querySelector(".mindmap-canvas");
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const ratio = newZoom / this.#viewport.zoom;
    this.#viewport.x = mx - ratio * (mx - this.#viewport.x);
    this.#viewport.y = my - ratio * (my - this.#viewport.y);
    this.#viewport.zoom = newZoom;

    this.#applyViewport();
    this.#saveViewport();
  }

  /* ---- context menu ---- */

  #onCanvasContextMenu(e) {
    e.preventDefault();
    const nodeEl = e.target.closest(".mindmap-node");
    const connEl = e.target.closest(".mindmap-connection");

    let items = [];

    if (nodeEl) {
      const nodeId = nodeEl.dataset.nodeId;
      const board = MindMapSystem.getBoard(this.#boardId);
      const node = board?.nodes.find(n => n.id === nodeId);

      items.push(
        { icon: "fas fa-pen", label: game.i18n.localize("MINDMAP.EditNote"), action: () => this.#editNodeNote(nodeId) },
        { icon: "fas fa-palette", label: game.i18n.localize("MINDMAP.ChangeColor"), action: () => this.#changeNodeColor(nodeId) },
        { icon: "fas fa-tag", label: game.i18n.localize("MINDMAP.RenameNode"), action: () => this.#renameNode(nodeId) }
      );
      if (node?.type === "journal") {
        items.push({ icon: "fas fa-book-open", label: game.i18n.localize("MINDMAP.OpenJournal"), action: async () => {
          const doc = await fromUuid(node.journalUuid);
          doc?.sheet?.render(true);
        }});
      }
      items.push({ icon: "fas fa-trash", label: game.i18n.localize("MINDMAP.RemoveNode"), action: () => this.#removeNode(nodeId) });

    } else if (connEl) {
      const connId = connEl.dataset.connId ?? connEl.getAttribute("data-conn-id");
      items.push(
        { icon: "fas fa-tag", label: game.i18n.localize("MINDMAP.EditLabel"), action: () => this.#editConnectionLabel(connId) },
        { icon: "fas fa-palette", label: game.i18n.localize("MINDMAP.ConnectionColor"), action: () => this.#changeConnectionColor(connId) },
        { icon: "fas fa-exchange-alt", label: game.i18n.localize("MINDMAP.ToggleStyle"), action: () => this.#toggleConnectionStyle(connId) },
        { icon: "fas fa-long-arrow-alt-right", label: game.i18n.localize("MINDMAP.ToggleArrow"), action: () => this.#toggleConnectionArrow(connId) },
        { icon: "fas fa-trash", label: game.i18n.localize("MINDMAP.RemoveConnection"), action: () => this.#removeConnection(connId) }
      );
    } else {
      return;
    }

    this.#showContextMenu(e, items);
  }

  #showContextMenu(e, items) {
    const menu = this.element.querySelector(".mindmap-context-menu");
    if (!menu) return;

    const canvas = this.element.querySelector(".mindmap-canvas");
    const canvasRect = canvas.getBoundingClientRect();

    menu.innerHTML = items.map((item, i) =>
      `<div class="context-item" data-index="${i}"><i class="${item.icon}"></i> ${item.label}</div>`
    ).join("");

    menu.style.display = "block";
    menu.style.left = `${e.clientX - canvasRect.left}px`;
    menu.style.top = `${e.clientY - canvasRect.top}px`;

    menu.querySelectorAll(".context-item").forEach((el, i) => {
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        items[i].action();
        this.#hideContextMenu();
      });
    });
  }

  #hideContextMenu() {
    const menu = this.element?.querySelector(".mindmap-context-menu");
    if (menu) menu.style.display = "none";
  }

  /* ---- drop from sidebar ---- */

  async #onDrop(e) {
    e.preventDefault();
    let data;
    try { data = JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return; }
    if (!data.uuid) return;

    const doc = await fromUuid(data.uuid);
    if (!doc) return;

    // Auto-create a board if none exists
    if (!this.#boardId) {
      const board = await MindMapSystem.createBoard(game.i18n.localize("MINDMAP.DefaultBoardName"));
      this.#boardId = board.id;
      this.#populateBoardSelector();
    }

    const canvas = this.element.querySelector(".mindmap-canvas");
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - this.#viewport.x) / this.#viewport.zoom - 55;
    const y = (e.clientY - rect.top - this.#viewport.y) / this.#viewport.zoom - 25;

    const img = doc.img ?? doc.thumbnail ?? doc.src ?? this.#defaultIcon(data.type);
    const node = await MindMapSystem.addNode(this.#boardId, {
      type: "journal",
      journalUuid: data.uuid,
      name: doc.name,
      img,
      x, y,
      color: this.#nodeColor,
      note: ""
    });

    this.#createNodeElement(node);
    this.#updateEmptyState();
  }

  #defaultIcon(type) {
    const map = {
      JournalEntry: "icons/svg/book.svg",
      JournalEntryPage: "icons/svg/book.svg",
      Actor: "icons/svg/mystery-man.svg",
      Item: "icons/svg/item-bag.svg",
      Scene: "icons/svg/mountain.svg",
      RollTable: "icons/svg/d20-black.svg"
    };
    return map[type] ?? "icons/svg/book.svg";
  }

  /* ================================================
   *  Canvas rendering
   * ============================================= */

  #rebuildCanvas() {
    const nodesContainer = this.element.querySelector(".mindmap-nodes");
    const svg = this.element.querySelector(".mindmap-svg");
    if (!nodesContainer || !svg) return;

    nodesContainer.innerHTML = "";
    svg.innerHTML = "";
    this.#createSvgDefs(svg);

    const board = MindMapSystem.getBoard(this.#boardId);
    if (board?.viewport) this.#viewport = { ...board.viewport };
    this.#applyViewport();

    if (!board) { this.#updateEmptyState(); return; }

    for (const node of board.nodes) this.#createNodeElement(node);

    // Defer connection drawing so the browser has time to lay out nodes
    // and offsetWidth/offsetHeight return accurate values.
    const boardId = this.#boardId;
    requestAnimationFrame(() => {
      if (!this.element || this.#boardId !== boardId) return;
      const currentSvg = this.element.querySelector(".mindmap-svg");
      if (!currentSvg) return;
      const currentBoard = MindMapSystem.getBoard(this.#boardId);
      if (currentBoard) {
        for (const conn of currentBoard.connections) this.#createConnectionElement(conn);
      }
    });

    this.#updateEmptyState();
  }

  #updateEmptyState() {
    const empty = this.element.querySelector(".mindmap-empty-state");
    if (!empty) return;
    const board = MindMapSystem.getBoard(this.#boardId);
    empty.style.display = (!board || board.nodes.length === 0) ? "" : "none";
  }

  /* ---- SVG defs ---- */

  #createSvgDefs(svg) {
    const defs = document.createElementNS(SVG_NS, "defs");
    const marker = document.createElementNS(SVG_NS, "marker");
    marker.setAttribute("id", "mindmap-arrow");
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "10");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "8");
    marker.setAttribute("markerHeight", "8");
    marker.setAttribute("orient", "auto-start-reverse");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    path.setAttribute("fill", "context-stroke");
    marker.appendChild(path);
    defs.appendChild(marker);
    svg.appendChild(defs);
  }

  /* ---- Node element ---- */

  #createNodeElement(node) {
    const container = this.element.querySelector(".mindmap-nodes");
    if (!container) return;

    const el = document.createElement("div");
    el.className = "mindmap-node";
    if (node.type === "note") el.classList.add("note-node");
    el.dataset.nodeId = node.id;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.style.borderColor = node.color;

    // Color strip
    const strip = document.createElement("div");
    strip.className = "node-color-strip";
    strip.style.backgroundColor = node.color;
    el.appendChild(strip);

    // Image or icon
    if (node.type === "journal") {
      const img = document.createElement("img");
      img.src = node.img || "icons/svg/book.svg";
      img.className = "node-img";
      el.appendChild(img);
    } else {
      const icon = document.createElement("i");
      icon.className = "fas fa-sticky-note node-icon";
      icon.style.color = node.color;
      el.appendChild(icon);
    }

    // Name
    const name = document.createElement("span");
    name.className = "node-name";
    name.textContent = node.name;
    el.appendChild(name);

    // Note indicator
    if (node.note) {
      const ni = document.createElement("i");
      ni.className = "fas fa-comment-dots node-note-indicator";
      ni.title = node.note;
      el.appendChild(ni);
    }

    container.appendChild(el);
  }

  /* ---- Connection element ---- */

  #createConnectionElement(conn) {
    const svg = this.element.querySelector(".mindmap-svg");
    const board = MindMapSystem.getBoard(this.#boardId);
    if (!svg || !board) return;

    const fromNode = board.nodes.find(n => n.id === conn.from);
    const toNode = board.nodes.find(n => n.id === conn.to);
    if (!fromNode || !toNode) return;

    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("mindmap-connection");
    group.dataset.connId = conn.id;

    const fc = this.#getNodeCenter(fromNode);
    const tc = this.#getNodeCenter(toNode);

    // Visible line
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", fc.x); line.setAttribute("y1", fc.y);
    line.setAttribute("x2", tc.x); line.setAttribute("y2", tc.y);
    line.setAttribute("stroke", conn.color || "#888");
    line.setAttribute("stroke-width", "2");
    if (conn.style === "dashed") line.setAttribute("stroke-dasharray", "8,4");
    if (conn.arrow === "forward" || conn.arrow === "both") line.setAttribute("marker-end", "url(#mindmap-arrow)");
    if (conn.arrow === "back" || conn.arrow === "both") line.setAttribute("marker-start", "url(#mindmap-arrow)");

    // Hit area (invisible wider line for easier clicking)
    const hit = document.createElementNS(SVG_NS, "line");
    hit.setAttribute("x1", fc.x); hit.setAttribute("y1", fc.y);
    hit.setAttribute("x2", tc.x); hit.setAttribute("y2", tc.y);
    hit.setAttribute("stroke", "transparent");
    hit.setAttribute("stroke-width", "14");
    hit.style.cursor = "pointer";
    hit.style.pointerEvents = "stroke";

    group.appendChild(line);
    group.appendChild(hit);

    // Right-click on connection: add listener directly to avoid SVG→HTML bubbling issues
    group.addEventListener("contextmenu", (e) => {
      e.stopPropagation();
      this.#onCanvasContextMenu(e);
    });

    // Label
    if (conn.label) {
      const mx = (fc.x + tc.x) / 2;
      const my = (fc.y + tc.y) / 2;
      const text = document.createElementNS(SVG_NS, "text");
      text.setAttribute("x", mx);
      text.setAttribute("y", my - 8);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("class", "connection-label");
      text.setAttribute("fill", conn.color || "#888");
      text.textContent = conn.label;
      group.appendChild(text);
    }

    svg.appendChild(group);
  }

  #getNodeCenter(node) {
    // Check if DOM element exists for more accurate center
    const el = this.element.querySelector(`.mindmap-node[data-node-id="${node.id}"]`);
    if (el) {
      return {
        x: node.x + el.offsetWidth / 2,
        y: node.y + el.offsetHeight / 2
      };
    }
    return { x: node.x + 55, y: node.y + 22 };
  }

  /* ---- Update connections when node moves ---- */

  #updateNodeConnections(nodeId) {
    const board = MindMapSystem.getBoard(this.#boardId);
    if (!board) return;

    const nodeEl = this.element.querySelector(`.mindmap-node[data-node-id="${nodeId}"]`);
    if (!nodeEl) return;
    const cx = parseFloat(nodeEl.style.left) + nodeEl.offsetWidth / 2;
    const cy = parseFloat(nodeEl.style.top) + nodeEl.offsetHeight / 2;

    for (const conn of board.connections) {
      if (conn.from !== nodeId && conn.to !== nodeId) continue;

      const g = this.element.querySelector(`.mindmap-connection[data-conn-id="${conn.id}"]`);
      if (!g) continue;

      const attr = conn.from === nodeId ? ["x1", "y1"] : ["x2", "y2"];
      for (const line of g.querySelectorAll("line")) {
        line.setAttribute(attr[0], cx);
        line.setAttribute(attr[1], cy);
      }

      const text = g.querySelector("text");
      if (text) {
        const otherId = conn.from === nodeId ? conn.to : conn.from;
        const otherEl = this.element.querySelector(`.mindmap-node[data-node-id="${otherId}"]`);
        if (otherEl) {
          const ox = parseFloat(otherEl.style.left) + otherEl.offsetWidth / 2;
          const oy = parseFloat(otherEl.style.top) + otherEl.offsetHeight / 2;
          text.setAttribute("x", (cx + ox) / 2);
          text.setAttribute("y", (cy + oy) / 2 - 8);
        }
      }
    }
  }

  /* ================================================
   *  Viewport
   * ============================================= */

  #applyViewport() {
    const vp = this.element.querySelector(".mindmap-viewport");
    if (vp) vp.style.transform = `translate(${this.#viewport.x}px, ${this.#viewport.y}px) scale(${this.#viewport.zoom})`;

    const label = this.element.querySelector(".zoom-level");
    if (label) label.textContent = `${Math.round(this.#viewport.zoom * 100)}%`;
  }

  async #saveViewport() {
    if (this.#boardId) await MindMapSystem.updateBoard(this.#boardId, { viewport: { ...this.#viewport } });
  }

  /* ================================================
   *  Connect mode
   * ============================================= */

  #handleConnectClick(nodeId) {
    if (!this.#connectSourceId) {
      this.#connectSourceId = nodeId;
      this.element.querySelector(`.mindmap-node[data-node-id="${nodeId}"]`)?.classList.add("connect-source");
      this.#setStatus(game.i18n.localize("MINDMAP.Status.SourceSelected"));
    } else if (this.#connectSourceId !== nodeId) {
      this.#createConnection(this.#connectSourceId, nodeId);
      this.element.querySelectorAll(".mindmap-node.connect-source").forEach(n => n.classList.remove("connect-source"));
      this.#connectSourceId = null;
      this.#setStatus(game.i18n.localize("MINDMAP.Status.ConnectMode"));
    }
  }

  async #createConnection(fromId, toId) {
    const board = MindMapSystem.getBoard(this.#boardId);
    if (!board) return;
    const exists = board.connections.some(
      c => (c.from === fromId && c.to === toId) || (c.from === toId && c.to === fromId)
    );
    if (exists) return;

    const conn = await MindMapSystem.addConnection(this.#boardId, { from: fromId, to: toId });
    if (conn) this.#createConnectionElement(conn);
  }

  /* ================================================
   *  Node operations (context menu)
   * ============================================= */

  async #editNodeNote(nodeId) {
    const board = MindMapSystem.getBoard(this.#boardId);
    const node = board?.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const result = await Dialog.prompt({
      title: game.i18n.localize("MINDMAP.EditNote"),
      content: `<textarea style="width:100%;height:100px;font-family:var(--font-primary);">${node.note || ""}</textarea>`,
      callback: (html) => { const el = html[0] ?? html; return el.querySelector("textarea").value; },
      rejectClose: false
    });

    if (result !== null && result !== undefined) {
      await MindMapSystem.updateNode(this.#boardId, nodeId, { note: result });
      this.#rebuildCanvas();
    }
  }

  async #changeNodeColor(nodeId) {
    const board = MindMapSystem.getBoard(this.#boardId);
    const node = board?.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const colors = ["#4a90d9", "#27ae60", "#e74c3c", "#8e44ad", "#f39c12", "#1abc9c", "#e67e22", "#95a5a6"];
    const content = `<div class="mindmap-color-grid">${
      colors.map(c => `<div class="color-swatch${c === node.color ? " active" : ""}" data-color="${c}" style="background:${c}"></div>`).join("")
    }<input type="color" value="${node.color}" class="custom-color-input" title="${game.i18n.localize("MINDMAP.CustomColor")}"></div>`;

    const result = await Dialog.prompt({
      title: game.i18n.localize("MINDMAP.ChangeColor"),
      content,
      callback: (html) => {
        const el = html[0] ?? html;
        const active = el.querySelector(".color-swatch.active");
        return active ? active.dataset.color : el.querySelector(".custom-color-input").value;
      },
      render: (html) => {
        const el = html[0] ?? html;
        el.querySelectorAll(".color-swatch").forEach(sw => {
          sw.addEventListener("click", () => {
            el.querySelectorAll(".color-swatch.active").forEach(s => s.classList.remove("active"));
            sw.classList.add("active");
          });
        });
      },
      rejectClose: false
    });

    if (result) {
      await MindMapSystem.updateNode(this.#boardId, nodeId, { color: result });
      this.#rebuildCanvas();
    }
  }

  async #renameNode(nodeId) {
    const board = MindMapSystem.getBoard(this.#boardId);
    const node = board?.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const result = await Dialog.prompt({
      title: game.i18n.localize("MINDMAP.RenameNode"),
      content: `<input type="text" value="${node.name}" style="width:100%;">`,
      callback: (html) => { const el = html[0] ?? html; return el.querySelector("input").value; },
      rejectClose: false
    });

    if (result) {
      await MindMapSystem.updateNode(this.#boardId, nodeId, { name: result });
      this.#rebuildCanvas();
    }
  }

  async #removeNode(nodeId) {
    await MindMapSystem.removeNode(this.#boardId, nodeId);
    this.#rebuildCanvas();
  }

  /* ================================================
   *  Connection operations (context menu)
   * ============================================= */

  async #editConnectionLabel(connId) {
    const board = MindMapSystem.getBoard(this.#boardId);
    const conn = board?.connections.find(c => c.id === connId);
    if (!conn) return;

    const result = await Dialog.prompt({
      title: game.i18n.localize("MINDMAP.EditLabel"),
      content: `<input type="text" value="${conn.label || ""}" style="width:100%;" placeholder="${game.i18n.localize("MINDMAP.LabelPlaceholder")}">`,
      callback: (html) => { const el = html[0] ?? html; return el.querySelector("input").value; },
      rejectClose: false
    });

    if (result !== null && result !== undefined) {
      await MindMapSystem.updateConnection(this.#boardId, connId, { label: result });
      this.#rebuildCanvas();
    }
  }

  async #changeConnectionColor(connId) {
    const board = MindMapSystem.getBoard(this.#boardId);
    const conn = board?.connections.find(c => c.id === connId);
    if (!conn) return;

    const colors = ["#888888", "#4a90d9", "#27ae60", "#e74c3c", "#8e44ad", "#f39c12", "#1abc9c", "#e67e22"];
    const content = `<div class="mindmap-color-grid">${
      colors.map(c => `<div class="color-swatch${c === conn.color ? " active" : ""}" data-color="${c}" style="background:${c}"></div>`).join("")
    }<input type="color" value="${conn.color || "#888888"}" class="custom-color-input"></div>`;

    const result = await Dialog.prompt({
      title: game.i18n.localize("MINDMAP.ConnectionColor"),
      content,
      callback: (html) => {
        const el = html[0] ?? html;
        const active = el.querySelector(".color-swatch.active");
        return active ? active.dataset.color : el.querySelector(".custom-color-input").value;
      },
      render: (html) => {
        const el = html[0] ?? html;
        el.querySelectorAll(".color-swatch").forEach(sw => {
          sw.addEventListener("click", () => {
            el.querySelectorAll(".color-swatch.active").forEach(s => s.classList.remove("active"));
            sw.classList.add("active");
          });
        });
      },
      rejectClose: false
    });

    if (result) {
      await MindMapSystem.updateConnection(this.#boardId, connId, { color: result });
      this.#rebuildCanvas();
    }
  }

  async #toggleConnectionStyle(connId) {
    const board = MindMapSystem.getBoard(this.#boardId);
    const conn = board?.connections.find(c => c.id === connId);
    if (!conn) return;
    await MindMapSystem.updateConnection(this.#boardId, connId, {
      style: conn.style === "solid" ? "dashed" : "solid"
    });
    this.#rebuildCanvas();
  }

  async #toggleConnectionArrow(connId) {
    const board = MindMapSystem.getBoard(this.#boardId);
    const conn = board?.connections.find(c => c.id === connId);
    if (!conn) return;
    const cycle = ["none", "forward", "back", "both"];
    const next = cycle[(cycle.indexOf(conn.arrow || "none") + 1) % cycle.length];
    await MindMapSystem.updateConnection(this.#boardId, connId, { arrow: next });
    this.#rebuildCanvas();
  }

  async #removeConnection(connId) {
    await MindMapSystem.removeConnection(this.#boardId, connId);
    this.#rebuildCanvas();
  }

  /* ================================================
   *  Status bar
   * ============================================= */

  #setStatus(text) {
    const bar = this.element?.querySelector(".mindmap-status-bar");
    if (!bar) return;
    if (text) {
      bar.textContent = text;
      bar.style.display = "";
    } else {
      bar.style.display = "none";
    }
  }

  /* ================================================
   *  Static action handlers (toolbar buttons)
   * ============================================= */

  static async #onNewBoard() {
    const result = await Dialog.prompt({
      title: game.i18n.localize("MINDMAP.NewBoard"),
      content: `<input type="text" value="${game.i18n.localize("MINDMAP.DefaultBoardName")}" style="width:100%;">`,
      callback: (html) => { const el = html[0] ?? html; return el.querySelector("input").value; },
      rejectClose: false
    });
    if (!result) return;

    const board = await MindMapSystem.createBoard(result);
    this.#boardId = board.id;
    this.#viewport = { x: 0, y: 0, zoom: 1 };
    this.#populateBoardSelector();
    this.#rebuildCanvas();
  }

  static async #onRenameBoard() {
    const board = MindMapSystem.getBoard(this.#boardId);
    if (!board) return;

    const result = await Dialog.prompt({
      title: game.i18n.localize("MINDMAP.RenameBoard"),
      content: `<input type="text" value="${board.name}" style="width:100%;">`,
      callback: (html) => { const el = html[0] ?? html; return el.querySelector("input").value; },
      rejectClose: false
    });
    if (!result) return;

    await MindMapSystem.updateBoard(this.#boardId, { name: result });
    this.#populateBoardSelector();
  }

  static async #onDeleteBoard() {
    const board = MindMapSystem.getBoard(this.#boardId);
    if (!board) return;

    const confirmed = await Dialog.confirm({
      title: game.i18n.localize("MINDMAP.DeleteBoard"),
      content: `<p>${game.i18n.format("MINDMAP.Confirm.DeleteBoard", { name: board.name })}</p>`
    });
    if (!confirmed) return;

    await MindMapSystem.deleteBoard(this.#boardId);
    const boards = MindMapSystem.getBoards();
    this.#boardId = boards.length ? boards[0].id : null;
    this.#viewport = { x: 0, y: 0, zoom: 1 };
    this.#populateBoardSelector();
    this.#rebuildCanvas();
  }

  static #onToggleConnect() {
    this.#connectMode = !this.#connectMode;
    this.#connectSourceId = null;

    this.element.querySelector(".connect-btn")?.classList.toggle("active", this.#connectMode);
    const canvas = this.element.querySelector(".mindmap-canvas");
    if (canvas) {
      canvas.style.cursor = this.#connectMode ? "crosshair" : "grab";
      canvas.classList.toggle("connect-active", this.#connectMode);
    }
    this.element.querySelectorAll(".mindmap-node.connect-source").forEach(n => n.classList.remove("connect-source"));

    if (this.#connectMode) {
      this.#setStatus(game.i18n.localize("MINDMAP.Status.ConnectMode"));
    } else {
      this.#setStatus(null);
    }
  }

  static #onZoomIn() {
    this.#viewport.zoom = Math.min(3, this.#viewport.zoom + 0.15);
    this.#applyViewport();
    this.#saveViewport();
  }

  static #onZoomOut() {
    this.#viewport.zoom = Math.max(0.2, this.#viewport.zoom - 0.15);
    this.#applyViewport();
    this.#saveViewport();
  }

  static #onFitView() {
    const board = MindMapSystem.getBoard(this.#boardId);
    if (!board?.nodes.length) return;

    const canvas = this.element.querySelector(".mindmap-canvas");
    const rect = canvas.getBoundingClientRect();

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of board.nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + 120);
      maxY = Math.max(maxY, n.y + 50);
    }

    const pad = 60;
    const cw = maxX - minX + pad * 2;
    const ch = maxY - minY + pad * 2;
    const zoom = Math.min(rect.width / cw, rect.height / ch, 1.5);

    this.#viewport.zoom = zoom;
    this.#viewport.x = (rect.width - cw * zoom) / 2 - minX * zoom + pad * zoom;
    this.#viewport.y = (rect.height - ch * zoom) / 2 - minY * zoom + pad * zoom;
    this.#applyViewport();
    this.#saveViewport();
  }

  static async #onAddNote() {
    if (!this.#boardId) {
      const board = await MindMapSystem.createBoard(game.i18n.localize("MINDMAP.DefaultBoardName"));
      this.#boardId = board.id;
      this.#populateBoardSelector();
    }

    const result = await Dialog.prompt({
      title: game.i18n.localize("MINDMAP.AddNote"),
      content: `<input type="text" placeholder="${game.i18n.localize("MINDMAP.NotePlaceholder")}" style="width:100%;">`,
      callback: (html) => { const el = html[0] ?? html; return el.querySelector("input").value; },
      rejectClose: false
    });
    if (!result) return;

    const canvas = this.element.querySelector(".mindmap-canvas");
    const rect = canvas.getBoundingClientRect();
    const x = (rect.width / 2 - this.#viewport.x) / this.#viewport.zoom - 50;
    const y = (rect.height / 2 - this.#viewport.y) / this.#viewport.zoom - 25;

    const node = await MindMapSystem.addNode(this.#boardId, {
      type: "note", name: result, x, y, color: this.#nodeColor, note: ""
    });
    this.#createNodeElement(node);
    this.#updateEmptyState();
  }
}
