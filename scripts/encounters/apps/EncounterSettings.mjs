import { MODULE_ID } from "../../shared/constants.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM form for configuring encounter settings:
 * compendium, creature-type field path, level field path, target folder, and CR groups.
 */
export class EncounterSettings extends HandlebarsApplicationMixin(ApplicationV2) {

  /** Local form state (survives add/remove group re-renders) */
  #compendium;
  #creatureTypePath;
  #levelPath;
  #targetFolder;
  #groups;
  #scenarios;

  static DEFAULT_OPTIONS = {
    id: "encounter-settings",
    classes: ["encounters", "encounter-settings"],
    tag: "form",
    window: {
      title: "ENCOUNTERS.SettingsTitle",
      icon: "fas fa-cog",
      resizable: true
    },
    position: {
      width: 520,
      height: "auto"
    },
    form: {
      submitOnChange: false,
      closeOnSubmit: true,
      handler: EncounterSettings.#onSubmit
    },
    actions: {
      addGroup: EncounterSettings.#onAddGroup,
      removeGroup: EncounterSettings.#onRemoveGroup,
      addScenario: EncounterSettings.#onAddScenario,
      removeScenario: EncounterSettings.#onRemoveScenario
    }
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/encounters/encounter-settings.hbs`
    }
  };

  constructor(options = {}) {
    super(options);
    this.#compendium = game.settings.get(MODULE_ID, "encounterCompendium");
    this.#creatureTypePath = game.settings.get(MODULE_ID, "encounterCreatureTypePath");
    this.#levelPath = game.settings.get(MODULE_ID, "encounterLevelPath");
    this.#targetFolder = game.settings.get(MODULE_ID, "encounterTargetFolder");
    this.#groups = foundry.utils.deepClone(game.settings.get(MODULE_ID, "encounterGroups"));
    this.#scenarios = foundry.utils.deepClone(game.settings.get(MODULE_ID, "encounterScenarios"));
  }

  /* ---------------------------------------- */
  /*  Context                                  */
  /* ---------------------------------------- */

  async _prepareContext(options) {
    return {
      compendium: this.#compendium,
      creatureTypePath: this.#creatureTypePath,
      levelPath: this.#levelPath,
      targetFolder: this.#targetFolder,
      groups: this.#groups,
      scenarios: this.#scenarios
    };
  }

  /* ---------------------------------------- */
  /*  State sync                               */
  /* ---------------------------------------- */

  /**
   * Read current DOM input values into instance state.
   * Called before add/remove group re-renders to preserve edits.
   */
  #syncFormToState() {
    const el = this.element;
    this.#compendium = el.querySelector('[name="compendium"]')?.value ?? this.#compendium;
    this.#creatureTypePath = el.querySelector('[name="creatureTypePath"]')?.value ?? this.#creatureTypePath;
    this.#levelPath = el.querySelector('[name="levelPath"]')?.value ?? this.#levelPath;
    this.#targetFolder = el.querySelector('[name="targetFolder"]')?.value ?? this.#targetFolder;

    const groups = [];
    el.querySelectorAll(".group-entry").forEach(entry => {
      const label = entry.querySelector('input[name$=".label"]')?.value || "";
      const minLevel = Number(entry.querySelector('input[name$=".minLevel"]')?.value) || 0;
      const maxLevel = Number(entry.querySelector('input[name$=".maxLevel"]')?.value) || 0;
      groups.push({
        label: label.trim(),
        minLevel,
        maxLevel
      });
    });
    this.#groups = groups;

    const scenarios = [];
    el.querySelectorAll(".scenario-entry textarea").forEach(ta => {
      scenarios.push(ta.value);
    });
    this.#scenarios = scenarios;
  }

  /* ---------------------------------------- */
  /*  Actions                                  */
  /* ---------------------------------------- */

  static async #onAddGroup() {
    this.#syncFormToState();
    this.#groups.push({ label: "", minLevel: 1, maxLevel: 1 });
    this.render();
  }

  static async #onRemoveGroup(event, target) {
    this.#syncFormToState();
    const index = Number(target.closest("[data-group-index]").dataset.groupIndex);
    this.#groups.splice(index, 1);
    this.render();
  }

  static async #onAddScenario() {
    this.#syncFormToState();
    this.#scenarios.push("");
    this.render();
  }

  static async #onRemoveScenario(event, target) {
    this.#syncFormToState();
    const index = Number(target.closest("[data-scenario-index]").dataset.scenarioIndex);
    this.#scenarios.splice(index, 1);
    this.render();
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);

    await game.settings.set(MODULE_ID, "encounterCompendium", data.compendium || "");
    await game.settings.set(MODULE_ID, "encounterCreatureTypePath", data.creatureTypePath || "");
    await game.settings.set(MODULE_ID, "encounterLevelPath", data.levelPath || "");
    await game.settings.set(MODULE_ID, "encounterTargetFolder", data.targetFolder || "");

    // Parse groups from form data
    const groups = Object.values(data.groups || {})
      .filter(g => g.label?.trim())
      .map(g => ({
        label: g.label.trim(),
        minLevel: Number(g.minLevel) || 0,
        maxLevel: Number(g.maxLevel) || 0
      }));

    await game.settings.set(MODULE_ID, "encounterGroups", groups);

    // Parse scenarios from form data
    const scenarios = Object.values(data.scenarios || {}).filter(s => s.trim());
    await game.settings.set(MODULE_ID, "encounterScenarios", scenarios);

    ui.notifications.info(game.i18n.localize("ENCOUNTERS.Info.SettingsSaved"));
  }
}
