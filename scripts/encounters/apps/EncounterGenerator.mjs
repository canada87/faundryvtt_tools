import { MODULE_ID } from "../../shared/constants.mjs";
import { EncounterSystem } from "../EncounterSystem.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Main encounter generator window.
 * Shows creature-type filter tags and CR-group inputs,
 * then spawns the drawn monsters on the canvas.
 */
export class EncounterGenerator extends HandlebarsApplicationMixin(ApplicationV2) {

  /** Cached compendium data */
  #pack = null;
  #index = null;
  #folderMap = null;

  static DEFAULT_OPTIONS = {
    id: "encounter-generator",
    classes: ["encounters", "encounter-generator"],
    window: {
      title: "ENCOUNTERS.GeneratorTitle",
      icon: "fas fa-dice-d20",
      resizable: true
    },
    position: {
      width: 500,
      height: 550
    },
    actions: {
      generate: EncounterGenerator.#onGenerate
    }
  };

  static PARTS = {
    generator: {
      template: `modules/${MODULE_ID}/templates/encounters/encounter-generator.hbs`
    }
  };

  /* ---------------------------------------- */
  /*  Context                                  */
  /* ---------------------------------------- */

  async _prepareContext(options) {
    const typePath = game.settings.get(MODULE_ID, "encounterCreatureTypePath");
    const groups = game.settings.get(MODULE_ID, "encounterGroups");

    const data = await EncounterSystem.loadCompendium();
    if (!data) {
      return { hasCompendium: false, types: [], groups: [] };
    }

    this.#pack = data.pack;
    this.#index = data.index;
    this.#folderMap = data.folderMap;

    const types = EncounterSystem.extractCreatureTypes(
      data.index, data.folderMap, groups, typePath
    );

    return {
      hasCompendium: true,
      types,
      groups,
      hasTypes: types.length > 0
    };
  }

  /* ---------------------------------------- */
  /*  Render hooks                             */
  /* ---------------------------------------- */

  _onRender(context, options) {
    super._onRender(context, options);
    const el = this.element;

    // Attach tag click handlers (left = include, right = exclude)
    el.querySelectorAll(".type-tag").forEach(tag => {
      tag.addEventListener("click", () => {
        tag.classList.remove("excluded");
        tag.classList.toggle("selected");
      });
      tag.addEventListener("contextmenu", ev => {
        ev.preventDefault();
        tag.classList.remove("selected");
        tag.classList.toggle("excluded");
      });
    });
  }

  /* ---------------------------------------- */
  /*  Actions                                  */
  /* ---------------------------------------- */

  static async #onGenerate(event, target) {
    const el = this.element;
    const typePath = game.settings.get(MODULE_ID, "encounterCreatureTypePath");
    const groups = game.settings.get(MODULE_ID, "encounterGroups");

    // Collect filter state from CSS classes
    const includedTypes = [...el.querySelectorAll(".type-tag.selected")]
      .map(t => t.dataset.type);
    const excludedTypes = [...el.querySelectorAll(".type-tag.excluded")]
      .map(t => t.dataset.type);

    // Collect counts from number inputs
    const counts = groups.map((_, i) =>
      Number(el.querySelector(`input[data-group-index="${i}"]`)?.value) || 0
    );

    const drawn = EncounterSystem.drawMonsters(
      this.#index, this.#folderMap, groups, counts,
      typePath, includedTypes, excludedTypes
    );

    if (drawn.length === 0) {
      ui.notifications.warn(game.i18n.localize("ENCOUNTERS.Warn.NoMonsters"));
      return;
    }

    // Capture reference before closing
    const pack = this.#pack;
    this.close();

    ui.notifications.info(game.i18n.localize("ENCOUNTERS.Info.ClickMap"));

    // Wait for a canvas click, then spawn
    const handleClick = async event => {
      canvas.stage.off("mousedown", handleClick);
      const pos = event.data.getLocalPosition(canvas.stage);
      await EncounterSystem.spawnEncounter(pack, drawn, pos);
    };

    canvas.stage.on("mousedown", handleClick);
  }
}
