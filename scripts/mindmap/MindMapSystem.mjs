import { MODULE_ID } from "../shared/constants.mjs";

/**
 * Data management for Mind Map boards.
 * Boards are stored as a world-level setting (Array).
 */
export class MindMapSystem {

  /* ---------- Read ---------- */

  static getBoards() {
    return game.settings.get(MODULE_ID, "mindmapBoards") ?? [];
  }

  static getBoard(boardId) {
    return this.getBoards().find(b => b.id === boardId) ?? null;
  }

  /* ---------- Write (boards) ---------- */

  static async saveBoards(boards) {
    await game.settings.set(MODULE_ID, "mindmapBoards", boards);
  }

  static async createBoard(name) {
    const boards = this.getBoards();
    const board = {
      id: foundry.utils.randomID(),
      name,
      nodes: [],
      connections: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    };
    boards.push(board);
    await this.saveBoards(boards);
    return board;
  }

  static async deleteBoard(boardId) {
    const boards = this.getBoards().filter(b => b.id !== boardId);
    await this.saveBoards(boards);
  }

  static async updateBoard(boardId, updates) {
    const boards = this.getBoards();
    const board = boards.find(b => b.id === boardId);
    if (!board) return null;
    Object.assign(board, updates);
    await this.saveBoards(boards);
    return board;
  }

  /* ---------- Nodes ---------- */

  static async addNode(boardId, nodeData) {
    const boards = this.getBoards();
    const board = boards.find(b => b.id === boardId);
    if (!board) return null;
    const node = { id: foundry.utils.randomID(), ...nodeData };
    board.nodes.push(node);
    await this.saveBoards(boards);
    return node;
  }

  static async updateNode(boardId, nodeId, updates) {
    const boards = this.getBoards();
    const board = boards.find(b => b.id === boardId);
    if (!board) return null;
    const node = board.nodes.find(n => n.id === nodeId);
    if (!node) return null;
    Object.assign(node, updates);
    await this.saveBoards(boards);
    return node;
  }

  static async removeNode(boardId, nodeId) {
    const boards = this.getBoards();
    const board = boards.find(b => b.id === boardId);
    if (!board) return;
    board.nodes = board.nodes.filter(n => n.id !== nodeId);
    board.connections = board.connections.filter(
      c => c.from !== nodeId && c.to !== nodeId
    );
    await this.saveBoards(boards);
  }

  /* ---------- Connections ---------- */

  static async addConnection(boardId, connData) {
    const boards = this.getBoards();
    const board = boards.find(b => b.id === boardId);
    if (!board) return null;
    const conn = {
      id: foundry.utils.randomID(),
      label: "",
      color: "#888888",
      style: "solid",
      arrow: "none",
      ...connData
    };
    board.connections.push(conn);
    await this.saveBoards(boards);
    return conn;
  }

  static async updateConnection(boardId, connId, updates) {
    const boards = this.getBoards();
    const board = boards.find(b => b.id === boardId);
    if (!board) return null;
    const conn = board.connections.find(c => c.id === connId);
    if (!conn) return null;
    Object.assign(conn, updates);
    await this.saveBoards(boards);
    return conn;
  }

  static async removeConnection(boardId, connId) {
    const boards = this.getBoards();
    const board = boards.find(b => b.id === boardId);
    if (!board) return;
    board.connections = board.connections.filter(c => c.id !== connId);
    await this.saveBoards(boards);
  }
}
