# 0007 — Enemies path on a shared flow field

## Status

accepted (realises the "smarter enemies" item from the ROADMAP; builds on the Room collision contract of ADR 0005 and the AIController FSM of ADR 0002)

## Context

Enemies chased with a naive straight-line seek (`Angle.Between` toward the Player), so they snagged on any wall between them and the target. The MVP slice calls for enemies that route _around_ walls, pathing on the Tiled collision grid. The ROADMAP deferred the algorithm to implementation, framing the choice as **one shared distance map (Dijkstra/flow field) vs per-enemy A\***.

The deciding fact is already in the game: the spawner Switch produces a **swarm** of Walkers, all chasing the same target. Per-enemy A\* would run N independent searches; the targets are identical, so that work is N-fold redundant.

## Decision

**A single flow field per Room, shared by every enemy.** One weighted-Dijkstra flood from the Player's cell fills a cost-to-target map over the Room's walkable cells; each enemy steers by reading the local gradient (the lowest-cost neighbour). One search serves the whole swarm — adding enemies is free.

- **Weighted flood, with a wall-clearance penalty.** Stepping through a cell near a wall costs extra (a precomputed cells-to-nearest-wall map; a penalty for cells short of a 2-cell clearance). Paths therefore bow into the open and swing wide around corners instead of hugging walls, and a 1-wide corridor (no cheaper alternative) is still used. 8-connected, with **no corner-cutting** (a diagonal needs both shared orthogonal cells open). The clearance map is a function of the walls only, so it's computed up front and reused — recomputed only when the grid changes, never per retarget.
- **Steering is pure centre-seeking — no reactive avoidance.** Because the _route_ already keeps its distance from walls, an enemy just steers toward the centre of its lowest-cost neighbour. A Dijkstra field has no local minima, so steepest-descent steering can't stall or oscillate. (This replaced an earlier flow field that hugged walls and bolted on a reactive wall-avoidance force; that force was exactly a potential field, and walls on several sides summed to local minima — enemies wedged on corners or wobbled between two walls. Moving clearance into the _planning_ instead of the _steering_ removed the whole failure class. See Consequences.)
- **Static obstacles can be stamped in.** The wall layer is the only geometry the Room knows about, but non-wall solids (the practice dummies) would otherwise be invisible to routing — enemies would grind against them. `FlowField.blockRect(...)` marks every cell a body's footprint overlaps as solid, so the flood (and the clearance penalty) route around it. It stamps the whole footprint, not a centre point: an off-grid body straddles cells, and a single-cell stamp leaves the field routing enemies into the uncovered half. Only valid for _static_ solids; moving obstacles (other enemies) are left to physics collision, since a snapshot field can't cheaply track them.
- **The Room hands geometry down (ADR 0005).** A new `Room.buildNavGrid()` snapshots the wall layer into a plain `NavGrid` (cols/rows/solid flags). The representation (the `TilemapLayer`) stays private; the scene never reaches into wall bodies. Walls are static, so the grid is built once per activation.
- **The scene owns the field; enemies depend on a `Navigator` interface.** `GameScene` builds one `FlowField` per Room and `retarget()`s it at the Player every frame — the call early-outs unless the Player crossed into a new cell, so the flood only runs on a real change. Enemies take a `Navigator` (which `FlowField` implements), not the concrete class, keeping routing swappable in ADR 0002's composition-lite spirit.
- **Routing governs approach/chase only.** The Walker paths whenever aggro'd. The Charger paths to close distance, but its committed, telegraphed lunge stays a **straight line** locked at the Player's commit-time position — pathing never homes the strike. When `steer()` returns null (the enemy is in the Player's own cell, off-grid, or unreachable) the enemy falls back to a straight line, so the final approach stays smooth and contact still lands.

Proximity aggro is unchanged; line-of-sight gating stays deferred (backlog), keeping this change about geometry, not perception.

## Considered options

- **Shared flow field, weighted flood (chosen).** One search per recompute regardless of swarm size; the natural fit for many enemies, one target. The clearance weighting costs a priority queue (a small binary heap) over a plain FIFO, and the flood is wasteful for a lone enemy in a small Room — both cheap enough not to care.
- **Uniform-cost BFS + reactive wall-avoidance (tried, rejected).** Started here (a FIFO flood, no heap) and added a steering force to keep bodies off walls. The force was a potential field and inherited its local minima: enemies stalled on corners and oscillated between facing walls. Patching reactive forces with more reactive rules doesn't generalise; clearance belongs in the plan, not the steering.
- **Per-enemy A\* (rejected).** Simpler mental model and naturally smooth paths, but redundant for a swarm sharing a target, and it strains precisely when the spawner is doing its job. We'd be optimising the one-enemy case at the cost of the many-enemy case the design leans on.
- **Keep naive straight-line seek (rejected).** The original; fails the slice's "route around walls" requirement outright.

## Consequences

`Room` grows one method (`buildNavGrid`) — the per-interaction cost ADR 0005 anticipated for new geometry needs. Steering is 8-directional, a small visual departure from the old free-angle seek; acceptable, and it echoes the Player's own 8-way movement.

The field is recomputed only on the Player's tile change, so a stationary Player costs nothing and a moving one costs one flood per cell crossed. The clearance map is recomputed only when the grid changes (a `blockRect`), not per target. Because the grid is a snapshot, a Room whose geometry changed at runtime (e.g. a future destructible wall) would need to rebuild both; nothing does today.

The lesson worth keeping: **wall clearance is a planning concern, not a steering one.** Encoding it as a path cost gives a globally consistent, minimum-free field that simple steepest-descent steering follows without traps. The same instinct applies to any future "keep away from X" behaviour — bias the flood, don't bolt on a force.

To make the field inspectable, `FlowField` exposes a small read surface (`cols`/`rows`/`tileSize` /`solidAt`/`reachable`, alongside `steer`) that a toggleable debug overlay draws — per-cell flow arrows, solid cells, the target, unreachable pockets. It is what proved the field was sound and the snags were body-vs-geometry, steering the design toward clearance-in-the-plan; it earns the extra public surface.

A future line-of-sight feature can layer on top: steer straight when the Player is visible, follow the field when not — the `Navigator` seam already isolates that decision from the enemy FSMs.

## Amendment — aggro reads the field's routed distance

The original decision left proximity aggro "unchanged" (range-only straight-line distance), with wall-aware waking deferred. That gap let an enemy wake through a wall: a Player within straight-line `aggroRange` but on the far side of a wall would aggro despite having no line of sight.

We close it using the field already built here, no new perception system. The `Navigator` gains `pathDistance(x, y)` — the routed cost to the target read back out in pixels (the flood's value at the cell, ÷ `STEP_ORTHO` × `tile`). An enemy now wakes only when the Player is within straight-line `aggroRange` **and** the routed path is reachable and no longer than `AGGRO_PATH_RATIO`× (≈1.6) the straight line. A target across a wall is unreachable or a long way round, so it fails the second gate. The straight-line pre-check is kept, not subsumed: the flood is weighted (paths bow off walls), so a pure path threshold would clip the effective range inconsistently near walls.

The test lives in one helper, `withinAggro` (`components/aggro.ts`), shared by the Walker/Charger `inactiveState` and the stationary Spawner's proximity gate — one definition of "near, around the walls." Because the Spawner stamps its own footprint solid (so the flood never reaches its centre cell), `pathDistance` falls back to the nearest reachable neighbour — the distance to its doorstep.

This is geometry-distance line-of-sight, not the true raycast still sketched above; that stays deferred. It's a strict tightening — enemies wake in a subset of the cases they used to — so it needs no new tuning beyond the one ratio.
