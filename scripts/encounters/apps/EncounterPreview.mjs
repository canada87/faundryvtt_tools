import { MODULE_ID } from "../../shared/constants.mjs";
import { EncounterSystem } from "../EncounterSystem.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Preview window showing drawn monsters before placing them on the map.
 * Allows removing, re-rolling individual monsters, or re-rolling the entire encounter.
 */
export class EncounterPreview extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @type {CompendiumCollection} */
  #pack;

  /** @type {Array} Drawn index entries */
  #drawn;

  /** @type {object} Parameters needed to re-draw */
  #drawContext;

  constructor(pack, drawn, drawContext, options = {}) {
    super(options);
    this.#pack = pack;
    this.#drawn = [...drawn];
    this.#drawContext = drawContext;
  }

  static DEFAULT_OPTIONS = {
    id: "encounter-preview",
    classes: ["encounters", "encounter-preview"],
    window: {
      title: "ENCOUNTERS.PreviewTitle",
      icon: "fas fa-eye",
      resizable: true
    },
    position: {
      width: 420,
      height: 500
    },
    actions: {
      rerollOne: EncounterPreview.#onRerollOne,
      removeOne: EncounterPreview.#onRemoveOne,
      rerollAll: EncounterPreview.#onRerollAll,
      confirmEncounter: EncounterPreview.#onConfirmEncounter
    }
  };

  static PARTS = {
    preview: {
      template: `modules/${MODULE_ID}/templates/encounters/encounter-preview.hbs`
    }
  };

  /* ---------------------------------------- */
  /*  Context                                  */
  /* ---------------------------------------- */

  async _prepareContext(options) {
    const ctx = this.#drawContext;

    return {
      monsters: this.#drawn.map((entry, i) => {
        const level = Number(EncounterSystem.getNestedValue(entry, ctx.levelPath));
        return {
          index: i,
          name: entry.name,
          img: entry.img,
          level: isNaN(level) ? "?" : level
        };
      }),
      count: this.#drawn.length,
      hasMonsters: this.#drawn.length > 0
    };
  }

  /* ---------------------------------------- */
  /*  Helpers                                  */
  /* ---------------------------------------- */

  /**
   * Get filtered candidates with the same level as the given entry.
   */
  #getCandidatesForEntry(entry) {
    const ctx = this.#drawContext;
    const entryLevel = Number(EncounterSystem.getNestedValue(entry, ctx.levelPath));

    return ctx.index.filter(i => {
      const level = Number(EncounterSystem.getNestedValue(i, ctx.levelPath));
      if (isNaN(level) || level !== entryLevel) return false;
      const type = EncounterSystem.getNestedValue(i, ctx.typePath)?.trim();
      if (!type) return false;
      if (ctx.excluded.includes(type)) return false;
      if (ctx.included.length > 0 && !ctx.included.includes(type)) return false;
      return true;
    });
  }

  /* ---------------------------------------- */
  /*  Actions                                  */
  /* ---------------------------------------- */

  static #onRerollOne(event, target) {
    const index = Number(target.closest("[data-index]").dataset.index);
    const entry = this.#drawn[index];
    const candidates = this.#getCandidatesForEntry(entry);
    if (candidates.length === 0) return;

    let newEntry;
    if (candidates.length === 1) {
      newEntry = candidates[0];
    } else {
      do {
        newEntry = candidates[Math.floor(Math.random() * candidates.length)];
      } while (newEntry._id === entry._id);
    }

    this.#drawn[index] = newEntry;
    this.render(true);
  }

  static #onRemoveOne(event, target) {
    const index = Number(target.closest("[data-index]").dataset.index);
    this.#drawn.splice(index, 1);
    this.render(true);
  }

  static #onRerollAll(event, target) {
    const ctx = this.#drawContext;
    let drawn;

    if (ctx.mode === "difficulty") {
      drawn = EncounterSystem.drawByDifficulty(
        ctx.index, ctx.groups,
        ctx.partyLevel, ctx.partySize, ctx.difficulty,
        ctx.typePath, ctx.levelPath, ctx.included, ctx.excluded
      );
    } else {
      drawn = EncounterSystem.drawMonsters(
        ctx.index, ctx.groups, ctx.counts,
        ctx.typePath, ctx.levelPath, ctx.included, ctx.excluded
      );
    }

    if (drawn.length === 0) {
      ui.notifications.warn(game.i18n.localize("ENCOUNTERS.Warn.NoMonsters"));
      return;
    }

    this.#drawn = drawn;
    this.render(true);
  }

  static async #onConfirmEncounter(event, target) {
    const pack = this.#pack;
    const drawn = [...this.#drawn];

    if (drawn.length === 0) {
      ui.notifications.warn(game.i18n.localize("ENCOUNTERS.Warn.NoMonsters"));
      return;
    }

    this.close();
    ui.notifications.info(game.i18n.localize("ENCOUNTERS.Info.ClickMap"));

    const handleClick = async event => {
      canvas.stage.off("mousedown", handleClick);
      const pos = event.data.getLocalPosition(canvas.stage);
      await EncounterSystem.spawnEncounter(pack, drawn, pos);
    };

    canvas.stage.on("mousedown", handleClick);
  }
}
