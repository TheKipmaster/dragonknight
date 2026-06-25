# 0006 — Narrative presentation: dialogue, a cutscene director, and the scripted-pause model

## Status

accepted (extends the scene layout and `GameState` of ADR 0003; reuses the door-trigger machinery of ADR 0005). **The dialogue _mode_ axis below is superseded by ADR 0014**: Dialogue always pauses, and the non-pausing "ambient" half is now the separate **Monologue** channel.

## Decision

**Dialogue renders in the parallel `UI` scene, not a new scene.** ADR 0003's `UI` scene already owns camera-independent overlays (the Hearts HUD); a Dialogue box is another such overlay, so its role widens from "HUD" to "HUD + narrative overlays." All of it flows over the event bus (`dialogue-start` / `-advance` / `-end`); `UI` and `Game` never reach into each other, per ADR 0003.

**A dialogue invocation carries a _mode_.** _Modal_ (cutscenes, conversations) locks Player control and **pauses the `Game` simulation** so the world freezes during a story beat. _Ambient_ (the Player's short in-world monologues) leaves gameplay running. Both step on a **dedicated advance key**, distinct from move/attack, so ambient lines can advance while the Player is mid-fight without firing a swing. _(Superseded by ADR 0014 — building this revealed the two "modes" as two concepts: the Dialogue box now **always** pauses, and the non-pausing case became the standalone **Monologue**. The dedicated advance key survives, but it is owned by `UIScene`, since a paused `Game` can't poll it.)_

**Amendment (Tripwires, ADR 0010).** The "map-authored trigger Zones" below are realized by the **Tripwire** mechanism (ADR 0010): the director and Dialogue system are ordinary Tripwire handlers, and the once-only "seen" tracking moves _out_ of the director into Tripwire's central progress-backed guard. Modality (pausing `Game`, locking the Player) stays the handler's job.

**Cutscenes are a lean in-world director, not a scripting engine.** A Cutscene is a Player-locked timeline played _over the active `Game` scene_ by a director with a bounded verb set: show modal Dialogue, pan/focus the camera, move/spawn an entity, wait, and fire a state event (e.g. open a Door). It uses the Room's real entities and camera — it is content the `Game` scene runs, not a separate Scene.

**"Seen" is progress, not a runtime flag.** Cutscenes fire from game events or map-authored trigger Zones (the same overlap-Zone mechanism as Doors, ADR 0005). Each fires **once**; the seen-flag lives in `GameState.progress` alongside keys held and Doors opened, so it survives Room teardown (ADR 0001) and the death → respawn-to-entrance loop and never replays. Cutscenes are **skippable** via a key that jumps to the end and applies the end-state.

**The Title screen is a sibling scene with a bespoke intro, _not_ the director.** The scene flow becomes `Boot → Preload → Title → Game (+ parallel UI)`. The Title's landscape-into-castle pan is a self-contained tween inside the `Title` scene, because the Title has no Player, Room, or `GameState` for the in-world director to drive. The win flow (touching the Treasure) plays a one-shot win Cutscene, then returns to `Title`, closing a replayable loop.

## Considered options

- **A dedicated Dialogue scene (rejected).** Cleaner isolation, but a third overlapping scene to coordinate with `Game` + `UI` for a widget that is fundamentally another camera-independent overlay. Widening the existing `UI` scene is less machinery.
- **Dialogue always blocking, or always non-blocking (rejected).** Cutscenes need the world frozen; the Player's in-world asides must not freeze it. Blocking is a property of the _invocation_, not the system.
- **A full timeline tool — parallel tracks, arbitrary tweens (rejected).** Reusable but far beyond a vertical slice. A small fixed verb set stages the intro/win beats we actually need.
- **Reusing the cutscene director for the Title intro (rejected).** The director is coupled to a live Room and Player-lock; the Title has neither. A bespoke tween avoids contorting the director into a context it wasn't built for.
- **Firing cutscenes every time their trigger is met (rejected).** Zero progress tracking, but the intro would replay on every death given the respawn-to-entrance loop. Once-only via `GameState.progress` is mandatory.

## Consequences

`Game` becomes **pausable by a `UI`-scene event** — a new coupling direction (presentation suspends simulation). Keep it funnelled through the event bus and the pause owned by `Game`; don't let `UI` reach in to stop bodies directly.

`GameState.progress` gains a class of **narrative flags** beside its gameplay progress. That's deliberate — both are "things that must outlive a Room teardown" (ADR 0001) — but it means the win/intro state is part of the same save surface if persistence ever lands.

The cutscene director joins the `Room` interface (ADR 0005) as another consumer of Room geometry and entities; new director verbs that touch the world should go through the Room's behaviour methods, not reach into its internals.

This ADR amends ADR 0003's four-scene list (`Boot / Preload / Game / UI`) to a five-scene flow with a `Title` entry scene and a `UI` scene whose remit now includes narrative overlays. See the pointer added there.
