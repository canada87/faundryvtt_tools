import { NotebookSystem } from "./NotebookSystem.mjs";
import { NotebookApp } from "./apps/NotebookApp.mjs";

/**
 * GM button in the Token HUD that adds the token's creature to the
 * bestiary (name and image taken from its actor) and opens it.
 */
export class TokenHudNotebook {

  /**
   * Hook callback for `renderTokenHUD`.
   * @param {TokenHUD} hud
   * @param {HTMLElement} html
   */
  static onRender(hud, html) {
    if (!game.user.isGM) return;
    const token = hud.object;
    if (!token?.actor) return;

    const column = html.querySelector(".col.left");
    if (!column) return;

    const known = NotebookSystem.getCreatures().some(c => c.actorUuid && c.actorUuid === TokenHudNotebook.#baseUuid(token));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "control-icon fvtt-notebook-hud";
    if (known) button.classList.add("active");
    button.dataset.tooltip = game.i18n.localize(known ? "NOTEBOOK.Bestiary.HudOpen" : "NOTEBOOK.Bestiary.HudAdd");
    button.innerHTML = `<i class="fas fa-dragon"></i>`;
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const creature = await NotebookSystem.addFromActor(token.actor, token.document);
      if (creature) NotebookApp.open({ tab: "bestiary", creatureId: creature.id });
    });
    column.append(button);
  }

  static #baseUuid(token) {
    const actorId = token.document.actorId;
    return (actorId && game.actors.get(actorId)?.uuid) || token.actor.uuid;
  }
}
