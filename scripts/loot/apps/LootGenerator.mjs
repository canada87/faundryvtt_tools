import { MODULE_ID } from "../../shared/constants.mjs";
import { LootSystem } from "../LootSystem.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Main loot generator window.
 * Shows configured loot groups with item counts, a difficulty selector for gold.
 * On generate: closes the window, waits for a map click, spawns a treasure token,
 * and fills it with loot items and gold.
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

    // Find the template actor
    const actorName = game.settings.get(MODULE_ID, "lootActorName");
    const templateActor = game.actors.getName(actorName);
    if (!templateActor) {
      ui.notifications.error(
        game.i18n.format("LOOT.Error.ActorNotFound", { name: actorName })
      );
      return;
    }

    // Capture references before closing
    const pack = this.#pack;
    const index = this.#index;
    const folderMap = this.#folderMap;

    this.close();
    ui.notifications.info(game.i18n.localize("LOOT.Info.ClickMap"));

    // Wait for a canvas click, then spawn and fill
    const handleClick = async (event) => {
      canvas.stage.off("mousedown", handleClick);
      const pos = event.data.getLocalPosition(canvas.stage);

      const tokenActor = await LootSystem.spawnTreasureToken(templateActor, pos);
      if (tokenActor) {
        await LootSystem.generate(pack, index, folderMap, tokenActor, counts, diffIndex);
      }
    };

    canvas.stage.on("mousedown", handleClick);
  }
}
