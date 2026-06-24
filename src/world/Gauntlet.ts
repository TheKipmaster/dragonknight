import Phaser from 'phaser';
import { GAUNTLET } from '../config/constants';
import { SpawnRing } from './SpawnRing';
import type { Room } from './Room';

/** One part of a Wave recipe: how many of a kind to spawn (the SPAWNER.waves
 *  shape). A Gauntlet Wave is a list of these, conjured together. */
export interface WavePart {
  readonly kind: string;
  readonly count: number;
}

/** How a Gauntlet advances between Waves (one mode for the whole encounter,
 *  ADR 0011): `'clear'` waits until the current Wave's Enemies are all dead;
 *  `{ afterMs }` advances on a timer regardless of kills (Waves may stack). */
export type AdvanceMode = 'clear' | { readonly afterMs: number };

/** A Gauntlet's authored content: a fixed, ordered list of Waves and the one
 *  advance mode they progress under. Lives in constants.ts per encounter. */
export interface GauntletRecipe {
  readonly advance: AdvanceMode;
  readonly waves: readonly (readonly WavePart[])[];
}

/** Spawns one Enemy of `kind` at (x, y) and hands it back so the Gauntlet can
 *  track it for clear-detection. Supplied by the scene, which owns the entity
 *  groups (mirrors the Spawner's SpawnFn). */
export type GauntletSpawnFn = (
  kind: string,
  x: number,
  y: number,
) => Phaser.Physics.Arcade.Sprite;

/** One member of an in-flight Wave: its kind and the telegraphed ring point. */
interface PendingMember {
  kind: string;
  x: number;
  y: number;
}

/** telegraphing: a Wave's markers are up, counting to the pop. fighting: a Wave
 *  is live on the field (clear-mode waits for it to die; timer-mode for the
 *  clock). breather: the post-clear pause before the next telegraph (clear-mode).
 *  done: every Wave spawned and every Enemy dead — or the controller discarded. */
type Phase = 'telegraphing' | 'fighting' | 'breather' | 'done';

/**
 * The Gauntlet (CONTEXT.md; ADR 0011): a scripted, deterministic, finite
 * sequence of Waves triggered by a Tripwire. Unlike the Spawner it has no body,
 * isn't destroyable, and draws no Wave at random — it runs a fixed, ordered
 * recipe and *ends*, the Player fighting through it. A scene-owned controller
 * (the TrickleSpawner shape, not the Spawner entity shape): created when its
 * Tripwire fires, ticked once a frame, discarded when done.
 *
 * It rings each Wave's members around an authored anchor (the firing Tripwire's
 * region centre) and telegraphs them with the shared SpawnRing — the same floor
 * markers as a Spawner Wave. The advance mode governs only *when the next Wave
 * spawns*; completion is mode-independent — all Waves spawned *and* no Gauntlet
 * Enemy still alive, at which point it runs the `onComplete` the starting handler
 * supplied (the sanctum's deferred Treasure/win payoff).
 *
 * It owns no failure/retry path (ADR 0011): a real game-over flow resets the run.
 * The scene discards it on Player death as interim cleanup.
 */
export class Gauntlet {
  private readonly ring: SpawnRing;

  /** Index of the last Wave begun; -1 until the first telegraph. */
  private waveIndex = -1;
  /** Starts in the breather with nextAt=0 so the first update lazily begins Wave
   *  0 (the scene constructs us in a handler that has no scene clock). */
  private phase: Phase = 'breather';
  /** When the in-flight telegraph pops (telegraphing). */
  private spawnAt = 0;
  /** When to begin the next Wave: the breather's end (clear-mode) or the timer
   *  deadline (timer-mode). */
  private nextAt = 0;

  private pending: PendingMember[] = [];
  /** Every Enemy this Gauntlet has spawned; pruned to the still-alive. */
  private children: Phaser.Physics.Arcade.Sprite[] = [];

  constructor(
    scene: Phaser.Scene,
    room: Room,
    private readonly anchorX: number,
    private readonly anchorY: number,
    private readonly recipe: GauntletRecipe,
    private readonly spawn: GauntletSpawnFn,
    private readonly onComplete: () => void,
  ) {
    this.ring = new SpawnRing(scene, room, {
      minRadius: GAUNTLET.minRadius,
      maxRadius: GAUNTLET.maxRadius,
      attempts: GAUNTLET.attempts,
      markColor: GAUNTLET.markColor,
      markDepth: GAUNTLET.markDepth,
    });
  }

  /** Drive the telegraph/spawn/advance cadence. Call once per frame. */
  update(now: number): void {
    switch (this.phase) {
      case 'done':
        return;
      case 'telegraphing':
        if (now >= this.spawnAt) this.popWave(now);
        return;
      case 'breather':
        if (now >= this.nextAt) this.beginTelegraph(now);
        return;
      case 'fighting':
        this.tickFighting(now);
        return;
    }
  }

  /** Raise the next Wave's telegraph markers at wall-free ring points around the
   *  anchor, counting down to the pop. */
  private beginTelegraph(now: number): void {
    const recipe = this.recipe.waves[++this.waveIndex];
    this.pending = [];
    for (const part of recipe) {
      for (let i = 0; i < part.count; i++) {
        const point = this.ring.pickPoint(this.anchorX, this.anchorY);
        if (point) this.pending.push({ kind: part.kind, x: point.x, y: point.y });
      }
    }
    for (const m of this.pending) this.ring.raiseMarker(m.x, m.y, GAUNTLET.telegraphMs);
    this.phase = 'telegraphing';
    this.spawnAt = now + GAUNTLET.telegraphMs;
  }

  /** The telegraph elapsed: materialise the Wave (tracking each member for
   *  clear-detection) and start fighting it. Timer-mode schedules the next Wave
   *  from this pop, regardless of kills. */
  private popWave(now: number): void {
    for (const m of this.pending) this.children.push(this.spawn(m.kind, m.x, m.y));
    this.pending = [];
    this.ring.clearMarkers();
    this.phase = 'fighting';
    if (this.recipe.advance !== 'clear') this.nextAt = now + this.recipe.advance.afterMs;
  }

  /** A Wave is live: decide whether to advance or complete. */
  private tickFighting(now: number): void {
    const moreWaves = this.waveIndex < this.recipe.waves.length - 1;

    if (this.recipe.advance === 'clear') {
      if (this.liveChildren() > 0) return; // current Wave not yet cleared
      if (!moreWaves) return this.complete();
      this.nextAt = now + GAUNTLET.breatherMs; // cleared: breathe, then the next
      this.phase = 'breather';
      return;
    }

    // timer-mode: the next Wave spawns on the clock; the encounter ends only once
    // the last Wave's Enemies are all down.
    if (moreWaves) {
      if (now >= this.nextAt) this.beginTelegraph(now);
    } else if (this.liveChildren() === 0) {
      this.complete();
    }
  }

  /** Drop destroyed children so the live count reflects only Enemies still up. */
  private liveChildren(): number {
    this.children = this.children.filter((c) => c.active);
    return this.children.length;
  }

  /** Cleared: stop, tear down any markers, and fire the encounter's payoff. */
  private complete(): void {
    this.phase = 'done';
    this.ring.clearMarkers();
    this.onComplete();
  }

  /** Discard the controller (scene teardown / Player-death cleanup, ADR 0011):
   *  stop ticking and clear any in-flight telegraph. Spawned Enemies live in the
   *  scene's `hostiles` group and are cleared there, not here. Idempotent. */
  destroy(): void {
    this.phase = 'done';
    this.ring.clearMarkers();
  }
}
