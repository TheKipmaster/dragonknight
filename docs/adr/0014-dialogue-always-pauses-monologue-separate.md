# 0014 — Dialogue always pauses; the Monologue is a separate non-pausing channel

## Status

accepted (supersedes ADR 0006's dialogue _mode_ axis; refines how ADR 0012's `say` step and the cutscene director relate to the pause)

## Decision

ADR 0006 modelled narrative text as **one** system with two _modes_ — `modal` (pauses `Game`) and `ambient` (non-pausing Player asides). Building against that revealed it as two concepts wearing one coat. This ADR splits them and fixes the pause semantics.

- **The Dialogue box always pauses.** There is no longer a mode flag. Showing a Dialogue line **always** `scene.pause('Game')`s — full freeze, the scene clock included — and locks the Player. The pause is **owned by `Game`**, which subscribes to `dialogue-start` / `dialogue-end` on the event bus and pauses/resumes _itself_ (ADR 0006's "UI never reaches into Game"). The advance key is **owned by `UIScene`**, not `Game`: a paused `Game` stops polling its keys (including the Player's `WASD`/`Space`), so the only scene that can read the advance press is the always-live `UI` scene, which walks the line list and emits `dialogue-advance` / `-end`.

- **A Cutscene is strictly interleaved, not "paused throughout."** Because every Dialogue line fully pauses (clock included), a Cutscene cannot talk and animate at once. The director alternates: a `say` step pauses `Game` for its duration; a `move` / `camera` / `wait` step runs with `Game` resumed so tweens animate; then the next `say` pauses again. Characters converse frozen and move _between_ lines.

- **The director holds a cinematic lock across the whole Cutscene.** `scene.pause` only freezes the world _during_ the dialogue moments. In the resumed gaps (a `move` step), the clock is live, so without a guard the Player could walk and Enemies could chase mid-Cutscene. The director therefore holds a **cinematic lock** — Player input off, Enemy AI off — for the Cutscene's entire run, composed with the per-line pause. This is the concrete mechanism behind ADR 0006's "Player-locked" Cutscene, distinct from the dialogue pause.

- **The Monologue is a separate channel (CONTEXT.md).** The non-pausing case — the Player thinking aloud — is no longer a dialogue mode. It is the **Monologue**: world-space text that floats above the Player, drifts up, and fades on a timer (the existing `RoomManager.denied()` "locked" cue is the template), drawn in `Game`, with no box, no Portrait, no pause, and no advance input. It shares no code with the Dialogue box; it is fired fire-and-forget.

- **A line resolves its speaker through a registry.** A Dialogue line is `{ speaker, text }`. A central speaker registry maps `speaker → { name, portrait? }` (CONTEXT.md "Portrait keyed by speaker; not every line needs one" — the narrator has none). Art wires in one place; lines stay terse. The box tolerates a missing Portrait (the art pass is pending) by rendering a blank bust.

- **Text reveal is a two-stage typewriter.** A line types out character-by-character; the advance key **completes** the current line's reveal if still typing, and **advances** to the next line once fully shown. Reveal speed lives in `constants.ts`.

## Considered options

- **Keep ADR 0006's one-system-two-modes (rejected).** Modelling the Player's fleeting self-talk as a non-pausing _mode_ of the same Dialogue box forces one component to be both a screen-anchored, pausing, advance-driven, multi-speaker box _and_ a transient, world-space, input-less, Player-only float. They share no rendering, no input model, and no lifecycle — the only thing in common is "shows words." Two concepts (Dialogue box, Monologue) are clearer than one flagged one.

- **Modal dialogue keeps the clock live instead of a full pause (rejected).** Pause only Player input + Enemy AI, leaving the scene clock running, so a Cutscene could pan the camera _while_ a character speaks. More cinematic, but it means the world isn't truly frozen during a conversation (physics, knockback, telegraphs all keep ticking under the box) and every system must honour a soft "suspended" flag Arcade physics won't respect. The owner chose the simpler model: dialogue freezes everything, choreography happens in the gaps.

- **Advance key owned by `Game` (rejected).** Natural home beside the Player's other keys, but a paused `Game` stops polling them — the key would die exactly when needed. `UIScene` ownership is forced by the always-pause decision.

- **Per-line speaker name + portrait id (rejected).** Spelling out the name and portrait on every line allows per-line expressions without a registry, but repeats the portrait id across every script and scatters art wiring. A registry centralises it; a line may override the portrait later if expressions are wanted.

## Consequences

ADR 0006's "_A dialogue invocation carries a mode_" decision is superseded: there is no mode. The non-pausing half it described is now the Monologue (CONTEXT.md), a separate channel; the pausing half is the only Dialogue behaviour. ADR 0012's reference to "ambient … Tripwire handlers" as a dialogue caller is corrected — the Dialogue box's callers are the cutscene director and conversation Tripwire handlers; Monologues are not Dialogue callers.

A new cross-scene split is firm: `Game` owns the pause (and the cutscene cinematic lock), `UIScene` owns the Dialogue rendering and the advance key, the event bus carries `dialogue-start/-advance/-end` between them. Neither reaches into the other (ADR 0003).

Dialogue scripts are inspectable data (ordered `{ speaker, text }` lines), so a smoke test can assert a cutscene's line count or a script's speakers without running Phaser — the same leverage `SANCTUM_GAUNTLET` and the declarative Cutscene (ADR 0012) give.

The cutscene director gains real responsibility beyond walking steps: it must raise and drop the cinematic lock around the whole timeline, and it must tolerate the pause/resume churn of interleaved `say` steps without losing its place (its `await` chain resolves on bus events, which fire regardless of scene pause).
