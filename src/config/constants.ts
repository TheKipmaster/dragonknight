/** Core tuning constants. The classic Zelda look: 16px tiles, integer-zoomed. */

export const TILE = 16;

/** Internal render resolution in pixels (the camera viewport). ~20x15 tiles. */
export const VIEW_WIDTH = 320;
export const VIEW_HEIGHT = 240;

export const PLAYER_SPEED = 90;

/**
 * Logical texture keys. Entities reference these, never raw image paths, so
 * placeholder primitives can be swapped for real art without touching gameplay
 * code (see asset strategy decision).
 */
export const TEX = {
  player: 'player',
  wall: 'wall',
  floor: 'floor',
  heart: 'heart',
} as const;
