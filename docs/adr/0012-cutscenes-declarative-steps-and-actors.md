# 0012 — Cutscenes as declarative step-lists, a director that walks them, and Actors as puppets

## Status

accepted (makes ADR 0006's "lean in-world director" concrete; the director is launched by ADR 0010 Tripwire handlers, as ADR 0006's amendment foretold; introduces the **Actor** of CONTEXT.md)

## Decision

ADR 0006 settled _that_ Cutscenes are a Player-locked, in-world director with a bounded verb set. This ADR settles _what shape_ that director and its content take.

- **A Cutscene is declarative data, not imperative code.** A `Cutscene` is an ordered array of typed steps — `{ say, ... }`, `{ move, target, to, ms }`, `{ spawn, ... }`, `{ despawn, ... }`, `{ camera, ... }`, `{ wait, ms }`, `{ fire, event }`. A single `CutsceneDirector` is a generic interpreter that walks the list, `await`-ing each step's completion before the next. Scripts live in a data module (the `constants.ts` / `SANCTUM_GAUNTLET` precedent), not as functions.

- **Dialogue is a separate system the director merely calls.** Per ADR 0006, the Dialogue box renders in the `UI` scene over the event bus. A `say` step opens a **modal** line and `await`s `dialogue-end` before advancing; a cutscene's conversation is just a run of `say` steps. The text box is built once and shared — the director is one caller, ambient/conversation Tripwire handlers are others. The director owns no text rendering.

- **Actors are will-less puppets (CONTEXT.md).** Cutscene "characters" are a new entity concept distinct from Enemy and from the deferred NPC: no `AIController`, no `Health`, no `hostiles`/`attackables` membership, nothing damages them. The director spawns one (id assigned by the `spawn` step), **moves it by direct authored tween** — ignoring walls, physics bodies, and the flow-field — and despawns it (an optional death puff is the "kill"). The Player is addressable as `'player'` while under director control.

- **Cutscenes ride existing launch seams — no new registry.** A map-located Cutscene is fired by an ordinary Tripwire handler that calls `director.play(SCRIPT)` (ADR 0010); a game-event Cutscene (the win, on touching the Treasure) is the same call from a Treasure Tripwire handler. There is no Cutscene-name registry mirroring `tripwires` — the Tripwire seam already _is_ the map-authored dispatch, and `play()` is the code-event path.

- **Skip exploits the declarative form.** The skip key tells the director to walk the remaining steps applying only the **state-mutating** ones instantly (`fire`, final `move`/`spawn`/`despawn` end-positions) and dropping the **cosmetic** ones (`wait`, camera tweens, in-flight movement). The terminal world-state is reached without replaying the choreography. "Seen" persistence stays ADR 0010's central Tripwire guard.

## Considered options

- **Imperative async cutscene handlers (rejected).** A cutscene as an `async` function `await`-ing director verbs — the most direct fit for ADR 0010's "name → code callback" culture. Rejected because skip is fragile: a suspended function can't be inspected for its future, so every verb must carry an abort-check and the terminal state must be re-expressed separately; and it's hard to test (you must run it against a mocked director). The cost is losing in-script branching (`if`/`for`) — acceptable, because all our Cutscenes are **fixed timelines**; a future conditional beat uses a `fire` step into code rather than branching in the script.

- **A full timeline tool — parallel tracks, arbitrary tweens (rejected, per ADR 0006).** A flat sequential step list is deliberately _not_ this; the rejection there stands.

- **A dedicated Cutscene registry mirroring `tripwires` (rejected).** A second `name → script` dispatch alongside the Tripwire registry. Redundant: Tripwire handlers already provide map-authored dispatch, and `director.play()` covers code events. A second registry would be parallel machinery for no new capability.

- **Reusing Enemy entities as cutscene puppets (rejected).** Driving a `Walker` as a "king" drags the flow-field, aggro, Health, and group membership into something that should only stand and talk — and means fighting the `AIController` to keep it still. A purpose-built Actor with none of that is less machinery, not more.

- **Pathfinding Actor movement (rejected).** Routing Actors around walls via ADR 0007's field — but that field is a single flood toward the _Player_ and can't path an arbitrary Actor to an arbitrary point without a second navigation system. Authored choreography wants a deterministic tween the author controls, not emergent pathing.

## Consequences

The `CutsceneDirector` joins the `Room` interface (ADR 0005) as a consumer of Room geometry, camera, and entities, exactly as ADR 0006 anticipated; verbs that touch the world should go through Room behaviour methods, not reach into internals.

A new **Actor** entity type exists that is in none of the combat groups. A future reader will ask "why isn't a talking character just an Enemy with AI off?" — this ADR is the answer: an Actor shares no combat machinery, so reuse would be suppression-all-the-way-down (the same "differs on every axis" reasoning ADR 0009/0011 used for Switch/Spawner/Gauntlet).

Cutscene scripts are now **inspectable data**: a smoke test can assert on a script's steps (e.g. "the win Cutscene fires the Treasure-reveal event," "the intro has N lines") without running Phaser — the same leverage `SANCTUM_GAUNTLET` gives the Gauntlet test.

The split "Dialogue is a system, the director is a caller" means the dedicated advance key, the modal pause of `Game` (ADR 0006), and the text-box rendering have exactly one implementation; the director must not grow its own.
