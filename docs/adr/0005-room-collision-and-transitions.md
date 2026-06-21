# 0005 — Room owns its collision; a RoomManager drives transitions

## Status

accepted (implements the Room lifecycle and door design from ADR 0001)

## Decision

**A Room owns its solid geometry.** The `Room` interface exposes behaviour, not data:
`addColliders(obj)` registers physics colliders between a dynamic object (or Group) and the
Room's walls, and `isSolidAt(x, y)` answers a point query. There is no public `walls` field.
The scene hands its entities *down* to the Room rather than reaching into wall bodies, so the
dependency points scene → Room and the scene never learns how collision is represented (a
`TilemapLayer`, a body group, …).

**A `RoomManager` owns the single active Room and the persistent Player.** Walking into a
door's overlap Zone triggers a transition: fade out → tear down the current Room's content
and `deactivate()` it → `activate()` the target → place the Player at the door's
`targetSpawn` → rewire doors → rebuild content → fade in. The Player is the through-line; it
is repositioned (`placeAt`), never rebuilt.

**Each side owns the lifetimes it creates.** The Room destroys the colliders and door Zones
it created on `deactivate()`. The scene builds and clears per-Room entity content through the
manager's `onEnter`/`onExit` hooks. Persistent physics (Player↔solids, group↔group) is wired
once and survives transitions.

## Considered options

- **Expose `walls: StaticGroup` (rejected).** The original interface. Forces a Tiled Room to
  rebuild one static body per solid tile, discarding native tile collision, and lets the scene
  reach into wall internals — the dependency points the wrong way.
- **Expose the `TilemapLayer` (rejected).** Efficient, but couples the scene to Phaser's
  tilemap API and leaks the representation; every new geometry need is a scene-side reach-in.
- **Behaviour methods `addColliders`/`isSolidAt` (chosen).** Minimal, idiomatic, keeps the
  representation private. The cost — each new geometry interaction (line-of-sight, etc.)
  becomes a new Room method — is acceptable and keeps capabilities explicit.
- **Ad-hoc transitions inside the scene (rejected).** Mixing room-swap orchestration into the
  gameplay scene tangles navigation with content and makes leak-free teardown easy to get
  wrong. A dedicated manager keeps the lifecycle in one place.

## Consequences

New ways of interacting with Room geometry grow the `Room` interface by a method each — a
deliberate trade for keeping the scene decoupled.

Room teardown destroys entities via `group.clear(true, true)`, which calls `destroy()` on each.
Any entity that creates **standalone scene objects** (not children of its sprite — Phaser has no
implicit parent/child outside a `Container`) must release them in a `destroy()` override, or they
leak across rooms. This bit the practice dummy's health bars and the Charger's telegraph lane.

The fade between Rooms is aesthetic, not a load mask (ADR 0001): all assets are already in
memory, so a transition is pure activation. A `transitioning` guard drops door re-triggers
while a fade is in flight, and arrival spawns are placed clear of their door Zone so the Player
does not immediately bounce back.
