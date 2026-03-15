import { MODULE_ID } from "../shared/constants.mjs";

/**
 * Core crafting system logic.
 * Manages recipes, inventory checks, and the craft operation.
 */
export class CraftingSystem {

  /* ---------------------------------------- */
  /*  Recipe CRUD (world setting, GM-only)    */
  /* ---------------------------------------- */

  static getRecipes() {
    return game.settings.get(MODULE_ID, "craftingRecipes") ?? [];
  }

  static async saveRecipes(recipes) {
    await game.settings.set(MODULE_ID, "craftingRecipes", recipes);
  }

  static async addRecipe(data) {
    const recipes = this.getRecipes();
    const recipe = {
      id: foundry.utils.randomID(),
      name: data.name || "",
      img: data.img || "icons/sundries/scrolls/scroll-plain.webp",
      description: data.description || "",
      components: data.components || [],
      result: data.result || null
    };
    recipes.push(recipe);
    await this.saveRecipes(recipes);
    return recipe;
  }

  static async updateRecipe(id, data) {
    const recipes = this.getRecipes();
    const idx = recipes.findIndex(r => r.id === id);
    if (idx === -1) return null;
    foundry.utils.mergeObject(recipes[idx], data, { overwrite: true });
    await this.saveRecipes(recipes);
    return recipes[idx];
  }

  static async deleteRecipe(id) {
    const recipes = this.getRecipes().filter(r => r.id !== id);
    await this.saveRecipes(recipes);
  }

  /* ---------------------------------------- */
  /*  Per-actor recipe assignments (flags)    */
  /* ---------------------------------------- */

  static getActorRecipeIds(actor) {
    return actor.getFlag(MODULE_ID, "crafting.recipes") ?? [];
  }

  static getActorRecipes(actor) {
    const knownIds = this.getActorRecipeIds(actor);
    const all = this.getRecipes();
    return all.filter(r => knownIds.includes(r.id));
  }

  static async assignRecipe(actor, recipeId) {
    const known = this.getActorRecipeIds(actor);
    if (!known.includes(recipeId)) {
      known.push(recipeId);
      await actor.setFlag(MODULE_ID, "crafting.recipes", known);
    }
  }

  static async unassignRecipe(actor, recipeId) {
    const known = this.getActorRecipeIds(actor).filter(id => id !== recipeId);
    await actor.setFlag(MODULE_ID, "crafting.recipes", known);
  }

  /* ---------------------------------------- */
  /*  Inventory helpers (system-agnostic)     */
  /* ---------------------------------------- */

  /**
   * Read the quantity of an owned item.
   * Handles dnd5e-style `system.quantity` (Number) and
   * pf2e-style `system.quantity.value` (Number).
   * Falls back to 1 if no quantity field is found.
   */
  static getItemQuantity(item) {
    const qty = item.system?.quantity;
    if (typeof qty === "number") return qty;
    if (typeof qty === "object" && qty !== null && typeof qty.value === "number") return qty.value;
    return 1;
  }

  /**
   * Count how many of a given item (by name) an actor owns.
   */
  static countItem(actor, itemName) {
    let total = 0;
    for (const item of actor.items) {
      if (item.name === itemName) total += this.getItemQuantity(item);
    }
    return total;
  }

  /**
   * Check whether an actor can craft a given recipe.
   */
  static canCraft(actor, recipe) {
    if (!recipe?.components?.length || !recipe?.result) return false;
    return recipe.components.every(c => this.countItem(actor, c.name) >= c.quantity);
  }

  /* ---------------------------------------- */
  /*  Craft execution                         */
  /* ---------------------------------------- */

  static async craft(actor, recipeId) {
    const recipe = this.getRecipes().find(r => r.id === recipeId);
    if (!recipe) {
      ui.notifications.error(game.i18n.localize("CRAFTING.Error.RecipeNotFound"));
      return false;
    }

    if (!this.canCraft(actor, recipe)) {
      ui.notifications.warn(game.i18n.localize("CRAFTING.Warn.MissingComponents"));
      return false;
    }

    // Remove components
    for (const comp of recipe.components) {
      const ok = await this._removeItems(actor, comp.name, comp.quantity);
      if (!ok) {
        ui.notifications.error(game.i18n.format("CRAFTING.Error.RemoveFailed", { item: comp.name }));
        return false;
      }
    }

    // Add result
    const ok = await this._addItem(actor, recipe.result);
    if (!ok) {
      ui.notifications.error(game.i18n.localize("CRAFTING.Error.CreateFailed"));
      return false;
    }

    ui.notifications.info(game.i18n.format("CRAFTING.Info.CraftSuccess", { item: recipe.result.name }));

    // Chat message
    await ChatMessage.create({
      content: `<div class="crafting-chat">
        <h3>${game.i18n.localize("CRAFTING.CraftingComplete")}</h3>
        <p><strong>${actor.name}</strong> ${game.i18n.format("CRAFTING.Chat.Crafted", { item: recipe.result.name })}</p>
        <img src="${recipe.result.img}" width="48" height="48" />
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor })
    });

    return true;
  }

  /* ---------------------------------------- */
  /*  Private helpers                         */
  /* ---------------------------------------- */

  static async _removeItems(actor, itemName, quantity) {
    let remaining = quantity;
    const toDelete = [];
    const toUpdate = [];

    const items = actor.items.filter(i => i.name === itemName);
    for (const item of items) {
      if (remaining <= 0) break;
      const qty = this.getItemQuantity(item);

      if (qty <= remaining) {
        toDelete.push(item.id);
        remaining -= qty;
      } else {
        const newQty = qty - remaining;
        if (typeof item.system?.quantity === "number") {
          toUpdate.push({ _id: item.id, "system.quantity": newQty });
        } else if (typeof item.system?.quantity?.value === "number") {
          toUpdate.push({ _id: item.id, "system.quantity.value": newQty });
        }
        remaining = 0;
      }
    }

    if (remaining > 0) return false;
    if (toUpdate.length) await actor.updateEmbeddedDocuments("Item", toUpdate);
    if (toDelete.length) await actor.deleteEmbeddedDocuments("Item", toDelete);
    return true;
  }

  static async _addItem(actor, resultData) {
    try {
      const sourceItem = await fromUuid(resultData.uuid);
      if (!sourceItem) {
        ui.notifications.error(game.i18n.format("CRAFTING.Error.ItemNotFound", { uuid: resultData.uuid }));
        return false;
      }

      const itemData = sourceItem.toObject();
      const qty = resultData.quantity || 1;

      // Set quantity if the system supports it
      if (typeof itemData.system?.quantity === "number") {
        itemData.system.quantity = qty;
      } else if (typeof itemData.system?.quantity?.value === "number") {
        itemData.system.quantity.value = qty;
      }

      await actor.createEmbeddedDocuments("Item", [itemData]);
      return true;
    } catch (err) {
      console.error("Faundryvtt Tools | Crafting: Failed to add result item:", err);
      return false;
    }
  }
}
