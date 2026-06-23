# 0001 — Per-Room tilemaps with an explicit Room lifecycle

## Status

accepted

## Decision

Each Room is authored as its own Tiled map and loaded as an independent unit. Only one Room is _active_ (has live entities, physics bodies, and AI) at a time. We deliberately reject modelling the whole Dungeon as a single large seamless tilemap.

To keep transitions hitch-free without on-demand asset loading, all Room tilemap JSON and the shared tileset image are preloaded at boot (the data is small for a single-Dungeon MVP). A Room transition is therefore pure _activation_ + camera re-bound, not an I/O event; the fade-to-black between Rooms is aesthetic, not a load mask.

## Considered options

- **One big seamless tilemap (rejected).** Gives LttP-style seamless scrolling across Rooms, but keeps every entity in every Room live, makes the map file unwieldy to author, and front-loads culling/perf work. Seamless overworld scrolling is not an MVP goal.
- **Per-Room maps, load on demand (rejected for MVP).** Loading a Room's assets at the moment of transition reintroduces a hitch. Unnecessary because the whole Dungeon's data fits comfortably in memory.
- **Per-Room maps, all data preloaded at boot (chosen).** Simple, zero transition hitch, small live entity set.

## Consequences

Loading is split into two costs that must stay separate: **asset I/O** (expensive, done once at boot) and **Room activation** (cheap, done per transition). To keep future optimisations (e.g. background-preloading adjacent Rooms for a larger world) a drop-in rather than a rewrite, a Room exposes an explicit four-phase lifecycle:

```ts
interface Room {
  // Ensure this Room's assets are in memory. No-op in MVP (boot preloads everything).
  // Future: streaming worlds call this on neighbours ahead of a transition.
  load(): Promise<void>;

  // Build the tilemap, spawn entities, set up colliders, bound the camera to Room size.
  // Cheap and synchronous; assumes load() already ran.
  activate(): void;

  // Despawn entities and release the live set (physics bodies, AI timers).
  // Keeps assets in memory.
  deactivate(): void;

  // Drop this Room's assets from memory. Unused in MVP.
  destroy(): void;
}
```

Global/cross-Room state (player stats, inventory, dungeon progress) must live _outside_ the Room, since a Room is torn down on every transition.

A door/transition is a Tiled object-layer rectangle carrying `targetRoom` and `targetSpawn` custom properties: which Room to activate, and where to place the player on arrival.
