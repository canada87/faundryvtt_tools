import { MODULE_ID } from "../../shared/constants.mjs";
import { ComponentGenerator } from "../ComponentGenerator.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM form for configuring rarity points and minimum levels
 * used by the component auto-generator.
 */
export class RaritySettings extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "crafting-rarity-settings",
    classes: ["crafting", "rarity-settings"],
    tag: "form",
    window: {
      title: "CRAFTING.RaritySettings",
      icon: "fas fa-sliders-h",
      resizable: true
    },
    position: {
      width: 420,
      height: "auto"
    },
    form: {
      submitOnChange: false,
      closeOnSubmit: true,
      handler: RaritySettings.#onSubmit
    }
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/crafting/rarity-settings.hbs`
    }
  };

  async _prepareContext(options) {
    const rarities = ComponentGenerator.getRarities();
    const rows = Object.entries(rarities).map(([key, data]) => ({
      key,
      label: game.i18n.localize(`CRAFTING.Rarity.${key}`),
      points: data.points,
      minLevel: data.minLevel
    }));
    return { rows };
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const rarities = {};
    for (const [key, values] of Object.entries(data.rarities)) {
      rarities[key] = {
        points: Math.max(1, Number(values.points) || 1),
        minLevel: Math.min(3, Math.max(1, Number(values.minLevel) || 1))
      };
    }
    await game.settings.set(MODULE_ID, "craftingRarities", rarities);
    ui.notifications.info(game.i18n.localize("CRAFTING.Info.RaritiesSaved"));
  }
}
