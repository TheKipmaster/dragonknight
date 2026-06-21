import Phaser from 'phaser';

const IDLE_COLOR = 0x6b6b3a;
const PRESSED_COLOR = 0xffd34d;

/**
 * A floor Switch (CONTEXT.md): a trigger the Player activates by standing on it.
 * What it does is configurable via `onTick` — here it spawns enemies, but the
 * same component serves a door-opening Switch later. While pressed it fires
 * `onTick` immediately and then every `intervalMs`; it changes colour to show
 * its pressed state.
 */
export class Switch {
  readonly zone: Phaser.GameObjects.Rectangle;
  private pressed = false;
  private pressedThisFrame = false;
  private lastFireAt = Number.NEGATIVE_INFINITY;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly intervalMs: number,
    private readonly onTick: () => void,
  ) {
    this.zone = scene.add.rectangle(x, y, 14, 14, IDLE_COLOR).setDepth(-5);
    scene.physics.add.existing(this.zone, true); // static body for overlap
  }

  /** Call from the player-overlap callback on each frame contact occurs. */
  notifyOverlap(): void {
    this.pressedThisFrame = true;
  }

  /** Drive the press/release edge and the spawn cadence. Call once per frame. */
  update(now: number): void {
    if (this.pressedThisFrame) {
      if (!this.pressed) {
        this.pressed = true;
        this.zone.setFillStyle(PRESSED_COLOR);
        this.lastFireAt = Number.NEGATIVE_INFINITY; // fire immediately on step-on
      }
      if (now - this.lastFireAt >= this.intervalMs) {
        this.lastFireAt = now;
        this.onTick();
      }
    } else if (this.pressed) {
      this.pressed = false;
      this.zone.setFillStyle(IDLE_COLOR);
    }
    this.pressedThisFrame = false;
  }

  /** Release the Switch's zone (and its overlap body) on Room teardown. */
  destroy(): void {
    this.zone.destroy();
  }
}
