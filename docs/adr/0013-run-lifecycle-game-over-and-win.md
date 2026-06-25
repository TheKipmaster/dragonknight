# 0013 — The Run lifecycle: death ends the Run, a Game Over screen, and the win-Cutscene bridge

## Status

accepted (amends ADR 0003's death model — respawn-in-place is retired; resolves the "real game-over" ADR 0011 anticipated; introduces the **Run** and **Game Over screen** of CONTEXT.md; extends ADR 0006's scene flow)

## Decision

The slice gains a real **Run lifecycle** with symmetric victory and defeat boundaries, both returning to the Title.

- **Death ends the Run.** When the Player's Hearts reach zero, the game no longer respawns the Player at the entrance with full Hearts. Instead `Game` stops and a **Game Over screen** is shown — a bespoke sibling scene to the Title (no Player, Room, or `GameState`), _not_ a Cutscene (it does not hand control back). A press resets the Run and returns to the Title. This is the "real game-over [that] resets the run" ADR 0011 deferred to; it retires that ADR's interim `onPlayerDied` respawn-in-place.

- **A Run is the unit that resets.** A **Run** (CONTEXT.md) is one playthrough from leaving the Title to victory or defeat. All Dungeon progress — Keys, opened Doors, fired Tripwires, sprung Traps — is **Run-scoped**: starting a new Run reinitialises `GameState` (Hearts to max, `activeRoomId` to the entrance, `progress` cleared). There is no persistence; a Run is in-memory only.

- **Victory is a Cutscene, not a screen.** Touching the Treasure fires a one-shot **win Cutscene** (ADR 0012) — in-world, over the Treasure Room, via the director — which on completion transitions to the **Title**. There is **no dedicated Victory screen**. The asymmetry with Game Over is deliberate: defeat is abrupt and needs a screen to land the beat; victory is earned and gets the richer in-world cutscene, so a static "you win" card would be redundant.

- **The win Cutscene is the only bridge between families.** Cutscenes/Dialogue are the _in-world_ family (take control, hand it back); the Title and Game Over are the _screen_ family (full takeover, no hand-back). The win Cutscene is the single seam where the in-world family ends by transitioning into a screen.

- **The scene flow.** `Boot → Preload → Title → Game (+ parallel UI)`, with two terminal exits from `Game` back to `Title`: the **Game Over** screen (on death) and the **win Cutscene** (on Treasure). Both reset the Run on the return, closing a replayable loop.

## Considered options

- **Keep the respawn-in-place loop, no Game Over (rejected).** The shipping MVP behaviour. Simplest, but leaves the "real game-over" TODO unbuilt, makes dying mid-Gauntlet a soft-lock (ADR 0011's known gap, since the once-ever Tripwire won't re-arm), and gives defeat no beat. The slice wants a closed, replayable loop on _both_ outcomes.

- **Game Over screen but keep progress on continue (rejected for the slice).** A softer, checkpoint feel: the screen acknowledges death, then respawns at the entrance with Keys/Doors intact. More forgiving, but it isn't a Run reset — it needs a separate "what persists across a continue" rule, and it doesn't resolve the Gauntlet re-arm cleanly (a re-entered Gauntlet whose Tripwire already fired stays dead). Run-reset is the simpler, more coherent model for a single-Dungeon slice and matches ADR 0011's "resets the run" language. Revisit if the Dungeon grows enough that a full reset feels punishing — that's a feel decision for the owner.

- **A dedicated Victory screen symmetric with Game Over (rejected).** Fully parallel structure (both outcomes end on a bespoke screen). Rejected as redundant: the win Cutscene already _is_ the celebratory payoff, so a static card after it adds a scene for nothing. The principled asymmetry (screen for the abrupt outcome, cutscene for the earned one) is the smaller design.

## Consequences

`onPlayerDied` changes meaning: it no longer refills Hearts and repositions the Player; it ends the Run and launches the Game Over scene. The Gauntlet's interim `onPlayerDied` discard (ADR 0011) and the Charger/Spawner cleanup it did become moot once `Game` is torn down on death — that interim code is removed, not adapted.

`GameState` gains an explicit **reset/init** entry point (start-of-Run), where before it was implicitly always-live from process start. Because `progress` is now Run-scoped and wiped on reset, the Gauntlet's once-ever `boss-fight` Tripwire re-arms naturally on the next Run — the soft-lock ADR 0011 flagged closes for free, with no `repeat`/persistence machinery.

ADR 0011's "Gauntlet leans on a game-over flow that does not yet exist" is now satisfied: dying in the sanctum ends the Run and the next Run re-arms the encounter, exactly as that ADR predicted.

This amends ADR 0003's "die → respawn at the Dungeon entrance with full Hearts" and ADR 0006's scene-flow note: the five-scene flow now also carries a `GameOver` terminal screen beside the `Title` entry screen. See the pointers added there.
