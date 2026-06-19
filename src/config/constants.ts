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
  dummy: 'dummy',
} as const;

/**
 * ── Sword combat tuning ───────────────────────────────────────────────────
 * Tweak these to dial in the melee feel, then re-run the dev server. All sword
 * timing and geometry lives here so nothing has to change in Player.ts.
 *
 * The combo: holding (or tapping) attack chains `comboLength` beats spaced by
 * `beatIntervalMs`. After the final beat there's a longer `comboCooldownMs`
 * recovery before the chain can restart. Pausing longer than `comboResetMs`
 * between beats drops the chain back to the first beat.
 */
export const SWORD = {
  /** Damage per combo beat. The array length also defines the combo length,
   *  so beat count and damage curve can never drift apart. */
  comboDamage: [2, 3, 5], //  beat 1 → 2, beat 2 → 3, beat 3 → 5
  knockback: 160, //     knockback impulse on hit (px/s)
  reach: 16, //          distance from Player centre to hitbox centre (px)
  radius: 9, //          hitbox circle radius (px)

  swingMs: 140, //       how long the hitbox stays active per beat (ms)
  beatIntervalMs: 280, //time between beats while chaining (the cadence, ms)
  comboCooldownMs: 650, //recovery after the final beat before restarting (ms)
  comboResetMs: 500, //  idle time between beats that resets the chain (ms)
} as const;
