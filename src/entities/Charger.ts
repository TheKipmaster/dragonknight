import Phaser from 'phaser';
import { ANIM, CHARGER, TEX } from '../config/constants';
import { Health } from '../components/Health';
import { Knockback } from '../components/Knockback';
import { AIController } from '../components/AIController';
import { inactiveState } from '../components/aggro';
import type { Activatable } from '../components/Activatable';
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
  implements Damageable, ContactAttacker, Activatable
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

    // The Charger is now an 80x80 top-down spritesheet, body-centred in the cell
    // (the centroid the repacker anchors on). Keep a small 12x12 collision
    // footprint but centre it on the cell: the Arcade body is axis-aligned and
    // does NOT rotate with the sprite, so a box on the body centre stays correct
    // at every facing (mirrors the Player).
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(12, 12).setOffset((80 - 12) / 2, (80 - 12) / 2);
    this.setCollideWorldBounds(true);
    this.play(ANIM.chargerIdle);

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
    this.face();
    this.animate();
  }

  /**
   * Top-down sprite: rotate the whole frame to face where the Charger is headed.
   * While chasing it tracks its movement; once committed it locks onto the lunge
   * lane (so the wind-up brace and the lunge streaks point down the line the
   * Player can see). Idle/recover/hurt keep the last facing. The art is drawn
   * facing north and pivots about its centred body centroid (default 0.5 origin);
   * Phaser's rotation 0 faces east, so offset by +90° (mirrors the Player).
   */
  private face(): void {
    let dx = 0;
    let dy = 0;
    if (this.committed) {
      dx = this.lungeX;
      dy = this.lungeY;
    } else if (this.ai.state === 'chase') {
      const v = (this.body as Phaser.Physics.Arcade.Body).velocity;
      dx = v.x;
      dy = v.y;
    }
    if (dx !== 0 || dy !== 0) this.setRotation(Math.atan2(dy, dx) + Math.PI / 2);
  }

  /** Play the pose for the current FSM state (frames defined in PreloadScene). */
  private animate(): void {
    switch (this.ai.state) {
      case 'windup':
        this.play(ANIM.chargerWindup, true);
        break;
      case 'lunge':
        this.play(ANIM.chargerLunge, true);
        break;
      case 'hurt':
        this.play(ANIM.chargerHurt, true);
        break;
      case 'chase': {
        const v = (this.body as Phaser.Physics.Arcade.Body).velocity;
        this.play(Math.abs(v.x) > 1 || Math.abs(v.y) > 1 ? ANIM.chargerWalk : ANIM.chargerIdle, true);
        break;
      }
      default: // inactive, recover
        this.play(ANIM.chargerIdle, true);
    }
  }

  /** Activatable: wake from `inactive` straight into the chase, ignoring aggro
   *  range (a Tripwire woke us deliberately, ADR 0010). Only acts on a dormant
   *  Charger, so an already-aggroed one mid-wind-up/lunge is never interrupted. */
  wake(): void {
    if (this.ai.state === 'inactive') this.ai.change('chase');
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
