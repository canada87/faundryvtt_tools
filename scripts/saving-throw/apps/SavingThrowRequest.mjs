import { MODULE_ID } from "../../shared/constants.mjs";
import { SavingThrowSystem } from "../SavingThrowSystem.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM application for requesting saving throws from players.
 * Handles both the setup form and the active session view.
 */
export class SavingThrowRequest extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "saving-throw-request",
    classes: ["faundryvtt-tools", "saving-throw-request"],
    window: {
      title: "SAVING_THROW.RequestTitle",
      icon: "fas fa-shield-alt",
      resizable: true
    },
    position: {
      width: 450,
      height: "auto"
    },
    actions: {
      requestRoll: SavingThrowRequest.#onRequestRoll,
      cancelSession: SavingThrowRequest.#onCancelSession,
      newRequest: SavingThrowRequest.#onNewRequest,
      selectAll: SavingThrowRequest.#onSelectAll,
      selectNone: SavingThrowRequest.#onSelectNone
    }
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/saving-throw/saving-throw-request.hbs`
    }
  };

  #hookId = null;

  /* ---------------------------------------- */
  /*  Context                                  */
  /* ---------------------------------------- */

  async _prepareContext(options) {
    const session = SavingThrowSystem.session;
    const players = SavingThrowSystem.getPlayerCharacters();

    // Build enriched session data for the template
    let sessionData = null;
    if (session) {
      const rolledCount = session.players.filter(p => p.result !== null).length;
      const successCount = session.players.filter(p => p.success).length;
      sessionData = {
        ...session,
        modeLabel: game.i18n.localize(`SAVING_THROW.Mode.${session.mode}`),
        rolledCount,
        successCount,
        totalCount: session.players.length,
        allRolled: rolledCount === session.players.length,
        isGroupMode: session.mode !== "individual"
      };
    }

    return {
      session: sessionData,
      players,
      hasPlayers: players.length > 0,
      modes: [
        { value: "individual", label: game.i18n.localize("SAVING_THROW.Mode.individual") },
        { value: "groupAny", label: game.i18n.localize("SAVING_THROW.Mode.groupAny") },
        { value: "groupMajority", label: game.i18n.localize("SAVING_THROW.Mode.groupMajority") },
        { value: "groupAll", label: game.i18n.localize("SAVING_THROW.Mode.groupAll") },
        { value: "groupCustom", label: game.i18n.localize("SAVING_THROW.Mode.groupCustom") }
      ]
    };
  }

  /* ---------------------------------------- */
  /*  Lifecycle                                */
  /* ---------------------------------------- */

  _onRender(context, options) {
    super._onRender(context, options);

    // Listen for session updates (re-render when rolls come in)
    if (!this.#hookId) {
      this.#hookId = Hooks.on("savingThrowUpdate", () => {
        this.render();
      });
    }

    // Toggle custom threshold input visibility based on mode selection
    const modeSelect = this.element.querySelector('[name="mode"]');
    const thresholdGroup = this.element.querySelector('.st-custom-threshold');
    if (modeSelect && thresholdGroup) {
      const updateVisibility = () => {
        thresholdGroup.style.display = modeSelect.value === "groupCustom" ? "" : "none";
      };
      modeSelect.addEventListener("change", updateVisibility);
      updateVisibility();
    }
  }

  _onClose(options) {
    if (this.#hookId) {
      Hooks.off("savingThrowUpdate", this.#hookId);
      this.#hookId = null;
    }
    super._onClose(options);
  }

  /* ---------------------------------------- */
  /*  Actions                                  */
  /* ---------------------------------------- */

  static #onRequestRoll(event, target) {
    const form = this.element;
    const dc = parseInt(form.querySelector('[name="dc"]').value) || 10;
    const dcVisible = form.querySelector('[name="dcVisible"]').checked;
    const mode = form.querySelector('[name="mode"]').value;
    const requiredSuccesses = parseInt(form.querySelector('[name="requiredSuccesses"]')?.value) || 1;

    const allPlayers = SavingThrowSystem.getPlayerCharacters();
    const selectedPlayers = [];
    form.querySelectorAll('[name="player"]:checked').forEach(cb => {
      const playerData = allPlayers.find(p => p.userId === cb.value);
      if (playerData) selectedPlayers.push(playerData);
    });

    if (selectedPlayers.length === 0) {
      ui.notifications.warn(game.i18n.localize("SAVING_THROW.Warn.NoPlayersSelected"));
      return;
    }

    SavingThrowSystem.startSession({ players: selectedPlayers, dc, dcVisible, mode, requiredSuccesses });
  }

  static #onCancelSession(event, target) {
    SavingThrowSystem.cancelSession();
  }

  static #onNewRequest(event, target) {
    SavingThrowSystem.cancelSession();
  }

  static #onSelectAll(event, target) {
    this.element.querySelectorAll('[name="player"]').forEach(cb => cb.checked = true);
  }

  static #onSelectNone(event, target) {
    this.element.querySelectorAll('[name="player"]').forEach(cb => cb.checked = false);
  }
}
