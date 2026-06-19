/**
 * The single currency of damage (ADR 0002).
 *
 * Anything that deals damage — the Player's sword, an Enemy's contact or
 * telegraphed strike — produces an Attack. It flows to a Damageable target's
 * `hit()`, the one chokepoint where damage and knockback are applied.
 */
export interface Attack {
  /** How much health to remove from the target. */
  damage: number;
  /** Knockback impulse magnitude, in pixels/second. */
  knockback: number;
  /** Origin of the attack; the target is shoved directly away from this point. */
  fromX: number;
  fromY: number;
}

/** A target that can receive an Attack. */
export interface Damageable {
  hit(attack: Attack): void;
}

export function isDamageable(obj: unknown): obj is Damageable {
  return typeof (obj as { hit?: unknown } | null)?.hit === 'function';
}
