/** Core tuning constants. 16px tiles, integer-zoomed. */

export const TILE = 16;

/** Internal render resolution in pixels (the camera viewport). ~20x15 tiles. */
export const VIEW_WIDTH = 320;
export const VIEW_HEIGHT = 240;

/** Player movement and damage-response tuning. */
export const PLAYER = {
  speed: 90, //          movement speed (px/s)
  attackMoveFactor: 0.5,//movement speed multiplier while mid-swing (0..1)
  iframeMs: 1000, //     invulnerability after taking a hit (ms)
  knockbackMs: 220, //   how long movement is relinquished to knockback (ms)
} as const;

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
  walker: 'walker',
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
  knockback: 50, //     knockback impulse on hit (px/s)
  reach: 16, //          distance from Player centre to hitbox centre (px)
  radius: 11, //          hitbox circle radius (px)

  swingMs: 140, //       how long the hitbox stays active per beat (ms)
  beatIntervalMs: 280, //time between beats while chaining (the cadence, ms)
  comboCooldownMs: 650, //recovery after the final beat before restarting (ms)
  comboResetMs: 500, //  idle time between beats that resets the chain (ms)
} as const;

/** ── Walker enemy tuning ──────────────────────────────────────────────────
 *  The first enemy: walks straight at the Player and deals contact damage. */
export const ENEMY = {
  speed: 55, //          chase speed (px/s); slower than the Player (90)
  maxHp: 10, //           hit points; a full combo (2+3+5=10) over-kills it
  contactDamage: 1, //   half-Hearts removed per touch (1 = half a Heart)
  contactKnockback: 180,//impulse applied to the Player on contact (px/s)
  hurtMs: 180, //        stun/knockback window after being hit by the sword (ms)
} as const;

/** ── Spawner Switch tuning ────────────────────────────────────────────────
 *  A Switch that spawns one Walker every interval while the Player stands on
 *  it, at a random point in a ring around the Player. */
export const SPAWNER = {
  intervalMs: 3000, //   one spawn this often while pressed (first is immediate)
  minRadius: 64, //      nearest a Walker spawns to the Player (px) — react time
  maxRadius: 120, //     farthest a Walker spawns from the Player (px)
  attempts: 12, //       tries to find a wall-free spawn point before giving up
} as const;
