# 0009 — Two spawning mechanisms: the destroyable Spawner entity vs. the Switch's spawn effect

## Status

accepted

## Decision

Dragon Knight keeps **two distinct enemy-spawning mechanisms** rather than unifying them:

- **The Switch's spawn effect** (`src/world/Switch.ts`, `SPAWN_SWITCH` constants): a floor trigger that, _while the Player stands on it_, spawns Enemies in a ring around the **Player**. Healthless, Player-driven, and a world/arena element — an extension of the deliberate Switch concept (CONTEXT.md).
- **The Spawner entity** (`SPAWNER` constants): a stationary, **destroyable** Enemy-subtype that _autonomously_ telegraphs and conjures Waves around **itself** on a cadence, and stops for good once its `Health` is destroyed. A combat objective, not a Player-operated trigger.

They are deliberately separate concepts with separate terms in CONTEXT.md (Switch vs. Spawner), and both remain available to maps.

## Considered options

- **Unify into one spawner (rejected).** Tempting — both "spawn enemies on a cadence." But the two differ on every axis that matters: who triggers them (Player presence vs. autonomous), where Enemies appear (around the Player vs. around the source), whether they can be destroyed (no vs. yes), and what role they play (puzzle/arena pacing vs. a combat objective you shut off at the source). Collapsing them would force a single component to carry mutually-exclusive flags and would muddy the glossary the project just clarified.
- **Replace the Switch effect with the Spawner (rejected).** The Player-triggered, spawn-around- the-Player behaviour is its own useful toy (e.g. a Switch-gated arena wave). Removing it to avoid having two mechanisms would delete a capability to save a concept, not a cost worth paying.
- **Keep both, distinct (chosen).** They are different toys with different feels. The cost is living with two code paths that superficially resemble each other; the resolution is the vocabulary split (Switch effect vs. Spawner entity) so the resemblance never causes confusion.

## Consequences

A future reader seeing both a Switch that spawns and a Spawner that spawns will ask "why two?" — this is the answer. The split also resolves the long-standing "rename the spawner-flavoured Switch" open item in ROADMAP.md: the Switch's effect stays a Switch effect, and "Spawner" now names the distinct destroyable entity. If a third spawning need appears that is neither of these, prefer extending the closest of the two over introducing a third mechanism.
