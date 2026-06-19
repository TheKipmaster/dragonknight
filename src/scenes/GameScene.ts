import Phaser from 'phaser';
import { Player } from '../entities/Player';
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

  constructor() {
    super('Game');
  }

  create(): void {
    this.room = new PlaceholderRoom(this, GameState.activeRoomId);
    this.room.activate();

    this.player = new Player(this, this.room.spawn.x, this.room.spawn.y);
    this.player.setDepth(1);

    this.physics.add.collider(this.player, this.room.walls);

    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.cameras.main.roundPixels = true;
  }
}
