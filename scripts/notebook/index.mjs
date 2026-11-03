import { MODULE_ID } from "../shared/constants.mjs";
import { HubMenu } from "../hub/HubMenu.mjs";
import { NotebookSystem } from "./NotebookSystem.mjs";
import { TokenHudNotebook } from "./TokenHudNotebook.mjs";
import { NotebookApp } from "./apps/NotebookApp.mjs";

/** Re-render the notebook and tell players what the GM just revealed. */
function onSharedDataChange() {
  NotebookSystem.notifyChanges();
  NotebookApp.refresh();
}

/**
 * Initialize the Notebook feature: a notebook players open whenever they
 * want (post-its, links, handouts from the GM, a bestiary revealed piece by
 * piece). The GM can read every player's notebook.
 * Called once during module init.
 */
export function initNotebook() {

  /* ---- Settings ---- */

  game.settings.register(MODULE_ID, "notebookEnabled", {
    name: "NOTEBOOK.Settings.Enabled.Name",
    hint: "NOTEBOOK.Settings.Enabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  game.settings.register(MODULE_ID, "notebookHandouts", {
    name: "Notebook Handouts",
    scope: "world",
    config: false,
    type: Array,
    default: [],
    onChange: onSharedDataChange
  });

  game.settings.register(MODULE_ID, "notebookBestiary", {
    name: "Notebook Bestiary",
    scope: "world",
    config: false,
    type: Array,
    default: [],
    onChange: onSharedDataChange
  });

  // Field labels new creatures start with (empty = localized defaults)
  game.settings.register(MODULE_ID, "notebookBestiaryTemplate", {
    name: "Notebook Bestiary Template",
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  if (!game.settings.get(MODULE_ID, "notebookEnabled")) return;

  /* ---- Keybinding (everyone) ---- */

  game.keybindings.register(MODULE_ID, "notebookToggle", {
    name: "NOTEBOOK.Toggle",
    editable: [{ key: "KeyB", modifiers: ["Shift"] }],
    onDown: () => {
      NotebookApp.toggle();
      return true;
    }
  });

  /* ---- Hub registration (GM) ---- */

  HubMenu.registerFeature({
    id: "notebook",
    icon: "fas fa-book",
    name: "NOTEBOOK.FeatureName",
    description: "NOTEBOOK.FeatureDescription",
    open: () => NotebookApp.open()
  });

  /* ---- Token controls button (players: the hub group is GM only) ---- */

  Hooks.on("getSceneControlButtons", (controls) => {
    if (game.user.isGM) return;
    const tool = {
      name: "fvtt-notebook",
      title: "NOTEBOOK.Title",
      icon: "fas fa-book",
      button: true,
      order: 100,
      onChange: () => NotebookApp.toggle()
    };
    // v12: controls is an array; v13+: a plain object keyed by name
    if (Array.isArray(controls)) {
      const tokens = controls.find(c => c.name === "token");
      tokens?.tools.push({ ...tool, onClick: tool.onChange });
    } else if (controls.tokens?.tools) {
      controls.tokens.tools[tool.name] = tool;
    }
  });

  /* ---- Hooks ---- */

  Hooks.once("ready", () => NotebookSystem.notifyChanges());
  Hooks.on("renderTokenHUD", TokenHudNotebook.onRender);
  Hooks.on("updateUser", (user, changes) => {
    if (changes.flags?.[MODULE_ID]?.notebook !== undefined || "name" in changes || "color" in changes) {
      NotebookApp.refresh();
    }
  });

  /* ---- Public API ---- */

  game.faundryvttTools.notebook = {
    NotebookSystem,
    NotebookApp,
    open(options) { NotebookApp.open(options); },
    toggle() { NotebookApp.toggle(); }
  };

  console.log("Faundryvtt Tools | Notebook feature initialized");
}
