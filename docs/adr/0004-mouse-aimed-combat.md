# 0004 — Mouse-aimed, free-direction melee with circular hitboxes

## Status

accepted (supersedes the 4/8-directional combat assumption in CONTEXT.md and ADR 0002's
combat notes)

## Decision

Combat aim is driven by the mouse and decoupled from movement. The Player moves with the
keyboard (8-way) while the sword strikes toward the cursor at any angle (free 360°). There
is no single "facing": movement direction and Aim are independent. A swing re-aims toward
the live cursor every frame for its duration.

The sword hitbox is a **circle** placed along the Aim vector, not a rectangle.

## Considered options

- **4/8-directional, keyboard-facing combat (rejected).** The original Zelda-like plan:
  attack in the direction you face, hitbox snapped to N/E/S/W. Simpler, but it can't express
  "back away from an enemy while still hitting it," which is the feel we want.
- **Rotated rectangular hitbox aimed at the cursor (rejected).** Arcade physics bodies are
  axis-aligned and cannot rotate (the AABB constraint behind choosing Arcade over Matter).
  A tilted rectangle sprite would have a hitbox that lies about its true coverage.
- **Circular hitbox along the Aim vector (chosen).** A circle is rotation-invariant, so free
  aim only changes the hitbox's *position*, never its shape — collision stays honest at every
  angle.

## Consequences

This is a deliberate move away from the "early Zelda" combat feel toward a mouse-aimed,
twin-stick-style action model; the genre framing in CONTEXT.md was updated to match. The
Player exposes `aimAngle` (radians) rather than a discrete facing.

Knockback is applied directly away from the Player's position (not the hitbox), so it reads
correctly regardless of Aim angle. Future ranged or telegraphed enemy attacks should aim the
same way (toward a target point), keeping a single angle-based convention across combat.
