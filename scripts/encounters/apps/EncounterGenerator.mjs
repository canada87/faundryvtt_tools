import { MODULE_ID } from "../../shared/constants.mjs";
import { EncounterSystem } from "../EncounterSystem.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Main encounter generator window.
 * Two modes:
 *   - **Difficulty**: party level / size / difficulty → auto-calculates budget and level range
 *   - **Manual**: pick a count for each CR group
 * Both modes share the creature-type filter tags.
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
      width: 520,
      height: 600
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

    // --- Type-tag click handlers (left = include, right = exclude) ---
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

    // --- Mode toggle ---
    const modeBtns = el.querySelectorAll(".mode-btn");
    const diffSection = el.querySelector(".difficulty-section");
    const manualSection = el.querySelector(".manual-section");

    modeBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        modeBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const mode = btn.dataset.mode;
        if (diffSection) diffSection.style.display = mode === "difficulty" ? "" : "none";
        if (manualSection) manualSection.style.display = mode === "manual" ? "" : "none";
      });
    });

    // --- Live budget / level-range summary ---
    const partyLevelInput = el.querySelector("#party-level");
    const partySizeInput = el.querySelector("#party-size");
    const difficultySelect = el.querySelector("#difficulty");
    const summaryEl = el.querySelector("#budget-summary");

    const updateSummary = () => {
      if (!summaryEl) return;
      const pLevel = Math.max(1, Number(partyLevelInput?.value) || 1);
      const pSize = Math.max(1, Number(partySizeInput?.value) || 1);
      const diff = Number(difficultySelect?.value) || 4;

      const budget = EncounterSystem.calculateBudget(pLevel, pSize, diff);
      const { min, max } = EncounterSystem.calculateLevelRange(pLevel, diff);

      summaryEl.textContent =
        `${game.i18n.localize("ENCOUNTERS.Budget")}: ${budget}  |  ` +
        `${game.i18n.localize("ENCOUNTERS.MonsterLevels")}: ${min} – ${max}`;
    };

    [partyLevelInput, partySizeInput, difficultySelect].forEach(input => {
      if (input) input.addEventListener("input", updateSummary);
    });

    // Initial calculation
    updateSummary();
  }

  /* ---------------------------------------- */
  /*  Actions                                  */
  /* ---------------------------------------- */

  static async #onGenerate(event, target) {
    const el = this.element;
    const typePath = game.settings.get(MODULE_ID, "encounterCreatureTypePath");
    const groups = game.settings.get(MODULE_ID, "encounterGroups");

    // Collect type filters (shared by both modes)
    const includedTypes = [...el.querySelectorAll(".type-tag.selected")]
      .map(t => t.dataset.type);
    const excludedTypes = [...el.querySelectorAll(".type-tag.excluded")]
      .map(t => t.dataset.type);

    // Determine active mode
    const activeMode = el.querySelector(".mode-btn.active")?.dataset.mode ?? "difficulty";
    let drawn;

    if (activeMode === "difficulty") {
      const partyLevel = Math.max(1, Number(el.querySelector("#party-level")?.value) || 1);
      const partySize = Math.max(1, Number(el.querySelector("#party-size")?.value) || 1);
      const difficulty = Number(el.querySelector("#difficulty")?.value) || 4;

      drawn = EncounterSystem.drawByDifficulty(
        this.#index, this.#folderMap, groups,
        partyLevel, partySize, difficulty,
        typePath, includedTypes, excludedTypes
      );
    } else {
      // Manual mode
      const counts = groups.map((_, i) =>
        Number(el.querySelector(`input[data-group-index="${i}"]`)?.value) || 0
      );
      drawn = EncounterSystem.drawMonsters(
        this.#index, this.#folderMap, groups, counts,
        typePath, includedTypes, excludedTypes
      );
    }

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
