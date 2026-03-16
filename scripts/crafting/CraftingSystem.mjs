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
    const result = data.result || null;
    const recipe = {
      id: foundry.utils.randomID(),
      name: result?.name || "",
      img: result?.img || "icons/sundries/scrolls/scroll-plain.webp",
      description: data.description || "",
      components: data.components || [],
      result
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
   * Parse a "lv<N>" suffix from an item name.
   * Returns { baseName, level } or null if no level suffix is found.
   * E.g. "legno lv2" → { baseName: "legno", level: 2 }
   */
  static _parseLevel(name) {
    const match = name.match(/^(.+?)\s+lv(\d+)$/i);
    if (!match) return null;
    return { baseName: match[1].trim(), level: parseInt(match[2], 10) };
  }

  /**
   * Check if a candidate item can substitute for a required component.
   * A higher-level item (same base name, level >=) can replace a lower-level one.
   * Items without a level suffix require exact name match.
   */
  static _isCompatible(requiredName, candidateName) {
    if (requiredName === candidateName) return true;
    const req = this._parseLevel(requiredName);
    if (!req) return false;
    const cand = this._parseLevel(candidateName);
    if (!cand) return false;
    return cand.baseName === req.baseName && cand.level >= req.level;
  }

  /**
   * Count how many compatible items an actor owns for a given component name.
   * Higher-level variants of a leveled item are included.
   */
  static countItem(actor, itemName) {
    let total = 0;
    for (const item of actor.items) {
      if (this._isCompatible(itemName, item.name)) total += this.getItemQuantity(item);
    }
    return total;
  }

  /**
   * Check whether an actor can craft a given recipe.
   * Uses a greedy allocation algorithm: processes the most restrictive
   * components first (highest level) so that shared items are not double-counted.
   */
  static canCraft(actor, recipe) {
    if (!recipe?.components?.length || !recipe?.result) return false;

    // Build inventory snapshot: Map<itemName, availableQty>
    const inventory = new Map();
    for (const item of actor.items) {
      const qty = this.getItemQuantity(item);
      inventory.set(item.name, (inventory.get(item.name) ?? 0) + qty);
    }

    // Sort components by level descending (most restrictive first)
    const sorted = [...recipe.components].sort((a, b) => {
      const la = this._parseLevel(a.name)?.level ?? 0;
      const lb = this._parseLevel(b.name)?.level ?? 0;
      return lb - la;
    });

    // Simulate allocation
    for (const comp of sorted) {
      let needed = comp.quantity;
      // Compatible item names sorted by level ascending (consume cheapest first)
      const compatible = [...inventory.keys()]
        .filter(name => this._isCompatible(comp.name, name))
        .sort((a, b) => {
          const la = this._parseLevel(a)?.level ?? 0;
          const lb = this._parseLevel(b)?.level ?? 0;
          return la - lb;
        });

      for (const name of compatible) {
        if (needed <= 0) break;
        const available = inventory.get(name) ?? 0;
        const take = Math.min(available, needed);
        inventory.set(name, available - take);
        needed -= take;
      }

      if (needed > 0) return false;
    }

    return true;
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

    // Remove components (most restrictive first, matching canCraft allocation order)
    const sortedComponents = [...recipe.components].sort((a, b) => {
      const la = this._parseLevel(a.name)?.level ?? 0;
      const lb = this._parseLevel(b.name)?.level ?? 0;
      return lb - la;
    });
    for (const comp of sortedComponents) {
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

    // Get compatible items; sort by level ascending so lower-level items are consumed first
    const items = actor.items.filter(i => this._isCompatible(itemName, i.name));
    items.sort((a, b) => {
      const la = this._parseLevel(a.name)?.level ?? 0;
      const lb = this._parseLevel(b.name)?.level ?? 0;
      return la - lb;
    });
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
