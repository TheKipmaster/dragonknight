import Phaser from 'phaser';
import { GameState } from './GameState';

/**
 * The Tripwire command registry (ADR 0010).
 *
 * A Tripwire (CONTEXT.md) is an invisible map region that runs an authored
 * behaviour when the Player crosses into it. This module is the dispatch seam:
 * the map authors *where/when* (a `type: 'tripwire'` rectangle, its name in
 * `obj.name`); code registers *what* via `on(name, handler)`.
 *
 * Deliberately NOT the event bus (ADR 0003): a Tripwire is a single-handler
 * *command* ("run this now"), not a broadcast *notification* ("this happened").
 * The map enforces one owner per name, the namespace is private (a Tripwire can
 * only fire through `fire`), and the bus stays notification-only.
 *
 * Once-ness is guarded centrally here, not in handlers (so a handler is pure
 * behaviour and the "intro replays on every death" bug of ADR 0006 can't recur):
 * a non-`repeat` Tripwire records its `${roomId}#${objId}` in
 * `GameState.progress.tripwiresFired` and refuses to fire again, surviving Room
 * teardown and the respawn-to-entrance loop like a sprung Trap.
 */

/** The single source of truth for valid Tripwire names — the `ROOM_IDS` idiom.
 *  `on()` is typed against the derived union, so a typo there is a *compile*
 *  error; the only stringly-typed surface left is the authored Tiled `name`,
 *  which TiledRoom validates against this list and warns-and-skips (ADR 0010). */
export const TRIPWIRE_NAMES = ['aggro', 'boss-fight', 'intro'] as const;
export type TripwireName = (typeof TRIPWIRE_NAMES)[number];

/** What a handler receives: only the per-instance authoring data it can't close
 *  over. `region` is the Tripwire's world-space rectangle (for region-scoped
 *  targeting); `props` are its remaining Tiled custom properties. */
export interface TripwireContext {
  readonly region: Phaser.Geom.Rectangle;
  readonly props: Readonly<Record<string, string>>;
}

/** What `fire()` receives: the handler context plus the dispatch-layer bits the
 *  central once-guard needs (and that handlers never see). */
export interface TripwireFireContext extends TripwireContext {
  /** Persistent `${roomId}#${objId}`, the once-guard key. */
  readonly id: string;
  /** Fire on every crossing instead of once-ever (the `repeat` Tiled property). */
  readonly repeat: boolean;
}

type TripwireHandler = (ctx: TripwireContext) => void;

class Tripwires {
  private readonly handlers = new Map<TripwireName, TripwireHandler>();

  /** Bind the behaviour for a Tripwire name. One owner per name — registering a
   *  second is almost always a mistake (a Tripwire is a command, not a broadcast),
   *  so warn rather than silently fan out. */
  on(name: TripwireName, handler: TripwireHandler): void {
    if (this.handlers.has(name)) {
      console.warn(`Tripwire "${name}" already has a handler — overwriting (a Tripwire is single-handler).`);
    }
    this.handlers.set(name, handler);
  }

  /** Run a Tripwire's behaviour, applying the central once-guard. Called by the
   *  Tripwire runtime on the entering edge; safe to call repeatedly (a fired
   *  once-Tripwire no-ops). */
  fire(name: TripwireName, ctx: TripwireFireContext): void {
    if (!ctx.repeat && GameState.progress.tripwiresFired.has(ctx.id)) return;
    const handler = this.handlers.get(name);
    if (!handler) {
      // A valid name with no handler: almost always authored ahead of its system
      // (e.g. a Cutscene Tripwire before the director lands, ADR 0010). Fail loud.
      console.warn(`Tripwire "${name}" (${ctx.id}) fired with no registered handler.`);
      return;
    }
    // Record *before* running so a throwing handler still can't re-fire.
    if (!ctx.repeat) GameState.progress.tripwiresFired.add(ctx.id);
    handler(ctx);
  }

  /** Drop all handlers — called on Game-scene shutdown so a scene restart starts
   *  clean (handlers close over the scene; see GameScene.create). */
  clear(): void {
    this.handlers.clear();
  }
}

/** Process-wide registry, mirroring the `eventBus` singleton (state/eventBus.ts). */
export const tripwires = new Tripwires();
