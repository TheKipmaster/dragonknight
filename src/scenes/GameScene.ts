import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { PracticeDummy } from '../entities/PracticeDummy';
import { Walker } from '../entities/Walker';
import { Charger } from '../entities/Charger';
import { Key } from '../entities/Key';
import { RoomManager } from '../world/RoomManager';
import { Switch } from '../world/Switch';
import { FlowField } from '../components/FlowField';
import { PathfindingDebug } from '../debug/PathfindingDebug';
import type { Room } from '../world/Room';
import { GameState } from '../state/GameState';
import { eventBus, GameEvent } from '../state/eventBus';
import { isContactAttacker } from '../combat/Attack';
import { SPAWNER, TILE } from '../config/constants';

/**
 * Gameplay scene. A RoomManager owns the active Room and drives transitions
 * (ADR 0001); this scene owns the Player and the *content* of Rooms — the entity
 * rig built per Room in populate()/clearContent() via the manager's hooks.
 *
 * Entity groups (all persist across transitions; the manager only swaps their
 * members): `attackables` is everything the sword can hit (dummies + enemies);
 * `hostiles` is the subset that deals contact damage; `solids` is non-hostile
 * props that block movement (dummies). An entity can be in several groups.
 */
export class GameScene extends Phaser.Scene {
  private manager!: RoomManager;
  private player!: Player;
  private attackables!: Phaser.GameObjects.Group;
  private hostiles!: Phaser.GameObjects.Group;
  private solids!: Phaser.GameObjects.Group;
  private pickups!: Phaser.GameObjects.Group;

  private spawnSwitch?: Switch;
  private switchOverlap?: Phaser.Physics.Arcade.Collider;

  /** Shared enemy pathfinding for the active Room: one BFS distance map from the
   *  Player serves the whole hostile swarm. Rebuilt per Room, re-aimed per frame. */
  private nav!: FlowField;
  /** Toggleable flow-field visualiser (backtick); a dev aid, off by default. */
  private pathDebug!: PathfindingDebug;

  constructor() {
    super('Game');
  }

  create(): void {
    this.attackables = this.add.group();
    this.hostiles = this.add.group();
    this.solids = this.add.group();
    this.pickups = this.add.group();

    // The Player is the through-line across Rooms: created once, repositioned by
    // the manager on each transition.
    this.player = new Player(this, 0, 0);
    this.player.setDepth(1);
    this.player.attackTargets = this.attackables;

    // Physics relationships that don't depend on which Room is active. A collider
    // registered against a Group also covers members added to it later, so these
    // survive transitions untouched (only Room walls are re-wired per Room).
    this.physics.add.collider(this.hostiles, this.hostiles);
    this.physics.add.collider(this.player, this.solids);
    this.physics.add.collider(this.hostiles, this.solids);
    this.physics.add.overlap(this.player, this.hostiles, this.onContact, undefined, this);
    this.physics.add.overlap(this.player, this.pickups, this.onPickup, undefined, this);

    this.pathDebug = new PathfindingDebug(this);

    this.manager = new RoomManager(this, this.player, {
      onEnter: (room) => this.populate(room),
      onExit: () => this.clearContent(),
    });
    this.manager.enter(GameState.activeRoomId);

    eventBus.on(GameEvent.PlayerDied, this.onPlayerDied, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      eventBus.off(GameEvent.PlayerDied, this.onPlayerDied, this);
    });
  }

  update(time: number): void {
    // Re-aim the shared flow field at the Player. retarget() early-outs unless
    // the Player crossed into a new cell, so the BFS only runs when needed.
    this.nav.retarget(this.player.x, this.player.y);
    this.spawnSwitch?.update(time);
    this.pathDebug.update();
  }

  /** Per-Room setup (manager onEnter): wire Room walls, then build its content. */
  private populate(room: Room): void {
    room.addColliders(this.player);
    room.addColliders(this.hostiles);

    // One flow field per Room (walls are static); enemies share it for chasing.
    this.nav = new FlowField(room.buildNavGrid());

    // Spawn map-authored items, skipping any already collected (they don't respawn).
    for (const item of room.items) {
      if (item.kind === 'key' && !GameState.progress.itemsTaken.has(item.id)) {
        this.pickups.add(new Key(this, item.x, item.y, item.id));
      }
    }

    // For now only the debug Room carries the practice rig; the others are bare
    // walkable Rooms. (Future: Rooms author their own entity placement.)
    if (room.id === 'room-debug') this.buildPracticeRig(room);

    // Seed the field once static obstacles (e.g. dummies) are stamped in.
    this.nav.retarget(this.player.x, this.player.y);
    this.pathDebug.setField(this.nav);
  }

  /** Per-Room teardown (manager onExit): destroy everything populate() created. */
  private clearContent(): void {
    // Every entity is in `attackables`; clearing all three groups with destroy
    // empties them. A shared member destroyed twice is a safe no-op in Phaser.
    this.attackables.clear(true, true);
    this.hostiles.clear(true, true);
    this.solids.clear(true, true);
    this.pickups.clear(true, true);
    this.switchOverlap?.destroy();
    this.switchOverlap = undefined;
    this.spawnSwitch?.destroy();
    this.spawnSwitch = undefined;
  }

  /** The debug Room's iteration rig: dummies, a Charger, and a Walker spawner. */
  private buildPracticeRig(room: Room): void {
    const { x, y } = room.spawn;

    // Practice dummies flanking the spawn: in `attackables` (sword hits them) and
    // `solids` (block movement), never hostile.
    for (const dx of [-40, 40]) {
      const dummy = new PracticeDummy(this, x + dx, y);
      this.attackables.add(dummy);
      this.solids.add(dummy);
      // Dummies are static solids the wall layer doesn't know about — stamp their
      // full body footprint into the flow field so enemies route around them
      // instead of grinding. (A dummy is placed off-grid, so its body straddles
      // two cells; stamp every cell it covers, not just its centre.)
      const b = dummy.body as Phaser.Physics.Arcade.Body;
      this.nav.blockRect(b.left, b.top, b.right, b.bottom);
    }

    // Telegraphed enemy: one Charger to iterate on feel; cleared on respawn.
    const charger = new Charger(this, x, y - TILE * 6, this.player, this.nav);
    this.attackables.add(charger);
    this.hostiles.add(charger);

    // Spawner Switch: one Walker per interval while the Player stands on it.
    this.spawnSwitch = new Switch(this, x, y - TILE * 3, SPAWNER.intervalMs, () =>
      this.spawnWalker(),
    );
    this.switchOverlap = this.physics.add.overlap(this.player, this.spawnSwitch.zone, () =>
      this.spawnSwitch?.notifyOverlap(),
    );
  }

  /** Enemy touched the Player: route contact damage through the Attack chokepoint. */
  private onContact: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, enemy) => {
    if (isContactAttacker(enemy)) this.player.hit(enemy.contactAttack());
  };

  /** Player touched a pickup: collect it and record it as taken (no respawn). */
  private onPickup: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, obj) => {
    if (obj instanceof Key) {
      GameState.progress.keysHeld++;
      GameState.progress.itemsTaken.add(obj.itemId);
      eventBus.emit(GameEvent.KeysChanged);
      obj.destroy();
    }
  };

  /** Spawn one Walker at a wall-free point in a ring around the Player. */
  private spawnWalker(): void {
    const room = this.manager.room;
    const { x: px, y: py } = this.player;
    for (let i = 0; i < SPAWNER.attempts; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Phaser.Math.Between(SPAWNER.minRadius, SPAWNER.maxRadius);
      const x = Phaser.Math.Clamp(px + Math.cos(angle) * dist, TILE * 1.5, room.widthPx - TILE * 1.5);
      const y = Phaser.Math.Clamp(py + Math.sin(angle) * dist, TILE * 1.5, room.heightPx - TILE * 1.5);
      if (room.isSolidAt(x, y)) continue;

      const walker = new Walker(this, x, y, this.player, this.nav);
      this.attackables.add(walker);
      this.hostiles.add(walker);
      return;
    }
    // No wall-free spot found this tick; skip silently.
  }

  private onPlayerDied(): void {
    GameState.player.halfHearts = GameState.player.maxHalfHearts;
    const spawn = this.manager.room.spawn;
    this.player.respawn(spawn.x, spawn.y);
    this.hostiles.clear(true, true); // destroy all live Walkers (and the Charger)
    eventBus.emit(GameEvent.PlayerDamaged); // refresh HUD to full
  }
}
