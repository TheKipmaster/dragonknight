import type { TripwireName, TripwireFireContext } from '../state/tripwires';

/**
 * The runtime half of a Tripwire (CONTEXT.md; ADR 0010): edge detection over a
 * Room-owned overlap zone.
 *
 * Phaser's overlap callback fires *every frame* the Player is inside the zone,
 * but a Tripwire is edge-triggered — it fires on the outside→inside *crossing*,
 * not continuously (the same insideThisFrame/wasInside model as Switch). The
 * scene wires the overlap to `notifyOverlap()` and ticks `update()` once a frame;
 * dispatch (and the central once-guard) live in the `tripwires` registry, reached
 * through the injected `fire`.
 *
 * Unlike Switch, this does NOT own its zone — the Room creates and destroys it
 * (the Door pattern, ADR 0010), so there is nothing to tear down here.
 */
export class Tripwire {
  private insideThisFrame = false;
  private wasInside = false;

  constructor(
    private readonly name: TripwireName,
    private readonly ctx: TripwireFireContext,
    private readonly fire: (name: TripwireName, ctx: TripwireFireContext) => void,
  ) {}

  /** Call from the player-overlap callback on each frame contact occurs. */
  notifyOverlap(): void {
    this.insideThisFrame = true;
  }

  /** Fire on the entering edge, then track the contact state. Call once per frame.
   *  A once-Tripwire that already fired is suppressed by the registry's guard, so
   *  re-crossing it is a safe no-op; a `repeat` Tripwire fires on every crossing. */
  update(): void {
    if (this.insideThisFrame && !this.wasInside) this.fire(this.name, this.ctx);
    this.wasInside = this.insideThisFrame;
    this.insideThisFrame = false;
  }
}
