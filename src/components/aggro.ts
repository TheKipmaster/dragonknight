import Phaser from 'phaser';
import type { AIState } from './AIController';

/**
 * A reusable `inactive` AI state (ADR 0002): the enemy holds position until the
 * target crosses within `range`, then activates (typically into `chase`). Both
 * the Walker and the Charger register this and start in it, rather than each
 * re-implementing an aggro check in its own FSM — so a far-off or off-screen
 * enemy stays dormant until the Player approaches.
 *
 * Aggro is range-only for now (straight-line distance to the target).
 * Line-of-sight gating — so an enemy won't wake through a wall — is deferred with
 * the smarter-enemies backlog item; it needs a wall raycast the project lacks.
 *
 * Note: only an *untouched* enemy stays here. Striking a dormant enemy routes
 * through its `hit()`, which knocks it into `hurt` → `chase`, so attacking wakes
 * it regardless of range.
 */
export function inactiveState(
  sprite: Phaser.Physics.Arcade.Sprite,
  target: Phaser.GameObjects.Sprite,
  range: number,
  activate: () => void,
): AIState {
  return {
    enter: () => sprite.setVelocity(0, 0),
    update: () => {
      if (Phaser.Math.Distance.Between(sprite.x, sprite.y, target.x, target.y) <= range) {
        activate();
      }
    },
  };
}
