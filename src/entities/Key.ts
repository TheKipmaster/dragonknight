import Phaser from 'phaser';
import { TEX } from '../config/constants';

/**
 * A Key pickup: a static overlap target the Player collects by touching. The
 * scene owns the pickup logic (it mutates GameState); the Key just carries its
 * persistent `itemId` so a collected Key never respawns on Room re-entry.
 */
export class Key extends Phaser.Physics.Arcade.Sprite {
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly itemId: string,
  ) {
    super(scene, x, y, TEX.key);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    (this.body as Phaser.Physics.Arcade.Body).setImmovable(true);

    // Gentle bob so it reads as a collectible.
    scene.tweens.add({
      targets: this,
      y: y - 2,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  destroy(fromScene?: boolean): void {
    this.scene?.tweens.killTweensOf(this);
    super.destroy(fromScene);
  }
}
