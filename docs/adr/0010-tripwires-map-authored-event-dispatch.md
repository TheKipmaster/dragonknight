# 0010 — Tripwires: one map-authored region dispatched to single-handler code callbacks

## Status

accepted (realizes the "map-authored trigger Zones" half of ADR 0006; extends `GameState.progress`
per the ADR 0003 amendment; reuses the Door zone-ownership and Switch overlap-wiring seams of
ADR 0005)

## Decision

A **Tripwire** (CONTEXT.md) is an invisible map region that runs an authored behaviour when the
Player crosses into it. Rather than grow a typed parser branch per behaviour (the door/key/trap/
spawner pattern), Tripwires are handled by **one generic mechanism** with a clean split between
*where/when* (authored in Tiled) and *what* (code callbacks):

**One generic map object, not a branch per behaviour.** `TiledRoom.readObjects` gains a single
`tripwire` branch — forever. A `tripwire` is a rectangle whose logical name rides in a property
(`event: "intro"`), the way a `door` carries `targetRoom`. It parses to a generic
`TripwireSpawn { id, x, y, w, h, name, repeat, props }`; `Room` gains `readonly tripwires`. The
parser learns nothing about cutscenes, dialogue, spawning, or AI — only how to turn a rectangle
into a named zone with its properties.

**Tiled triggers are spatial-only.** A Tripwire's position *is* its firing condition. Game-event-
driven firing (e.g. "Treasure touched → win Cutscene") stays in code on the existing `eventBus`;
authoring a non-spatial condition as a map object would place a shape in space to mean something
that isn't spatial. Both sources wake the *same handler functions* — a handler is a plain closure,
so `eventBus.on(GameEvent.X, () => handler(ctx))` reuses it without the Tripwire layer's
involvement.

**Dispatch is a dedicated, single-handler command registry — not the event bus.** A small
`Map<TripwireName, handler>`-backed `Tripwires` module exposes `on(name, handler)` / `fire(name,
ctx)`. A Tripwire is a **command** ("run this now", exactly one owner), distinct from `eventBus`
**notifications** ("this happened", N listeners; ADR 0003). The map enforces single-ownership,
isolates the namespace (a Tripwire can only fire through `fire`, not a stray `emit`), and keeps
ADR 0003's notification bus semantically clean.

**Names are typed by the `ROOM_IDS` idiom; the Tiled boundary fails loud.** `TRIPWIRE_NAMES`
(`as const`) derives `type TripwireName`, so handler registration is compile-checked. The one
place a typo can survive is the authored Tiled string, which is validated at parse/populate time
and warned-and-skipped exactly like a malformed `door` — including the "fired a Tripwire with no
registered handler" gap (handlers may be authored before their system, e.g. cutscenes, exist).

**Firing is once-ever by default, guarded centrally.** The registry records a fired Tripwire's
`${roomId}#${objId}` in `GameState.progress` (mirroring `trapsSprung`) and refuses to fire it
again, so it survives Room teardown and the respawn-to-entrance loop — killing the "intro replays
on every death" bug class ADR 0006 flagged. Handlers stay pure behaviour; they never see the
seen-flag. A `repeat: true` Tiled property opts a Tripwire into firing on every crossing
(edge-triggered via a `wasInside` reset, since Phaser overlap fires every frame inside).

**Handlers are closures fed `{ region, props }`; targeting is region/room-scoped.** Handlers
register once in `GameScene` and close over the persistent groups (`hostiles`, the Player,
`spawnEnemy`, the future Cutscene director), so the fire-time context carries only per-instance
data. "Change enemy AI" means "wake the hostiles in this region" (often the whole active Room) —
a spatial query over `hostiles`, not per-entity references.

**Ownership recombines existing seams.** The Room owns the zone (created in `readObjects`,
destroyed in `deactivate()` — the Door pattern); `GameScene` owns the overlap wiring and the
registry (torn down in `clearContent()` beside `switchOverlap` — the Switch pattern). No new
ownership model.

## Considered options

- **Extend the typed-branch pattern per behaviour (rejected).** A `cutscene`/`dialogue`/`ambush`
  branch each, with its own `*Spawn` interface and `populate()` loop. Familiar, but it couples a
  *parsing* concern to *gameplay* concerns and explodes with every new behaviour — the exact
  scaling fear that motivated this design.
- **Dispatch over the existing `eventBus` (rejected).** One channel for everything. But a typed
  facade over the emitter just *becomes* the registry, and backing it with a broadcast bus
  enforces no single-ownership, exposes a public namespace any code can `emit` into, and blurs
  ADR 0003's notification/command split. Type safety was never the differentiator (a wrapper
  recovers it either way); semantics and cardinality are.
- **A unified spatial-or-event trigger object in Tiled (rejected).** Author the firing condition
  as a property so "game event" is one option. It would place meaningless rectangles on the map
  for non-spatial conditions and reinvent `eventBus.on` in map data.
- **Per-entity id targeting (deferred, not rejected).** A Tripwire pointing at specific authored
  enemy objects by id. Precise, but needs an `objId → live entity` resolution layer the
  group-oriented entity model doesn't have. Region scope covers the MVP cases; revisit when a
  level must wake *some but not all* enemies sharing a region (ADR 0009's "extend the closest
  mechanism when a real third need appears").
- **Handler-owned once-guard (rejected).** Each handler checks its own seen-flag. Flexible but
  re-implements the guard everywhere, and forgetting it *is* the ADR-0006 replay bug. Centralizing
  it makes the safe behaviour the default.

## Consequences

A future reader sees **two dispatch mechanisms** (`eventBus` and `Tripwires`) and will ask "why
two?" — this is the answer, the same shape of question ADR 0009 settled for spawners: notifications
(broadcast, past-tense) vs. commands (single-handler, imperative). Keep firing Tripwires *only*
through `fire`, never from the bus, and vice versa.

`GameState.progress` gains a `tripwiresFired` set beside keys/doors/traps-sprung — a continuation
of the ADR 0003 amendment's "anything that must survive Room teardown," not a new category of
concern. It is one more thing a future save file would hold.

This **realizes ADR 0006's "map-authored trigger Zones"**: the Cutscene director and Dialogue
system become ordinary Tripwire handlers, and "seen" tracking moves *out* of the director into the
central guard here. Modality (a Cutscene pausing `Game`, locking the Player) remains the handler's
job — the dispatch layer never touches the pause, preserving ADR 0003's single pause owner.

The Tiled side stays **stringly-typed at the boundary** by necessity (map data can't be
compile-checked); the fail-loud warning is the only line of defense there, so it must cover both
malformed names and unhandled-but-valid names.

"trigger" remains the **informal umbrella** for any overlap-fired region (a Door's `DoorTrigger`
zone, a Switch, a Trap, a Tripwire); the named concept is the **Tripwire** (CONTEXT.md).
