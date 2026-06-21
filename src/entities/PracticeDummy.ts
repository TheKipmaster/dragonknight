import Phaser from 'phaser';
import { TEX } from '../config/constants';
import { Health } from '../components/Health';
import type { Attack, Damageable } from '../combat/Attack';

/**
 * A stationary practice target (composition-lite, ADR 0002). It never chases
 * and never threatens — its whole job is to confirm that an attack landed:
 * it flashes, gets nudged off its post and springs back, pops a damage number,
 * and drains a small health bar that refills so you can keep practising.
 */
export class PracticeDummy extends Phaser.Physics.Arcade.Sprite implements Damageable {
  private readonly health: Health;
  private readonly anchorX: number;
  private readonly anchorY: number;

  private readonly barBg: Phaser.GameObjects.Rectangle;
  private readonly barFill: Phaser.GameObjects.Rectangle;
  private static readonly BAR_WIDTH = 18;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEX.dummy);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.anchorX = x;
    this.anchorY = y;

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(12, 14).setOffset(2, 2);
    body.setImmovable(true); // the Player can't shove it by walking into it

    this.health = new Health(scene, 10, {
      onDeath: () => this.onDepleted(),
    });

    this.barBg = scene.add
      .rectangle(x, y - 13, PracticeDummy.BAR_WIDTH, 3, 0x000000, 0.6)
      .setOrigin(0.5)
      .setDepth(15);
    this.barFill = scene.add
      .rectangle(x - PracticeDummy.BAR_WIDTH / 2, y - 13, PracticeDummy.BAR_WIDTH, 3, 0x57d977)
      .setOrigin(0, 0.5)
      .setDepth(16);
  }

  /** The damage chokepoint endpoint: react to a landed attack. */
  hit(attack: Attack): void {
    if (!this.health.takeDamage(attack.damage)) return;

    // On the depleting hit, onDepleted() owns the tint (red), so skip the white flash.
    if (!this.health.isDead) this.flash();
    this.nudge(attack.fromX, attack.fromY);
    this.spawnDamageNumber(attack.damage);
    this.updateBar();
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    // Keep the health bar tracking the dummy while it wobbles.
    this.barBg.setPosition(this.x, this.y - 13);
    this.barFill.setPosition(this.x - PracticeDummy.BAR_WIDTH / 2, this.y - 13);
  }

  private flash(): void {
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(80, () => this.clearTint());
  }

  /** Wobble away from the attack origin and spring exactly back to the post. */
  private nudge(fromX: number, fromY: number): void {
    const angle = Phaser.Math.Angle.Between(fromX, fromY, this.anchorX, this.anchorY);
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({
      targets: this,
      x: this.anchorX + Math.cos(angle) * 5,
      y: this.anchorY + Math.sin(angle) * 5,
      duration: 60,
      yoyo: true,
      ease: 'Quad.out',
      onComplete: () => this.setPosition(this.anchorX, this.anchorY),
    });
  }

  private spawnDamageNumber(amount: number): void {
    const label = this.scene.add
      .text(this.x, this.y - 8, `${amount}`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffef9f',
      })
      .setOrigin(0.5)
      .setDepth(20);
    this.scene.tweens.add({
      targets: label,
      y: label.y - 14,
      alpha: 0,
      duration: 500,
      ease: 'Cubic.out',
      onComplete: () => label.destroy(),
    });
  }

  private updateBar(): void {
    this.barFill.width = PracticeDummy.BAR_WIDTH * this.health.fraction;
  }

  /** The health bar is built from standalone scene objects (not children of the
   *  sprite), so they must be torn down explicitly — otherwise they leak across
   *  Room transitions when the dummy is destroyed via group.clear(). */
  destroy(fromScene?: boolean): void {
    this.barBg.destroy();
    this.barFill.destroy();
    super.destroy(fromScene);
  }

  /** Practice dummy never truly dies — it refills after a beat. */
  private onDepleted(): void {
    this.setTintFill(0xff4d6d);
    this.scene.time.delayedCall(180, () => {
      this.clearTint();
      this.health.reset();
      this.updateBar();
    });
  }
}
