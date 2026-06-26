/** Core tuning constants. 16px tiles, integer-zoomed. */

export const TILE = 16;

/** Internal render resolution in pixels (the camera viewport). ~20x15 tiles. */
export const VIEW_WIDTH = 320;
export const VIEW_HEIGHT = 240;

/**
 * Aggro wall gate (ADR 0007). An enemy wakes only when the Player is both within
 * its straight-line `aggroRange` *and* reachable by a routed path no longer than
 * this multiple of that straight line — so a Player on the far side of a wall
 * (path much longer than the line of sight, or none at all) won't wake it
 * through the wall. Generous enough to tolerate the flow field's clearance
 * weighting (paths bow off walls, reading a little long) and honest detours
 * around corners; tight enough to reject the other side of a thin wall.
 */
export const AGGRO_PATH_RATIO = 1.6;

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
  spawner: 'spawner', // stationary destroyable nest (ADR 0009)
  spawnMark: 'spawn-mark', // incoming-spawn telegraph reticle (tinted at runtime)
  key: 'key',
  splat: 'splat', //      death decal dropped where an enemy dies
  trap: 'trap', //        hidden magic-glyph hazard rune (tinted at runtime)
  tiles: 'tiles-stone', // shared dungeon tileset image (public/tiles/stone.png)
  knightPortrait: 'knight-portrait', // Dialogue bust for the player (public/portraits/knight.png)
} as const;

/**
 * Animation keys. Registered ONCE in PreloadScene.create() (animations are global,
 * not per-sprite), then played by entities via sprite.play(). Like TEX, entities
 * reference these logical keys, never frame indices — so re-authoring a
 * spritesheet's frame layout is a PreloadScene-only change, not a gameplay one.
 */
export const ANIM = {
  playerIdle: 'player-idle',
  playerWalk: 'player-walk',
  playerHurt: 'player-hurt',
  playerAttack: 'player-attack',
  walkerIdle: 'walker-idle',
  walkerWalk: 'walker-walk',
  walkerHurt: 'walker-hurt',
  chargerIdle: 'charger-idle',
  chargerWalk: 'charger-walk',
  chargerWindup: 'charger-windup',
  chargerHurt: 'charger-hurt',
  chargerLunge: 'charger-lunge',
} as const;

/**
 * Floor decals — purely decorative images dropped on a Room's floor.
 *
 * Each key is BOTH the texture key it's loaded under AND the name a `point`
 * object must carry in a map's `objects` layer to spawn it (the id-doubles-as-key
 * idiom, like ROOM_IDS). PreloadScene loads every entry; TiledRoom draws any
 * marker whose name is a key here. So adding a decal is: drop the PNG, add one
 * line below, place a same-named point marker in Tiled — no loader changes.
 */
export const DECALS: Record<string, string> = {
  pentagram: 'tiles/pentagram.png',
};

/** Depth for floor decals: above the floor layer (-10), below walls/entities (0). */
export const DECAL_DEPTH = -9;

/**
 * Death splats — the blood decal an enemy leaves where it dies. One procedural
 * texture (generated in PreloadScene) is reused for every splat; per-spawn
 * rotation and scale jitter keep them from looking stamped. Splats are
 * room-scoped: GameScene clears them on transition, so they accumulate within a
 * fight but never leak between Rooms.
 */
export const SPLAT = {
  color: 0x8a1f2a, //     blob fill (dark dried-blood red)
  radius: 6, //           base radius of the baked blob texture (px)
  blobs: 5, //            overlapping circles that make one irregular splat
  minScale: 0.7, //       per-spawn scale jitter range (multiplies radius)
  maxScale: 1.2,
  alpha: 0.85, //         decal opacity
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
  comboDamage: [2, 3, 5],
  knockback: 50, //     knockback impulse on hit (px/s)
  reach: 10, //          distance from Player centre to hitbox centre (px)
  radius: 17, //          hitbox circle radius (px)

  swingMs: 140, //       how long the hitbox stays active per beat (ms)
  beatIntervalMs: 280, //time between beats while chaining (the cadence, ms)
  comboCooldownMs: 650, //recovery after the final beat before restarting (ms)
  comboResetMs: 500, //  idle time between beats that resets the chain (ms)
} as const;

/** ── Dialogue box tuning ──────────────────────────────────────────────────
 *  The framed, screen-anchored text box (CONTEXT.md; ADR 0014). Always pauses
 *  Game while shown; rendered in the parallel UI scene. The advance key is owned
 *  by the UI scene (a paused Game can't poll keys) and is deliberately distinct
 *  from Space (attack). Text reveals as a two-stage typewriter: advance completes
 *  the current line's reveal, then advances to the next. Layout is in the 320×240
 *  internal resolution; the box hugs the bottom of the screen. */
export const DIALOGUE = {
  advanceKey: 'E', //    dedicated advance key (distinct from Space = attack)
  typeMs: 28, //         typewriter cadence: ms per revealed character
  marginX: 6, //         box inset from the screen's left/right edges (px)
  marginBottom: 6, //    box inset from the screen's bottom edge (px)
  height: 70, //         box height (px)
  padding: 6, //         inner padding (px)
  portraitSize: 46, //   Portrait slot side (px); text shifts right when shown
  nameLineH: 12, //      vertical room reserved for the speaker name line (px)
  bgColor: 0x10101a, //  box fill
  bgAlpha: 0.92,
  borderColor: 0xb9c4e0,// box outline
  nameColor: '#ffd34d', //speaker name (warm gold, matches the key label)
  textColor: '#e8ecf5', //body text
  fontSize: '9px',
  depth: 1000, //        above the HUD (hearts/keys draw at default depth)
} as const;

/** ── Monologue tuning ─────────────────────────────────────────────────────
 *  The Player thinking aloud (CONTEXT.md; ADR 0014): a transient line that
 *  floats above the Player, rises, and fades on a timer — the casual,
 *  *non-pausing* counterpart to the Dialogue box. No box, no Portrait, no input
 *  (it expires; it is not advanced). Modelled on the Door's "locked" cue. */
export const MONOLOGUE = {
  lifeMs: 5000, //       how long a line lingers before it has fully faded (ms)
  riseDist: 14, //       how far it drifts upward over its life (px)
  yOffset: 14, //        starting height above the Player's centre (px)
  maxWidth: 100, //      word-wrap width so a long line doesn't overflow (px)
  color: '#cdd6f4', //   soft off-white murmur (an inner voice, not UI gold)
  fontSize: '8px',
  depth: 30, //          above entities and the Player; like the "locked" cue
} as const;

/** ── Walker enemy tuning ──────────────────────────────────────────────────
 *  The first enemy: walks straight at the Player and deals contact damage. */
export const WALKER = {
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
  aggroRange: 160, //    dormant until the Player comes within this distance (px)
  triggerRange: 70, //   distance to the Player that commits a wind-up (px)
  windupMs: 900, //      Telegraph duration — the Player's reaction window (ms)
  lungeSpeed: 260, //    dash speed during the strike (px/s)
  lungeMs: 260, //       dash duration (ms); distance ≈ speed×ms ≈ 68px (~4 tiles)
  recoverMs: 700, //     vulnerable whiff-recovery after a lunge (ms)
  hurtMs: 180, //        stagger window when struck OUTSIDE the commit (ms)
  lungeDamage: 2, //     half-Hearts on a connecting lunge (2 = a full Heart)
  lungeKnockback: 240, //impulse applied to the Player by a lunge (px/s)
  contactDamage: 1, //   passive body-contact half-Hearts (1 = half a Heart)
  contactKnockback: 160,//impulse applied to the Player by passive contact (px/s)
} as const;

/** ── Trap tuning ──────────────────────────────────────────────────────────
 *  A hidden magic-glyph floor hazard (CONTEXT.md; ADR 0008). Invisible until an
 *  entity steps on it, then an instant flash + hit — no Telegraph. Damage is
 *  victim-aware: a survivable bite to the Player, lethal to an ordinary Enemy by
 *  default. It springs once for free, then stays revealed and re-arms on a
 *  cadence (lit = live, dimmed = spent). These are global defaults; a map's
 *  `trap` object overrides the gameplay numbers via Tiled props (see TiledRoom). */
export const TRAP = {
  // Gameplay — per-trap overridable in Tiled (camelCase property names).
  playerDamage: 4, //    half-Hearts removed from the Player (4 = 2 Hearts)
  enemyDamage: 999, //   HP removed from an Enemy — used only when lethal=false
  lethal: true, //       default: one-shot any Enemy regardless of its HP
  rearmMs: 2500, //      dormant window after springing before it re-arms (ms)
  knockback: 60, //      radial impulse shoving the victim off the glyph (px/s)

  // Footprint — inset within the 16px tile so clipping a corner won't spring it.
  triggerSize: 12, //    overlap zone side (px)

  // Presentation — placeholder rune; art pass later. State reads via opacity.
  glyphSize: 14, //      generated rune texture side (px)
  color: 0xb05cf0, //    arcane purple (the magic/charger family)
  litAlpha: 0.9, //      opacity while armed-and-revealed (reads as live)
  dimAlpha: 0.3, //      opacity while dormant/re-arming (reads as spent/safe)
  flashMs: 130, //       spring flash duration (ms)
  depth: -8, //          above floor/decals (-9/-10), below walls/entities (0+)
} as const;

/** ── Spawn-Switch tuning ──────────────────────────────────────────────────
 *  A Switch that spawns one Walker every interval while the Player stands on
 *  it, at a random point in a ring around the Player. Distinct from the SPAWNER
 *  entity below (ADR 0009): this is the Player-triggered Switch effect. */
export const SPAWN_SWITCH = {
  intervalMs: 3000, //   one spawn this often while pressed (first is immediate)
  minRadius: 64, //      nearest a Walker spawns to the Player (px) — react time
  maxRadius: 120, //     farthest a Walker spawns from the Player (px)
  attempts: 12, //       tries to find a wall-free spawn point before giving up
} as const;

/** ── Trapped-corridor lone-Walker trickle ─────────────────────────────────
 *  The trapped-corridor posts one Walker at a time at the corridor's *far* end
 *  (opposite the mouth the Player came in by), so the Player must walk it back
 *  through the traps. When it dies, a relief posts after a cooldown — one at a
 *  time, forever. Scripted in GameScene; the post is driven by TrickleSpawner. */
export const CORRIDOR = {
  walkerCooldownMs: 2000, // gap after a posted Walker dies before its relief posts
} as const;

/** ── Spawner entity tuning ────────────────────────────────────────────────
 *  A stationary, destroyable nest (CONTEXT.md; ADR 0009). Once the Player comes
 *  within `aggroRange` it telegraphs and conjures a Wave — a batch drawn at
 *  random from `waves` — at wall-free points in a tight ring around *itself*,
 *  then repeats on a `intervalMs` cadence (pop-to-pop). Each Wave is previewed
 *  for `telegraphMs` (the reaction window) before it appears. Cycles never
 *  overlap and skip while `maxLiveChildren` of its own spawn are still alive.
 *  Destroying its `maxHp` stops it for good; its already-spawned Enemies remain. */
export const SPAWNER = {
  maxHp: 45, //          hit points; ~4–5 full combos (10 dmg each) to fell it
  aggroRange: 150, //    dormant until the Player comes within this distance (px)
  intervalMs: 4000, //   cadence between Wave spawns, pop-to-pop (ms)
  telegraphMs: 850, //   lead/reaction window a Wave is previewed before it pops (ms)
  minRadius: 24, //      nearest a Wave member spawns to the Spawner (px) — tight
  maxRadius: 48, //      farthest a Wave member spawns from the Spawner (px)
  attempts: 12, //       tries to find a wall-free point per member before skipping
  maxLiveChildren: 6, // skip cycles while this many of its own spawn are alive

  /** Wave recipes; one is chosen at random each cycle. Each entry is a list of
   *  {kind, count} parts spawned together at their own telegraphed ring points. */
  waves: [
    [{ kind: 'walker', count: 3 }],
    [{ kind: 'charger', count: 1 }],
  ],

  // Presentation — incoming-spawn telegraph markers + the nest's death.
  markColor: 0xff5c5c, //warning hue for the floor markers (incoming spawn)
  markSize: 14, //       generated marker reticle texture side (px)
  markDepth: -8, //      above floor/decals, below walls/entities (like a Trap)
  deathMs: 200, //       crumble tween duration on destruction (ms)
} as const;

/** The Gauntlet (CONTEXT.md; ADR 0011): a Tripwire-triggered, deterministic
 *  sequence of Waves rung and telegraphed around an authored anchor (the firing
 *  Tripwire's region centre). Unlike the Spawner it has no body, isn't
 *  destroyable, picks no Wave at random, and ends — the Player fights *through*
 *  it. These are the shared knobs; each encounter's Wave list lives in its own
 *  recipe (e.g. SANCTUM_GAUNTLET). The ring is *wider* than the Spawner's tight
 *  nest ring: the Player is standing on the anchor when they trip it, so members
 *  must not materialise on top of them. */
export const GAUNTLET = {
  minRadius: 56, //      nearest a Wave member spawns to the anchor (px) — clear of the Player
  maxRadius: 96, //      farthest a Wave member spawns from the anchor (px)
  attempts: 16, //       tries to find a wall-free point per member before skipping
  telegraphMs: 900, //   lead/reaction window a Wave is previewed before it pops (ms)
  breatherMs: 600, //    pause after a Wave is cleared before the next telegraphs (clear-mode)
  spawnActive: true, //  Gauntlet Enemies wake on sight at once — a triggered arena fight
  markColor: 0xff5c5c, //warning hue for the floor markers (matches the Spawner's)
  markDepth: -8, //      above floor/decals, below walls/entities (like a Trap)
} as const;

/** The sanctum's boss-stand-in Gauntlet (ADR 0011), started by the `boss-fight`
 *  Tripwire. Deterministic: the same three Waves every run, each cleared before
 *  the next telegraphs (`advance: 'clear'`). Only the two MVP Enemy kinds exist;
 *  tune the composition freely. Timer pacing would read `advance: { afterMs: N }`. */
export const SANCTUM_GAUNTLET = {
  advance: 'clear',
  waves: [
    [{ kind: 'walker', count: 5 }],
    [{ kind: 'walker', count: 3 }, { kind: 'charger', count: 1 }],
    [{ kind: 'walker', count: 5 }, { kind: 'charger', count: 2 }],
  ],
} as const;
