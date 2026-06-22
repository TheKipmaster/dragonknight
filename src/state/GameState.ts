/**
 * The single source of truth for cross-Room state (ADR 0003).
 *
 * Anything that must outlive a Room teardown lives here: Hearts, inventory,
 * the active Room, Dungeon progress. Deliberately a plain typed module rather
 * than Phaser's stringly-typed registry.
 *
 * Hearts are counted in half-Heart units to support half-Heart granularity:
 * a value of 6 means 3 full Hearts.
 */

export interface PlayerState {
  /** Current health in half-Heart units. */
  halfHearts: number;
  /** Maximum health in half-Heart units. */
  maxHalfHearts: number;
}

export interface DungeonProgress {
  keysHeld: number;
  /** lockIds of Doors already unlocked — they stay open and never re-charge. */
  doorsOpened: Set<string>;
  /** Persistent ids of one-shot items already collected — they don't respawn. */
  itemsTaken: Set<string>;
}

export const GameState = {
  player: {
    halfHearts: 6,
    maxHalfHearts: 6,
  } as PlayerState,

  activeRoomId: 'entrance',

  progress: {
    keysHeld: 0,
    doorsOpened: new Set<string>(),
    itemsTaken: new Set<string>(),
  } as DungeonProgress,
};

export type GameStateShape = typeof GameState;
