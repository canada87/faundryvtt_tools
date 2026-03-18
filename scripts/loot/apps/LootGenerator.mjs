import { MODULE_ID } from "../../shared/constants.mjs";
import { LootSystem } from "../LootSystem.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Main loot generator window.
 * Shows configured loot groups with item counts, a difficulty selector for gold,
 * and generates loot onto the selected token's actor.
 */
export class LootGenerator extends HandlebarsApplicationMixin(ApplicationV2) {

  /** Cached compendium data */
  #pack = null;
  #index = null;
  #folderMap = null;

  static DEFAULT_OPTIONS = {
    id: "loot-generator",
    classes: ["loot", "loot-generator"],
    window: {
      title: "LOOT.GeneratorTitle",
      icon: "fas fa-coins",
      resizable: true
    },
    position: {
      width: 440,
      height: "auto"
    },
    actions: {
      generate: LootGenerator.#onGenerate
    }
  };

  static PARTS = {
    generator: {
      template: `modules/${MODULE_ID}/templates/loot/loot-generator.hbs`
    }
  };

  /* ---------------------------------------- */
  /*  Context                                  */
  /* ---------------------------------------- */

  async _prepareContext(options) {
    const groups = game.settings.get(MODULE_ID, "lootGroups");
    const goldRanges = game.settings.get(MODULE_ID, "lootGoldRanges");

    const data = await LootSystem.loadCompendium();
    if (!data) {
      return { hasCompendium: false, groups: [], goldRanges: [], hasGoldRanges: false };
    }

    this.#pack = data.pack;
    this.#index = data.index;
    this.#folderMap = data.folderMap;

    return {
      hasCompendium: true,
      groups: groups.map((g, i) => ({ label: g.label, index: i })),
      hasGroups: groups.length > 0,
      goldRanges: goldRanges.map((r, i) => ({
        index: i,
        label: `${r.label} (${r.min} – ${r.max})`
      })),
      hasGoldRanges: goldRanges.length > 0
    };
  }

  /* ---------------------------------------- */
  /*  Actions                                  */
  /* ---------------------------------------- */

  static async #onGenerate(event, target) {
    const el = this.element;

    // Require a selected token
    const token = canvas.tokens.controlled[0];
    if (!token) {
      ui.notifications.warn(game.i18n.localize("LOOT.Warn.NoToken"));
      return;
    }
    const actor = token.actor;
    if (!actor) {
      ui.notifications.warn(game.i18n.localize("LOOT.Warn.NoActor"));
      return;
    }

    // Collect counts per group
    const groups = game.settings.get(MODULE_ID, "lootGroups");
    const counts = groups.map((_, i) =>
      Number(el.querySelector(`input[data-group-index="${i}"]`)?.value) || 0
    );

    // Difficulty index
    const diffIndex = Number(el.querySelector("#gold-difficulty")?.value ?? -1);

    // Check there's something to generate
    const hasItems = counts.some(c => c > 0);
    if (!hasItems && diffIndex < 0) {
      ui.notifications.warn(game.i18n.localize("LOOT.Warn.NothingToGenerate"));
      return;
    }

    await LootSystem.generate(this.#pack, this.#index, this.#folderMap, actor, counts, diffIndex);
  }
}
