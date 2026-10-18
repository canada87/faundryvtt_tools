import { SceneNavSystem } from "../SceneNavSystem.mjs";

const { DialogV2 } = foundry.applications.api;

/**
 * Dialogs shared by the Scene Navigator panel and the in-scene bar.
 */
export class SceneNavDialogs {

  /** Choose, create or remove the journal used as the scene's GM note. */
  static async editNote(scene) {
    if (!scene) return;
    const esc = Handlebars.escapeExpression;
    const loc = key => game.i18n.localize(key);
    const current = SceneNavSystem.getSceneNote(scene)?.journal ?? null;

    const options = game.journal.contents
      .slice()
      .sort(SceneNavSystem.sortByName)
      .map(j => `<option value="${j.id}" ${j.id === current?.id ? "selected" : ""}>${esc(j.name)}</option>`)
      .join("");

    const content = `
      <p>${game.i18n.format("SCENENAV.Note.DialogHint", { name: esc(scene.name) })}</p>
      <div class="form-group">
        <label>${loc("SCENENAV.Note.Journal")}</label>
        <select name="journal">
          <option value="">${loc("SCENENAV.Note.None")}</option>
          ${options}
        </select>
      </div>`;

    const buttons = [
      {
        action: "save",
        label: loc("SCENENAV.Save"),
        icon: "fas fa-save",
        default: true,
        callback: (event, button) => ({ action: "save", journalId: button.form.elements.journal.value })
      },
      {
        action: "create",
        label: loc("SCENENAV.Note.CreateNew"),
        icon: "fas fa-plus",
        callback: () => ({ action: "create" })
      }
    ];
    if (current) {
      buttons.unshift({
        action: "open",
        label: loc("SCENENAV.Note.Open"),
        icon: "fas fa-book-open",
        callback: () => ({ action: "open" })
      });
    }

    const result = await DialogV2.wait({
      window: { title: loc("SCENENAV.Note.Title"), icon: "fas fa-book" },
      content,
      buttons,
      rejectClose: false
    });
    if (!result || typeof result !== "object") return;

    if (result.action === "open") return SceneNavSystem.openSceneNote(scene);
    if (result.action === "create") {
      const journal = await SceneNavSystem.createSceneNote(scene);
      journal?.sheet.render(true);
      return;
    }
    if ((result.journalId || null) !== (current?.id ?? null)) {
      await SceneNavSystem.setSceneNote(scene, result.journalId);
    }
  }

  /** Open the note if the scene has one, otherwise ask which journal to use. */
  static async openOrEditNote(scene) {
    if (SceneNavSystem.getSceneNote(scene)) SceneNavSystem.openSceneNote(scene);
    else await this.editNote(scene);
  }

  /** Pick connected players and pull them to a scene. */
  static async pullPlayers(scene) {
    if (!scene) return;
    const esc = Handlebars.escapeExpression;
    const loc = key => game.i18n.localize(key);
    const players = SceneNavSystem.getPlayers();

    if (!players.length) {
      ui.notifications.info(loc("SCENENAV.Pull.NoPlayers"));
      return;
    }

    const rows = players.map(u => {
      const here = u.viewedScene === scene.id;
      const where = game.scenes.get(u.viewedScene)?.name ?? loc("SCENENAV.Pull.Nowhere");
      const character = u.character?.name ? ` <span class="scenenav-pull-char">(${esc(u.character.name)})</span>` : "";
      return `
        <label class="scenenav-pull-row ${here ? "is-here" : ""}">
          <input type="checkbox" name="user" value="${u.id}" ${here ? "disabled" : "checked"} />
          <span class="scenenav-pull-dot" style="background:${esc(String(u.color ?? "#999"))}"></span>
          <span class="scenenav-pull-name">${esc(u.name)}${character}</span>
          <span class="scenenav-pull-where">${here ? loc("SCENENAV.Pull.AlreadyHere") : esc(where)}</span>
        </label>`;
    }).join("");

    const content = `
      <p>${game.i18n.format("SCENENAV.Pull.DialogHint", { name: esc(scene.name) })}</p>
      <div class="scenenav-pull-list">${rows}</div>`;

    const userIds = await DialogV2.wait({
      window: { title: loc("SCENENAV.Pull.Title"), icon: "fas fa-users" },
      position: { width: 460 },
      content,
      rejectClose: false,
      buttons: [
        {
          action: "pull",
          label: loc("SCENENAV.Pull.Confirm"),
          icon: "fas fa-people-arrows",
          default: true,
          callback: (event, button) => [...button.form.querySelectorAll("input[name=user]:checked")].map(i => i.value)
        },
        { action: "cancel", label: loc("Cancel"), icon: "fas fa-times" }
      ]
    });
    if (!Array.isArray(userIds) || !userIds.length) return;

    SceneNavSystem.pullPlayers(scene.id, userIds);
    ui.notifications.info(game.i18n.format("SCENENAV.Pull.Done", { count: userIds.length, name: scene.name }));
  }
}
