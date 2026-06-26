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
  /** Persistent ids of Traps already sprung — they rebuild revealed (but live)
   *  instead of getting their hidden first-strike again (ADR 0003 amendment). */
  trapsSprung: Set<string>;
  /** Persistent ids of once-only Tripwires already fired — they never fire again,
   *  surviving Room teardown and the respawn loop (ADR 0010; `repeat` Tripwires
   *  are not recorded here). */
  tripwiresFired: Set<string>;
}

export const GameState = {
  player: {
    halfHearts: 10,
    maxHalfHearts: 10,
  } as PlayerState,

  activeRoomId: 'entrance',

  progress: {
    keysHeld: 0,
    doorsOpened: new Set<string>(),
    itemsTaken: new Set<string>(),
    trapsSprung: new Set<string>(),
    tripwiresFired: new Set<string>(),
  } as DungeonProgress,
};

export type GameStateShape = typeof GameState;

/**
 * Reinitialise all Run-scoped state to the start of a fresh Run (ADR 0013/0015):
 * Hearts to full, the active Room back to the entrance, and every progress set
 * cleared. Called at the top of `GameScene.create()`, making a Run reset an
 * invariant of *entering Game* — every path in (the Title, and later the Game
 * Over screen) gets a clean Run with no caller obliged to reset first. There is
 * no persistence; a Run is in-memory only, so this is the whole of "new game".
 */
export function resetRun(): void {
  GameState.player.halfHearts = GameState.player.maxHalfHearts;
  GameState.activeRoomId = 'entrance';
  GameState.progress.keysHeld = 0;
  GameState.progress.doorsOpened.clear();
  GameState.progress.itemsTaken.clear();
  GameState.progress.trapsSprung.clear();
  GameState.progress.tripwiresFired.clear();
}
