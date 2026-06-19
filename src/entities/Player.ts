import Phaser from 'phaser';
import { PLAYER_SPEED, TEX } from '../config/constants';

export type Facing = 'up' | 'down' | 'left' | 'right';

interface MoveKeys {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
}

/**
 * The Player: a Sprite subclass (composition-lite, ADR 0002). Behaviour that
 * varies across entities (Health, Knockback, AIController) will attach as
 * components later; for now this just handles 8-directional movement.
 *
 * `facing` is tracked even though the placeholder square doesn't show it yet —
 * the sword hitbox will spawn in the facing direction.
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  facing: Facing = 'down';
  private keys: MoveKeys;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEX.player);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(12, 12).setOffset(2, 4);

    const kb = scene.input.keyboard!;
    this.keys = {
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    // Arrow keys mirror WASD.
    this.cursors = kb.createCursorKeys();
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);

    let vx = 0;
    let vy = 0;
    if (this.keys.left.isDown || this.cursors.left.isDown) vx -= 1;
    if (this.keys.right.isDown || this.cursors.right.isDown) vx += 1;
    if (this.keys.up.isDown || this.cursors.up.isDown) vy -= 1;
    if (this.keys.down.isDown || this.cursors.down.isDown) vy += 1;

    const len = Math.hypot(vx, vy);
    if (len > 0) {
      this.setVelocity((vx / len) * PLAYER_SPEED, (vy / len) * PLAYER_SPEED);
      // Horizontal intent wins for facing when moving diagonally.
      if (vx !== 0) this.facing = vx < 0 ? 'left' : 'right';
      else if (vy !== 0) this.facing = vy < 0 ? 'up' : 'down';
    } else {
      this.setVelocity(0, 0);
    }
  }
}
