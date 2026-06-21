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
  charger: 'charger',
  key: 'key',
  tiles: 'tiles-stone', // shared dungeon tileset image (public/tiles/stone.png)
} as const;

/** Tileset name as authored in the Tiled maps; must match `addTilesetImage`. */
export const TILESET_NAME = 'stone';

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
  aggroRange: 120, //    dormant until the Player comes within this distance (px)
  maxHp: 10, //           hit points; a full combo (2+3+5=10) over-kills it
  contactDamage: 1, //   half-Hearts removed per touch (1 = half a Heart)
  contactKnockback: 180,//impulse applied to the Player on contact (px/s)
  hurtMs: 180, //        stun/knockback window after being hit by the sword (ms)
} as const;

/** ── Charger enemy tuning ─────────────────────────────────────────────────
 *  The telegraphed enemy: a lunging charger. It stalks the Player, then commits
 *  to a wind-up (the Telegraph) that locks a lunge lane toward the Player's
 *  position at that instant; after the wind-up it dashes down that lane. The
 *  wind-up is *committed* — striking it mid-wind-up or mid-lunge deals damage but
 *  can't shove or cancel it. The counterplay is to step out of the telegraphed
 *  lane and punish the vulnerable recovery.
 *
 *  Two damage profiles: a connecting lunge is the real threat; brushing the body
 *  passively (while it chases or recovers) only chips like a Walker touch. */
export const CHARGER = {
  maxHp: 30, //          hit points; tanky — three full combos (3×10=30) to fell it
  chaseSpeed: 45, //     stalk speed (px/s); slower than the Walker (55)
  aggroRange: 95, //    dormant until the Player comes within this distance (px)
  triggerRange: 70, //   distance to the Player that commits a wind-up (px)
  windupMs: 600, //      Telegraph duration — the Player's reaction window (ms)
  lungeSpeed: 260, //    dash speed during the strike (px/s)
  lungeMs: 260, //       dash duration (ms); distance ≈ speed×ms ≈ 68px (~4 tiles)
  recoverMs: 700, //     vulnerable whiff-recovery after a lunge (ms)
  hurtMs: 180, //        stagger window when struck OUTSIDE the commit (ms)
  lungeDamage: 2, //     half-Hearts on a connecting lunge (2 = a full Heart)
  lungeKnockback: 240, //impulse applied to the Player by a lunge (px/s)
  contactDamage: 1, //   passive body-contact half-Hearts (1 = half a Heart)
  contactKnockback: 160,//impulse applied to the Player by passive contact (px/s)
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
