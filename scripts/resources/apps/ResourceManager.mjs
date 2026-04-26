import { MODULE_ID } from "../../shared/constants.mjs";
import { ResourceSystem } from "../ResourceSystem.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM-only manager for on-screen Resources.
 */
export class ResourceManager extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "faundryvtt-resource-manager",
    classes: ["faundryvtt-tools", "resource-manager"],
    window: {
      icon: "fas fa-list-ol",
      title: "RESOURCES.ManagerTitle"
    },
    position: {
      width: 560,
      height: "auto"
    },
    actions: {
      addResource: ResourceManager.#onAddResource,
      deleteResource: ResourceManager.#onDeleteResource,
      decrement: ResourceManager.#onDecrement,
      increment: ResourceManager.#onIncrement,
      toggleVisible: ResourceManager.#onToggleVisible,
      toggleActive: ResourceManager.#onToggleActive
    }
  };

  static PARTS = {
    manager: {
      template: `modules/${MODULE_ID}/templates/resources/resource-manager.hbs`
    }
  };

  async _prepareContext() {
    return {
      resources: ResourceSystem.getResources()
    };
  }

  /** Re-render the manager whenever the resources setting changes. */
  _onRender(context, options) {
    const root = this.element;
    if (!root) return;

    root.querySelectorAll("input[data-field]").forEach(input => {
      input.addEventListener("change", async (ev) => {
        const id = ev.currentTarget.dataset.resourceId;
        const field = ev.currentTarget.dataset.field;
        let value = ev.currentTarget.value;
        if (field === "value") value = Number(value) || 0;
        await ResourceSystem.updateResource(id, { [field]: value });
      });
    });
  }

  /* ---- Actions ---- */

  static async #onAddResource() {
    await ResourceSystem.createResource();
  }

  static async #onDeleteResource(event, target) {
    const id = target.dataset.resourceId;
    const resource = ResourceSystem.getResource(id);
    if (!resource) return;
    const confirmed = await Dialog.confirm({
      title: game.i18n.localize("RESOURCES.DeleteResource"),
      content: `<p>${game.i18n.format("RESOURCES.Confirm.Delete", { name: resource.label })}</p>`
    });
    if (!confirmed) return;
    await ResourceSystem.deleteResource(id);
  }

  static async #onDecrement(event, target) {
    await ResourceSystem.adjustValue(target.dataset.resourceId, -1);
  }

  static async #onIncrement(event, target) {
    await ResourceSystem.adjustValue(target.dataset.resourceId, +1);
  }

  static async #onToggleVisible(event, target) {
    const id = target.dataset.resourceId;
    const resource = ResourceSystem.getResource(id);
    if (!resource) return;
    await ResourceSystem.updateResource(id, { visibleToPlayers: !resource.visibleToPlayers });
  }

  static async #onToggleActive(event, target) {
    const id = target.dataset.resourceId;
    const resource = ResourceSystem.getResource(id);
    if (!resource) return;
    await ResourceSystem.updateResource(id, { active: !resource.active });
  }
}
