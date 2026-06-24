# Roadmap

The MVP goal, current status, and backlog. Architectural _decisions_ live in [`docs/adr/`](./adr); domain _terms_ live in [`CONTEXT.md`](../CONTEXT.md). This file is the "what we're building and what's left" — keep it current as work lands.

_Status as of 2026-06-22._

## MVP goal

A playable **vertical slice**: the first Dungeon, with every system represented once and nothing more. It must prove the whole loop end to end, not be content-complete.

### The slice

**Player can:**

- Move 8-directionally (keyboard), aim and attack with the mouse (free 360°)
- Swing the sword (3-beat combo), deal damage + knockback
- Take damage, lose Hearts, get i-frames + knockback
- Die → respawn at the Dungeon entrance with full Hearts (no save)

**The Dungeon has:**

- ~4–5 Rooms connected by Doors with fade transitions
- Two enemy types: a contact wanderer **and** a telegraphed attacker, both pathfinding around walls (proximity aggro; not omniscient line-of-sight)
- One locked Door + one Key — the core progression gate
- One push-Block puzzle (shove a Block onto a Switch to open a path)
- A goal: a final Room with a **Treasure** that ends the slice (a win state)

**HUD:** Hearts.

**Presentation & atmosphere** (the slice grew here — these are now must-haves, not polish):

- A **Title screen** as the entry point; the win flow returns to it (replayable loop)
- **Atmospheric Lighting** — Rooms can be authored darker, with light sources (torches, a glowing Treasure, a Player aura). Mood only, never gates visibility
- **Dialogue boxes** (modal + ambient) and scripted **Cutscenes** — at least an intro and a win cutscene, fired once and tracked in `GameState.progress`

### Explicitly out of scope (post-MVP)

Persistence/saving · a real boss (the Treasure stands in) · multiple weapons · inventory UI · more than two enemy types · gamepad input.

## Status

### Done

- [x] Scaffold: Phaser 3 + TypeScript + Vite; Boot/Preload/Game/UI scenes
- [x] Placeholder Room with camera scroll + walls; Room lifecycle seam (ADR 0001)
- [x] Player movement (8-way), mouse-aimed sword, 3-beat combo (2/3/5 damage)
- [x] Move-slow for the duration of a combo
- [x] `Health` component, `Attack` damage chokepoint, `Knockback` component
- [x] Practice dummy (combat test rig)
- [x] Player damage loop: Hearts, i-frames, knockback, death → respawn
- [x] First mobile enemy: `Walker` (naive seek, contact damage) on the `AIController` FSM
- [x] Telegraphed enemy: `Charger` (committed wind-up → lunge) on the `AIController` FSM; reusable `inactive`/aggro state both enemies share
- [x] Spawner `Switch` (spawns Walkers while stood on; colour change)
- [x] Headless smoke test (boot + behavioural assertion)
- [x] **Tiled Room(s) + Door transitions** — replace the placeholder Room; exercise the Room lifecycle (ADR 0001) for real (collision contract + RoomManager: ADR 0005)
- [x] **Key + locked Door** — the progression gate (map-authored lock/key; persistent in `GameState.progress`)
- [x] **Smarter enemies (pathfinding)** — enemies route around walls on a shared flow field (one weighted-Dijkstra flood from the Player serves the swarm, with a wall-clearance penalty so paths swing wide of corners; ADR 0007). Governs approach/chase only; the Charger's committed lunge stays a straight line. Includes a 'P'-toggle debug overlay.
- [x] **Tripwires** — map-authored invisible regions (`type: 'tripwire'`, name in `obj.name`) that run an authored behaviour when the Player crosses in (CONTEXT.md; ADR 0010). One generic parser branch serves every behaviour; what each does is bound by name to a single-handler code callback in a dedicated **command registry**, deliberately distinct from the notification `eventBus` (ADR 0003). Once-ever by default, guarded centrally in `GameState.progress.tripwiresFired` (`repeat:true` opts into every-crossing); the `aggro` handler wakes a Room's dormant Enemies via `Activatable`. Realizes the **trigger-region** half the **Cutscenes** item below needs — the director/Dialogue become ordinary handlers.
- [x] **Gauntlet** — a Tripwire-triggered, deterministic, finite sequence of **Waves** (CONTEXT.md; ADR 0011), the sanctum's boss stand-in started by the `boss-fight` handler. A bodiless, scene-owned controller (not a destroyable Spawner, not a Player-held Switch — a **third** spawning mechanism): it rings each Wave around the firing Tripwire's region centre and telegraphs it with a shared `SpawnRing` (extracted from the Spawner), advancing on one mode per encounter — `'clear'` (next Wave when the current is dead) or `{ afterMs }` (timed). Cleared when all Waves have spawned and no Gauntlet Enemy is left, running an `onComplete` payoff (the sanctum's reveal-Treasure/win wires in later). Owns no failure path — a real **game-over** (below) re-arms the once-ever Tripwire; `onPlayerDied` discards the controller as interim cleanup. Recipe in `constants.ts` (`SANCTUM_GAUNTLET`); smoke-asserted (2→1 Waves, clear-advance, completion).

### Remaining for the MVP

- [ ] **Treasure + win state** — the goal in the final Room. Touching the Treasure is the win: it fires a one-shot win **Cutscene**, then returns to the **Title screen**, closing the loop so the slice is replayable from the front door.
- [ ] **Traps** — hidden magic-glyph floor hazards (`Trap`, CONTEXT.md). Invisible until an entity steps on one, then an instant flash + hit — no Telegraph. **Victim-aware damage** through the ADR 0002 chokepoint (ADR 0008): a survivable bite to the Player, lethal to an ordinary Enemy, so you can lure Enemies onto them. Discriminated by two overlaps (`player × traps`, `enemies × traps`), not a `faction` concept. Springs once free, then stays **permanently visible** and **re-arms on a cadence** (lit = live, dimmed = safe). Map-authored as `name: "trap"` point objects with per-Trap overrides via Tiled props; tunables centralised in `constants.ts`. "Discovered" persists in `GameState.progress` (ADR 0003 amendment — `progress` now also carries hazard memory). Needs a smoke assertion (Player drops 2 Hearts, a Walker dies) and likely surfaces the dead-Charger bug below (a lured Charger killed mid-lunge takes the same `die()` path).
- [ ] **Art pass** — revisit placeholder primitives once the feel is proven. Now has two dependents: it supplies the **Portraits** the Dialogue system needs, and it should land in step with **Lighting** (placeholder primitives have no normal maps — favour an overlay/render-texture lighting approach over Phaser's Light2D pipeline).
- [ ] **Dialogue boxes** — a framed text box at the bottom of the screen with a **portrait** of the speaker. Purely a **presentation layer** — no interactive NPC entity enters scope; the "speaker" is whatever name/portrait the script supplies (cutscene characters, intro narration, the Player). Renders in the parallel `UI` scene (extends ADR 0003's UI-scene role to narrative overlays) and is driven over the event bus (`dialogue-start`/`-advance`/`-end`), never reaching into `Game`. A dialogue invocation has a **mode**: _modal_ (cutscenes/conversations — locks Player control, pauses `Game` simulation) or _ambient_ (the Player's short in-world monologues — gameplay keeps running). Both step via a **dedicated advance key** so ambient lines don't collide with move/attack. A script is an ordered list of lines, each with speaker, portrait id, and text.
- [ ] **Cutscenes** — a scripted, Player-locked timeline run in-world over the `Game` scene by a **lean director** with a bounded verb set: show modal Dialogue, pan/focus the camera, move/spawn an entity, wait, and fire a state event (e.g. open a Door). Fired by game events or map-authored **trigger regions** (reusing the door-trigger machinery, ADR 0005); each fires **once**, with "seen" recorded in `GameState.progress` (ADR 0003) so it survives Room teardown and the respawn-to-entrance loop and never replays. **Skippable** via a key that jumps to the end and applies the end-state.
- [ ] **Title screen** — the game's entry scene, inserted in the flow as `Boot → Preload → Title → Game` (ADR 0003). A landscape pans down into a castle with the logo fading in beside it — a **bespoke tween/camera move inside the `Title` scene**, not the in-world cutscene director (the Title has no Player/Room/`GameState`). Minimal "press to start"; no load/options menu (no persistence in the slice). The win flow returns here.

## Known bugs

- **Dead Charger persists** — a Charger killed during its committed wind-up/lunge is not torn down: the sprite stays on screen with no health, collision, or movement, looping its wind-up pulse forever. Likely `die()` racing the committed-state timeline (the FSM keeps ticking the wind-up tween/lane during the death tween, or `onDeath` not firing mid-commit).

## Backlog / deferred ideas

Things raised during the build and consciously deferred — not forgotten.

- [ ] **Push-Block puzzle** — `Block` + `Switch` (door-opening flavour of the Switch). The Block shoves in grid-aligned steps on the Tiled collision grid (ADR 0005) onto a Switch to open a path. Switch state model (held-while-pressed vs latch-open-permanently) deferred to implementation/level design.
- [ ] **Lighting (atmospheric)** — a Room can be authored darker (a per-map ambient darkness property, ADR 0001), with **light sources** casting a radial gradient. Mood only — never gates visibility (geometry, Enemies, Player stay visible; LoS-style fog is out of scope). A light source is one **emitter** concept (radius/intensity/colour) positioned by an owner: static torches authored in Tiled, plus entity-owned emitters so the **Treasure glows** (draws the eye to the goal) and the **Player** carries a faint aura (no black-silhouette in dim Rooms). Sequence with the Art pass — placeholder primitives have no normal maps, so favour an overlay/render-texture approach over Phaser's Light2D pipeline.
- **Fuller smoke assertions** — drive the actual sword swing via input; assert contact damage drops a Heart; assert the combo deals 2→3→5; assert respawn refills Hearts.
- **Per-beat combo differentiation** — currently only damage scales; could give the finisher a bigger/heavier hitbox.
- **Adjacent-Room preloading** — the ADR 0001 optimisation; only needed for a larger/streaming world.
- **Refactor `Health` to an injectable store** — only if a third persistent-health entity appears (today the Player keeps Hearts in `GameState`; see Player class comment).
- **Line-of-sight aggro** — enemies only notice the Player when they can see them (and lose them when sight breaks), instead of proximity aggro. A stealthier feel; deferred out of the pathfinding item to keep that one about geometry, not perception.
- **Gamepad input** — keyboard + mouse only for the MVP, behind an input-mapping indirection later.
- **Split the `Switch` term** — _resolved._ The hazard half became its own **Trap** concept (CONTEXT.md, ADR 0008) — a hidden, victim-harming floor glyph. The spawner half is now the distinct **Spawner** entity (CONTEXT.md, ADR 0009) — a destroyable, autonomous nest — separate from the Switch's Player-triggered spawn effect, which stays a Switch effect.
