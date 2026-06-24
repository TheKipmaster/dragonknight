# 0011 — Gauntlet: a third, Tripwire-triggered spawning mechanism

## Status

accepted (introduces the **Gauntlet** of CONTEXT.md; consumes the ADR 0010 Tripwire dispatch via the `boss-fight` handler; reuses ADR 0009's Spawner ring/telegraph, now extracted to a shared `SpawnRing`)

## Decision

Dragon Knight gains a **third** enemy-spawning mechanism, the **Gauntlet** (CONTEXT.md): a scripted, deterministic, finite sequence of Waves triggered by a Tripwire. It joins — rather than extends — the two of ADR 0009 (the autonomous, destroyable **Spawner**; the Player-held **Switch** spawn effect).

- **A controller, not an entity.** A Gauntlet has no body, no Health, and cannot be destroyed (CONTEXT.md). It is a scene-owned controller (the `TrickleSpawner` shape, not the `Spawner` entity shape): created when its Tripwire fires, ticked once a frame in `GameScene.update()`, discarded when done.
- **Deterministic, ordered Waves.** Its Waves come from a fixed, ordered recipe in `constants.ts` (the `SPAWNER` precedent — e.g. `SANCTUM_GAUNTLET`), each Wave the same Enemies every run. This is the axis that most distinguishes it from the Spawner, whose Wave is drawn _at random_ and repeats forever.
- **One advance-mode per Gauntlet.** Either `'clear'` (the next Wave spawns once every Enemy of the current one is dead — breather-paced) or `{ afterMs }` (the next Wave spawns on a timer regardless of kills — Waves may stack into escalating pressure). The mode governs only _when the next Wave spawns_.
- **Completion is mode-independent.** A Gauntlet is **cleared when all its Waves have spawned _and_ no Gauntlet Enemy is still alive** — the Player has fought _through_ it. On clear it runs an `onComplete` callback the starting handler supplies; the dispatch/Tripwire layer is not involved.
- **Spawns ring an authored anchor, telegraphed.** With no body to ring around, a Gauntlet rings its Wave members around the firing Tripwire's region centre (`ctx.region`, already in `TripwireContext`) — so the map authors the anchor for free, no new Tiled object or parser branch. Each Wave previews the same pulsing floor markers as a Spawner Wave; that ring-point picking + telegraph logic is extracted from `Spawner` into a shared `SpawnRing` so there is one implementation, not two.
- **No failure logic; once-ever trigger.** The `boss-fight` Tripwire stays once-ever (ADR 0010) — no `repeat`, no completion-keyed persistence. A Gauntlet knows only how to run _forward_; it owns no retry/reset path. Mid-Gauntlet death is the (future) game-over flow's concern: a real game-over resets the run, wiping `GameState.progress.tripwiresFired`, which re-arms the Tripwire for nothing. Designing a retry loop around today's placeholder `onPlayerDied` (respawn-in-place, keep progress) would be throwaway complexity. The one interim concession is scene cleanup: `onPlayerDied` **discards the active Gauntlet** beside where it already clears `spawners`, so a controller whose tracked Enemies were just cleared can't march through its remaining Waves around an empty anchor.

## Considered options

- **A `deterministic`/`sequential` mode on the Spawner (rejected).** The path ADR 0009 nominally pointed at ("extend the closest"). But a Gauntlet differs from a Spawner on every axis that has a flag: body vs none, destroyable vs not, random vs fixed, endless vs finite, autonomous vs triggered, cadence vs clear-gated. Collapsing them forces one component to carry mutually-exclusive flags and re-muddies the Switch/Spawner glossary 0009 just clarified — the same reasoning 0009 used to keep Switch and Spawner apart, now applied to keep Gauntlet apart from both.
- **Persist on completion + a `repeat` Tripwire for retry (rejected).** An earlier design made `boss-fight` `repeat: true`, gave the handler a running/cleared guard, and recorded a new `gauntletsCleared` set so re-crossing restarted a failed run. It solved a soft-lock that only exists because `onPlayerDied` is a placeholder — building real persistence and Tripwire-semantics changes around interim behaviour. Deferring failure to the game-over flow deletes all of it.
- **Hand-authored spawn points (deferred).** Named Tiled point objects for exact, designed Wave positions. More control, but needs a new object type, a parser branch, and a point-collection path. The region-centre ring covers the sanctum; revisit if an encounter needs hand-placed spots (the ADR 0009 / 0010 "extend when a real third need appears" posture).
- **A `GauntletCleared` event-bus notification (rejected for now).** Idiomatic ADR 0003 broadcast, but the only consumer (reveal Treasure / win Cutscene) is unbuilt, so it would be an event with no listener. A handler-supplied `onComplete` callback is local, single-owner, and adds no global surface; promote to a bus notification if a second consumer appears.

## Consequences

A future reader now sees **three** spawning mechanisms and will ask "why three, when 0009 said extend the closest?" — this is the answer: the Gauntlet shares only the surface verb ("spawn enemies") with the other two and differs on every meaningful axis, so a shared component would be flags-all-the-way-down. The lineage of "why N?" answers (Switch vs Spawner in 0009, eventBus vs Tripwires in 0010) gains one more entry.

`SpawnRing` becomes shared infrastructure: a change to ring geometry or telegraph feel now touches both the Spawner and every Gauntlet at once. That is the point, but it means the Spawner's spawn feel is no longer privately its own.

The Gauntlet leans on a game-over flow that does not yet exist. Until it lands, dying mid-Gauntlet in the sanctum is a known dead-end (the once-ever Tripwire won't re-arm) — an accepted placeholder gap, the same posture as the `boss-fight` handler it replaces. The interim `onPlayerDied` discard keeps that gap quiet rather than buggy.
