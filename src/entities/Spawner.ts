import Phaser from 'phaser';
import { SPAWNER, TEX, TILE } from '../config/constants';
import { Health } from '../components/Health';
import { withinAggro } from '../components/aggro';
import type { Navigator } from '../components/FlowField';
import type { Room } from '../world/Room';
import type { Attack, Damageable } from '../combat/Attack';
import { eventBus, GameEvent } from '../state/eventBus';

/** Creates one Enemy of `kind` at (x, y), registers it, and returns it so the
 *  Spawner can track it against the live-children cap. Supplied by the scene,
 *  which owns the entity groups (mirrors the Switch's `onTick`). */
export type SpawnFn = (
  kind: string,
  x: number,
  y: number,
) => Phaser.Physics.Arcade.Sprite;

/** The per-Spawner gameplay numbers; SPAWNER supplies the defaults, a map's
 *  `spawner` object overrides them (ADR 0009). The ring geometry, wave recipes
 *  and presentation stay global in SPAWNER — only these scalars vary per nest. */
export interface SpawnerConfig {
  /** Hit points; destroying them stops it for good. */
  maxHp: number;
  /** Dormant until the Player comes within this distance (px). */
  aggroRange: number;
  /** Cadence between Wave spawns, pop-to-pop (ms). */
  intervalMs: number;
  /** Lead/reaction window a Wave is previewed before it pops (ms). */
  telegraphMs: number;
  /** Skip cycles while this many of its own spawn are alive. */
  maxLiveChildren: number;
}

/** One member of an in-flight Wave: its kind and the telegraphed ring point. */
interface PendingMember {
  kind: string;
  x: number;
  y: number;
}

/** dormant: Player out of range, holding. idle: waiting out the cadence gap.
 *  telegraphing: a Wave's markers are up, counting down to the pop. */
type SpawnerState = 'dormant' | 'idle' | 'telegraphing';

/**
 * The Spawner (CONTEXT.md; ADR 0009): a stationary, destroyable nest. Once the
 * Player enters `aggroRange` it telegraphs and conjures a Wave — a batch drawn
 * at random from `SPAWNER.waves` — at wall-free points in a tight ring around
 * *itself*, then repeats on a cadence. Each Wave is previewed for `telegraphMs`
 * (the reaction window: floor markers showing exactly where Enemies will appear)
 * before it pops. Cycles never overlap and only one is ever in flight, so death
 * cleanup is "clear the single pending Wave's markers".
 *
 * It is an Enemy subtype in code (a Damageable in `attackables`, so the sword
 * fells it) but does *not* itself damage the Player — its threat is what it
 * conjures. It is a solid, static obstacle (blocks the Player and Enemies, and
 * the scene stamps it into the flow field so Enemies route around it). When its
 * Health hits zero it stops for good; its already-spawned Enemies keep roaming.
 */
export class Spawner
  extends Phaser.Physics.Arcade.Sprite
  implements Damageable
{
  private readonly health: Health;

  private phase: SpawnerState = 'dormant';
  /** When the next telegraph may begin (idle) — the cadence gap. */
  private nextTelegraphAt = 0;
  /** When the in-flight Wave pops (telegraphing). */
  private spawnAt = 0;
  private dead = false;

  private pending: PendingMember[] = [];
  private readonly markers: Phaser.GameObjects.Image[] = [];
  /** Enemies this Spawner has produced; pruned to the still-alive for the cap. */
  private children: Phaser.Physics.Arcade.Sprite[] = [];

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly target: Phaser.GameObjects.Sprite,
    private readonly room: Room,
    private readonly config: SpawnerConfig,
    private readonly nav: Navigator,
    private readonly spawn: SpawnFn,
  ) {
    super(scene, x, y, TEX.spawner);
    scene.add.existing(this);
    scene.physics.add.existing(this, true); // static body: stationary + immovable

    this.health = new Health(scene, config.maxHp, { onDeath: () => this.die() });
  }

  /** Drive proximity gating and the telegraph/spawn cadence. Call once per frame. */
  update(now: number): void {
    if (this.dead) return;

    // Wall-aware: a Player on the far side of a wall won't wake the nest, even
    // when within straight-line range (ADR 0007). Shared with the mobile enemies.
    const inRange = withinAggro(this.nav, this.x, this.y, this.target, this.config.aggroRange);

    if (this.phase === 'dormant') {
      if (inRange) this.beginTelegraph(now); // wake → telegraph a Wave immediately
      return;
    }

    if (!inRange) {
      this.sleep(); // Player disengaged: pause, drop any in-flight telegraph
      return;
    }

    if (this.phase === 'idle') {
      if (now >= this.nextTelegraphAt) this.beginTelegraph(now);
    } else if (now >= this.spawnAt) {
      this.popWave(now);
    }
  }

  /** Choose a Wave recipe and raise its telegraph markers — unless the live-child
   *  cap is hit or no wall-free point can be found, in which case the cycle is
   *  skipped and retried after a full interval. */
  private beginTelegraph(now: number): void {
    if (this.liveChildren() >= this.config.maxLiveChildren) {
      this.idleFor(now, this.config.intervalMs);
      return;
    }

    const recipe = Phaser.Utils.Array.GetRandom(
      SPAWNER.waves as unknown as { kind: string; count: number }[][],
    );
    const pending: PendingMember[] = [];
    for (const part of recipe) {
      for (let i = 0; i < part.count; i++) {
        const point = this.pickPoint();
        if (point) pending.push({ kind: part.kind, x: point.x, y: point.y });
      }
    }

    if (pending.length === 0) {
      this.idleFor(now, this.config.intervalMs);
      return;
    }

    this.pending = pending;
    for (const m of pending) this.markers.push(this.makeMarker(m.x, m.y));
    this.phase = 'telegraphing';
    this.spawnAt = now + this.config.telegraphMs;
  }

  /** The telegraph elapsed: materialise the whole Wave, then return to idle for
   *  the remainder of the cadence (so pop-to-pop equals intervalMs). */
  private popWave(now: number): void {
    for (const m of this.pending) {
      this.children.push(this.spawn(m.kind, m.x, m.y));
    }
    this.pending = [];
    this.clearMarkers();
    this.idleFor(now, Math.max(0, this.config.intervalMs - this.config.telegraphMs));
  }

  private idleFor(now: number, gapMs: number): void {
    this.phase = 'idle';
    this.nextTelegraphAt = now + gapMs;
  }

  /** Player left aggro range: hold and clear any in-flight telegraph so it isn't
   *  "owed" a spawn on return — re-approaching re-telegraphs from scratch. */
  private sleep(): void {
    this.pending = [];
    this.clearMarkers();
    this.phase = 'dormant';
  }

  /** A wall-free point in the tight ring around the Spawner, clamped to the Room,
   *  or null if none found within `attempts` (the caller skips the member). */
  private pickPoint(): { x: number; y: number } | null {
    for (let i = 0; i < SPAWNER.attempts; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Phaser.Math.Between(SPAWNER.minRadius, SPAWNER.maxRadius);
      const x = Phaser.Math.Clamp(this.x + Math.cos(angle) * dist, TILE * 1.5, this.room.widthPx - TILE * 1.5);
      const y = Phaser.Math.Clamp(this.y + Math.sin(angle) * dist, TILE * 1.5, this.room.heightPx - TILE * 1.5);
      if (this.room.isSolidAt(x, y)) continue;
      return { x, y };
    }
    return null;
  }

  /** A pulsing floor reticle marking where a Wave member is about to appear. */
  private makeMarker(x: number, y: number): Phaser.GameObjects.Image {
    const mark = this.scene.add
      .image(x, y, TEX.spawnMark)
      .setTint(SPAWNER.markColor)
      .setDepth(SPAWNER.markDepth);
    this.scene.tweens.add({
      targets: mark,
      scale: { from: 0.7, to: 1.2 },
      alpha: { from: 0.4, to: 1 },
      duration: this.config.telegraphMs / 3,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    return mark;
  }

  private clearMarkers(): void {
    for (const m of this.markers) {
      this.scene.tweens.killTweensOf(m);
      m.destroy();
    }
    this.markers.length = 0;
  }

  /** Drop destroyed children so the cap counts only Enemies still on the field. */
  private liveChildren(): number {
    this.children = this.children.filter((c) => c.active);
    return this.children.length;
  }

  /** Damageable: the sword chips its Health. Stationary, so no knockback; no
   *  i-frames, so a full combo lands (HP is tuned in combos). */
  hit(attack: Attack): void {
    if (this.dead || !this.health.takeDamage(attack.damage)) return;
    this.flash();
  }

  private flash(): void {
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(80, () => {
      if (!this.dead) this.clearTint();
    });
  }

  /** Out of health: stop for good. Cancel the in-flight Wave, drop a blood splat
   *  (it is a creature — EnemyDied), and crumble. Living children are left be. */
  private die(): void {
    this.dead = true;
    this.pending = [];
    this.clearMarkers();
    (this.body as Phaser.Physics.Arcade.StaticBody).enable = false;
    eventBus.emit(GameEvent.EnemyDied, this.x, this.y);
    this.scene.tweens.add({
      targets: this,
      scale: 0,
      alpha: 0,
      angle: 90,
      duration: SPAWNER.deathMs,
      ease: 'Quad.in',
      onComplete: () => this.destroy(),
    });
  }

  /** Markers are standalone scene Images, so they must be torn down explicitly —
   *  otherwise they leak when the Spawner is destroyed via group.clear() on Room
   *  teardown (which bypasses die()). Idempotent with die()/sleep(). */
  destroy(fromScene?: boolean): void {
    this.dead = true;
    this.clearMarkers();
    super.destroy(fromScene);
  }
}
