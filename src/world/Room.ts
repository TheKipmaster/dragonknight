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

  /** Static collision bodies (walls) for the active Room. */
  readonly walls: Phaser.Physics.Arcade.StaticGroup;

  /** Ensure assets are in memory. No-op in MVP (boot preloads everything). */
  load(): Promise<void>;

  /** Build the tilemap, spawn entities, bound the camera to Room size. */
  activate(): void;

  /** Despawn entities and release the live set; keep assets in memory. */
  deactivate(): void;

  /** Drop this Room's assets from memory. Unused in MVP. */
  destroy(): void;
}
