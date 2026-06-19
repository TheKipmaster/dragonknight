import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { PracticeDummy } from '../entities/PracticeDummy';
import { PlaceholderRoom } from '../world/PlaceholderRoom';
import type { Room } from '../world/Room';
import { GameState } from '../state/GameState';

/**
 * Gameplay scene: activates the current Room and runs entities/physics.
 * Only one Room is active at a time (ADR 0001).
 */
export class GameScene extends Phaser.Scene {
  private room!: Room;
  private player!: Player;
  private enemies!: Phaser.GameObjects.Group;

  constructor() {
    super('Game');
  }

  create(): void {
    this.room = new PlaceholderRoom(this, GameState.activeRoomId);
    this.room.activate();

    // Practice dummies flanking the spawn point.
    this.enemies = this.add.group();
    const { x, y } = this.room.spawn;
    this.enemies.add(new PracticeDummy(this, x - 40, y));
    this.enemies.add(new PracticeDummy(this, x + 40, y));

    this.player = new Player(this, x, y);
    this.player.setDepth(1);
    this.player.attackTargets = this.enemies;

    this.physics.add.collider(this.player, this.room.walls);
    this.physics.add.collider(this.player, this.enemies);

    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.cameras.main.roundPixels = true;
  }
}
