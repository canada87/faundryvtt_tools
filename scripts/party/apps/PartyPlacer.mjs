import { MODULE_ID } from "../../shared/constants.mjs";
import { PartySystem } from "../PartySystem.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM window for selecting player actors and placing them on the map.
 */
export class PartyPlacer extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "party-placer",
    classes: ["party", "party-placer"],
    window: {
      title: "PARTY.PlacerTitle",
      icon: "fas fa-users",
      resizable: true
    },
    position: {
      width: 380,
      height: "auto"
    },
    actions: {
      place: PartyPlacer.#onPlace,
      selectAll: PartyPlacer.#onSelectAll,
      selectNone: PartyPlacer.#onSelectNone
    }
  };

  static PARTS = {
    placer: {
      template: `modules/${MODULE_ID}/templates/party/party-placer.hbs`
    }
  };

  /* ---------------------------------------- */
  /*  Context                                  */
  /* ---------------------------------------- */

  async _prepareContext(options) {
    const actors = PartySystem.getPlayerActors();
    return {
      actors,
      hasActors: actors.length > 0
    };
  }

  /* ---------------------------------------- */
  /*  Actions                                  */
  /* ---------------------------------------- */

  static #onSelectAll() {
    this.element.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
  }

  static #onSelectNone() {
    this.element.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  }

  static async #onPlace() {
    const el = this.element;

    // Collect selected actor IDs
    const selected = [...el.querySelectorAll('input[type="checkbox"]:checked')]
      .map(cb => cb.dataset.actorId);

    if (selected.length === 0) {
      ui.notifications.warn(game.i18n.localize("PARTY.Warn.NoneSelected"));
      return;
    }

    this.close();
    ui.notifications.info(game.i18n.localize("PARTY.Info.ClickMap"));

    const handleClick = async (event) => {
      canvas.stage.off("mousedown", handleClick);
      const pos = event.data.getLocalPosition(canvas.stage);
      const count = await PartySystem.spawnParty(selected, pos);
      ui.notifications.info(
        game.i18n.format("PARTY.Info.Placed", { count })
      );
    };

    canvas.stage.on("mousedown", handleClick);
  }
}
