import { MODULE_ID } from "../shared/constants.mjs";
import { ReachSystem } from "./ReachSystem.mjs";
import { ReachCalculator } from "./ReachCalculator.mjs";

/** Fill colors of the rings (1st movement, 2nd movement, 3rd movement). */
const RING_COLORS = [0x2ecc71, 0xf1c40f, 0xe67e22];

/** Fill opacity of the colored cells. */
const RING_ALPHA = 0.3;

/** Tolerance when assigning a cell to a ring. */
const EPSILON = 1e-6;

/**
 * Local overlay that colors the cells reachable by the selected token.
 *
 * - drawn on this client only, through a core grid highlight layer (no
 *   documents, no network, nothing for the other players to render);
 * - toggled with a keybinding; while on, it follows the controlled token and
 *   is recomputed only when something relevant changes (debounced).
 */
export class ReachOverlay {

  static LAYER = "faundryvtt-tools-reach";

  static #active = false;
  static #tokenId = null;
  static #label = null;
  static #warned = new Set();
  static #refresh = foundry.utils.debounce(() => this.render(), 60);

  static get active() {
    return this.#active;
  }

  /** True when the overlay currently follows this token. */
  static concerns(tokenDoc) {
    return this.#active && !!tokenDoc && tokenDoc.id === this.#tokenId;
  }

  /** True when the overlay currently follows a token of this actor. */
  static concernsActor(actor) {
    if (!this.#active || !this.#tokenId || !actor) return false;
    return canvas.tokens?.get(this.#tokenId)?.actor === actor;
  }

  /* ---------------------------------------- */
  /*  Toggle                                   */
  /* ---------------------------------------- */

  static toggle() {
    if (this.#active) {
      this.#active = false;
      this.clear();
      return;
    }
    if (!canvas.ready) return;
    if (!this.#pickToken()) {
      ui.notifications.warn(game.i18n.localize("REACH.NoToken"));
      return;
    }
    this.#active = true;
    this.render();
  }

  static scheduleRefresh() {
    if (this.#active) this.#refresh();
  }

  /* ---------------------------------------- */
  /*  Rendering                                */
  /* ---------------------------------------- */

  static render() {
    this.clear();
    if (!this.#active || !canvas.ready) return;

    const token = this.#pickToken();
    this.#tokenId = token?.id ?? null;
    if (!token) return;

    const info = ReachSystem.budgetsOf(token.document);
    if (!info) {
      this.#warnMissingSpeed(token);
      return;
    }

    const layer = this.#layer();
    if (!layer) return;

    const started = performance.now();
    const mode = ReachSystem.mode;
    const budgets = info.budgets;
    const max = budgets.reduce((m, b) => (b !== null && b > m ? b : m), 0);

    if (max > 0) {
      if (canvas.grid.isGridless) this.#drawGridless(token, budgets, mode);
      else this.#drawCells(token, budgets, max, mode);
    }
    this.#drawLabel(token, info);

    if (CONFIG.debug?.faundryvttTools) {
      console.debug(`Faundryvtt Tools | Movement reach (${mode}) in ${(performance.now() - started).toFixed(1)} ms`);
    }
  }

  static #drawCells(token, budgets, max, mode) {
    const grid = canvas.grid;
    const gridLayer = canvas.interface.grid;
    const { cells } = ReachCalculator.computeCells(token, max, mode);
    const canSee = this.#visibilityFilter();

    for (const { offset, cost } of cells) {
      const ring = budgets.findIndex(b => b !== null && cost <= b + EPSILON);
      if (ring < 0) continue;
      if (canSee && !canSee(grid.getCenterPoint(offset))) continue;
      const { x, y } = grid.getTopLeftPoint(offset);
      gridLayer.highlightPosition(this.LAYER, { x, y, color: RING_COLORS[ring], alpha: RING_ALPHA, border: null });
    }
  }

  /** Gridless scenes: one shape per ring, outer first so the inner stays on top. */
  static #drawGridless(token, budgets, mode) {
    const gridLayer = canvas.interface.grid;
    for (let ring = budgets.length - 1; ring >= 0; ring--) {
      const budget = budgets[ring];
      if (budget === null) continue;
      const shape = ReachCalculator.computeGridlessShape(token, budget, mode);
      if (!shape) continue;
      gridLayer.highlightPosition(this.LAYER, { shape, color: RING_COLORS[ring], alpha: RING_ALPHA, border: null });
    }
  }

  /** Small text above the token: movement left in the current movement. */
  static #drawLabel(token, { speed, walked, budgets }) {
    const units = canvas.grid.units || "";
    const round = (n) => Math.round(n * 10) / 10;
    const ringLeft = budgets.findIndex(b => b !== null);
    let text;
    if (ringLeft < 0) {
      text = game.i18n.localize("REACH.LabelNone");
    } else {
      // Distance left in the movement currently in progress
      const left = round(budgets[ringLeft] - ringLeft * speed);
      text = game.i18n.format("REACH.Label", {
        left, speed: round(speed), units, walked: round(walked)
      });
      if (ringLeft > 0) text = `${text} · ${game.i18n.format("REACH.LabelExtra", { n: ringLeft + 1 })}`;
    }

    const style = CONFIG.canvasTextStyle?.clone?.() ?? new PIXI.TextStyle();
    style.fontSize = Math.max(14, Math.round(canvas.grid.size * 0.26));
    const TextClass = foundry.canvas?.containers?.PreciseText ?? PIXI.Text;
    const label = new TextClass(text, style);
    label.anchor.set(0.5, 1);
    const doc = token.document;
    const center = doc.getCenterPoint?.() ?? token.center;
    label.position.set(center.x, doc.y - 4);
    label.eventMode = "none";
    canvas.interface.addChild(label);
    this.#label = label;
  }

  static clear() {
    canvas.interface?.grid?.clearHighlightLayer?.(this.LAYER);
    if (this.#label) {
      if (!this.#label.destroyed) this.#label.destroy();
      this.#label = null;
    }
  }

  /** The canvas is going away: everything drawn on it is destroyed with it. */
  static onTearDown() {
    this.#label = null;
  }

  /* ---------------------------------------- */
  /*  Helpers                                  */
  /* ---------------------------------------- */

  /** Controlled token owned by the user, otherwise the user's character token. */
  static #pickToken() {
    const controlled = canvas.tokens?.controlled?.find(t => t.document.isOwner);
    if (controlled) return controlled;
    const character = game.user.character;
    return character?.getActiveTokens?.(true)?.[0] ?? null;
  }

  static #layer() {
    const gridLayer = canvas.interface?.grid;
    if (!gridLayer) return null;
    return gridLayer.getHighlightLayer?.(this.LAYER) ?? gridLayer.addHighlightLayer(this.LAYER);
  }

  /**
   * Players should not discover the layout of rooms they have never seen:
   * cells are drawn only if currently visible or already explored.
   * @returns {((point: Point) => boolean)|null} null when no filter applies
   */
  static #visibilityFilter() {
    if (game.user.isGM) return null;
    if (!game.settings.get(MODULE_ID, "reachHideUnseen")) return null;
    const visibility = canvas.visibility;
    if (!visibility?.tokenVision) return null;
    const fog = canvas.fog;
    const tolerance = Math.max(1, (canvas.grid.size || 100) / 4);
    return (point) => {
      try {
        if (visibility.testVisibility(point, { tolerance })) return true;
        return !!fog?.isPointExplored?.(point);
      } catch {
        return true;
      }
    };
  }

  static #warnMissingSpeed(token) {
    const key = token.actor?.id ?? token.id;
    if (this.#warned.has(key)) return;
    this.#warned.add(key);
    ui.notifications.warn(game.i18n.format("REACH.NoSpeed", {
      name: token.name,
      path: game.settings.get(MODULE_ID, "reachSpeedPath") || "—"
    }));
  }
}
