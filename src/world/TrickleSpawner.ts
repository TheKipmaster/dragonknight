import Phaser from 'phaser';

/** Spawns one enemy at (x, y) and hands it back so the post can watch its life.
 *  Supplied by the scene, which owns the entity groups (mirrors Switch's onTick
 *  and the Spawner's SpawnFn). */
export type TrickleSpawnFn = (x: number, y: number) => Phaser.Physics.Arcade.Sprite;

/**
 * Keeps a single enemy posted at a fixed point: spawns one at once, and when it
 * dies waits `cooldownMs` before posting a relief — one at a time, indefinitely.
 *
 * The trapped-corridor uses it to feed lone Walkers in from the far end so the
 * player can bait them back across the flank traps (see GameScene). Distinct
 * from the map-authored Spawner nest (ADR 0009): no nest body to destroy, no
 * telegraph, no waves — an invisible post that trickles one creature at a time.
 */
export class TrickleSpawner {
  /** The currently posted enemy; undefined between death and the next relief. */
  private live?: Phaser.Physics.Arcade.Sprite;
  /** Scene-clock time the relief may post (set when the live one falls). */
  private reliefAt = 0;

  constructor(
    private readonly x: number,
    private readonly y: number,
    private readonly cooldownMs: number,
    private readonly spawn: TrickleSpawnFn,
  ) {}

  /** Drive the post; call once per frame with the scene clock (ms). */
  update(now: number): void {
    if (this.live?.active) return; // the posted enemy is still up
    if (this.live) {
      // It just fell (destroyed → inactive): start the cooldown to the relief.
      this.live = undefined;
      this.reliefAt = now + this.cooldownMs;
      return;
    }
    if (now < this.reliefAt) return; // cooling down before the relief posts
    this.live = this.spawn(this.x, this.y);
  }
}
