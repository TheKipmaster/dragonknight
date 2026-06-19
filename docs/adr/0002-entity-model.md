# 0002 — Composition-lite entities (Sprite subclasses + attachable behaviour components)

## Status

accepted

## Decision

Entities (Player, enemies, interactive objects) are Phaser Arcade `Sprite` subclasses, so
they stay native Phaser GameObjects. Behaviour that *varies across entity types* is pulled
out into small reusable component objects attached to the entity — e.g. `Health`,
`Knockback`, `AIController` — rather than expressed through a deep inheritance hierarchy.
This is not a full ECS: entities remain objects with methods; only the varying parts become
components.

## Considered options

- **Class-per-entity inheritance (rejected).** Fastest to start and the mainstream Phaser
  idiom, but hits the inheritance trap quickly — "flying + shooting + frozen" enemies force
  awkward hierarchies, and shared behaviour across unrelated types becomes copy-paste.
- **Full ECS, e.g. bitecs (rejected for MVP).** The scalable "correct" answer, but inverts
  effort: you build infrastructure before anything moves on screen, and you fight Phaser,
  which wants to own the sprite/GameObject layer. Too heavy for an MVP and a learning
  project.
- **Composition-lite (chosen).** Keeps Phaser-native sprite ergonomics while dodging the
  worst of the inheritance trap. Discipline required: only the bits that genuinely vary
  become components.

## Consequences

A future reader will ask "why isn't this ECS?" — this is the answer. If the entity count or
behaviour-combinatorics grow past what composition-lite handles comfortably, migrating to a
real ECS is the expected next step, and the component objects defined here are the natural
seam for that migration.

Damage flows through a single chokepoint: anything that deals damage produces an `Attack`
data bundle (amount, knockback strength, hitbox size/duration), and `Health.takeDamage()`
is the one place damage is applied — shared by the player's sword and enemy contact/attacks.
