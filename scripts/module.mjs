import { MODULE_ID } from "./shared/constants.mjs";
import { HubMenu } from "./hub/HubMenu.mjs";
import { initCrafting } from "./crafting/index.mjs";
import { initEncounters } from "./encounters/index.mjs";
import { initLoot } from "./loot/index.mjs";
import { initParty } from "./party/index.mjs";
import { initLighting } from "./lighting/index.mjs";

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

  console.log("Faundryvtt Tools | Module initialized");
});

/* ---------------------------------------- */
/*  Scene control button (GM only)          */
/* ---------------------------------------- */

Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user.isGM) return;
  const tokenControls = controls.find(c => c.name === "token");
  if (tokenControls) {
    tokenControls.tools.push({
      name: "faundryvtt-tools-hub",
      title: game.i18n.localize("FVTT_TOOLS.HubTitle"),
      icon: "fas fa-toolbox",
      button: true,
      onClick: () => new HubMenu().render(true)
    });
  }
});

/* ---------------------------------------- */
/*  Ready                                    */
/* ---------------------------------------- */

Hooks.once("ready", () => {
  console.log("Faundryvtt Tools | Module ready");
});
