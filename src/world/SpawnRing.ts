import Phaser from 'phaser';
import { TEX, TILE } from '../config/constants';
import type { Room } from './Room';

/** The ring geometry + telegraph presentation a spawner draws Wave members with.
 *  The Spawner rings tight around its own body; a Gauntlet rings wider around an
 *  authored anchor — same picking and markers, different radii (ADR 0011). */
export interface RingConfig {
  /** Nearest a member spawns to the anchor (px). */
  minRadius: number;
  /** Farthest a member spawns from the anchor (px). */
  maxRadius: number;
  /** Tries to find a wall-free point per member before giving up. */
  attempts: number;
  /** Warning hue for the incoming-spawn floor markers. */
  markColor: number;
  /** Marker depth: above floor/decals, below walls/entities (like a Trap). */
  markDepth: number;
}

/**
 * Shared ring picking + telegraph markers for the two ring-spawners — the
 * Spawner nest (ADR 0009, around itself) and the Gauntlet (ADR 0011, around an
 * authored anchor). Extracted so there is one implementation of "find a wall-free
 * ring point" and "pulse a floor reticle where a Wave member will appear", not
 * two that drift apart.
 *
 * It owns the live markers so a single `clearMarkers()` tears the whole telegraph
 * down; the caller owns *when* to telegraph, pop, and clear.
 */
export class SpawnRing {
  private readonly markers: Phaser.GameObjects.Image[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly room: Room,
    private readonly config: RingConfig,
  ) {}

  /** A wall-free point in the ring around (cx, cy), clamped to the Room, or null
   *  if none found within `attempts` (the caller skips that member). */
  pickPoint(cx: number, cy: number): { x: number; y: number } | null {
    for (let i = 0; i < this.config.attempts; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Phaser.Math.Between(this.config.minRadius, this.config.maxRadius);
      const x = Phaser.Math.Clamp(cx + Math.cos(angle) * dist, TILE * 1.5, this.room.widthPx - TILE * 1.5);
      const y = Phaser.Math.Clamp(cy + Math.sin(angle) * dist, TILE * 1.5, this.room.heightPx - TILE * 1.5);
      if (this.room.isSolidAt(x, y)) continue;
      return { x, y };
    }
    return null;
  }

  /** Raise a pulsing floor reticle where a Wave member is about to appear; it is
   *  tracked until `clearMarkers()`. `telegraphMs` sets the pulse period. */
  raiseMarker(x: number, y: number, telegraphMs: number): void {
    const mark = this.scene.add
      .image(x, y, TEX.spawnMark)
      .setTint(this.config.markColor)
      .setDepth(this.config.markDepth);
    this.scene.tweens.add({
      targets: mark,
      scale: { from: 0.7, to: 1.2 },
      alpha: { from: 0.4, to: 1 },
      duration: telegraphMs / 3,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    this.markers.push(mark);
  }

  /** Tear down every live marker (and its tween). Idempotent. */
  clearMarkers(): void {
    for (const m of this.markers) {
      this.scene.tweens.killTweensOf(m);
      m.destroy();
    }
    this.markers.length = 0;
  }
}
