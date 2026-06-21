import Phaser from 'phaser';

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

  /** Where to place the Player when this Room becomes active. */
  readonly spawn: Phaser.Math.Vector2;

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
}
