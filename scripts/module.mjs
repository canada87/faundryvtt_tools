import { MODULE_ID } from "./shared/constants.mjs";
import { HubMenu } from "./hub/HubMenu.mjs";
import { initCrafting } from "./crafting/index.mjs";
import { initEncounters } from "./encounters/index.mjs";
import { initLoot } from "./loot/index.mjs";
import { initParty } from "./party/index.mjs";
import { initLighting } from "./lighting/index.mjs";
import { initImageShare } from "./image-share/index.mjs";
import { initSavingThrow } from "./saving-throw/index.mjs";
import { initMindMap } from "./mindmap/index.mjs";
import { initBackup } from "./backup/index.mjs";
import { initResources } from "./resources/index.mjs";
import { initHexMap } from "./hexmap/index.mjs";

/* ---------------------------------------- */
/*  Settings menu launcher (FormApplication */
/*  that immediately opens the Hub)         */
/* ---------------------------------------- */

class HubLauncher extends FormApplication {
  constructor(...args) {
    super(...args);
    new HubMenu().render(true);
    this.close();
  }
  async _updateObject() {}
  render() { return this; }
}

/* ---------------------------------------- */
/*  Init — register hub & initialize features */
/* ---------------------------------------- */

Hooks.once("init", () => {

  // Global API namespace
  game.faundryvttTools = {
    openHub() {
      new HubMenu().render(true);
    }
  };

  // Settings menu button — opens the Hub (GM only)
  game.settings.registerMenu(MODULE_ID, "hubMenu", {
    name: "FVTT_TOOLS.HubTitle",
    label: "FVTT_TOOLS.OpenHub",
    hint: "FVTT_TOOLS.HubHint",
    icon: "fas fa-toolbox",
    type: HubLauncher,
    restricted: true
  });

  // Initialize all features
  initCrafting();
  initEncounters();
  initLoot();
  initParty();
  initLighting();
  initImageShare();
  initSavingThrow();
  initMindMap();
  initBackup();
  initResources();
  initHexMap();

  console.log("Faundryvtt Tools | Module initialized");
});

/* ---------------------------------------- */
/*  Scene control group (GM only)           */
/* ---------------------------------------- */

Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user.isGM) return;

  const hubTool = {
    name: "hub",
    title: game.i18n.localize("FVTT_TOOLS.OpenHub"),
    icon: "fas fa-toolbox",
    button: true,
    onClick: () => new HubMenu().render(true)
  };
  const featureTools = HubMenu.features.map(f => ({
    name: f.id,
    title: game.i18n.localize(f.name),
    icon: f.icon,
    button: true,
    onClick: f.open
  }));
  const allTools = [hubTool, ...featureTools];

  const group = {
    name: "faundryvtt-tools",
    title: "FVTT_TOOLS.HubTitle",
    icon: "fas fa-toolbox",
    visible: true,
    activeTool: "hub"
  };

  // v12: controls is an array; v13+: controls is a plain object keyed by name
  if (Array.isArray(controls)) {
    controls.push({ ...group, tools: allTools });
  } else {
    controls["faundryvtt-tools"] = {
      ...group,
      tools: Object.fromEntries(allTools.map(t => [t.name, t]))
    };
  }
});

/* ---------------------------------------- */
/*  Ready                                    */
/* ---------------------------------------- */

Hooks.once("ready", () => {
  console.log("Faundryvtt Tools | Module ready");
});
