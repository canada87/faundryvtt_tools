import { MODULE_ID } from "../../shared/constants.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM form for configuring encounter settings:
 * compendium, creature-type field path, target folder, and CR groups.
 */
export class EncounterSettings extends HandlebarsApplicationMixin(ApplicationV2) {

  /** Local form state (survives add/remove group re-renders) */
  #compendium;
  #creatureTypePath;
  #targetFolder;
  #groups;

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
      removeGroup: EncounterSettings.#onRemoveGroup
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
    this.#targetFolder = game.settings.get(MODULE_ID, "encounterTargetFolder");
    this.#groups = foundry.utils.deepClone(game.settings.get(MODULE_ID, "encounterGroups"));
  }

  /* ---------------------------------------- */
  /*  Context                                  */
  /* ---------------------------------------- */

  async _prepareContext(options) {
    return {
      compendium: this.#compendium,
      creatureTypePath: this.#creatureTypePath,
      targetFolder: this.#targetFolder,
      groups: this.#groups.map(g => ({
        ...g,
        foldersStr: g.folders.join(", ")
      }))
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
    this.#targetFolder = el.querySelector('[name="targetFolder"]')?.value ?? this.#targetFolder;

    const groups = [];
    el.querySelectorAll(".group-entry").forEach(entry => {
      const label = entry.querySelector('input[name$=".label"]')?.value || "";
      const folders = entry.querySelector('input[name$=".folders"]')?.value || "";
      groups.push({
        label: label.trim(),
        folders: folders.split(",").map(s => s.trim()).filter(Boolean)
      });
    });
    this.#groups = groups;
  }

  /* ---------------------------------------- */
  /*  Actions                                  */
  /* ---------------------------------------- */

  static async #onAddGroup() {
    this.#syncFormToState();
    this.#groups.push({ label: "", folders: [] });
    this.render();
  }

  static async #onRemoveGroup(event, target) {
    this.#syncFormToState();
    const index = Number(target.closest("[data-group-index]").dataset.groupIndex);
    this.#groups.splice(index, 1);
    this.render();
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);

    await game.settings.set(MODULE_ID, "encounterCompendium", data.compendium || "");
    await game.settings.set(MODULE_ID, "encounterCreatureTypePath", data.creatureTypePath || "");
    await game.settings.set(MODULE_ID, "encounterTargetFolder", data.targetFolder || "");

    // Parse groups from form data
    const groups = Object.values(data.groups || {})
      .filter(g => g.label?.trim())
      .map(g => ({
        label: g.label.trim(),
        folders: g.folders.split(",").map(s => s.trim()).filter(Boolean)
      }));

    await game.settings.set(MODULE_ID, "encounterGroups", groups);

    ui.notifications.info(game.i18n.localize("ENCOUNTERS.Info.SettingsSaved"));
  }
}
