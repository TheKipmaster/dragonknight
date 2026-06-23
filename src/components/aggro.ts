import Phaser from 'phaser';
import { AGGRO_PATH_RATIO } from '../config/constants';
import type { AIState } from './AIController';
import type { Navigator } from './FlowField';

/**
 * Is `target` within aggro range of (fromX, fromY), accounting for walls? Two
 * gates (ADR 0007): the straight-line distance must be within `range` (the
 * range "feel" is unchanged), *and* the routed path around walls must exist and
 * stay within `AGGRO_PATH_RATIO`× that straight line. A target the other side of
 * a wall is either unreachable or a long way round, so it fails the second gate
 * and won't wake the enemy through the wall — geometry-distance line-of-sight,
 * short of a true raycast (which stays deferred, smarter-enemies backlog).
 *
 * The straight-line pre-check is kept (not subsumed by the path gate) because the
 * flood is weighted: an open path that merely runs near a wall reads a little
 * long, so a pure path threshold would clip the effective range inconsistently.
 */
export function withinAggro(
  nav: Navigator,
  fromX: number,
  fromY: number,
  target: Phaser.GameObjects.Sprite,
  range: number,
): boolean {
  const straight = Phaser.Math.Distance.Between(fromX, fromY, target.x, target.y);
  if (straight > range) return false;
  const path = nav.pathDistance(fromX, fromY);
  return path !== null && path <= straight * AGGRO_PATH_RATIO;
}

/**
 * A reusable `inactive` AI state (ADR 0002): the enemy holds position until the
 * target crosses within aggro range, then activates (typically into `chase`).
 * Both the Walker and the Charger register this and start in it, rather than each
 * re-implementing an aggro check in its own FSM — so a far-off or off-screen
 * enemy stays dormant until the Player approaches. Aggro is wall-aware via
 * `withinAggro` (the flow field tells path from straight-line distance).
 *
 * Note: only an *untouched* enemy stays here. Striking a dormant enemy routes
 * through its `hit()`, which knocks it into `hurt` → `chase`, so attacking wakes
 * it regardless of range or walls.
 */
export function inactiveState(
  sprite: Phaser.Physics.Arcade.Sprite,
  target: Phaser.GameObjects.Sprite,
  range: number,
  nav: Navigator,
  activate: () => void,
): AIState {
  return {
    enter: () => sprite.setVelocity(0, 0),
    update: () => {
      if (withinAggro(nav, sprite.x, sprite.y, target, range)) activate();
    },
  };
}
