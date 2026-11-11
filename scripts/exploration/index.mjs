import { MODULE_ID } from "../shared/constants.mjs";
import { HubMenu } from "../hub/HubMenu.mjs";
import { ExplorationSystem, STATE_SETTING } from "./ExplorationSystem.mjs";
import { ExplorationTracker } from "./apps/ExplorationTracker.mjs";

/**
 * Initialize the Exploration feature: outside combat each player token may
 * move a fixed number of cells per turn; when every token used its quota the
 * world clock advances and the counters reset.
 * Disabled by default: when off, no hook is registered at all.
 */
export function initExploration() {

  /* ---- Settings ---- */

  game.settings.register(MODULE_ID, "explorationEnabled", {
    name: "EXPLORATION.Settings.Enabled.Name",
    hint: "EXPLORATION.Settings.Enabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    requiresReload: true
  });

  const onPaceChange = () => {
    if (!ExplorationSystem.isEnabled()) return;
    ExplorationTracker.refresh();
    if (game.user.isGM) ExplorationSystem.recheck(canvas?.scene);
  };

  game.settings.register(MODULE_ID, "explorationQuota", {
    name: "EXPLORATION.Settings.Quota.Name",
    hint: "EXPLORATION.Settings.Quota.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 6,
    onChange: onPaceChange
  });

  game.settings.register(MODULE_ID, "explorationSeconds", {
    name: "EXPLORATION.Settings.Seconds.Name",
    hint: "EXPLORATION.Settings.Seconds.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 60,
    onChange: onPaceChange
  });

  game.settings.register(MODULE_ID, STATE_SETTING, {
    name: "Exploration State",
    scope: "world",
    config: false,
    type: Object,
    default: { epoch: 0, used: {}, excluded: {} },
    onChange: (value) => {
      if (ExplorationSystem.isEnabled()) ExplorationSystem.onSettingChange(value);
    }
  });

  if (!ExplorationSystem.isEnabled()) return;

  /* ---- Keybinding (GM only) ---- */

  game.keybindings.register(MODULE_ID, "explorationToggle", {
    name: "EXPLORATION.Toggle",
    editable: [{ key: "KeyV", modifiers: ["Shift"] }],
    restricted: true,
    onDown: () => {
      ExplorationTracker.toggle();
      return true;
    }
  });

  /* ---- Hub registration ---- */

  HubMenu.registerFeature({
    id: "exploration",
    icon: "fas fa-shoe-prints",
    name: "EXPLORATION.FeatureName",
    description: "EXPLORATION.FeatureDescription",
    open: () => ExplorationTracker.toggle()
  });

  /* ---- Hooks ---- */

  Hooks.once("ready", () => {
    ExplorationSystem.load();

    // Every client counts its relevant movements (players: own tokens only)
    Hooks.on("moveToken", (...args) => ExplorationSystem.onMove(...args));

    if (!game.user.isGM) {
      // Players: block tokens that reached the quota
      Hooks.on("preMoveToken", (tokenDoc) => ExplorationSystem.onPreMove(tokenDoc));
      return;
    }

    /* ---- GM only: panel refresh and automatic turn ---- */

    ExplorationSystem.onUpdate = (tokenId) => ExplorationTracker.update(tokenId);

    const refresh = () => ExplorationTracker.refresh();
    for (const hook of ["canvasReady", "createToken", "deleteToken", "createCombat", "combatStart"]) {
      Hooks.on(hook, refresh);
    }
    Hooks.on("updateToken", (tokenDoc, changes) => {
      if ("name" in changes || "texture" in changes || "actorId" in changes) refresh();
    });
    Hooks.on("updateCombat", (combat, changes) => {
      if ("round" in changes || "scene" in changes) refresh();
    });

    // A player leaving may complete the group; one joining adds a row
    Hooks.on("userConnected", () => {
      refresh();
      ExplorationSystem.recheck(canvas?.scene);
    });

    // After a combat everybody starts the exploration turn from zero
    Hooks.on("deleteCombat", (combat) => {
      refresh();
      if (combat.started && game.users.activeGM?.isSelf) ExplorationSystem.resetCounters();
    });
  });

  /* ---- Public API ---- */

  game.faundryvttTools.exploration = {
    ExplorationSystem,
    ExplorationTracker,
    open() { ExplorationTracker.open(); },
    toggle() { ExplorationTracker.toggle(); },
    nextTurn() { return ExplorationSystem.nextTurn(); }
  };

  console.log("Faundryvtt Tools | Exploration feature initialized");
}
