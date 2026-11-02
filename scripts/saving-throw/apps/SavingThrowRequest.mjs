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
      selectNone: SavingThrowRequest.#onSelectNone,
      setResult: SavingThrowRequest.#onSetResult,
      toggleExclude: SavingThrowRequest.#onToggleExclude,
      resolveNow: SavingThrowRequest.#onResolveNow
    }
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/saving-throw/saving-throw-request.hbs`
    }
  };

  static MODES = [
    { value: "individual", icon: "fa-user" },
    { value: "groupAny", icon: "fa-user-check" },
    { value: "groupMajority", icon: "fa-users" },
    { value: "groupAll", icon: "fa-people-group" },
    { value: "groupCustom", icon: "fa-sliders" }
  ];

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
      const participants = session.players.filter(p => !p.excluded);
      const total = participants.length;
      const rolledCount = participants.filter(p => p.result !== null).length;
      const successCount = participants.filter(p => p.success).length;
      const required = SavingThrowSystem.requiredSuccessesFor(session.mode, total, session.requiredSuccesses);

      // Group outcome already decided before everyone has rolled?
      let outlook = null;
      if (required !== null && !session.resolved && total > 0) {
        if (successCount >= required) outlook = "reached";
        else if (successCount + (total - rolledCount) < required) outlook = "unreachable";
      }

      const percent = n => (total ? Math.min(100, Math.round((n / total) * 100)) : 0);

      sessionData = {
        ...session,
        players: session.players.map(p => ({
          ...p,
          // hasResult instead of {{#if result}}: a total of 0 is a valid roll
          hasResult: p.result !== null,
          state: p.excluded ? "excluded" : p.result === null ? "pending" : p.success ? "success" : "failure"
        })),
        modeLabel: game.i18n.localize(`SAVING_THROW.Mode.${session.mode}`),
        rolledCount,
        successCount,
        totalCount: total,
        allRolled: rolledCount === total,
        canResolve: rolledCount > 0,
        isGroupMode: required !== null,
        required,
        successPercent: percent(successCount),
        thresholdPercent: percent(required ?? 0),
        outlook
      };
    }

    return {
      session: sessionData,
      players,
      hasPlayers: players.length > 0,
      modes: SavingThrowRequest.MODES.map(({ value, icon }) => ({
        value,
        icon,
        label: game.i18n.localize(`SAVING_THROW.ModeShort.${value}`),
        tooltip: game.i18n.localize(`SAVING_THROW.Mode.${value}`)
      }))
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
    const modeRadios = this.element.querySelectorAll('[name="mode"]');
    const thresholdGroup = this.element.querySelector('.st-custom-threshold');
    if (modeRadios.length && thresholdGroup) {
      const updateVisibility = () => {
        const mode = this.element.querySelector('[name="mode"]:checked')?.value;
        thresholdGroup.hidden = mode !== "groupCustom";
      };
      modeRadios.forEach(radio => radio.addEventListener("change", updateVisibility));
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
    const mode = form.querySelector('[name="mode"]:checked')?.value ?? "individual";
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

  static async #onSetResult(event, target) {
    const userId = target.dataset.userId;
    const player = SavingThrowSystem.session?.players.find(p => p.userId === userId);
    if (!player) return;

    const label = game.i18n.format("SAVING_THROW.ManualLabel", {
      name: Handlebars.escapeExpression(player.characterName)
    });
    const value = await foundry.applications.api.DialogV2.prompt({
      window: { title: "SAVING_THROW.ManualTitle", icon: "fas fa-pen" },
      content: `<div class="form-group">
        <label for="st-manual-result">${label}</label>
        <input id="st-manual-result" type="number" name="result" value="${player.result ?? ""}" autofocus />
      </div>`,
      ok: { callback: (event, button) => button.form.elements.result.valueAsNumber },
      rejectClose: false
    });

    if (Number.isFinite(value)) SavingThrowSystem.setManualResult(userId, value);
  }

  static #onToggleExclude(event, target) {
    SavingThrowSystem.toggleExcluded(target.dataset.userId);
  }

  static #onResolveNow(event, target) {
    SavingThrowSystem.resolveNow();
  }
}
