import { MODULE_ID } from "../shared/constants.mjs";

/** World setting holding the shared state (written by GMs only). */
export const STATE_SETTING = "explorationState";

/** Movement methods that never consume quota. */
const NOT_COUNTED = new Set(["undo", "paste"]);

/** Delay used to batch several movements into one setting write (ms). */
const PERSIST_DELAY = 250;

/**
 * Exploration pace: outside combat, every player token has a quota of grid
 * cells per "turn". Once a token reaches it, its owners can no longer move it.
 * When every tracked token reached the quota (or the GM forces it) the world
 * clock advances by a fixed number of seconds and the counters reset.
 *
 * Performance notes:
 * - every client keeps an in-memory copy of the state, so the movement checks
 *   are plain object lookups (no settings reads, no canvas work);
 * - only the active GM persists the state, batching close movements into a
 *   single setting write;
 * - nothing runs on a timer: everything is driven by movement/combat events.
 *
 * State shape: { epoch, used: { tokenId: cells }, excluded: { tokenId: true } }
 * `epoch` grows at every reset, so clients can tell a reset from a normal
 * update and merge concurrent updates safely (counters only grow in an epoch).
 */
export class ExplorationSystem {

  static #state = { epoch: 0, used: {}, excluded: {} };
  static #timer = null;
  static #advancing = false;

  /**
   * Called after the in-memory state changes.
   * Receives the changed token id, or null for a structural change.
   * @type {(tokenId: string|null) => void}
   */
  static onUpdate = () => {};

  /* ---------------------------------------- */
  /*  Settings                                 */
  /* ---------------------------------------- */

  static isEnabled() {
    return game.settings.get(MODULE_ID, "explorationEnabled");
  }

  /** Cells each token may move per turn. */
  static get quota() {
    return Math.max(1, Number(game.settings.get(MODULE_ID, "explorationQuota")) || 1);
  }

  /** Seconds the world clock advances at every turn. */
  static get seconds() {
    return Math.max(0, Number(game.settings.get(MODULE_ID, "explorationSeconds")) || 0);
  }

  /* ---------------------------------------- */
  /*  State                                    */
  /* ---------------------------------------- */

  /** Load the persisted state into memory (on ready). */
  static load() {
    const saved = game.settings.get(MODULE_ID, STATE_SETTING) ?? {};
    this.#state = {
      epoch: Number(saved.epoch) || 0,
      used: { ...saved.used },
      excluded: { ...saved.excluded }
    };
  }

  /** Merge a persisted state coming from the setting onChange. */
  static onSettingChange(saved) {
    if (!saved) return;
    const epoch = Number(saved.epoch) || 0;
    const excluded = { ...saved.excluded };

    // Reset (or older client catching up): the saved state wins
    if (epoch !== this.#state.epoch) {
      this.#state = { epoch, used: { ...saved.used }, excluded };
      this.onUpdate(null);
      return;
    }

    const excludedChanged = !this.#sameKeys(excluded, this.#state.excluded);
    this.#state.excluded = excluded;

    // Same epoch: counters only grow, keep the highest value
    const changed = [];
    for (const [id, cells] of Object.entries(saved.used ?? {})) {
      if (cells > (this.#state.used[id] ?? 0)) {
        this.#state.used[id] = cells;
        changed.push(id);
      }
    }

    if (excludedChanged) this.onUpdate(null);
    else for (const id of changed) this.onUpdate(id);
  }

  static usedOf(tokenId) {
    return this.#state.used[tokenId] ?? 0;
  }

  static isExcluded(tokenId) {
    return this.#state.excluded[tokenId] === true;
  }

  static isDone(tokenId) {
    return this.usedOf(tokenId) >= this.quota;
  }

  /* ---------------------------------------- */
  /*  Scene helpers                            */
  /* ---------------------------------------- */

  /** True while a started combat involves this scene (or no scene at all). */
  static isCombatActive(scene) {
    if (!scene) return false;
    return game.combats.some(c => c.started && (!c.scene || c.scene.id === scene.id));
  }

  /** True when at least one connected non-GM user owns the token. */
  static hasOnlineOwner(tokenDoc) {
    const doc = tokenDoc.actor ?? tokenDoc;
    return game.users.some(u => u.active && !u.isGM && doc.testUserPermission(u, "OWNER"));
  }

  /** Connected non-GM users owning the token. */
  static onlineOwners(tokenDoc) {
    const doc = tokenDoc.actor ?? tokenDoc;
    return game.users.filter(u => u.active && !u.isGM && doc.testUserPermission(u, "OWNER"));
  }

  /** Player tokens on the scene whose owner is online (excluded ones included). */
  static trackedTokens(scene) {
    if (!scene) return [];
    return scene.tokens.filter(t => this.hasOnlineOwner(t));
  }

  /* ---------------------------------------- */
  /*  Movement hooks                           */
  /* ---------------------------------------- */

  /**
   * preMoveToken (players only): block tokens that already reached the quota.
   * The move that crosses the quota is allowed in full.
   */
  static onPreMove(tokenDoc) {
    if (game.user.isGM) return;
    if (!this.isDone(tokenDoc.id)) return;
    if (this.isExcluded(tokenDoc.id)) return;
    if (this.isCombatActive(tokenDoc.parent)) return;
    return false;
  }

  /** moveToken (every client): count the cells moved by players. */
  static onMove(tokenDoc, movement, _operation, user) {
    const mover = this.#resolveUser(user ?? movement?.user);
    if (!mover || mover.isGM) return;
    if (NOT_COUNTED.has(movement.method)) return;

    // Players only track their own tokens (needed for the local block check)
    const isGM = game.user.isGM;
    if (!isGM && !tokenDoc.isOwner) return;

    const scene = tokenDoc.parent;
    if (this.isCombatActive(scene)) return;

    const cells = this.#cellsOf(tokenDoc, movement);
    if (!(cells > 0)) return;

    const id = tokenDoc.id;
    this.#state.used[id] = (this.#state.used[id] ?? 0) + cells;
    this.onUpdate(id);

    if (isGM && game.users.activeGM?.isSelf) {
      this.#schedulePersist();
      this.recheck(scene);
    }
  }

  /** Cells covered by a movement step (gridless scenes: distance / grid size). */
  static #cellsOf(tokenDoc, movement) {
    const passed = movement?.passed ?? {};
    const grid = tokenDoc.parent?.grid;
    if (grid && !grid.isGridless && Number.isFinite(passed.spaces)) return passed.spaces;
    const size = grid?.distance || 1;
    return (Number(passed.distance) || 0) / size;
  }

  /* ---------------------------------------- */
  /*  Turn handling (GM)                       */
  /* ---------------------------------------- */

  /** Advance the turn automatically if every tracked token reached the quota. */
  static recheck(scene) {
    if (!game.users.activeGM?.isSelf || this.#advancing) return;
    if (!scene || this.isCombatActive(scene)) return;
    const tokens = this.trackedTokens(scene).filter(t => !this.isExcluded(t.id));
    if (!tokens.length) return;
    if (tokens.every(t => this.isDone(t.id))) this.nextTurn({ auto: true });
  }

  /**
   * Advance the world clock and reset every counter.
   * @param {object} [options]
   * @param {boolean} [options.auto=false]   Triggered by the quota (notifies the GM)
   * @param {boolean} [options.advanceTime=true]
   */
  static async nextTurn({ auto = false, advanceTime = true } = {}) {
    if (!game.user.isGM || this.#advancing) return;
    this.#advancing = true;
    try {
      // Unblock the players first, then move the clock
      this.#state = {
        epoch: this.#state.epoch + 1,
        used: {},
        excluded: this.#pruneExcluded(this.#state.excluded)
      };
      this.onUpdate(null);
      await this.#write();

      const seconds = this.seconds;
      if (advanceTime && seconds > 0) await game.time.advance(seconds);
      if (auto) ui.notifications.info(game.i18n.format("EXPLORATION.AutoAdvanced", { seconds }));
    } finally {
      this.#advancing = false;
    }
  }

  /** Reset the counters without moving the clock (e.g. after a combat). */
  static resetCounters() {
    return this.nextTurn({ advanceTime: false });
  }

  /** Exclude a token from the quota (not blocked, not waited for). */
  static async setExcluded(tokenId, excluded) {
    if (!game.user.isGM) return;
    const next = { ...this.#state.excluded };
    if (excluded) next[tokenId] = true;
    else delete next[tokenId];
    this.#state.excluded = next;
    this.onUpdate(null);
    await this.#write();
    this.recheck(canvas?.scene);
  }

  /* ---------------------------------------- */
  /*  Persistence                              */
  /* ---------------------------------------- */

  static #schedulePersist() {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#write(), PERSIST_DELAY);
  }

  static #write() {
    clearTimeout(this.#timer);
    this.#timer = null;
    const { epoch, used, excluded } = this.#state;
    return game.settings.set(MODULE_ID, STATE_SETTING, {
      epoch,
      used: { ...used },
      excluded: { ...excluded }
    });
  }

  /* ---------------------------------------- */
  /*  Utilities                                */
  /* ---------------------------------------- */

  /** Drop exclusions of tokens that no longer exist (done only at reset). */
  static #pruneExcluded(excluded) {
    const out = {};
    for (const id of Object.keys(excluded)) {
      if (game.scenes.some(s => s.tokens.has(id))) out[id] = true;
    }
    return out;
  }

  static #sameKeys(a, b) {
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    return ka.every(k => k in b);
  }

  static #resolveUser(user) {
    if (!user) return null;
    if (typeof user === "string") return game.users.get(user) ?? null;
    return user;
  }
}
