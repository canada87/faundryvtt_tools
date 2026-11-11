import { MODULE_ID } from "../shared/constants.mjs";

/** Movement methods that never count as walked distance. */
const NOT_COUNTED = new Set(["undo", "paste", "config"]);

/** Paths tried when the configured speed field is empty or invalid. */
const FALLBACK_PATHS = [
  "system.attributes.movement.walk",
  "system.attributes.speed.total",
  "system.attributes.speed.value",
  "system.movement.speed.value",
  "system.movement.speed",
  "system.movement.walk.value",
  "system.speed.value",
  "system.speed"
];

/**
 * Movement reach: speed from the actor sheet (system agnostic: the GM
 * configures the field path) and the distance already walked.
 *
 * Walked distance:
 * - token in a started combat → the core movement history (Foundry clears it
 *   when the combatant's turn starts), nothing tracked by this module;
 * - otherwise → a local counter fed by the moveToken hook. Every client keeps
 *   its own copy (no network, no settings writes). It resets when the world
 *   clock moves (optional), when a combat starts or ends, when the
 *   Exploration feature starts a new turn (if that feature is on) and on
 *   demand.
 */
export class ReachSystem {

  /** tokenId -> distance walked outside combat (scene units). */
  static #walked = new Map();

  /** Last Exploration epoch seen (null = unknown / feature missing). */
  static #explorationEpoch = null;

  /* ---------------------------------------- */
  /*  Settings                                 */
  /* ---------------------------------------- */

  static isEnabled() {
    return game.settings.get(MODULE_ID, "reachEnabled");
  }

  /** "free" | "line" | "path" (client setting, every player chooses). */
  static get mode() {
    return game.settings.get(MODULE_ID, "reachMode");
  }

  /** How many full movements to draw (rings). */
  static get rings() {
    const n = Math.round(Number(game.settings.get(MODULE_ID, "reachRings")) || 2);
    return Math.min(3, Math.max(1, n));
  }

  /* ---------------------------------------- */
  /*  Speed                                    */
  /* ---------------------------------------- */

  /**
   * Speed of the token for one full movement, in scene distance units.
   * @returns {number|null} null when the field cannot be read
   */
  static speedOf(tokenDoc) {
    const actor = tokenDoc?.actor;
    if (!actor) return null;

    const path = String(game.settings.get(MODULE_ID, "reachSpeedPath") ?? "").trim();
    let raw = path ? this.#readNumber(actor, path) : null;
    if (raw === null && !path) {
      for (const p of FALLBACK_PATHS) {
        raw = this.#readNumber(actor, p);
        if (raw !== null) break;
      }
    }
    if (raw === null) return null;

    const factor = Number(game.settings.get(MODULE_ID, "reachSpeedFactor")) || 1;
    let speed = raw * factor;
    if (game.settings.get(MODULE_ID, "reachSpeedUnit") === "spaces") {
      speed *= canvas.grid?.distance || 1;
    }
    return speed > 0 ? speed : null;
  }

  /** Read a numeric field: plain numbers, numeric strings or {value|total|max}. */
  static #readNumber(actor, path) {
    let v = foundry.utils.getProperty(actor, path);
    if (v && typeof v === "object") v = v.value ?? v.total ?? v.max ?? v.walk;
    const n = Number(v);
    return Number.isFinite(n) && v !== "" && v !== null ? n : null;
  }

  /* ---------------------------------------- */
  /*  Walked distance                          */
  /* ---------------------------------------- */

  /** True when the token takes part in a started combat. */
  static inCombat(tokenDoc) {
    const combatant = tokenDoc?.combatant;
    return !!combatant?.combat?.started;
  }

  /** Distance already walked in the current turn (scene units). */
  static walkedOf(tokenDoc) {
    if (!tokenDoc) return 0;
    if (this.inCombat(tokenDoc)) return this.#historyDistance(tokenDoc);
    return this.#walked.get(tokenDoc.id) ?? 0;
  }

  /** Measure the core movement history (combat). */
  static #historyDistance(tokenDoc) {
    const history = tokenDoc.movementHistory;
    if (!history?.length) return 0;
    try {
      const measured = tokenDoc.measureMovementPath(history);
      if (Number.isFinite(measured?.distance)) return measured.distance;
    } catch { /* fall back to plain grid measurement */ }
    try {
      const measured = canvas.grid.measurePath(history.map(w => ({ x: w.x, y: w.y })));
      return Number(measured?.distance) || 0;
    } catch {
      return 0;
    }
  }

  /** moveToken hook (every client, own tokens only): count outside combat. */
  static onMove(tokenDoc, movement) {
    if (!tokenDoc?.isOwner) return false;
    if (NOT_COUNTED.has(movement?.method)) return false;
    if (this.inCombat(tokenDoc)) return false;
    const distance = Number(movement?.passed?.distance) || 0;
    if (!(distance > 0)) return false;
    this.#walked.set(tokenDoc.id, (this.#walked.get(tokenDoc.id) ?? 0) + distance);
    return true;
  }

  /** Forget the walked distance (one token or all of them). */
  static reset(tokenId = null) {
    if (tokenId) this.#walked.delete(tokenId);
    else this.#walked.clear();
  }

  /**
   * Called on every world setting update: a new Exploration epoch means a
   * new exploration turn, so the counters restart with it.
   * Reads the setting only if the Exploration feature registered it.
   * @returns {boolean} true when the counters were reset
   */
  static checkExplorationEpoch() {
    const key = `${MODULE_ID}.explorationState`;
    if (!game.settings.settings.has(key)) return false;
    if (!game.settings.get(MODULE_ID, "explorationEnabled")) return false;
    const epoch = Number(game.settings.get(MODULE_ID, "explorationState")?.epoch) || 0;
    const changed = this.#explorationEpoch !== null && epoch !== this.#explorationEpoch;
    this.#explorationEpoch = epoch;
    if (changed) this.reset();
    return changed;
  }

  /* ---------------------------------------- */
  /*  Budgets                                  */
  /* ---------------------------------------- */

  /**
   * Remaining distance for each ring: ring k = k full movements minus what
   * was already walked. Rings already used up are null.
   * @returns {{speed:number, walked:number, budgets:(number|null)[]}|null}
   */
  static budgetsOf(tokenDoc) {
    const speed = this.speedOf(tokenDoc);
    if (speed === null) return null;
    const walked = this.walkedOf(tokenDoc);
    const budgets = [];
    for (let k = 1; k <= this.rings; k++) {
      const left = k * speed - walked;
      budgets.push(left > 1e-6 ? left : null);
    }
    return { speed, walked, budgets };
  }
}
