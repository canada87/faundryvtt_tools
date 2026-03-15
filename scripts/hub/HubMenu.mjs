import { MODULE_ID } from "../shared/constants.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Top-level hub menu that lets the user choose which feature to open.
 * Each feature registers itself via HubMenu.registerFeature().
 */
export class HubMenu extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "faundryvtt-tools-hub",
    classes: ["faundryvtt-tools", "hub-menu"],
    window: {
      title: "FVTT_TOOLS.HubTitle",
      icon: "fas fa-toolbox",
      resizable: true
    },
    position: {
      width: 420,
      height: "auto"
    },
    actions: {
      openFeature: HubMenu.#onOpenFeature
    }
  };

  static PARTS = {
    hub: {
      template: `modules/${MODULE_ID}/templates/hub-menu.hbs`
    }
  };

  /** @type {Array<{id: string, icon: string, name: string, description: string, open: Function}>} */
  static features = [];

  /**
   * Register a feature so it appears in the hub menu.
   * @param {{id: string, icon: string, name: string, description: string, open: Function}} feature
   */
  static registerFeature(feature) {
    this.features.push(feature);
  }

  async _prepareContext(options) {
    return {
      features: HubMenu.features.map(f => ({
        id: f.id,
        icon: f.icon,
        name: game.i18n.localize(f.name),
        description: game.i18n.localize(f.description)
      }))
    };
  }

  static async #onOpenFeature(event, target) {
    const featureId = target.closest("[data-feature]").dataset.feature;
    const feature = HubMenu.features.find(f => f.id === featureId);
    if (feature?.open) {
      feature.open();
      this.close();
    }
  }
}
