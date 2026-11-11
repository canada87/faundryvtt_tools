import { MODULE_ID } from "../../shared/constants.mjs";
import { ExplorationSystem } from "../ExplorationSystem.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const APP_ID = "faundryvtt-exploration-tracker";

/** Round fractional cells (gridless scenes) to one decimal. */
const fmt = (n) => Math.round(n * 10) / 10;

/**
 * GM panel: player tokens on the viewed scene with the quota they used,
 * plus the button that advances the turn.
 * Movement updates patch the single row; full renders are debounced.
 */
export class ExplorationTracker extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: APP_ID,
    classes: ["faundryvtt-tools", "exploration-tracker"],
    window: {
      icon: "fas fa-shoe-prints",
      title: "EXPLORATION.Title",
      resizable: true
    },
    position: {
      width: 360,
      height: "auto"
    },
    actions: {
      nextTurn: ExplorationTracker.#onNextTurn,
      toggleExcluded: ExplorationTracker.#onToggleExcluded,
      panToToken: ExplorationTracker.#onPanToToken
    }
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/exploration/exploration-tracker.hbs`
    }
  };

  /* ---------------------------------------- */
  /*  Singleton helpers                        */
  /* ---------------------------------------- */

  static get instance() {
    return foundry.applications.instances.get(APP_ID) ?? null;
  }

  static open() {
    const app = this.instance ?? new ExplorationTracker();
    app.render({ force: true });
    return app;
  }

  static toggle() {
    const app = this.instance;
    if (app?.rendered) app.close();
    else this.open();
  }

  /** Debounced full render, only while the panel is open. */
  static refresh = foundry.utils.debounce(() => {
    const app = ExplorationTracker.instance;
    if (app?.rendered) app.render();
  }, 100);

  /**
   * Update a single token row in place (movement). Falls back to a full
   * render for structural changes or rows not on screen.
   * @param {string|null} tokenId
   */
  static update(tokenId) {
    const app = this.instance;
    if (!app?.rendered) return;
    const row = tokenId && app.element.querySelector(`.exploration-row[data-token-id="${tokenId}"]`);
    if (!row) return this.refresh();

    const quota = ExplorationSystem.quota;
    const used = ExplorationSystem.usedOf(tokenId);
    const pct = Math.min(100, Math.round((used / quota) * 100));
    row.querySelector(".exploration-bar-fill").style.width = `${pct}%`;
    row.querySelector(".exploration-count").textContent = `${fmt(used)}/${quota}`;
    row.querySelector(".exploration-pct").textContent = `${pct}%`;
    row.classList.toggle("is-done", used >= quota);
    app.#updateSummary();
  }

  /* ---------------------------------------- */
  /*  Context                                  */
  /* ---------------------------------------- */

  async _prepareContext() {
    const scene = canvas?.scene ?? null;
    const quota = ExplorationSystem.quota;
    const seconds = ExplorationSystem.seconds;
    const paused = ExplorationSystem.isCombatActive(scene);

    const tokens = ExplorationSystem.trackedTokens(scene).map(t => {
      const used = ExplorationSystem.usedOf(t.id);
      const owners = ExplorationSystem.onlineOwners(t);
      return {
        id: t.id,
        name: t.name,
        img: t.texture?.src,
        owners: owners.map(u => u.name).join(", "),
        color: owners[0]?.color?.css ?? owners[0]?.color ?? "",
        used: fmt(used),
        pct: Math.min(100, Math.round((used / quota) * 100)),
        done: used >= quota,
        excluded: ExplorationSystem.isExcluded(t.id)
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    const counted = tokens.filter(t => !t.excluded);
    return {
      scene,
      paused,
      quota,
      seconds,
      tokens,
      ready: counted.filter(t => t.done).length,
      total: counted.length
    };
  }

  _onRender(context, options) {
    const root = this.element;
    root.querySelectorAll("input[data-setting]").forEach(input => {
      input.addEventListener("change", async (ev) => {
        const key = ev.currentTarget.dataset.setting;
        const min = key === "explorationQuota" ? 1 : 0;
        const value = Math.max(min, Number(ev.currentTarget.value) || min);
        await game.settings.set(MODULE_ID, key, value);
      });
    });
  }

  /** Refresh the "ready x/y" counter without re-rendering. */
  #updateSummary() {
    const summary = this.element.querySelector(".exploration-summary-count");
    if (!summary) return;
    const rows = [...this.element.querySelectorAll(".exploration-row:not(.is-excluded)")];
    summary.textContent = `${rows.filter(r => r.classList.contains("is-done")).length}/${rows.length}`;
  }

  /* ---------------------------------------- */
  /*  Actions                                  */
  /* ---------------------------------------- */

  static async #onNextTurn() {
    await ExplorationSystem.nextTurn();
  }

  static async #onToggleExcluded(event, target) {
    const id = target.closest("[data-token-id]")?.dataset.tokenId;
    if (!id) return;
    await ExplorationSystem.setExcluded(id, !ExplorationSystem.isExcluded(id));
  }

  static #onPanToToken(event, target) {
    const id = target.closest("[data-token-id]")?.dataset.tokenId;
    const token = id && canvas?.tokens?.get(id);
    if (token) canvas.animatePan({ x: token.center.x, y: token.center.y });
  }
}
