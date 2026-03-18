/**
 * Core logic for the Party Placer feature.
 * Handles retrieving player-assigned actors and spawning their tokens.
 */
export class PartySystem {

  /**
   * Get all actors assigned as character to non-GM users.
   * @returns {Array<{userId: string, userName: string, actorId: string, actorName: string, actorImg: string}>}
   */
  static getPlayerActors() {
    return game.users
      .filter(u => !u.isGM && u.character)
      .map(u => ({
        userId: u.id,
        userName: u.name,
        actorId: u.character.id,
        actorName: u.character.name,
        actorImg: u.character.img
      }));
  }

  /**
   * Spawn tokens for the given actor IDs around a position.
   * @param {string[]} actorIds   Actor IDs to place
   * @param {{x: number, y: number}} position  World-space click position
   */
  static async spawnParty(actorIds, position) {
    const tokenDataArray = [];
    const gridSize = canvas.grid.size;
    const radius = gridSize * 2;

    for (let i = 0; i < actorIds.length; i++) {
      const actor = game.actors.get(actorIds[i]);
      if (!actor) continue;

      // Spread tokens in a circle around the click point
      const angle = (i / actorIds.length) * 2 * Math.PI;
      const offsetX = Math.cos(angle) * radius;
      const offsetY = Math.sin(angle) * radius;
      const snapped = canvas.grid.getSnappedPosition(
        position.x + offsetX,
        position.y + offsetY,
        1
      );

      const tokenProto = await actor.getTokenDocument();
      tokenDataArray.push({
        ...tokenProto.toObject(),
        x: snapped.x,
        y: snapped.y
      });
    }

    if (tokenDataArray.length > 0) {
      await canvas.scene.createEmbeddedDocuments("Token", tokenDataArray);
    }

    return tokenDataArray.length;
  }
}
