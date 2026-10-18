import { MODULE_ID } from "../../shared/constants.mjs";
import { SceneNavSystem, DIRECTIONS } from "../SceneNavSystem.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM-only editor for the links of a single scene:
 * parent, children (sub-maps) and "continues" connections.
 */
export class SceneLinksEditor extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    classes: ["faundryvtt-tools", "scene-links-editor"],
    window: {
      icon: "fas fa-link",
      resizable: true
    },
    position: {
      width: 520,
      height: "auto"
    },
    actions: {
      addLink: SceneLinksEditor.#onAddLink,
      removeLink: SceneLinksEditor.#onRemoveLink
    }
  };

  static PARTS = {
    editor: {
      template: `modules/${MODULE_ID}/templates/scene-nav/scene-links-editor.hbs`
    }
  };

  constructor(options = {}) {
    super({ ...options, id: `faundryvtt-scene-links-${options.sceneId}` });
    this.sceneId = options.sceneId;
  }

  get scene() {
    return game.scenes.get(this.sceneId);
  }

  get title() {
    return game.i18n.format("SCENENAV.LinksTitle", { name: this.scene?.name ?? "" });
  }

  async _prepareContext() {
    const S = SceneNavSystem;
    const data = S.getData();
    const scene = this.scene;
    if (!scene) return { missing: true };

    const nameOf = id => game.scenes.get(id)?.name ?? "?";
    const dirLabel = d => d ? game.i18n.localize(`SCENENAV.Direction.${d}`) : "";

    const parentLink = S.getLinks(data).find(l => l.type === "child" && l.to === scene.id);
    const children = S.getChildLinks(scene.id, data)
      .map(l => ({ linkId: l.id, name: nameOf(l.to) }))
      .sort(S.sortByName);
    const continues = S.getContinuations(scene.id, data).map(c => ({
      linkId: c.link.id,
      name: nameOf(c.sceneId),
      direction: dirLabel(c.direction)
    }));

    const folderLabel = s => S.getFolderPath(S.getSceneFolderId(s.id, data), data).map(f => f.name).join(" › ");
    const targets = S.getScenes()
      .filter(s => s.id !== scene.id)
      .map(s => {
        const folder = folderLabel(s);
        return { id: s.id, label: folder ? `${s.name} (${folder})` : s.name };
      });

    return {
      scene: { id: scene.id, name: scene.name, thumb: scene.thumb },
      parent: parentLink ? { linkId: parentLink.id, name: nameOf(parentLink.from) } : null,
      children,
      continues,
      targets,
      directions: DIRECTIONS.map(d => ({ value: d, label: d ? dirLabel(d) : game.i18n.localize("SCENENAV.Direction.none") }))
    };
  }

  _onRender(context, options) {
    // Direction only makes sense for "continues" links
    const form = this.element.querySelector(".scenenav-links-add");
    if (!form) return;
    const typeSelect = form.querySelector("[name=type]");
    const dirSelect = form.querySelector("[name=direction]");
    const sync = () => { dirSelect.disabled = typeSelect.value !== "continues"; };
    typeSelect.addEventListener("change", sync);
    sync();
  }

  static async #onAddLink(event, target) {
    const form = target.closest(".scenenav-links-add");
    const type = form.querySelector("[name=type]").value;
    const targetId = form.querySelector("[name=target]").value;
    const direction = form.querySelector("[name=direction]").value;
    if (!targetId) return;

    let ok;
    if (type === "childOf") ok = await SceneNavSystem.setParent(this.sceneId, targetId);
    else if (type === "parentOf") ok = await SceneNavSystem.setParent(targetId, this.sceneId);
    else ok = await SceneNavSystem.addContinuation(this.sceneId, targetId, direction);

    if (ok === false) ui.notifications.warn(game.i18n.localize("SCENENAV.Warn.LinkCycle"));
  }

  static async #onRemoveLink(event, target) {
    await SceneNavSystem.removeLink(target.dataset.linkId);
  }
}
