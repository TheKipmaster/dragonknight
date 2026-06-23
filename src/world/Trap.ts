import Phaser from 'phaser';
import { TEX, TRAP } from '../config/constants';
import { isDamageable } from '../combat/Attack';

/** The per-Trap gameplay numbers; TRAP supplies the defaults (ADR 0008). */
export interface TrapConfig {
  /** Half-Hearts removed from the Player. */
  playerDamage: number;
  /** HP removed from an Enemy when not `lethal`. */
  enemyDamage: number;
  /** Kill any Enemy outright regardless of HP. */
  lethal: boolean;
  /** Dormant window after springing before it re-arms (ms). */
  rearmMs: number;
  /** Radial impulse shoving the victim off the glyph (px/s). */
  knockback: number;
}

/**
 * A Trap (CONTEXT.md; ADR 0008): a hidden magic-glyph floor hazard. Invisible
 * until an entity steps on it, then it springs — an instant flash plus a
 * victim-aware hit routed through the Attack chokepoint (ADR 0002): a survivable
 * bite to the Player, lethal to an ordinary Enemy. It springs once for free,
 * then stays permanently revealed and re-arms on a cadence — lit = live,
 * dimmed = spent.
 *
 * The scene wires two overlaps against `zone` — player×traps and enemies×traps
 * — and each springs the same Trap with its own victim category. The Trap owns
 * the armed/dormant state shared by both, so it never inspects entity types
 * (the category is supplied by which overlap fired). The `armed` flag also makes
 * contact edge-like: it fires once, then can't re-fire until the dormant window
 * elapses, so standing on a just-sprung glyph doesn't re-hit every frame.
 */
export class Trap {
  readonly zone: Phaser.GameObjects.Zone;
  private readonly glyph: Phaser.GameObjects.Image;
  private armed = true;
  private rearmAt = 0;
  private discovered: boolean;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly config: TrapConfig,
    /** Whether this Trap has been sprung before (persisted) — starts revealed. */
    discovered: boolean,
    /** Fires the first time this Trap ever springs, for persistence. */
    private readonly onFirstSpring?: () => void,
  ) {
    this.discovered = discovered;

    this.glyph = scene.add
      .image(x, y, TEX.trap)
      .setDepth(TRAP.depth)
      .setTint(TRAP.color)
      .setAlpha(discovered ? TRAP.litAlpha : 0); // hidden until first sprung

    this.zone = scene.add.zone(x, y, TRAP.triggerSize, TRAP.triggerSize);
    scene.physics.add.existing(this.zone, true); // static body for overlap
    this.zone.setData('trap', this); // the overlap callbacks resolve us from here
  }

  /**
   * Spring on a victim if armed. `category` selects the damage profile: the
   * Player takes a fixed survivable bite; an Enemy is killed outright (lethal)
   * or chipped for `enemyDamage`. i-frames are respected by the target's hit().
   */
  springOn(target: unknown, category: 'player' | 'enemy'): void {
    if (!this.armed || !isDamageable(target)) return;
    this.armed = false;
    this.rearmAt = this.scene.time.now + this.config.rearmMs;

    const damage =
      category === 'player'
        ? this.config.playerDamage
        : this.config.lethal
          ? Number.POSITIVE_INFINITY // zeroes any Health via Math.max(0, hp - ∞)
          : this.config.enemyDamage;

    target.hit({
      damage,
      knockback: this.config.knockback,
      fromX: this.zone.x,
      fromY: this.zone.y,
    });

    if (!this.discovered) {
      this.discovered = true;
      this.onFirstSpring?.();
    }
    this.flash();
  }

  /** Re-arm once the dormant window elapses; brighten back to the live look. */
  update(now: number): void {
    if (!this.armed && now >= this.rearmAt) {
      this.armed = true;
      this.scene.tweens.add({ targets: this.glyph, alpha: TRAP.litAlpha, duration: 160 });
    }
  }

  /** Reveal-and-pop on spring, then settle to the dimmed dormant look. */
  private flash(): void {
    this.scene.tweens.killTweensOf(this.glyph);
    this.glyph.setAlpha(1).setScale(1.4);
    this.scene.tweens.add({
      targets: this.glyph,
      alpha: TRAP.dimAlpha,
      scale: 1,
      duration: TRAP.flashMs,
      ease: 'Quad.out',
    });
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.glyph);
    this.glyph.destroy();
    this.zone.destroy();
  }
}
