import Phaser from 'phaser';
import { CHARGER, TEX } from '../config/constants';
import { Health } from '../components/Health';
import { Knockback } from '../components/Knockback';
import { AIController } from '../components/AIController';
import { inactiveState } from '../components/aggro';
import type { Navigator } from '../components/FlowField';
import type { Attack, ContactAttacker, Damageable } from '../combat/Attack';
import { eventBus, GameEvent } from '../state/eventBus';

const TELEGRAPH_TINT = 0xffe089; //  warning hue worn during the wind-up
const LANE_COLOR = 0xffd24d; //      colour of the drawn lunge lane
const LANE_WIDTH = 6; //             thickness of the lane indicator (px)

/**
 * The telegraphed enemy (composition-lite, ADR 0002): a lunging Charger. Unlike
 * the Walker, its threat is a committed, *telegraphed* strike rather than mere
 * contact. Its FSM (in an AIController) is:
 *
 *   inactive → (Player in range) → chase → (in range) → windup → lunge →
 *   recover → chase;  when struck OUTSIDE the commit: → hurt → chase;
 *   onDeath → die()
 *
 * `windup` is the Telegraph (CONTEXT.md): the body flares and a lunge *lane* is
 * drawn toward the Player's position at that instant. The lane is locked at
 * wind-up start, so the counterplay is simply to step out of the line you can
 * see. The wind-up is *committed* — taking a hit during `windup`/`lunge` still
 * deals damage but can neither shove nor cancel the Charger. It is only
 * stagger-able (knocked into `hurt`) during `chase`/`recover`, making the
 * post-lunge recovery the real punish window. See the CHARGER block in
 * constants.ts for all tuning.
 */
export class Charger
  extends Phaser.Physics.Arcade.Sprite
  implements Damageable, ContactAttacker
{
  private readonly health: Health;
  private readonly knockback: Knockback;
  private readonly ai: AIController;
  /** The drawn telegraph; only rendered while winding up. */
  private readonly lane: Phaser.GameObjects.Graphics;

  /** Locked lunge direction (unit vector), captured at wind-up start. */
  private lungeX = 0;
  private lungeY = 0;
  private stateUntil = 0; //  when the current timed state expires (ms)

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly target: Phaser.GameObjects.Sprite,
    private readonly nav: Navigator,
    startActive = false,
  ) {
    super(scene, x, y, TEX.charger);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(12, 12).setOffset(2, 4);
    this.setCollideWorldBounds(true);

    this.lane = scene.add.graphics().setDepth(0);

    this.health = new Health(scene, CHARGER.maxHp, { onDeath: () => this.die() });
    this.knockback = new Knockback(this);

    this.ai = new AIController()
      .add('inactive', inactiveState(this, target, CHARGER.aggroRange, nav, () => this.ai.change('chase')))
      .add('chase', { update: () => this.chase() })
      .add('windup', {
        enter: () => this.beginWindup(),
        update: () => this.tickTimed('lunge'),
        exit: () => this.endWindup(),
      })
      .add('lunge', {
        enter: () => this.beginLunge(),
        update: () => this.tickTimed('recover'),
      })
      .add('recover', {
        enter: () => this.beginTimed(CHARGER.recoverMs),
        update: () => this.tickTimed('chase'),
      })
      .add('hurt', {
        update: () => {
          // Let the knockback velocity ride, then resume stalking.
          if (this.scene.time.now >= this.stateUntil) this.ai.change('chase');
        },
      });
    // Dormant by default, waking on aggro; startActive stalks from birth,
    // ignoring aggroRange (mirrors Walker — see its note).
    this.ai.change(startActive ? 'chase' : 'inactive');
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    this.ai.update(delta);
  }

  /** chase: close distance on the Player — routing around walls via the flow
   *  field (straight-line fallback near the target/off-grid) — and commit a
   *  wind-up once in range. The lunge itself stays a straight line locked at
   *  wind-up start (see beginWindup); only the approach paths. */
  private chase(): void {
    const dir = this.nav.steer(this.x, this.y);
    if (dir) {
      this.setVelocity(dir.x * CHARGER.chaseSpeed, dir.y * CHARGER.chaseSpeed);
    } else {
      const angle = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y);
      this.setVelocity(Math.cos(angle) * CHARGER.chaseSpeed, Math.sin(angle) * CHARGER.chaseSpeed);
    }

    const dist = Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y);
    if (dist <= CHARGER.triggerRange) this.ai.change('windup');
  }

  /** windup: stop, lock the lunge lane toward the Player, flare the Telegraph. */
  private beginWindup(): void {
    this.setVelocity(0, 0);

    const angle = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y);
    this.lungeX = Math.cos(angle);
    this.lungeY = Math.sin(angle);

    const reach = (CHARGER.lungeSpeed * CHARGER.lungeMs) / 1000;
    this.lane
      .clear()
      .lineStyle(LANE_WIDTH, LANE_COLOR, 0.35)
      .lineBetween(this.x, this.y, this.x + this.lungeX * reach, this.y + this.lungeY * reach);

    this.setTint(TELEGRAPH_TINT);
    // Pulse so the wind-up reads as building, not static.
    this.scene.tweens.add({
      targets: this,
      scale: 1.18,
      duration: CHARGER.windupMs / 2,
      yoyo: true,
      ease: 'Sine.inOut',
    });

    this.beginTimed(CHARGER.windupMs);
  }

  private endWindup(): void {
    this.lane.clear();
    this.scene.tweens.killTweensOf(this);
    this.setScale(1);
    this.clearTint();
  }

  /** lunge: dash down the locked lane; its body contact is the strike. */
  private beginLunge(): void {
    this.setVelocity(this.lungeX * CHARGER.lungeSpeed, this.lungeY * CHARGER.lungeSpeed);
    this.beginTimed(CHARGER.lungeMs);
  }

  private beginTimed(durationMs: number): void {
    this.stateUntil = this.scene.time.now + durationMs;
  }

  /** Advance to `next` once the current timed state has elapsed. */
  private tickTimed(next: string): void {
    if (this.scene.time.now >= this.stateUntil) {
      if (next === 'recover') this.setVelocity(0, 0); // end the dash cleanly
      this.ai.change(next);
    }
  }

  /** True while a lunge is committed and unstoppable (wind-up or dash). */
  private get committed(): boolean {
    return this.ai.state === 'windup' || this.ai.state === 'lunge';
  }

  /** Damageable: take a hit from the Player's sword. */
  hit(attack: Attack): void {
    if (!this.health.takeDamage(attack.damage)) return;
    this.flash();
    // Committed: damage lands, but the lunge can be neither shoved nor cancelled.
    if (this.committed) return;
    this.knockback.apply(attack.fromX, attack.fromY, attack.knockback);
    this.beginTimed(CHARGER.hurtMs);
    this.ai.change('hurt');
  }

  /**
   * ContactAttacker: a connecting lunge is the real threat; passive body
   * contact while chasing/recovering only chips like a Walker touch.
   */
  contactAttack(): Attack {
    const lunging = this.ai.state === 'lunge';
    return {
      damage: lunging ? CHARGER.lungeDamage : CHARGER.contactDamage,
      knockback: lunging ? CHARGER.lungeKnockback : CHARGER.contactKnockback,
      fromX: this.x,
      fromY: this.y,
    };
  }

  private flash(): void {
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(80, () => {
      // Don't stomp the Telegraph tint if we're still winding up.
      if (this.ai.state === 'windup') this.setTint(TELEGRAPH_TINT);
      else this.clearTint();
    });
  }

  /** The telegraph `lane` is a standalone scene Graphics, not a child of the
   *  sprite, so it must be destroyed explicitly — otherwise it leaks across Room
   *  transitions when the Charger is destroyed via group.clear() (which bypasses
   *  die()). Idempotent with die()'s own lane teardown. */
  destroy(fromScene?: boolean): void {
    this.lane.destroy();
    super.destroy(fromScene);
  }

  private die(): void {
    eventBus.emit(GameEvent.EnemyDied, this.x, this.y);
    this.setVelocity(0, 0);
    this.lane.destroy();
    this.scene.tweens.killTweensOf(this);
    (this.body as Phaser.Physics.Arcade.Body).enable = false;
    this.scene.tweens.add({
      targets: this,
      scale: 0,
      alpha: 0,
      duration: 140,
      ease: 'Quad.in',
      onComplete: () => this.destroy(),
    });
  }
}
