import Phaser from 'phaser';

/**
 * A walkability snapshot of a Room, in grid cells (ADR 0005: the Room hands its
 * geometry *down* as a nav grid rather than exposing its TilemapLayer). Walls
 * don't move, so a Room builds this once on activation and the FlowField reuses
 * it for that Room's lifetime.
 */
export interface NavGrid {
  readonly cols: number;
  readonly rows: number;
  /** Cell size in world pixels (= TILE). */
  readonly tile: number;
  /** Solid (blocked) flag per cell, row-major (`row * cols + col`). */
  readonly solid: boolean[];
}

/**
 * Steers an entity toward a target while routing around walls. The enemy FSMs
 * depend on this interface, not on the concrete FlowField, so the routing
 * strategy stays swappable (ADR 0002's composition-lite spirit).
 */
export interface Navigator {
  /**
   * A unit step direction from world point (x, y) toward the current target,
   * following walls. Returns null when the caller should fall back to a
   * straight line: the point sits in the target's own cell (final approach),
   * is unreachable, or is off-grid. The returned vector is a shared scratch —
   * read it immediately, don't retain it.
   */
  steer(x: number, y: number): Phaser.Math.Vector2 | null;
}

/** Integer step costs (scaled so a diagonal ≈ √2 orthogonals). */
const STEP_ORTHO = 10;
const STEP_DIAG = 14;
/** Keep paths at least this many cells off a wall when an alternative exists. */
const CLEAR_WANT = 2;
/** Extra cost per cell a path runs short of CLEAR_WANT — bows routes into the
 *  open. Big enough to prefer a short detour over hugging a wall, small enough
 *  that a 1-wide corridor (no alternative) is still used. */
const CLEAR_COST = 12;
/** Sentinel "not reached" for the integer distance/clearance maps. */
const UNREACHED = 0x7fffffff;

/** 8-connected neighbour offsets: 4 orthogonal first, then 4 diagonal. */
const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/**
 * A shared flow field over a Room's nav grid (the smarter-enemies decision,
 * ADR 0007). One weighted-Dijkstra flood from the target's cell fills a
 * cost-to-target map across every walkable cell; any number of enemies then
 * steer by reading the gradient, so a Walker swarm costs one search, not one
 * per enemy.
 *
 * The flood is *weighted*: stepping through a cell near a wall costs extra (a
 * clearance penalty), so paths bow into the open and swing wide around corners
 * rather than hugging walls. That keeps the routing — not the steering —
 * responsible for wall clearance: enemies then follow the field with plain
 * centre-seeking, no reactive avoidance, so there are no potential-field local
 * minima to oscillate or stall in. Movement is 8-connected but never cuts a wall
 * corner (a diagonal step needs both shared orthogonal cells open).
 */
export class FlowField implements Navigator {
  /** Cost to the target per cell; UNREACHED = unreachable (or solid). */
  private readonly dist: Int32Array;
  /** Cells to the nearest wall per cell (Chebyshev); 0 on a wall. Walls are
   *  static, so this is recomputed only when the grid changes, not per target. */
  private readonly clearance: Int32Array;
  private clearanceDirty = true;
  /** FIFO frontier reused by the clearance flood (cell indices). */
  private readonly queue: Int32Array;
  /** Binary min-heap for the Dijkstra flood: parallel key/cell arrays. */
  private readonly heapKey: Int32Array;
  private readonly heapCell: Int32Array;
  private heapSize = 0;
  private popKey = 0;

  private targetCol = -1;
  private targetRow = -1;
  private readonly step = new Phaser.Math.Vector2();

  constructor(private readonly grid: NavGrid) {
    const cells = grid.cols * grid.rows;
    this.dist = new Int32Array(cells);
    this.clearance = new Int32Array(cells);
    this.queue = new Int32Array(cells);
    // At most one improving push per directed edge (≤ 8 per cell).
    this.heapKey = new Int32Array(cells * 8);
    this.heapCell = new Int32Array(cells * 8);
  }

  private isSolid(col: number, row: number): boolean {
    return this.grid.solid[row * this.grid.cols + col];
  }

  private inBounds(col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < this.grid.cols && row < this.grid.rows;
  }

  /* ── Read surface for the debug overlay (see debug/PathfindingDebug). ──────── */
  get cols(): number {
    return this.grid.cols;
  }
  get rows(): number {
    return this.grid.rows;
  }
  get tileSize(): number {
    return this.grid.tile;
  }
  /** Solid (a wall or a stamped obstacle)? */
  solidAt(col: number, row: number): boolean {
    return this.inBounds(col, row) && this.isSolid(col, row);
  }
  /** Does a route to the current target exist from this cell? */
  reachable(col: number, row: number): boolean {
    return this.inBounds(col, row) && this.dist[row * this.grid.cols + col] < UNREACHED;
  }

  /**
   * Re-aim the field at a world-space target. Cheap to call every frame: it
   * early-outs unless the target has crossed into a new cell, so the flood only
   * runs when the route actually needs refreshing. Returns true on a recompute.
   */
  retarget(x: number, y: number): boolean {
    const col = Math.floor(x / this.grid.tile);
    const row = Math.floor(y / this.grid.tile);
    if (col === this.targetCol && row === this.targetRow) return false;
    this.targetCol = col;
    this.targetRow = row;
    this.compute(col, row);
    return true;
  }

  /**
   * Cells-to-nearest-wall, by multi-source BFS from every solid cell (the flood
   * runs *over* solids — they're the sources, not barriers). Static per Room, so
   * only recomputed when the grid changes (blockRect / first use).
   */
  private computeClearance(): void {
    const { cols, rows, solid } = this.grid;
    const n = cols * rows;
    const clear = this.clearance;
    const q = this.queue;
    let head = 0;
    let tail = 0;

    for (let i = 0; i < n; i++) {
      if (solid[i]) {
        clear[i] = 0;
        q[tail++] = i;
      } else {
        clear[i] = UNREACHED;
      }
    }
    while (head < tail) {
      const cur = q[head++];
      const cc = cur % cols;
      const cr = (cur - cc) / cols;
      const nd = clear[cur] + 1;
      for (const [dc, dr] of NEIGHBOURS) {
        const nc = cc + dc;
        const nr = cr + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const ni = nr * cols + nc;
        if (clear[ni] > nd) {
          clear[ni] = nd;
          q[tail++] = ni;
        }
      }
    }
    this.clearanceDirty = false;
  }

  /** Weighted Dijkstra from the target cell, filling `dist` with costs. */
  private compute(targetCol: number, targetRow: number): void {
    this.dist.fill(UNREACHED);
    if (!this.inBounds(targetCol, targetRow) || this.isSolid(targetCol, targetRow)) return;
    if (this.clearanceDirty) this.computeClearance();

    const { cols } = this.grid;
    const clear = this.clearance;
    this.heapSize = 0;
    const start = targetRow * cols + targetCol;
    this.dist[start] = 0;
    this.heapPush(0, start);

    while (this.heapSize > 0) {
      const cur = this.heapPop();
      if (this.popKey > this.dist[cur]) continue; // stale heap entry
      const cc = cur % cols;
      const cr = (cur - cc) / cols;
      const base = this.dist[cur];

      for (const [dc, dr] of NEIGHBOURS) {
        const nc = cc + dc;
        const nr = cr + dr;
        if (!this.inBounds(nc, nr) || this.isSolid(nc, nr)) continue;
        // No corner-cutting: a diagonal needs both shared orthogonals open.
        if (dc !== 0 && dr !== 0 && (this.isSolid(cc + dc, cr) || this.isSolid(cc, cr + dr))) {
          continue;
        }
        const ni = nr * cols + nc;
        const stepLen = dc !== 0 && dr !== 0 ? STEP_DIAG : STEP_ORTHO;
        const penalty = CLEAR_COST * Math.max(0, CLEAR_WANT - clear[ni]);
        const nd = base + stepLen + penalty;
        if (nd < this.dist[ni]) {
          this.dist[ni] = nd;
          this.heapPush(nd, ni);
        }
      }
    }
  }

  steer(x: number, y: number): Phaser.Math.Vector2 | null {
    const { cols, tile } = this.grid;
    const col = Math.floor(x / tile);
    const row = Math.floor(y / tile);
    if (!this.inBounds(col, row)) return null;

    const here = this.dist[row * cols + col];
    // Unreachable or already in the target cell: caller goes straight.
    if (here >= UNREACHED || here === 0) return null;

    let best = here;
    let bestCol = col;
    let bestRow = row;
    for (const [dc, dr] of NEIGHBOURS) {
      const nc = col + dc;
      const nr = row + dr;
      if (!this.inBounds(nc, nr) || this.isSolid(nc, nr)) continue;
      if (dc !== 0 && dr !== 0 && (this.isSolid(col + dc, row) || this.isSolid(col, row + dr))) {
        continue;
      }
      const d = this.dist[nr * cols + nc];
      if (d < best) {
        best = d;
        bestCol = nc;
        bestRow = nr;
      }
    }

    if (best === here) return null; // no downhill neighbour — let the caller fall back

    // Steer toward the chosen cell's *centre*. The weighted flood already keeps
    // the path clear of walls, so plain centre-seeking — no reactive avoidance —
    // suffices, and a Dijkstra field has no local minima to get trapped in.
    const cx = (bestCol + 0.5) * tile;
    const cy = (bestRow + 0.5) * tile;
    return this.step.set(cx - x, cy - y).normalize();
  }

  /**
   * Mark every cell overlapped by a world-space rectangle as solid — a static
   * obstacle the wall layer doesn't carry (e.g. a practice dummy). A footprint,
   * not a point: an off-grid or larger-than-a-cell body straddles cells, and
   * stamping only its centre cell would leave the field routing enemies into the
   * uncovered half. Invalidates the field (target + clearance) so it recomputes.
   */
  blockRect(left: number, top: number, right: number, bottom: number): void {
    const { tile, cols, rows } = this.grid;
    const c0 = Math.max(0, Math.floor(left / tile));
    const c1 = Math.min(cols - 1, Math.floor((right - 1e-3) / tile));
    const r0 = Math.max(0, Math.floor(top / tile));
    const r1 = Math.min(rows - 1, Math.floor((bottom - 1e-3) / tile));
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) this.grid.solid[row * cols + col] = true;
    }
    this.clearanceDirty = true;
    this.targetCol = -1;
    this.targetRow = -1;
  }

  /* ── Binary min-heap (keyed by cost). Lazy deletion: stale pops are skipped
   *    against `dist` in compute(). ──────────────────────────────────────────── */
  private heapPush(key: number, cell: number): void {
    let i = this.heapSize++;
    this.heapKey[i] = key;
    this.heapCell[i] = cell;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heapKey[parent] <= this.heapKey[i]) break;
      this.heapSwap(parent, i);
      i = parent;
    }
  }

  /** Pop the min cell; its key is left in `popKey` for the staleness check. */
  private heapPop(): number {
    const cell = this.heapCell[0];
    this.popKey = this.heapKey[0];
    const last = --this.heapSize;
    this.heapKey[0] = this.heapKey[last];
    this.heapCell[0] = this.heapCell[last];
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let smallest = i;
      if (l < last && this.heapKey[l] < this.heapKey[smallest]) smallest = l;
      if (r < last && this.heapKey[r] < this.heapKey[smallest]) smallest = r;
      if (smallest === i) break;
      this.heapSwap(smallest, i);
      i = smallest;
    }
    return cell;
  }

  private heapSwap(a: number, b: number): void {
    const k = this.heapKey[a];
    this.heapKey[a] = this.heapKey[b];
    this.heapKey[b] = k;
    const c = this.heapCell[a];
    this.heapCell[a] = this.heapCell[b];
    this.heapCell[b] = c;
  }
}
