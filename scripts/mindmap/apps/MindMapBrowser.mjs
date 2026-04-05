import { MODULE_ID } from "../../shared/constants.mjs";
import { MindMapSystem } from "../MindMapSystem.mjs";
import { MindMapApp } from "./MindMapApp.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class MindMapBrowser extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "faundryvtt-mindmap-browser",
    classes: ["faundryvtt-tools", "mindmap-browser"],
    window: {
      icon: "fas fa-project-diagram",
      title: "MINDMAP.BrowserTitle",
    },
    position: {
      width: 520,
      height: "auto",
    },
    actions: {
      openBoard: MindMapBrowser.#openBoard,
      newBoard: MindMapBrowser.#newBoard,
      deleteBoard: MindMapBrowser.#deleteBoard,
      renameBoard: MindMapBrowser.#renameBoard,
    },
  };

  static PARTS = {
    browser: {
      template: `modules/${MODULE_ID}/templates/mindmap/mindmap-browser.hbs`,
    },
  };

  async _prepareContext() {
    const boards = MindMapSystem.getBoards();
    return {
      boards: boards.map(b => ({
        ...b,
        nodeCount: b.nodes?.length ?? 0,
        connectionCount: b.connections?.length ?? 0,
      })),
    };
  }

  /* ---- Action handlers ---- */

  static async #openBoard(event, target) {
    const boardId = target.dataset.boardId;
    new MindMapApp({ boardId }).render(true);
  }

  static async #newBoard() {
    const result = await Dialog.prompt({
      title: game.i18n.localize("MINDMAP.NewBoard"),
      content: `<input type="text" value="${game.i18n.localize("MINDMAP.DefaultBoardName")}" style="width:100%;margin-top:4px;">`,
      callback: (html) => { const el = html[0] ?? html; return el.querySelector("input").value; },
      rejectClose: false,
    });
    if (!result) return;
    const board = await MindMapSystem.createBoard(result);
    this.render();
    new MindMapApp({ boardId: board.id }).render(true);
  }

  static async #deleteBoard(event, target) {
    event.stopPropagation();
    const boardId = target.dataset.boardId;
    const board = MindMapSystem.getBoard(boardId);
    if (!board) return;
    const confirmed = await Dialog.confirm({
      title: game.i18n.localize("MINDMAP.DeleteBoard"),
      content: `<p>${game.i18n.format("MINDMAP.Confirm.DeleteBoard", { name: board.name })}</p>`,
    });
    if (!confirmed) return;
    await MindMapSystem.deleteBoard(boardId);
    this.render();
  }

  static async #renameBoard(event, target) {
    event.stopPropagation();
    const boardId = target.dataset.boardId;
    const board = MindMapSystem.getBoard(boardId);
    if (!board) return;
    const result = await Dialog.prompt({
      title: game.i18n.localize("MINDMAP.RenameBoard"),
      content: `<input type="text" value="${board.name}" style="width:100%;margin-top:4px;">`,
      callback: (html) => { const el = html[0] ?? html; return el.querySelector("input").value; },
      rejectClose: false,
    });
    if (!result || result === board.name) return;
    await MindMapSystem.updateBoard(boardId, { name: result });
    this.render();
  }
}
