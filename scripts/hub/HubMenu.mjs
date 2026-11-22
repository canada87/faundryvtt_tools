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
      width: 600,
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
   * `key` (e.g. "KeyF") adds a GM shortcut Shift+key that opens the feature;
   * `keybinding` instead points to a shortcut the feature registered itself.
   * `setting` is the feature's "enabled" setting, where the shortcut is shown.
   * Must be called during `init` (keybindings can only be registered there).
   * @param {{id: string, icon: string, name: string, description: string, open: Function,
   *          key?: string, keybinding?: string, setting?: string}} feature
   */
  static registerFeature(feature) {
    this.features.push(feature);
    if (!feature.key) return;
    feature.keybinding = `hubOpen_${feature.id}`;
    game.keybindings.register(MODULE_ID, feature.keybinding, {
      name: feature.name,
      hint: "FVTT_TOOLS.ShortcutHint",
      editable: [{ key: feature.key, modifiers: ["Shift"] }],
      restricted: true,
      onDown: () => {
        feature.open();
        return true;
      }
    });
  }

  /**
   * Current keys of a module keybinding, as shown to the user ("Shift+F").
   * @param {string} action
   * @returns {string} empty when unbound
   */
  static shortcutLabel(action) {
    return game.keybindings.get(MODULE_ID, action)
      .map(({ key, modifiers = [] }) => [...modifiers, key.replace(/^(Key|Digit)/, "")].join("+"))
      .join(" / ");
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
