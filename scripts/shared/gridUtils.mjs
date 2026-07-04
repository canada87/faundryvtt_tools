/**
 * Snap a canvas-space point to the scene grid, compatible across Foundry versions.
 * V12+ exposes `grid.getSnappedPoint({x,y}, {mode, resolution})`; older versions only
 * had `grid.getSnappedPosition(x, y, interval)`, which V14 removed entirely.
 * @param {number} x
 * @param {number} y
 * @returns {{x: number, y: number}}
 */
export function snapToGrid(x, y) {
  const grid = canvas.grid;
  if (typeof grid.getSnappedPoint === "function") {
    const mode = CONST.GRID_SNAPPING_MODES?.CENTER ?? 1;
    return grid.getSnappedPoint({ x, y }, { mode, resolution: 1 });
  }
  return grid.getSnappedPosition(x, y, 1);
}
