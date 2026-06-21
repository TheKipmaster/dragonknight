import Phaser from 'phaser';
import type { FlowField } from '../components/FlowField';

const TOGGLE_KEY = Phaser.Input.Keyboard.KeyCodes.P; // show/hide the flow field

const ARROW_COLOR = 0x40c0ff; //  per-cell flow direction
const SOLID_COLOR = 0xff4040; //  walls + stamped obstacles
const TARGET_COLOR = 0x40ff40; // the cell the field flows toward (the Player)
const DEAD_COLOR = 0x888888; //  open but unreachable cells

/**
 * A toggleable debug overlay for the enemy flow field (ADR 0007). Press the
 * 'P' key to show/hide it. While shown it draws, per walkable cell, an
 * arrow toward the cell an enemy there would step to — so the routing is visible
 * and you can tell a *bad path* (the field's fault) from a *body snagging on a
 * corner* (physics' fault). Solid cells (walls + stamped obstacles) shade red,
 * the target cell marks green, and open-but-unreachable cells dot grey.
 *
 * Purely a dev aid: it reads the field, never drives it, and draws nothing while
 * off. The scene owns one and re-points it at each Room's field via setField().
 */
export class PathfindingDebug {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly toggle: Phaser.Input.Keyboard.Key;
  private active = false;
  private field?: FlowField;

  constructor(scene: Phaser.Scene) {
    // Depth above entities so the grid reads clearly; thin/transparent strokes
    // still let the sprites show through.
    this.gfx = scene.add.graphics().setDepth(50).setVisible(false);
    this.toggle = scene.input.keyboard!.addKey(TOGGLE_KEY);
  }

  /** Point the overlay at the active Room's field (called on each populate). */
  setField(field: FlowField): void {
    this.field = field;
  }

  /** Drive from the scene's update(): handle the toggle, redraw while active. */
  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.toggle)) {
      this.active = !this.active;
      this.gfx.setVisible(this.active);
      if (!this.active) this.gfx.clear();
    }
    if (this.active) this.draw(); // the field re-aims as the Player moves
  }

  private draw(): void {
    const f = this.field;
    const g = this.gfx;
    g.clear();
    if (!f) return;

    const t = f.tileSize;
    g.lineStyle(1, ARROW_COLOR, 0.7);
    for (let row = 0; row < f.rows; row++) {
      for (let col = 0; col < f.cols; col++) {
        const cx = (col + 0.5) * t;
        const cy = (row + 0.5) * t;

        if (f.solidAt(col, row)) {
          g.fillStyle(SOLID_COLOR, 0.15).fillRect(col * t, row * t, t, t);
          continue;
        }
        if (!f.reachable(col, row)) {
          g.fillStyle(DEAD_COLOR, 0.25).fillCircle(cx, cy, 1.5);
          continue;
        }
        const dir = f.steer(cx, cy);
        if (!dir) {
          // The target's own cell (or a no-downhill cell): mark, don't arrow.
          g.fillStyle(TARGET_COLOR, 0.6).fillCircle(cx, cy, 2.5);
          continue;
        }
        this.arrow(cx, cy, dir.x, dir.y, t * 0.42);
      }
    }
  }

  /** A short arrow from (cx,cy) along the unit (dx,dy), with a small head. */
  private arrow(cx: number, cy: number, dx: number, dy: number, len: number): void {
    const ex = cx + dx * len;
    const ey = cy + dy * len;
    const ang = Math.atan2(dy, dx);
    const head = 3;
    this.gfx
      .lineBetween(cx, cy, ex, ey)
      .lineBetween(ex, ey, ex - Math.cos(ang - 0.5) * head, ey - Math.sin(ang - 0.5) * head)
      .lineBetween(ex, ey, ex - Math.cos(ang + 0.5) * head, ey - Math.sin(ang + 0.5) * head);
  }
}
