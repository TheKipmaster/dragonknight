import Phaser from 'phaser';
import type { NavGrid } from '../components/FlowField';

/**
 * A door trigger: an overlap zone that, when the Player enters it, transitions
 * to `targetRoom` and places them at that room's `targetSpawn` (ADR 0001). The
 * zone is owned by the Room and destroyed on deactivate().
 *
 * A locked door carries a `lockId`; it only transitions once that lock is in
 * GameState.progress.doorsOpened (opened by spending a Key). Doors on both sides
 * of a doorway share a lockId, so opening it from one side opens it from both.
 */
export interface DoorTrigger {
  readonly zone: Phaser.GameObjects.Zone;
  readonly targetRoom: string;
  readonly targetSpawn: string;
  readonly lockId?: string;
}

/** A one-shot item to spawn when the Room activates (e.g. a Key). */
export interface ItemSpawn {
  /** Persistent id (`roomId#objectId`) so a collected item never respawns. */
  readonly id: string;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
}
export interface EnemySpawn {
  /** Persistent id (`roomId#objectId`) so a collected item never respawns. */
  readonly id: string;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
}

/**
 * A Trap to build when the Room activates (CONTEXT.md; ADR 0008). Carries its
 * resolved per-Trap config: the TRAP defaults, with any Tiled custom-property
 * overrides already applied by TiledRoom. The scene builds the live Trap.
 */
export interface TrapSpawn {
  /** Persistent id (`roomId#objectId`) so a sprung Trap rebuilds revealed. */
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** Half-Hearts removed from the Player. */
  readonly playerDamage: number;
  /** HP removed from an Enemy when not `lethal`. */
  readonly enemyDamage: number;
  /** Default: kill any Enemy outright regardless of HP. */
  readonly lethal: boolean;
  /** Dormant window before it re-arms (ms). */
  readonly rearmMs: number;
  /** Radial impulse shoving the victim off the glyph (px/s). */
  readonly knockback: number;
}

/**
 * A Spawner to build when the Room activates (CONTEXT.md; ADR 0009). Carries its
 * resolved per-Spawner config: the SPAWNER defaults, with any Tiled
 * custom-property overrides already applied by TiledRoom. The scene builds the
 * live Spawner (its wave recipes and ring geometry stay global in SPAWNER).
 */
export interface SpawnerSpawn {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** Hit points; destroying them stops it for good. */
  readonly maxHp: number;
  /** Dormant until the Player comes within this distance (px). */
  readonly aggroRange: number;
  /** Cadence between Wave spawns, pop-to-pop (ms). */
  readonly intervalMs: number;
  /** Lead/reaction window a Wave is previewed before it pops (ms). */
  readonly telegraphMs: number;
  /** Skip cycles while this many of its own spawn are alive. */
  readonly maxLiveChildren: number;
}

/**
 * The Room lifecycle seam (ADR 0001).
 *
 * Loading is split into two costs that stay separate: asset I/O (expensive,
 * done once at boot) and Room activation (cheap, done per transition). Keeping
 * these four phases explicit makes a future "preload adjacent Rooms"
 * optimisation a drop-in rather than a rewrite.
 */
export interface Room {
  readonly id: string;

  /** World-pixel dimensions of this Room (may exceed the viewport). */
  readonly widthPx: number;
  readonly heightPx: number;

  /** Default spawn (the `start` marker) for when no named spawn is requested. */
  readonly spawn: Phaser.Math.Vector2;

  /** Door triggers parsed from the map's object layer; valid while active. */
  readonly doors: readonly DoorTrigger[];

  /** Item spawns parsed from the map's object layer (e.g. Keys). */
  readonly items: readonly ItemSpawn[];

  /** Enemy spawns parsed from the map's object layer. */
  readonly enemies: readonly EnemySpawn[];

  /** Trap spawns parsed from the map's object layer (ADR 0008). */
  readonly traps: readonly TrapSpawn[];

  /** Spawner spawns parsed from the map's object layer (ADR 0009). */
  readonly spawners: readonly SpawnerSpawn[];

  /** Look up a named spawn marker (e.g. a door's targetSpawn). */
  spawnAt(name: string): Phaser.Math.Vector2 | undefined;

  /** Ensure assets are in memory. No-op in MVP (boot preloads everything). */
  load(): Promise<void>;

  /** Build the tilemap, spawn entities, bound the camera to Room size. */
  activate(): void;

  /** Despawn entities and release the live set; keep assets in memory. */
  deactivate(): void;

  /** Drop this Room's assets from memory. Unused in MVP. */
  destroy(): void;

  /**
   * Register physics colliders between a dynamic object (or Group) and this
   * Room's solid geometry. The scene hands its entities *down* to the Room so it
   * never has to know how collision is represented (a tile layer, a body group,
   * …) — only that the Room owns the walls. A collider against a Group also
   * covers members added later, so call once at setup.
   */
  addColliders(obj: Phaser.Types.Physics.Arcade.ArcadeColliderType): void;

  /** Is the given world-pixel point inside a solid tile? */
  isSolidAt(x: number, y: number): boolean;

  /**
   * Snapshot this Room's solid geometry as a grid for pathfinding (ADR 0005:
   * geometry grows the interface a method at a time). The Room produces the
   * grid rather than exposing its TilemapLayer, keeping the representation
   * private. Walls are static, so callers build this once per activation.
   */
  buildNavGrid(): NavGrid;
}
