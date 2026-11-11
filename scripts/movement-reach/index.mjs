import { MODULE_ID } from "../shared/constants.mjs";
import { HubMenu } from "../hub/HubMenu.mjs";
import { ReachSystem } from "./ReachSystem.mjs";
import { ReachOverlay } from "./ReachOverlay.mjs";
import { ReachCalculator } from "./ReachCalculator.mjs";

/**
 * Initialize the Movement Reach feature: with a keybinding every user colors
 * the cells the selected token can reach with one, two (or three) full
 * movements, minus the distance already walked in the turn.
 * Disabled by default: when off, no hook and no keybinding are registered.
 */
export function initMovementReach() {

  /* ---- Settings ---- */

  game.settings.register(MODULE_ID, "reachEnabled", {
    name: "REACH.Settings.Enabled.Name",
    hint: "REACH.Settings.Enabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    requiresReload: true
  });

  const refresh = () => {
    if (ReachSystem.isEnabled()) ReachOverlay.scheduleRefresh();
  };

  game.settings.register(MODULE_ID, "reachSpeedPath", {
    name: "REACH.Settings.SpeedPath.Name",
    hint: "REACH.Settings.SpeedPath.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "",
    onChange: refresh
  });

  game.settings.register(MODULE_ID, "reachSpeedUnit", {
    name: "REACH.Settings.SpeedUnit.Name",
    hint: "REACH.Settings.SpeedUnit.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      distance: "REACH.Settings.SpeedUnit.Distance",
      spaces: "REACH.Settings.SpeedUnit.Spaces"
    },
    default: "distance",
    onChange: refresh
  });

  game.settings.register(MODULE_ID, "reachSpeedFactor", {
    name: "REACH.Settings.SpeedFactor.Name",
    hint: "REACH.Settings.SpeedFactor.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 1,
    onChange: refresh
  });

  game.settings.register(MODULE_ID, "reachRings", {
    name: "REACH.Settings.Rings.Name",
    hint: "REACH.Settings.Rings.Hint",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 1, max: 3, step: 1 },
    default: 2,
    onChange: refresh
  });

  game.settings.register(MODULE_ID, "reachResetOnTime", {
    name: "REACH.Settings.ResetOnTime.Name",
    hint: "REACH.Settings.ResetOnTime.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "reachHideUnseen", {
    name: "REACH.Settings.HideUnseen.Name",
    hint: "REACH.Settings.HideUnseen.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: refresh
  });

  // Every player picks the precision that their PC can afford
  game.settings.register(MODULE_ID, "reachMode", {
    name: "REACH.Settings.Mode.Name",
    hint: "REACH.Settings.Mode.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      free: "REACH.Settings.Mode.Free",
      line: "REACH.Settings.Mode.Line",
      path: "REACH.Settings.Mode.Path"
    },
    default: "path",
    onChange: refresh
  });

  if (!ReachSystem.isEnabled()) return;

  /* ---- Keybindings (every user) ---- */

  game.keybindings.register(MODULE_ID, "reachToggle", {
    name: "REACH.Toggle",
    hint: "REACH.ToggleHint",
    editable: [{ key: "KeyR", modifiers: ["Shift"] }],
    onDown: () => {
      ReachOverlay.toggle();
      return true;
    }
  });

  game.keybindings.register(MODULE_ID, "reachReset", {
    name: "REACH.Reset",
    hint: "REACH.ResetHint",
    editable: [],
    onDown: () => {
      resetSelected();
      return true;
    }
  });

  /* ---- Hub registration ---- */

  HubMenu.registerFeature({
    id: "movement-reach",
    icon: "fas fa-person-walking-arrow-right",
    name: "REACH.FeatureName",
    description: "REACH.FeatureDescription",
    open: () => ReachOverlay.toggle()
  });

  /* ---- Hooks ---- */

  Hooks.once("ready", () => {
    ReachSystem.checkExplorationEpoch();

    const schedule = () => ReachOverlay.scheduleRefresh();

    // Walked distance outside combat (own tokens) and redraw after a move
    Hooks.on("moveToken", (tokenDoc, movement) => {
      const counted = ReachSystem.onMove(tokenDoc, movement);
      if (counted || ReachOverlay.concerns(tokenDoc)) schedule();
    });

    // Position, size or movement history of the shown token
    Hooks.on("updateToken", (tokenDoc) => {
      if (ReachOverlay.concerns(tokenDoc)) schedule();
    });
    Hooks.on("deleteToken", (tokenDoc) => {
      ReachSystem.reset(tokenDoc.id);
      if (ReachOverlay.concerns(tokenDoc)) schedule();
    });

    // Speed changed on the sheet
    Hooks.on("updateActor", (actor) => {
      if (ReachOverlay.concernsActor(actor)) schedule();
    });

    // Selection follows the controlled token
    Hooks.on("controlToken", schedule);

    // Walls and doors (opening a door changes the reachable area)
    for (const hook of ["createWall", "updateWall", "deleteWall"]) Hooks.on(hook, schedule);

    // Canvas lifecycle: highlight layers and labels die with the canvas
    Hooks.on("canvasTearDown", () => ReachOverlay.onTearDown());
    Hooks.on("canvasReady", schedule);

    // Combat: inside, the core movement history is used; a new or ended
    // combat restarts the counters kept for outside combat
    Hooks.on("combatStart", () => { ReachSystem.reset(); schedule(); });
    Hooks.on("deleteCombat", () => { ReachSystem.reset(); schedule(); });
    for (const hook of ["updateCombat", "createCombatant", "deleteCombatant"]) Hooks.on(hook, schedule);

    // The world clock moved: a new exploration turn outside combat
    Hooks.on("updateWorldTime", () => {
      if (!game.settings.get(MODULE_ID, "reachResetOnTime")) return;
      ReachSystem.reset();
      schedule();
    });

    // Exploration feature (if enabled): follow its turns
    Hooks.on("updateSetting", (setting) => {
      if (setting?.key !== `${MODULE_ID}.explorationState`) return;
      if (ReachSystem.checkExplorationEpoch()) schedule();
    });
  });

  /** Reset the walked distance of the selected tokens (or all of them). */
  function resetSelected() {
    const owned = canvas.tokens?.controlled?.filter(t => t.document.isOwner) ?? [];
    if (owned.length) for (const t of owned) ReachSystem.reset(t.id);
    else ReachSystem.reset();
    ReachOverlay.scheduleRefresh();
    ui.notifications.info(game.i18n.localize("REACH.ResetDone"));
  }

  /* ---- Public API ---- */

  game.faundryvttTools.movementReach = {
    ReachSystem,
    ReachOverlay,
    ReachCalculator,
    toggle() { ReachOverlay.toggle(); },
    reset(tokenId = null) {
      ReachSystem.reset(tokenId);
      ReachOverlay.scheduleRefresh();
    },
    budgetsOf(tokenDoc) { return ReachSystem.budgetsOf(tokenDoc); }
  };

  console.log("Faundryvtt Tools | Movement Reach feature initialized");
}
