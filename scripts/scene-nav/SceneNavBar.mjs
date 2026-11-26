import { MODULE_ID } from "../shared/constants.mjs";
import { SceneNavSystem } from "./SceneNavSystem.mjs";
import { SceneNavigator } from "./apps/SceneNavigator.mjs";
import { SceneNavDialogs } from "./apps/SceneNavDialogs.mjs";

/**
 * GM-only bar fixed at the top of the screen for the viewed scene:
 * the parent chain as a breadcrumb, sub-maps and adjacent maps as
 * quick-jump chips (click: view, Shift+click: activate), the scene's
 * GM note, the players currently here and a button to pull players here.
 */
export class SceneNavBar {

  static #containerId = "faundryvtt-scenenav-bar";

  /** Cast panel open under the bar. */
  static #castOpen = false;

  /** A cast chip is being dragged: dropping it back on the bar must not assign it. */
  static #dragging = false;

  static getContainer() {
    let el = document.getElementById(this.#containerId);
    if (!el) {
      el = document.createElement("div");
      el.id = this.#containerId;
      el.className = "faundryvtt-scenenav-bar";
      el.addEventListener("click", ev => this.#onClick(ev));
      // Right-click on the note changes which journal it uses
      el.addEventListener("contextmenu", ev => {
        if (!ev.target.closest("[data-bar-action=note]")) return;
        ev.preventDefault();
        SceneNavDialogs.editNote(canvas.scene);
      });
      // Cast chips drag onto the canvas as standard Actor data: Foundry creates the token
      el.addEventListener("dragstart", ev => {
        const chip = ev.target.closest?.(".scenenav-cast-actor[data-uuid]");
        if (!chip) return;
        this.#dragging = true;
        ev.dataTransfer.setData("text/plain", JSON.stringify({ type: "Actor", uuid: chip.dataset.uuid }));
      });
      el.addEventListener("dragend", () => { this.#dragging = false; });
      // Actors dropped on the bar (e.g. from the Actors sidebar) are assigned to the scene
      el.addEventListener("dragover", ev => ev.preventDefault());
      el.addEventListener("drop", ev => this.#onDrop(ev));
      document.body.appendChild(el);
    }
    return el;
  }

  static render() {
    if (!game.user.isGM) return;
    const container = this.getContainer();
    const scene = canvas?.scene;
    const S = SceneNavSystem;
    const data = S.getData();

    const ancestors = scene ? S.getAncestorIds(scene.id, data).reverse() : [];
    const children = scene ? S.getChildLinks(scene.id, data).map(l => l.to) : [];
    const continues = scene ? S.getContinuations(scene.id, data) : [];

    if (!scene) {
      container.innerHTML = "";
      container.style.display = "none";
      return;
    }

    const esc = Handlebars.escapeExpression;
    const loc = key => game.i18n.localize(key);
    const nameOf = id => esc(game.scenes.get(id)?.name ?? "?");
    const sceneLink = (id, cls, icon, label) =>
      `<a class="scenenav-bar-link ${cls}" data-scene-id="${id}">${icon ? `<i class="${icon}"></i> ` : ""}${label}</a>`;

    container.style.display = "flex";

    if (game.settings.get(MODULE_ID, "scenesNavBarCollapsed")) {
      container.classList.add("is-collapsed");
      container.innerHTML = `<button type="button" class="scenenav-bar-btn" data-bar-action="expand" data-tooltip="${loc("SCENENAV.Bar.Expand")}"><i class="fas fa-sitemap"></i></button>`;
      return;
    }
    container.classList.remove("is-collapsed");

    const crumbs = [
      ...ancestors.map(id => sceneLink(id, "is-ancestor", "", nameOf(id))),
      `<span class="scenenav-bar-current">${esc(scene.name)}</span>`
    ].join(`<span class="scenenav-bar-sep">›</span>`);

    const childLinks = children
      .map(id => ({ id, name: game.scenes.get(id)?.name ?? "" }))
      .sort(S.sortByName)
      .map(c => sceneLink(c.id, "is-child", "fas fa-level-down-alt", esc(c.name)))
      .join("");

    const continueLinks = continues.map(c => {
      const dir = c.direction ? `<b>${esc(loc(`SCENENAV.Direction.${c.direction}`))}</b> ` : "";
      return sceneLink(c.sceneId, "is-continues", "fas fa-arrow-right", `${dir}${nameOf(c.sceneId)}`);
    }).join("");

    const note = S.getSceneNote(scene);
    const noteHtml = note
      ? `<a class="scenenav-bar-note" data-bar-action="note"
            data-tooltip="${esc(`${S.getNotePreview(scene) || loc("SCENENAV.Note.Open")} — ${loc("SCENENAV.Bar.NoteHint")}`)}">
           <i class="fas fa-book-open"></i> ${esc(note.journal.name)}
         </a>`
      : `<button type="button" class="scenenav-bar-btn" data-bar-action="editNote" data-tooltip="${loc("SCENENAV.Note.Title")}"><i class="fas fa-book"></i></button>`;

    const here = S.getPlayersByScene().get(scene.id) ?? [];
    const playersHtml = here.length
      ? `<span class="scenenav-bar-players" data-tooltip="${esc(here.map(p => p.name).join(", "))}">
           ${here.map(p => `<span class="scenenav-bar-player" style="--player-color:${esc(p.color)}"></span>`).join("")}
           ${here.length}
         </span>`
      : "";

    const cast = S.getSceneCast(scene, data);
    const castBtn = `<button type="button" class="scenenav-bar-btn scenenav-bar-cast-btn ${this.#castOpen ? "is-open" : ""}"
        data-bar-action="cast" data-tooltip="${loc("SCENENAV.Cast.BarHint")}">
        <i class="fas fa-users"></i>${cast.length ? `<span class="scenenav-bar-cast-count">${cast.length}</span>` : ""}
      </button>`;

    container.innerHTML = `
      <button type="button" class="scenenav-bar-btn" data-bar-action="open" data-tooltip="${loc("SCENENAV.Toggle")}"><i class="fas fa-map"></i></button>
      ${ancestors.length ? `<button type="button" class="scenenav-bar-btn" data-bar-action="up" data-tooltip="${loc("SCENENAV.Bar.Up")}"><i class="fas fa-level-up-alt"></i></button>` : ""}
      <div class="scenenav-bar-crumbs" data-tooltip="${loc("SCENENAV.Bar.Hint")}">${crumbs}</div>
      ${childLinks ? `<div class="scenenav-bar-group" data-tooltip="${loc("SCENENAV.Bar.Hint")}">${childLinks}</div>` : ""}
      ${continueLinks ? `<div class="scenenav-bar-group" data-tooltip="${loc("SCENENAV.Bar.Hint")}">${continueLinks}</div>` : ""}
      <div class="scenenav-bar-group">
        ${noteHtml}
        ${playersHtml}
        <button type="button" class="scenenav-bar-btn" data-bar-action="pull" data-tooltip="${loc("SCENENAV.Pull.Title")}"><i class="fas fa-people-arrows"></i></button>
        ${castBtn}
      </div>
      <button type="button" class="scenenav-bar-btn" data-bar-action="collapse" data-tooltip="${loc("SCENENAV.Bar.Collapse")}"><i class="fas fa-chevron-up"></i></button>
      ${this.#castOpen ? this.#renderCastPanel(scene, cast, data) : ""}
    `;
  }

  /** Cast panel: assigned actors, then actors on the map that are not assigned. */
  static #renderCastPanel(scene, cast, data) {
    const S = SceneNavSystem;
    const esc = Handlebars.escapeExpression;
    const loc = key => game.i18n.localize(key);

    const chip = c => {
      const others = S.getActorScenes(c.id, data).filter(e => e.scene.id !== scene.id).map(e => e.scene.name);
      const tip = [
        c.name,
        c.count ? game.i18n.format("SCENENAV.Cast.OnMapCount", { count: c.count }) : loc("SCENENAV.Cast.OffMap"),
        others.length ? `${loc("SCENENAV.Cast.AlsoIn")}: ${others.join(", ")}` : ""
      ].filter(Boolean).join(" — ");
      const action = c.assigned ? "unassign" : "assign";
      return `<div class="scenenav-cast-actor ${c.count ? "is-present" : "is-offmap"} ${c.hostile ? "is-hostile" : ""}"
          draggable="true" data-actor-id="${c.id}" data-uuid="${esc(c.uuid)}" data-tooltip="${esc(tip)}">
          <img src="${esc(c.img)}" alt="" draggable="false" />
          <span class="scenenav-cast-name">${esc(c.name)}</span>
          ${c.count > 1 ? `<span class="scenenav-cast-count">×${c.count}</span>` : ""}
          <button type="button" class="scenenav-bar-btn" data-bar-action="${action}"
            data-tooltip="${loc(c.assigned ? "SCENENAV.Cast.Unassign" : "SCENENAV.Cast.Assign")}">
            <i class="fas ${c.assigned ? "fa-times" : "fa-thumbtack"}"></i>
          </button>
        </div>`;
    };

    const section = (title, items) => items.length
      ? `<div class="scenenav-cast-section">
           <h4>${title} <span class="scenenav-cast-total">${items.length}</span></h4>
           <div class="scenenav-cast-list">${items.map(chip).join("")}</div>
         </div>`
      : "";

    return `<div class="scenenav-bar-cast">
      ${section(loc("SCENENAV.Cast.Assigned"), cast.filter(c => c.assigned))}
      ${section(loc("SCENENAV.Cast.OnMap"), cast.filter(c => !c.assigned))}
      <p class="scenenav-cast-hint">${loc(cast.length ? "SCENENAV.Cast.DragHint" : "SCENENAV.Cast.Empty")}</p>
    </div>`;
  }

  /** Assign an Actor dropped on the bar to the viewed scene. */
  static async #onDrop(event) {
    if (this.#dragging) return;
    let payload;
    try {
      payload = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }
    if (payload?.type !== "Actor" || !payload.uuid || !canvas.scene) return;
    event.preventDefault();
    const actor = await fromUuid(payload.uuid);
    if (!actor) return;
    if (actor.pack) return ui.notifications.warn(game.i18n.localize("SCENENAV.Cast.NoCompendium"));
    this.#castOpen = true;
    if (!await SceneNavSystem.assignActor(canvas.scene.id, actor.id)) this.render();
  }

  static async #onClick(event) {
    const actionEl = event.target.closest("[data-bar-action]");
    if (actionEl) {
      switch (actionEl.dataset.barAction) {
        case "open": return SceneNavigator.toggle();
        case "note": return SceneNavSystem.openSceneNote(canvas.scene);
        case "editNote": return SceneNavDialogs.editNote(canvas.scene);
        case "pull": return SceneNavDialogs.pullPlayers(canvas.scene);
        case "collapse": return this.#setCollapsed(true);
        case "expand": return this.#setCollapsed(false);
        case "cast":
          this.#castOpen = !this.#castOpen;
          return this.render();
        case "assign":
        case "unassign": {
          const actorId = actionEl.closest("[data-actor-id]")?.dataset.actorId;
          if (!actorId || !canvas.scene) return;
          return actionEl.dataset.barAction === "assign"
            ? SceneNavSystem.assignActor(canvas.scene.id, actorId)
            : SceneNavSystem.unassignActor(canvas.scene.id, actorId);
        }
        case "up": {
          const parentId = SceneNavSystem.getParentId(canvas.scene?.id);
          if (parentId) return this.#goTo(parentId, event.shiftKey);
        }
      }
      return;
    }
    const link = event.target.closest(".scenenav-bar-link[data-scene-id]");
    if (link) return this.#goTo(link.dataset.sceneId, event.shiftKey);
    const castActor = event.target.closest(".scenenav-cast-actor[data-actor-id]");
    if (castActor) game.actors.get(castActor.dataset.actorId)?.sheet.render(true);
  }

  static async #setCollapsed(collapsed) {
    await game.settings.set(MODULE_ID, "scenesNavBarCollapsed", collapsed);
    this.render();
  }

  /** View a scene, or activate it (bringing the players) with Shift. */
  static async #goTo(sceneId, activate) {
    const scene = game.scenes.get(sceneId);
    if (!scene) return;
    try {
      if (activate) await scene.activate();
      else await scene.view();
    } catch (err) {
      console.error("Faundryvtt Tools | Scene Navigator", err);
      ui.notifications.error(game.i18n.format("SCENENAV.Error.SceneAction", { name: scene.name }));
    }
  }
}
