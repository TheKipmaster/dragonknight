import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { PracticeDummy } from '../entities/PracticeDummy';
import { Walker } from '../entities/Walker';
import { Charger } from '../entities/Charger';
import { Spawner } from '../entities/Spawner';
import { Key } from '../entities/Key';
import { RoomManager } from '../world/RoomManager';
import { Switch } from '../world/Switch';
import { Trap } from '../world/Trap';
import { Tripwire } from '../world/Tripwire';
import { TrickleSpawner } from '../world/TrickleSpawner';
import { Gauntlet } from '../world/Gauntlet';
import { FlowField } from '../components/FlowField';
import { isActivatable } from '../components/Activatable';
import { PathfindingDebug } from '../debug/PathfindingDebug';
import type { Room } from '../world/Room';
import { GameState } from '../state/GameState';
import { eventBus, GameEvent } from '../state/eventBus';
import { tripwires } from '../state/tripwires';
import type { TripwireSpawn } from '../world/Room';
import { isContactAttacker } from '../combat/Attack';
import { CORRIDOR, DECAL_DEPTH, GAUNTLET, SANCTUM_GAUNTLET, SPAWN_SWITCH, SPLAT, TEX, TILE, TRAP } from '../config/constants';

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
  /** Death splats dropped this Room; cleared on transition so they don't leak. */
  private decals!: Phaser.GameObjects.Group;

  private spawnSwitch?: Switch;
  private switchOverlap?: Phaser.Physics.Arcade.Collider;

  /** The active Room's destroyable Spawner nests (ADR 0009), map-authored. */
  private spawners: Spawner[] = [];

  /** The trapped-corridor's scripted lone-Walker post (set only in that Room,
   *  keyed off the entry side); undefined elsewhere. Reset on Room teardown. */
  private corridorWalkers?: TrickleSpawner;

  /** The active, Tripwire-triggered Gauntlet, if one is running (ADR 0011); the
   *  sanctum's `boss-fight` starts it. Discarded on Room teardown and on death. */
  private gauntlet?: Gauntlet;

  /** Live Traps in the active Room; their overlap zones live in `trapZones`
   *  (a persistent group with two standing overlaps, members swapped per Room). */
  private trapZones!: Phaser.GameObjects.Group;
  private traps: Trap[] = [];

  /** The active Room's Tripwire runtimes (edge detection) and their Player
   *  overlaps (ADR 0010). Their zones are Room-owned; these are torn down per
   *  Room in clearContent(). Handlers register once in create(), not per Room. */
  private tripwireRuntimes: Tripwire[] = [];
  private tripwireOverlaps: Phaser.Physics.Arcade.Collider[] = [];

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
    this.decals = this.add.group();
    this.trapZones = this.add.group();

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
    // Traps discriminate their victim by *which* overlap fires, not by type
    // (ADR 0008): the Player takes a survivable bite, an Enemy a lethal one.
    this.physics.add.overlap(this.player, this.trapZones, this.onTrapPlayer, undefined, this);
    this.physics.add.overlap(this.hostiles, this.trapZones, this.onTrapEnemy, undefined, this);

    this.pathDebug = new PathfindingDebug(this);

    // Bind Tripwire behaviours once (ADR 0010). Handlers close over the
    // persistent groups/Player, which outlive Room transitions, so they need no
    // per-Room re-registration; the per-Room part is just wiring zone overlaps.
    this.registerTripwires();

    this.manager = new RoomManager(this, this.player, {
      onEnter: (room, fromSpawn) => this.populate(room, fromSpawn),
      onExit: () => this.clearContent(),
    });
    this.manager.enter(GameState.activeRoomId);

    eventBus.on(GameEvent.PlayerDied, this.onPlayerDied, this);
    eventBus.on(GameEvent.EnemyDied, this.onEnemyDied, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      eventBus.off(GameEvent.PlayerDied, this.onPlayerDied, this);
      eventBus.off(GameEvent.EnemyDied, this.onEnemyDied, this);
      tripwires.clear(); // handlers close over this scene; a restart re-registers
    });
  }

  update(time: number): void {
    // Re-aim the shared flow field at the Player. retarget() early-outs unless
    // the Player crossed into a new cell, so the BFS only runs when needed.
    this.nav.retarget(this.player.x, this.player.y);
    this.spawnSwitch?.update(time);
    for (const spawner of this.spawners) spawner.update(time);
    this.corridorWalkers?.update(time);
    this.gauntlet?.update(time);
    for (const trap of this.traps) trap.update(time);
    for (const tw of this.tripwireRuntimes) tw.update();
    this.pathDebug.update();
  }

  /** Per-Room setup (manager onEnter): wire Room walls, then build its content.
   *  `fromSpawn` is the marker the Player entered at — the trapped-corridor keys
   *  its scripted Walker post off which mouth that was (see buildCorridorWalkers). */
  private populate(room: Room, fromSpawn: string): void {
    room.addColliders(this.player);
    room.addColliders(this.hostiles);

    // One flow field per Room (walls are static); enemies share it for chasing.
    // Most Rooms use the default clearance bias, which bows paths into the open
    // and so funnels chasers down a corridor's centre lane. The trapped-corridor
    // turns that bias down: the field then routes (near) shortest-path to the
    // Player's actual position, so the player can bait walkers off-centre onto
    // its flank traps. Per-field via FlowFieldOptions — the Navigator seam means
    // no enemy code changes. (clearCost is the dial; lower = more steerable, 0 =
    // pure shortest-path. Tune to taste.)
    const navOptions = room.id === 'trapped-corridor' ? { clearCost: 0 } : {};
    this.nav = new FlowField(room.buildNavGrid(), navOptions);

    for (const e of room.enemies) this.spawnEnemy(e.kind, e.x, e.y);

    // Build map-authored Traps. A Trap sprung on a previous visit rebuilds
    // revealed-but-live (its id is remembered in progress; ADR 0003 amendment).
    for (const t of room.traps) this.addTrap(t.x, t.y, t, t.id);

    // Build map-authored Spawner nests (ADR 0009).
    for (const s of room.spawners) this.addSpawner(room, s);

    // Wire map-authored Tripwires (ADR 0010): an overlap per Room-owned zone that
    // drives its edge-detecting runtime; behaviour was bound once in create().
    for (const tw of room.tripwires) this.addTripwire(tw);

    // Spawn map-authored items, skipping any already collected (they don't respawn).
    for (const item of room.items) {
      if (item.kind === 'key' && !GameState.progress.itemsTaken.has(item.id)) {
        this.pickups.add(new Key(this, item.x, item.y, item.id));
      }
    }

    // For now only the debug Room carries the practice rig; the others are bare
    // walkable Rooms. (Future: Rooms author their own entity placement.)
    if (room.id === 'room-debug') this.buildPracticeRig(room);

    // The trapped-corridor feeds lone Walkers in from its far end (entry-side
    // dependent); no-op in every other Room.
    if (room.id === 'trapped-corridor') this.buildCorridorWalkers(room, fromSpawn);

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
    this.decals.clear(true, true);
    this.switchOverlap?.destroy();
    this.switchOverlap = undefined;
    this.spawnSwitch?.destroy();
    this.spawnSwitch = undefined;
    // Spawners are in `attackables` (cleared above), but their standalone
    // telegraph markers need their own destroy() to be torn down.
    for (const spawner of this.spawners) spawner.destroy();
    this.spawners.length = 0;
    // Destroying each Trap tears down its glyph and zone (the zone auto-leaves
    // trapZones on destroy); the two standing overlaps survive for the next Room.
    for (const trap of this.traps) trap.destroy();
    this.traps.length = 0;
    // Drop the Tripwire overlaps and runtimes; their zones are Room-owned and torn
    // down by Room.deactivate() (ADR 0010). Handlers persist (registered once).
    for (const overlap of this.tripwireOverlaps) overlap.destroy();
    this.tripwireOverlaps.length = 0;
    this.tripwireRuntimes.length = 0;
    // Its posted Walker is in the groups cleared above; just drop the post.
    this.corridorWalkers = undefined;
    // Discard any running Gauntlet (ADR 0011): its spawned Enemies are in the
    // groups cleared above; destroy() just tears down its in-flight telegraph so a
    // stale controller can't keep ticking into the next Room.
    this.gauntlet?.destroy();
    this.gauntlet = undefined;
  }

  /** The trapped-corridor's scripted threat: one Walker posted at the corridor's
   *  *far* end — the entry mouth's opposite — so the Player must walk it back
   *  through the traps (and can juke it onto the flanks). Entry-side dependent:
   *  in via the bottom (entrance) → post at the top (from-corpse-pile); in via
   *  the top (corpse-pile) → post at the bottom (from-entrance); in via the
   *  sanctum (the mid-corridor side door) → no post, it has no opposite end.
   *  One at a time, with a cooldown before the relief (see TrickleSpawner). */
  private buildCorridorWalkers(room: Room, fromSpawn: string): void {
    const postSpawn =
      fromSpawn === 'from-entrance'
        ? 'from-corpse-pile'
        : fromSpawn === 'from-corpse-pile'
          ? 'from-entrance'
          : undefined;
    if (!postSpawn) return;

    const post = room.spawnAt(postSpawn);
    if (!post) return;

    this.corridorWalkers = new TrickleSpawner(
      post.x,
      post.y,
      CORRIDOR.walkerCooldownMs,
      (x, y) => this.spawnEnemy('walker', x, y, true), // posts active — chases on sight
    );
  }

  /** Build a Trap, remembering whether it was already sprung (persistence). */
  private addTrap(
    x: number,
    y: number,
    config: import('../world/Trap').TrapConfig,
    id: string,
  ): void {
    const trap = new Trap(this, x, y, config, GameState.progress.trapsSprung.has(id), () =>
      GameState.progress.trapsSprung.add(id),
    );
    this.traps.push(trap);
    this.trapZones.add(trap.zone);
  }

  /** Build a Spawner nest (ADR 0009): solid + flow-field-stamped like a dummy so
   *  it blocks movement and Enemies route around it; in `attackables` so the
   *  sword fells it; never in `hostiles` (it deals no contact damage). Its Wave
   *  members spawn through the shared spawnEnemy() path. */
  private addSpawner(room: Room, s: import('../world/Room').SpawnerSpawn): void {
    const spawner = new Spawner(this, s.x, s.y, this.player, room, s, this.nav, (kind, sx, sy) =>
      this.spawnEnemy(kind, sx, sy),
    );
    this.attackables.add(spawner);
    this.solids.add(spawner);
    const body = spawner.body as Phaser.Physics.Arcade.StaticBody;
    this.nav.blockRect(body.left, body.top, body.right, body.bottom);
    this.spawners.push(spawner);
  }

  /** Wire one map-authored Tripwire (ADR 0010): an edge-detecting runtime fed by
   *  a Player overlap on its Room-owned zone. Dispatch and the central once-guard
   *  live in the `tripwires` registry; this only routes the crossing to it. */
  private addTripwire(tw: TripwireSpawn): void {
    const runtime = new Tripwire(
      tw.name,
      { id: tw.id, repeat: tw.repeat, region: tw.region, props: tw.props },
      (name, ctx) => tripwires.fire(name, ctx),
    );
    this.tripwireRuntimes.push(runtime);
    this.tripwireOverlaps.push(
      this.physics.add.overlap(this.player, tw.zone, () => runtime.notifyOverlap()),
    );
  }

  /** Bind the behaviour for each Tripwire name (ADR 0010). Handlers are closures
   *  over this scene's persistent state, so they reach the Player, the entity
   *  groups, and spawnEnemy() directly; the fire-time context carries only the
   *  per-instance `region`/`props`. Registered once (see create()). */
  private registerTripwires(): void {
    // 'aggro': wake every Enemy in the active Room — the dormant-ambush pattern,
    // the "change enemy AI" use case. Room-scoped: `hostiles` holds only the
    // active Room's Enemies (swapped per Room), so this never reaches elsewhere.
    tripwires.on('aggro', () => {
      for (const h of this.hostiles.getChildren()) if (isActivatable(h)) h.wake();
    });

    // 'boss-fight' (sanctum): start the boss-stand-in Gauntlet (ADR 0011) rung
    // around the Tripwire's region centre — the pentagram at room centre, where
    // the Player is standing when they trip it. The Gauntlet runs forward through
    // its Waves; it owns no failure path (a real game-over resets the run), and
    // the once-ever Tripwire won't re-fire. onComplete is the encounter's payoff.
    tripwires.on('boss-fight', ({ region }) => {
      this.gauntlet = new Gauntlet(
        this,
        this.manager.room,
        region.centerX,
        region.centerY,
        SANCTUM_GAUNTLET,
        (kind, x, y) => this.spawnEnemy(kind, x, y, GAUNTLET.spawnActive),
        () => {
          // TODO(boss-fight): reveal the Treasure / play the win Cutscene (ROADMAP
          // Treasure+win state). For now, clearing the Gauntlet is its own reward.
        },
      );
    });
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
    this.spawnSwitch = new Switch(this, x, y - TILE * 3, SPAWN_SWITCH.intervalMs, () =>
      this.spawnWalker(),
    );
    this.switchOverlap = this.physics.add.overlap(this.player, this.spawnSwitch.zone, () =>
      this.spawnSwitch?.notifyOverlap(),
    );

    // The Spawner nest is now map-authored — see the `spawner` object in
    // room-debug.tmj (built via populate()'s room.spawners loop, ADR 0009).

    // A demo Trap to iterate on feel (hidden until stepped on; lethal to Enemies
    // so the spawned Walkers can be lured onto it). Maps author their own via a
    // `trap` point object; this is the debug-rig analogue of the hardcoded Charger.
    this.addTrap(
      x,
      y - TILE * 4.5,
      {
        playerDamage: TRAP.playerDamage,
        enemyDamage: TRAP.enemyDamage,
        lethal: TRAP.lethal,
        rearmMs: TRAP.rearmMs,
        knockback: TRAP.knockback,
      },
      'room-debug#trap-demo',
    );
  }

  /** Enemy touched the Player: route contact damage through the Attack chokepoint. */
  private onContact: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, enemy) => {
    if (isContactAttacker(enemy)) this.player.hit(enemy.contactAttack());
  };

  /** Player stepped on a Trap zone: spring it with the Player damage profile. */
  private onTrapPlayer: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, zone) => {
    (zone as Phaser.GameObjects.GameObject).getData('trap')?.springOn(this.player, 'player');
  };

  /** An Enemy stepped on a Trap zone: spring it with the (lethal) Enemy profile. */
  private onTrapEnemy: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (enemy, zone) => {
    (zone as Phaser.GameObjects.GameObject).getData('trap')?.springOn(enemy, 'enemy');
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
    for (let i = 0; i < SPAWN_SWITCH.attempts; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Phaser.Math.Between(SPAWN_SWITCH.minRadius, SPAWN_SWITCH.maxRadius);
      const x = Phaser.Math.Clamp(px + Math.cos(angle) * dist, TILE * 1.5, room.widthPx - TILE * 1.5);
      const y = Phaser.Math.Clamp(py + Math.sin(angle) * dist, TILE * 1.5, room.heightPx - TILE * 1.5);
      if (room.isSolidAt(x, y)) continue;

      this.spawnEnemy('walker', x, y);
      return;
    }
    // No wall-free spot found this tick; skip silently.
  }

  /** Create an Enemy of `kind`, register it in the sword/contact groups, and
   *  return it. Shared by map-authored placement, the Spawner nest, and the
   *  Switch's spawn effect (via spawnWalker). */
  private spawnEnemy(
    kind: string,
    x: number,
    y: number,
    active = false,
  ): Phaser.Physics.Arcade.Sprite {
    const enemy = kind === 'charger'
      ? new Charger(this, x, y, this.player, this.nav, active)
      : new Walker(this, x, y, this.player, this.nav, active);
    this.attackables.add(enemy);
    this.hostiles.add(enemy);
    return enemy;
  }

  /** An enemy died: drop a jittered floor splat under the floor's entities. */
  private onEnemyDied(x: number, y: number): void {
    const splat = this.add
      .image(x, y, TEX.splat)
      .setDepth(DECAL_DEPTH)
      .setAlpha(SPLAT.alpha)
      .setRotation(Math.random() * Math.PI * 2)
      .setScale(Phaser.Math.FloatBetween(SPLAT.minScale, SPLAT.maxScale));
    this.decals.add(splat);
  }

  private onPlayerDied(): void {
    GameState.player.halfHearts = GameState.player.maxHalfHearts;
    const spawn = this.manager.room.spawn;
    this.player.respawn(spawn.x, spawn.y);
    this.hostiles.clear(true, true); // destroy all live Walkers (and the Charger)
    // Spawners aren't hostile (not in `hostiles`), so clear them explicitly —
    // like the Charger, they stay gone until the Room rebuilds on re-entry.
    for (const spawner of this.spawners) spawner.destroy();
    this.spawners.length = 0;
    // Discard any running Gauntlet (ADR 0011): its Enemies were just cleared from
    // `hostiles`, so a still-running controller would march through its remaining
    // Waves around the empty anchor. It owns no retry — a real game-over re-arms
    // the once-ever Tripwire; this is interim cleanup, not failure handling.
    this.gauntlet?.destroy();
    this.gauntlet = undefined;
    eventBus.emit(GameEvent.PlayerDamaged); // refresh HUD to full
  }
}
