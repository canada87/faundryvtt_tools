import { MODULE_ID } from "../../shared/constants.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM form for configuring loot settings:
 * compendium, currency path, loot groups (label + folders), gold ranges.
 */
export class LootSettings extends HandlebarsApplicationMixin(ApplicationV2) {

  /** Local form state (survives add/remove re-renders) */
  #compendium;
  #actorName;
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
      height: 650
    },
    form: {
      submitOnChange: false,
      closeOnSubmit: true,
      handler: LootSettings.#onSubmit
    },
    actions: {
      addGroup: LootSettings.#onAddGroup,
      removeGroup: LootSettings.#onRemoveGroup,
      addFolder: LootSettings.#onAddFolder,
      removeFolder: LootSettings.#onRemoveFolder,
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
    this.#actorName = game.settings.get(MODULE_ID, "lootActorName");
    this.#currencyPath = game.settings.get(MODULE_ID, "lootCurrencyPath");
    this.#groups = foundry.utils.deepClone(game.settings.get(MODULE_ID, "lootGroups"));
    this.#goldRanges = foundry.utils.deepClone(game.settings.get(MODULE_ID, "lootGoldRanges"));
  }

  /* ---------------------------------------- */
  /*  Lifecycle                                */
  /* ---------------------------------------- */

  _onRender(context, options) {
    this.element.querySelector('[name="compendium"]')
      ?.addEventListener("change", () => {
        this.#syncFormToState();
        this.render();
      });
  }

  /* ---------------------------------------- */
  /*  Context                                  */
  /* ---------------------------------------- */

  async _prepareContext(options) {
    const availablePacks = game.packs
      .filter(p => p.metadata.type === "Item")
      .map(p => ({
        value: p.metadata.label,
        label: p.metadata.label,
        selected: p.metadata.label === this.#compendium
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    let availableCompendiumFolders = [];
    const selectedPack = game.packs.find(p => p.metadata.label === this.#compendium);
    if (selectedPack) {
      await selectedPack.getIndex({ fields: ["folder"] });
      availableCompendiumFolders = selectedPack.folders
        .filter(f => !f.folder)
        .map(f => f.name)
        .sort();
    }

    return {
      compendium: this.#compendium,
      actorName: this.#actorName,
      currencyPath: this.#currencyPath,
      groups: this.#groups.map((g, gi) => ({
        index: gi,
        label: g.label,
        folders: g.folders.map((fname, fi) => ({
          groupIndex: gi,
          folderIndex: fi,
          options: availableCompendiumFolders.map(fn => ({
            value: fn,
            label: fn,
            selected: fn === fname
          }))
        }))
      })),
      goldRanges: this.#goldRanges,
      availablePacks
    };
  }

  /* ---------------------------------------- */
  /*  State sync                               */
  /* ---------------------------------------- */

  #syncFormToState() {
    const el = this.element;
    this.#compendium = el.querySelector('[name="compendium"]')?.value ?? this.#compendium;
    this.#actorName = el.querySelector('[name="actorName"]')?.value ?? this.#actorName;
    this.#currencyPath = el.querySelector('[name="currencyPath"]')?.value ?? this.#currencyPath;

    const groups = [];
    el.querySelectorAll(".group-entry").forEach(entry => {
      const label = entry.querySelector('[name$=".label"]')?.value || "";
      const folderSelects = entry.querySelectorAll('select[name*=".folders."]');
      const folders = Array.from(folderSelects).map(s => s.value).filter(Boolean);
      groups.push({ label: label.trim(), folders });
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

  static async #onAddFolder(event, target) {
    this.#syncFormToState();
    const groupIndex = Number(target.dataset.groupIndex);
    this.#groups[groupIndex].folders.push("");
    this.render();
  }

  static async #onRemoveFolder(event, target) {
    this.#syncFormToState();
    const groupIndex = Number(target.dataset.groupIndex);
    const folderIndex = Number(target.dataset.folderIndex);
    this.#groups[groupIndex].folders.splice(folderIndex, 1);
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
    await game.settings.set(MODULE_ID, "lootActorName", data.actorName || "Tesoro");
    await game.settings.set(MODULE_ID, "lootCurrencyPath", data.currencyPath || "system.currency.gp");

    const groups = Object.values(data.groups || {})
      .filter(g => g.label?.trim())
      .map(g => ({
        label: g.label.trim(),
        folders: Object.values(g.folders || {}).filter(Boolean)
      }));
    await game.settings.set(MODULE_ID, "lootGroups", groups);

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
