import Phaser from 'phaser';

/**
 * Reusable knockback component (ADR 0002). Shoves the host sprite directly away
 * from an origin point. The *duration* of the shove (how long the host gives up
 * control of its own velocity) is owned by the host — the Player relinquishes
 * movement for PLAYER.knockbackMs, the Walker sits in its `hurt` state for
 * ENEMY.hurtMs — because that window is entity-specific.
 */
export class Knockback {
  constructor(private readonly sprite: Phaser.Physics.Arcade.Sprite) {}

  apply(fromX: number, fromY: number, strength: number): void {
    const angle = Phaser.Math.Angle.Between(fromX, fromY, this.sprite.x, this.sprite.y);
    this.sprite.setVelocity(Math.cos(angle) * strength, Math.sin(angle) * strength);
  }
}
