import { MODULE_ID } from "../../shared/constants.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM form for configuring loot settings:
 * compendium, currency path, loot groups (label + folders), gold ranges.
 */
export class LootSettings extends HandlebarsApplicationMixin(ApplicationV2) {

  /** Local form state (survives add/remove re-renders) */
  #compendium;
  #currencyPath;
  #groups;
  #goldRanges;

  static DEFAULT_OPTIONS = {
    id: "loot-settings",
    classes: ["loot", "loot-settings"],
    tag: "form",
    window: {
      title: "LOOT.SettingsTitle",
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
      handler: LootSettings.#onSubmit
    },
    actions: {
      addGroup: LootSettings.#onAddGroup,
      removeGroup: LootSettings.#onRemoveGroup,
      addGoldRange: LootSettings.#onAddGoldRange,
      removeGoldRange: LootSettings.#onRemoveGoldRange
    }
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/loot/loot-settings.hbs`
    }
  };

  constructor(options = {}) {
    super(options);
    this.#compendium = game.settings.get(MODULE_ID, "lootCompendium");
    this.#currencyPath = game.settings.get(MODULE_ID, "lootCurrencyPath");
    this.#groups = foundry.utils.deepClone(game.settings.get(MODULE_ID, "lootGroups"));
    this.#goldRanges = foundry.utils.deepClone(game.settings.get(MODULE_ID, "lootGoldRanges"));
  }

  /* ---------------------------------------- */
  /*  Context                                  */
  /* ---------------------------------------- */

  async _prepareContext(options) {
    return {
      compendium: this.#compendium,
      currencyPath: this.#currencyPath,
      groups: this.#groups.map(g => ({
        ...g,
        foldersStr: g.folders.join(", ")
      })),
      goldRanges: this.#goldRanges
    };
  }

  /* ---------------------------------------- */
  /*  State sync                               */
  /* ---------------------------------------- */

  #syncFormToState() {
    const el = this.element;
    this.#compendium = el.querySelector('[name="compendium"]')?.value ?? this.#compendium;
    this.#currencyPath = el.querySelector('[name="currencyPath"]')?.value ?? this.#currencyPath;

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

    const goldRanges = [];
    el.querySelectorAll(".gold-range-entry").forEach(entry => {
      goldRanges.push({
        label: entry.querySelector('input[name$=".label"]')?.value || "",
        min: Number(entry.querySelector('input[name$=".min"]')?.value) || 0,
        max: Number(entry.querySelector('input[name$=".max"]')?.value) || 0
      });
    });
    this.#goldRanges = goldRanges;
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

  static async #onAddGoldRange() {
    this.#syncFormToState();
    this.#goldRanges.push({ label: "", min: 0, max: 0 });
    this.render();
  }

  static async #onRemoveGoldRange(event, target) {
    this.#syncFormToState();
    const index = Number(target.closest("[data-range-index]").dataset.rangeIndex);
    this.#goldRanges.splice(index, 1);
    this.render();
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);

    await game.settings.set(MODULE_ID, "lootCompendium", data.compendium || "");
    await game.settings.set(MODULE_ID, "lootCurrencyPath", data.currencyPath || "system.currency.gp");

    // Parse groups
    const groups = Object.values(data.groups || {})
      .filter(g => g.label?.trim())
      .map(g => ({
        label: g.label.trim(),
        folders: g.folders.split(",").map(s => s.trim()).filter(Boolean)
      }));
    await game.settings.set(MODULE_ID, "lootGroups", groups);

    // Parse gold ranges
    const goldRanges = Object.values(data.goldRanges || {})
      .filter(r => r.label?.trim())
      .map(r => ({
        label: r.label.trim(),
        min: Number(r.min) || 0,
        max: Number(r.max) || 0
      }));
    await game.settings.set(MODULE_ID, "lootGoldRanges", goldRanges);

    ui.notifications.info(game.i18n.localize("LOOT.Info.SettingsSaved"));
  }
}
