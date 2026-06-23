import Phaser from 'phaser';
import { ENEMY, TEX } from '../config/constants';
import { Health } from '../components/Health';
import { Knockback } from '../components/Knockback';
import { AIController } from '../components/AIController';
import { inactiveState } from '../components/aggro';
import type { Navigator } from '../components/FlowField';
import type { Attack, ContactAttacker, Damageable } from '../combat/Attack';
import { eventBus, GameEvent } from '../state/eventBus';

/**
 * The first mobile enemy (composition-lite, ADR 0002). It walks straight at the
 * target (naive seek, no pathfinding — ADR-noted) and deals contact damage. No
 * attacks of its own. Its tiny FSM lives in an AIController:
 *
 *   inactive → (Player in range) → chase → (struck) → hurt → chase
 *   and onDeath → die()
 */
export class Walker
  extends Phaser.Physics.Arcade.Sprite
  implements Damageable, ContactAttacker
{
  private readonly health: Health;
  private readonly knockback: Knockback;
  private readonly ai: AIController;
  private hurtUntil = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly target: Phaser.GameObjects.Sprite,
    private readonly nav: Navigator,
    startActive = false,
  ) {
    super(scene, x, y, TEX.walker);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(12, 12).setOffset(2, 4);
    this.setCollideWorldBounds(true);

    this.health = new Health(scene, ENEMY.maxHp, { onDeath: () => this.die() });
    this.knockback = new Knockback(this);

    this.ai = new AIController()
      .add('inactive', inactiveState(this, target, ENEMY.aggroRange, nav, () => this.ai.change('chase')))
      .add('chase', { update: () => this.chase() })
      .add('hurt', {
        update: () => {
          // Let the knockback velocity ride, then resume the chase.
          if (this.scene.time.now >= this.hurtUntil) this.ai.change('chase');
        },
      });
    // Map-/nest-spawned Walkers start dormant and wake on aggro; a startActive
    // Walker (the trapped-corridor's posted threat) chases from birth, ignoring
    // aggroRange — it's spawned *because* it should already be coming.
    this.ai.change(startActive ? 'chase' : 'inactive');
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    this.ai.update(delta);
  }

  /** Route around walls via the shared flow field; fall back to a straight line
   *  on the final approach (target's own cell) or when off the navigable grid. */
  private chase(): void {
    const dir = this.nav.steer(this.x, this.y);
    if (dir) {
      this.setVelocity(dir.x * ENEMY.speed, dir.y * ENEMY.speed);
      return;
    }
    const angle = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y);
    this.setVelocity(Math.cos(angle) * ENEMY.speed, Math.sin(angle) * ENEMY.speed);
  }

  /** Damageable: take a hit from the Player's sword. */
  hit(attack: Attack): void {
    if (!this.health.takeDamage(attack.damage)) return;
    this.flash();
    this.knockback.apply(attack.fromX, attack.fromY, attack.knockback);
    this.hurtUntil = this.scene.time.now + ENEMY.hurtMs;
    this.ai.change('hurt');
  }

  /** ContactAttacker: the damage dealt to the Player on contact. */
  contactAttack(): Attack {
    return {
      damage: ENEMY.contactDamage,
      knockback: ENEMY.contactKnockback,
      fromX: this.x,
      fromY: this.y,
    };
  }

  private flash(): void {
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(80, () => this.clearTint());
  }

  private die(): void {
    eventBus.emit(GameEvent.EnemyDied, this.x, this.y);
    this.setVelocity(0, 0);
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
