import { MODULE_ID } from "../shared/constants.mjs";

/**
 * Core system for requesting saving throws from players.
 * The GM creates a session, players roll however they want (any die, from sheet or chat),
 * and the system captures the first roll from each targeted player.
 */
export class SavingThrowSystem {

  static #session = null;
  static #hookId = null;

  /* ---------------------------------------- */
  /*  Socket                                   */
  /* ---------------------------------------- */

  static setupSocket() {
    game.socket.on(`module.${MODULE_ID}`, (data) => {
      if (data.type === "savingThrowRequest") {
        SavingThrowSystem.#onReceiveRequest(data);
      }
      if (data.type === "savingThrowRollAck") {
        SavingThrowSystem.#onRollAck(data);
      }
      if (data.type === "savingThrowResults") {
        SavingThrowSystem.#onReceiveResults(data);
      }
    });
  }

  /* ---------------------------------------- */
  /*  GM: Start session                        */
  /* ---------------------------------------- */

  static startSession({ players, dc, dcVisible, mode, requiredSuccesses }) {
    if (!game.user.isGM) return;
    if (SavingThrowSystem.#session && !SavingThrowSystem.#session.resolved) {
      ui.notifications.warn(game.i18n.localize("SAVING_THROW.Warn.SessionActive"));
      return;
    }

    const sessionId = foundry.utils.randomID();

    SavingThrowSystem.#session = {
      id: sessionId,
      dc,
      dcVisible,
      mode,
      requiredSuccesses: mode === "groupCustom" ? (requiredSuccesses || 1) : null,
      players: players.map(p => ({
        userId: p.userId,
        characterName: p.characterName,
        characterImg: p.characterImg,
        result: null,
        success: null
      })),
      resolved: false,
      groupSuccess: null
    };

    // Register hook to intercept rolls
    SavingThrowSystem.#hookId = Hooks.on("createChatMessage",
      SavingThrowSystem.#onChatMessage.bind(SavingThrowSystem)
    );

    // Notify targeted players via socket
    const targetUserIds = players.map(p => p.userId);
    game.socket.emit(`module.${MODULE_ID}`, {
      type: "savingThrowRequest",
      sessionId,
      dc: dcVisible ? dc : null,
      dcVisible,
      targetUserIds
    });

    // Post request chat message (whisper to targeted players + GM)
    const dcText = dcVisible
      ? `<p><strong>${game.i18n.localize("SAVING_THROW.DC")}:</strong> ${dc}</p>`
      : "";

    const whisperIds = [...targetUserIds];
    if (!whisperIds.includes(game.user.id)) whisperIds.push(game.user.id);

    ChatMessage.create({
      content: `<div class="saving-throw-chat request">
        <h3><i class="fas fa-shield-alt"></i> ${game.i18n.localize("SAVING_THROW.RequestTitle")}</h3>
        ${dcText}
        <p>${game.i18n.localize("SAVING_THROW.Chat.RollNow")}</p>
      </div>`,
      whisper: whisperIds,
      speaker: { alias: game.i18n.localize("SAVING_THROW.FeatureName") }
    });

    Hooks.call("savingThrowUpdate");
  }

  /* ---------------------------------------- */
  /*  Chat message hook (GM side)              */
  /* ---------------------------------------- */

  static #onChatMessage(message) {
    if (!game.user.isGM) return;
    if (!SavingThrowSystem.#session) return;
    if (SavingThrowSystem.#session.resolved) return;

    const rolls = message.rolls;
    if (!rolls?.length) return;

    const authorId = message.author?.id;
    if (!authorId) return;

    // Find the player in our session who hasn't rolled yet
    const player = SavingThrowSystem.#session.players.find(
      p => p.userId === authorId && p.result === null
    );
    if (!player) return;

    // Capture the total from the first roll
    player.result = rolls[0].total;
    player.success = player.result >= SavingThrowSystem.#session.dc;

    // Acknowledge to the player via socket
    game.socket.emit(`module.${MODULE_ID}`, {
      type: "savingThrowRollAck",
      userId: authorId,
      result: player.result,
      success: player.success,
      dcVisible: SavingThrowSystem.#session.dcVisible
    });

    Hooks.call("savingThrowUpdate");

    // Check if all players have rolled
    if (SavingThrowSystem.#session.players.every(p => p.result !== null)) {
      SavingThrowSystem.#resolveSession();
    }
  }

  /* ---------------------------------------- */
  /*  Resolve                                  */
  /* ---------------------------------------- */

  static #resolveSession() {
    const session = SavingThrowSystem.#session;
    if (!session) return;

    session.resolved = true;
    const successes = session.players.filter(p => p.success).length;
    const total = session.players.length;

    switch (session.mode) {
      case "individual":
        session.groupSuccess = null;
        break;
      case "groupAny":
        session.groupSuccess = successes >= 1;
        break;
      case "groupMajority":
        session.groupSuccess = successes >= Math.ceil(total / 2);
        break;
      case "groupAll":
        session.groupSuccess = successes === total;
        break;
      case "groupCustom":
        session.groupSuccess = successes >= (session.requiredSuccesses || 1);
        break;
    }

    // Remove the hook
    if (SavingThrowSystem.#hookId !== null) {
      Hooks.off("createChatMessage", SavingThrowSystem.#hookId);
      SavingThrowSystem.#hookId = null;
    }

    // Post results to chat
    SavingThrowSystem.#postResults();

    Hooks.call("savingThrowUpdate");
  }

  /* ---------------------------------------- */
  /*  Post results                             */
  /* ---------------------------------------- */

  static #postResults() {
    const session = SavingThrowSystem.#session;
    if (!session) return;

    let html = `<div class="saving-throw-chat results">
      <h3><i class="fas fa-shield-alt"></i> ${game.i18n.localize("SAVING_THROW.ResultsTitle")} — ${game.i18n.localize("SAVING_THROW.DC")} ${session.dc}</h3>
      <ul class="st-results-list">`;

    for (const p of session.players) {
      const icon = p.success ? "fa-check" : "fa-times";
      const cls = p.success ? "success" : "failure";
      const label = p.success
        ? game.i18n.localize("SAVING_THROW.Success")
        : game.i18n.localize("SAVING_THROW.Failure");
      html += `<li class="st-result-entry ${cls}">
        <i class="fas ${icon}"></i>
        <strong>${p.characterName}</strong>: ${p.result} — ${label}
      </li>`;
    }

    html += `</ul>`;

    // Group result (if not individual mode)
    if (session.mode !== "individual" && session.groupSuccess !== null) {
      const successes = session.players.filter(p => p.success).length;
      const total = session.players.length;
      const modeLabel = game.i18n.localize(`SAVING_THROW.Mode.${session.mode}`);
      const groupLabel = session.groupSuccess
        ? game.i18n.localize("SAVING_THROW.GroupSuccess")
        : game.i18n.localize("SAVING_THROW.GroupFailure");
      let countText = `${successes}/${total}`;
      if (session.mode === "groupCustom" && session.requiredSuccesses) {
        countText += ` — ${game.i18n.format("SAVING_THROW.RequiredCount", { count: session.requiredSuccesses })}`;
      }
      html += `<div class="st-group-result ${session.groupSuccess ? "success" : "failure"}">
        <strong>${modeLabel}:</strong> ${groupLabel} (${countText})
      </div>`;
    }

    html += `</div>`;

    // Whisper to involved players + GM
    const whisperIds = session.players.map(p => p.userId);
    if (!whisperIds.includes(game.user.id)) whisperIds.push(game.user.id);

    ChatMessage.create({
      content: html,
      whisper: whisperIds,
      speaker: { alias: game.i18n.localize("SAVING_THROW.FeatureName") }
    });

    // Send results popup to players via socket
    game.socket.emit(`module.${MODULE_ID}`, {
      type: "savingThrowResults",
      dc: session.dc,
      mode: session.mode,
      requiredSuccesses: session.requiredSuccesses,
      groupSuccess: session.groupSuccess,
      players: session.players.map(p => ({
        characterName: p.characterName,
        result: p.result,
        success: p.success
      })),
      targetUserIds: session.players.map(p => p.userId)
    });
  }

  /* ---------------------------------------- */
  /*  Cancel                                   */
  /* ---------------------------------------- */

  static cancelSession() {
    if (!game.user.isGM) return;
    if (SavingThrowSystem.#hookId !== null) {
      Hooks.off("createChatMessage", SavingThrowSystem.#hookId);
      SavingThrowSystem.#hookId = null;
    }
    SavingThrowSystem.#session = null;
    Hooks.call("savingThrowUpdate");
  }

  /* ---------------------------------------- */
  /*  Player side — socket handlers            */
  /* ---------------------------------------- */

  static #onReceiveRequest(data) {
    if (!data.targetUserIds?.includes(game.user.id)) return;
    if (game.user.isGM) return;

    const dcText = data.dcVisible && data.dc
      ? `<p><strong>${game.i18n.localize("SAVING_THROW.DC")}:</strong> ${data.dc}</p>`
      : "";

    new Dialog({
      title: game.i18n.localize("SAVING_THROW.RequestTitle"),
      content: `<div class="saving-throw-dialog">
        <p><i class="fas fa-shield-alt fa-2x"></i></p>
        <h3>${game.i18n.localize("SAVING_THROW.RequestTitle")}</h3>
        ${dcText}
        <p>${game.i18n.localize("SAVING_THROW.Chat.RollNow")}</p>
      </div>`,
      buttons: {
        ok: {
          icon: '<i class="fas fa-dice-d20"></i>',
          label: game.i18n.localize("SAVING_THROW.Understood"),
          callback: () => {}
        }
      },
      default: "ok"
    }).render(true);
  }

  static #onRollAck(data) {
    if (data.userId !== game.user.id) return;
    ui.notifications.info(
      game.i18n.format("SAVING_THROW.Info.RollRecorded", { result: data.result })
    );
  }

  static #onReceiveResults(data) {
    if (!data.targetUserIds?.includes(game.user.id)) return;
    if (game.user.isGM) return;

    SavingThrowSystem.#showResultsPopup(data);
  }

  /**
   * Build and display the results popup (same layout as the GM app).
   */
  static #showResultsPopup(data) {
    let playersHtml = "";
    for (const p of data.players) {
      const icon = p.success ? "fa-check" : "fa-times";
      const cls = p.success ? "success" : "failure";
      playersHtml += `<div class="st-player-row rolled ${cls}">
        <span class="st-player-name">${p.characterName}</span>
        <span class="st-roll-result">${p.result}</span>
        <i class="fas ${icon} st-icon ${cls}"></i>
      </div>`;
    }

    let groupHtml = "";
    if (data.mode !== "individual" && data.groupSuccess !== null) {
      const successes = data.players.filter(p => p.success).length;
      const total = data.players.length;
      const modeLabel = game.i18n.localize(`SAVING_THROW.Mode.${data.mode}`);
      const groupLabel = data.groupSuccess
        ? game.i18n.localize("SAVING_THROW.GroupSuccess")
        : game.i18n.localize("SAVING_THROW.GroupFailure");
      const cls = data.groupSuccess ? "success" : "failure";
      const icon = data.groupSuccess ? "fa-check-circle" : "fa-times-circle";
      let countText = `${successes}/${total}`;
      if (data.mode === "groupCustom" && data.requiredSuccesses) {
        countText += ` — ${game.i18n.format("SAVING_THROW.RequiredCount", { count: data.requiredSuccesses })}`;
      }
      groupHtml = `<div class="st-group-result ${cls}">
        <i class="fas ${icon}"></i> ${modeLabel}: ${groupLabel} (${countText})
      </div>`;
    }

    new Dialog({
      title: game.i18n.localize("SAVING_THROW.ResultsTitle"),
      content: `<div class="saving-throw-results-popup">
        <h3><i class="fas fa-shield-alt"></i> ${game.i18n.localize("SAVING_THROW.ResultsTitle")} — ${game.i18n.localize("SAVING_THROW.DC")} ${data.dc}</h3>
        <div class="st-player-list">${playersHtml}</div>
        ${groupHtml}
      </div>`,
      buttons: {
        ok: {
          icon: '<i class="fas fa-check"></i>',
          label: "OK",
          callback: () => {}
        }
      },
      default: "ok"
    }, { width: 400 }).render(true);
  }

  /* ---------------------------------------- */
  /*  Getters                                  */
  /* ---------------------------------------- */

  static get session() {
    return SavingThrowSystem.#session;
  }

  static get hasActiveSession() {
    return SavingThrowSystem.#session !== null && !SavingThrowSystem.#session.resolved;
  }

  /**
   * Get list of active player characters for selection.
   * @returns {Array<{userId: string, playerName: string, characterName: string, characterImg: string}>}
   */
  static getPlayerCharacters() {
    const pcs = [];
    for (const user of game.users) {
      if (user.isGM || !user.active) continue;
      const char = user.character;
      if (!char) continue;
      pcs.push({
        userId: user.id,
        playerName: user.name,
        characterName: char.name,
        characterImg: char.img || char.prototypeToken?.texture?.src || "icons/svg/mystery-man.svg"
      });
    }
    return pcs;
  }
}
