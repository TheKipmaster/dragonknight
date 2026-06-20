# Roadmap

The MVP goal, current status, and backlog. Architectural *decisions* live in
[`docs/adr/`](./adr); domain *terms* live in [`CONTEXT.md`](../CONTEXT.md). This
file is the "what we're building and what's left" — keep it current as work lands.

_Status as of 2026-06-19._

## MVP goal

A playable **vertical slice**: the first Dungeon, with every system represented
once and nothing more. It must prove the whole loop end to end, not be content-complete.

### The slice

**Player can:**
- Move 8-directionally (keyboard), aim and attack with the mouse (free 360°)
- Swing the sword (3-beat combo), deal damage + knockback
- Take damage, lose Hearts, get i-frames + knockback
- Die → respawn at the Dungeon entrance with full Hearts (no save)

**The Dungeon has:**
- ~4–5 Rooms connected by Doors with fade transitions
- Two enemy types: a contact wanderer **and** a telegraphed attacker
- One locked Door + one Key — the core progression gate
- One push-Block puzzle (shove a Block onto a Switch to open a path)
- A goal: a final Room with a **Treasure** that ends the slice (a win state)

**HUD:** Hearts.

### Explicitly out of scope (post-MVP)

Persistence/saving · a real boss (the Treasure stands in) · multiple weapons ·
inventory UI · more than two enemy types · pathfinding · gamepad input.

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
- [x] Spawner `Switch` (spawns Walkers while stood on; colour change)
- [x] Headless smoke test (boot + behavioural assertion)

### Remaining for the MVP
- [ ] **Tiled Room(s) + Door transitions** — replace the placeholder Room; exercise the Room lifecycle (ADR 0001) for real
- [ ] **Telegraphed enemy** — second AI shape (wind-up → strike), enemy-initiated `Attack`
- [ ] **Key + locked Door** — the progression gate
- [ ] **Push-Block puzzle** — `Block` + `Switch` (door-opening flavour of the Switch)
- [ ] **Treasure + win state** — final Room goal
- [ ] **Art pass** — revisit placeholder primitives once the feel is proven

## Backlog / deferred ideas

Things raised during the build and consciously deferred — not forgotten.

- **Fuller smoke assertions** — drive the actual sword swing via input; assert contact damage drops a Heart; assert the combo deals 2→3→5; assert respawn refills Hearts.
- **Per-beat combo differentiation** — currently only damage scales; could give the finisher a bigger/heavier hitbox.
- **Adjacent-Room preloading** — the ADR 0001 optimisation; only needed for a larger/streaming world.
- **Smarter enemies** — A* pathfinding and line-of-sight (naive seek for now).
- **Refactor `Health` to an injectable store** — only if a third persistent-health entity appears (today the Player keeps Hearts in `GameState`; see Player class comment).
- **Gamepad input** — keyboard + mouse only for the MVP, behind an input-mapping indirection later.
- **Split the `Switch` term** — if the "spawner trap vs progression trigger" overload starts to chafe, introduce a distinct `Trap`/`Spawner` concept.
