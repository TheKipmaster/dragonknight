import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { PracticeDummy } from '../entities/PracticeDummy';
import { Walker } from '../entities/Walker';
import { Charger } from '../entities/Charger';
import { TiledRoom } from '../world/TiledRoom';
import { Switch } from '../world/Switch';
import type { Room } from '../world/Room';
import { GameState } from '../state/GameState';
import { eventBus, GameEvent } from '../state/eventBus';
import { isContactAttacker } from '../combat/Attack';
import { SPAWNER, TILE } from '../config/constants';

/**
 * Gameplay scene: activates the current Room and runs entities/physics.
 * Only one Room is active at a time (ADR 0001).
 *
 * Two enemy groups: `attackables` is everything the sword can hit (dummies +
 * Walkers); `hostiles` is the subset that deals contact damage and collides
 * with walls (Walkers). Walkers live in both; clearing `hostiles` on respawn
 * destroys them and removes them from `attackables` too.
 */
export class GameScene extends Phaser.Scene {
  private room!: Room;
  private player!: Player;
  private attackables!: Phaser.GameObjects.Group;
  private hostiles!: Phaser.GameObjects.Group;
  private solids!: Phaser.GameObjects.Group;
  private spawnSwitch!: Switch;

  constructor() {
    super('Game');
  }

  create(): void {
    this.room = new TiledRoom(this, GameState.activeRoomId);
    this.room.activate();

    this.attackables = this.add.group();
    this.hostiles = this.add.group();
    // Solid, non-hostile props: blocked like walls, never deal contact damage.
    this.solids = this.add.group();

    const { x, y } = this.room.spawn;
    // Practice dummies flanking the spawn (sword targets, never hostile, but
    // solid — they're in `attackables` so the sword hits them and in `solids`
    // so the Player and enemies can't walk through them).
    for (const dx of [-40, 40]) {
      const dummy = new PracticeDummy(this, x + dx, y);
      this.attackables.add(dummy);
      this.solids.add(dummy);
    }

    this.player = new Player(this, x, y);
    this.player.setDepth(1);
    this.player.attackTargets = this.attackables;

    // Telegraphed enemy: one Charger placed statically to iterate on feel. This
    // is a stopgap rig until Tiled Rooms own real enemy placement; like the
    // spawned Walkers it lives in `hostiles`, so it is cleared on respawn.
    const charger = new Charger(this, x, y - TILE * 6, this.player);
    this.attackables.add(charger);
    this.hostiles.add(charger);

    // Spawner Switch: one Walker per interval while the Player stands on it.
    this.spawnSwitch = new Switch(this, x, y - TILE * 3, SPAWNER.intervalMs, () =>
      this.spawnWalker(),
    );

    this.room.addColliders(this.player);
    this.room.addColliders(this.hostiles);
    this.physics.add.collider(this.hostiles, this.hostiles);
    this.physics.add.collider(this.player, this.solids);
    this.physics.add.collider(this.hostiles, this.solids);

    this.physics.add.overlap(this.player, this.hostiles, this.onContact, undefined, this);
    this.physics.add.overlap(this.player, this.spawnSwitch.zone, () =>
      this.spawnSwitch.notifyOverlap(),
    );

    eventBus.on(GameEvent.PlayerDied, this.onPlayerDied, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      eventBus.off(GameEvent.PlayerDied, this.onPlayerDied, this);
    });

    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.cameras.main.roundPixels = true;
  }

  update(time: number): void {
    this.spawnSwitch.update(time);
  }

  /** Enemy touched the Player: route contact damage through the Attack chokepoint. */
  private onContact: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, enemy) => {
    if (isContactAttacker(enemy)) this.player.hit(enemy.contactAttack());
  };

  /** Spawn one Walker at a wall-free point in a ring around the Player. */
  private spawnWalker(): void {
    const { x: px, y: py } = this.player;
    for (let i = 0; i < SPAWNER.attempts; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Phaser.Math.Between(SPAWNER.minRadius, SPAWNER.maxRadius);
      const x = Phaser.Math.Clamp(px + Math.cos(angle) * dist, TILE * 1.5, this.room.widthPx - TILE * 1.5);
      const y = Phaser.Math.Clamp(py + Math.sin(angle) * dist, TILE * 1.5, this.room.heightPx - TILE * 1.5);
      if (this.room.isSolidAt(x, y)) continue;

      const walker = new Walker(this, x, y, this.player);
      this.attackables.add(walker);
      this.hostiles.add(walker);
      return;
    }
    // No wall-free spot found this tick; skip silently.
  }

  private onPlayerDied(): void {
    GameState.player.halfHearts = GameState.player.maxHalfHearts;
    this.player.respawn(this.room.spawn.x, this.room.spawn.y);
    this.hostiles.clear(true, true); // destroy all live Walkers
    eventBus.emit(GameEvent.PlayerDamaged); // refresh HUD to full
  }
}
