/**
 * An entity that can be woken from its dormant AI state into action (ADR 0010).
 *
 * Map-/nest-spawned Enemies start `inactive`, waking on aggro (components/aggro.ts).
 * A Tripwire handler uses this to wake them *deliberately* — the dormant-ambush
 * pattern — without knowing the Enemy's concrete type, mirroring how `Damageable`
 * and `ContactAttacker` (combat/Attack.ts) let the sword and contact damage treat
 * any Enemy uniformly.
 */
export interface Activatable {
  /** Force the entity awake (into its active/chase state), ignoring aggro range. */
  wake(): void;
}

export function isActivatable(obj: unknown): obj is Activatable {
  return typeof (obj as { wake?: unknown } | null)?.wake === 'function';
}
