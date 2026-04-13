import { MODULE_ID } from "../../shared/constants.mjs";
import { ComponentGenerator } from "../ComponentGenerator.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM form for configuring the component auto-generator:
 * compendium label, components folder name, and level folder names / points.
 */
export class GeneratorSettings extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "crafting-generator-settings",
    classes: ["crafting", "generator-settings"],
    tag: "form",
    window: {
      title: "CRAFTING.GeneratorSettings",
      icon: "fas fa-cogs",
      resizable: true
    },
    position: {
      width: 480,
      height: "auto"
    },
    form: {
      submitOnChange: false,
      closeOnSubmit: true,
      handler: GeneratorSettings.#onSubmit
    }
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/crafting/generator-settings.hbs`
    }
  };

  async _prepareContext(options) {
    const config = ComponentGenerator.getConfig();
    const levels = Object.entries(config.levels).map(([key, data]) => ({
      key: Number(key),
      folderName: data.folderName,
      points: data.points
    }));
    return {
      compendiumLabel: config.compendiumLabel,
      componentsFolder: config.componentsFolder,
      levels
    };
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const defaults = ComponentGenerator.DEFAULT_CONFIG;

    const config = {
      compendiumLabel: data.compendiumLabel?.trim() || defaults.compendiumLabel,
      componentsFolder: data.componentsFolder?.trim() || defaults.componentsFolder,
      levels: {}
    };

    for (const [key, values] of Object.entries(data.levels ?? {})) {
      const levelNum = Number(key);
      config.levels[levelNum] = {
        folderName: values.folderName?.trim() || `lv${levelNum}`,
        points: Math.max(1, Number(values.points) || 1)
      };
    }

    await game.settings.set(MODULE_ID, "craftingGeneratorConfig", config);
    ui.notifications.info(game.i18n.localize("CRAFTING.Info.GeneratorSettingsSaved"));
  }
}
