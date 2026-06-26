# 0015 — Wiring the Title: a stateless Title, the Run reset on *entering Game*, and an interim death return

## Status

accepted (implements the `Boot → Preload → Title → Game` entry flow ADR 0013 specified but left unwired; pins *where* ADR 0013's "explicit reset/init entry point" is called; the Game Over screen and win Cutscene of ADR 0013 remain deferred)

## Decision

ADR 0013 settled the **Run lifecycle** on paper — Title as entry and loop-return, death ends the Run, a Game Over screen, a win Cutscene — but the code still booted straight `Preload → Game` and `onPlayerDied` respawned in place. This ADR wires the **entry half** of that loop and the Run reset it depends on; it deliberately ships less than ADR 0013's full vision (see *Scope*).

- **The Title is stateless; entering Game is what resets the Run.** The **Title screen** (CONTEXT.md) holds no `GameState` — it cannot touch Hearts, the active Room, or progress. It is a screen that points at the Game scene. The start-of-Run reset (ADR 0013's "explicit reset/init entry point") lives in `GameState.resetRun()` and is called at the **top of `GameScene.create()`**, not by the Title. Resetting becomes an **invariant of entering Game**: every path into Game (the Title now, the Game Over screen later) gets a fresh Run for free, with no caller obliged to remember to reset first.

- **The intro resolves the portrait/landscape mismatch by panning, not cropping.** The dropped title art is a **portrait** castle (1024×1536) but the viewport is **320×240 landscape**. Rather than crop or pillarbox, the background is pre-scaled to **width** (320×480 — twice the viewport height) and the Title pans the view **up** through it: it opens framed low on the castle gate and bridge, tweens up to reveal towers → mountains → sky, and fades the wordmark in over the sky above the castle, coming to rest on that composed frame. The whole composition is seen *over time*; nothing is discarded. This is the "self-contained animated intro" of CONTEXT.md — a tween in the Title scene, **not** a Cutscene (no director, no Actors).

- **Any key or click starts the Run, after a short input guard.** A Title screen is its own input context (no Player), so the in-world key meanings don't apply and "press any key" is the affordance. Input is ignored for the first ~300ms so a key still held from the previous Run (a death that returned here) can't instantly skip the Title.

- **Death returns to the Title via a fade — the interim stand-in for the Game Over screen.** `onPlayerDied` no longer respawns; it fades to black, stops the parallel UI scene, and starts the Title (which tears Game down). It does **not** reset state — the *next* entry into Game does. The full Game Over **screen** (ADR 0013: a press-to-continue beat) is deferred; the fade lands exactly where that screen will later slot, between the fade and the Title.

## Scope — what this ADR does *not* do

- **No Game Over screen yet.** Death fades straight to the Title; the bespoke press-to-continue screen of ADR 0013 is future work.
- **No win Cutscene yet.** Touching the Treasure still does not transition to the Title (the `GameScene` TODO stands). The win bridge needs the **cutscene director** (ADR 0012), which is unbuilt; pulling it in was out of scope for wiring the Title. The Treasure→Title return is the one loop seam still open.

## Considered options

- **Title owns the reset / a `Run.start()` module owns it (rejected).** Either the Title calls `resetRun()` before launching Game, or a shared lifecycle module does the reset *and* the transition. Both make the reset a step a caller must remember, and the Title-owns variant forces the Title to touch `GameState`, contradicting its "no Player, Room, or progress" definition. Making reset an invariant of `GameScene.create()` is the smaller, harder-to-forget design. The cost — Game's `create()` always wipes state, so a Run can't be *resumed* by re-entering Game — is free in the MVP, where Runs are in-memory and both death and victory reset.

- **Crop or pillarbox the portrait background (rejected).** Cover-and-crop loses the sky and foreground; pillarboxing leaves bars on a 320×240 screen that look unfinished. Scale-to-width + pan keeps the entire composition and turns the mismatch into the intro's motion.

- **A build-flag skip so the smoke harness boots straight to Game (rejected).** The smallest harness change, but it makes the game *flow differently under test* — the anti-pattern that tests must serve the game, not reshape it. The harness instead drives the real path: it waits for the Title, dispatches a keypress past the guard, and polls until Game is live.

## Consequences

`GameState` gains `resetRun()`, called at the top of `GameScene.create()`. The interim respawn-in-place body of `onPlayerDied` — and the Charger/Spawner/Gauntlet cleanup it did (ADR 0011) — is **removed**, not adapted: tearing Game down on death disposes of all of it (ADR 0013 foretold this).

`PreloadScene` now hands off to `Title`, which only ever points at `Game`. The parallel `UI` scene is launched from `GameScene.create()` itself — *after* `resetRun()` — so the HUD always reads fresh Run state, sidestepping a race on a death-return where it could otherwise paint the previous Run's Hearts. (Previously Preload launched the UI alongside Game.)

The smoke harness (`scripts/smoke.mjs`) no longer assumes Game is live at boot; it steps through the Title first. Its brittle fixed boot-wait gives way to polling scene state.

The deferred pieces leave two clearly-marked TODOs against ADR 0013: the Game Over screen (where the death fade currently lands) and the win Cutscene (the open Treasure→Title seam, gated on ADR 0012's director).
