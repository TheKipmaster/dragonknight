import Phaser from 'phaser';

/**
 * Decoupled notification channel between scenes/entities (ADR 0003).
 * The bus carries *events*; authoritative data lives in GameState.
 */
export const eventBus = new Phaser.Events.EventEmitter();

export const GameEvent = {
  /** Hearts changed (took damage, healed, respawned) — the HUD redraws. */
  PlayerDamaged: 'player-damaged',
  PlayerDied: 'player-died',
  RoomChanged: 'room-changed',
  ItemPickedUp: 'item-picked-up',
  /** Keys held changed (picked up or spent on a locked Door) — the HUD redraws. */
  KeysChanged: 'keys-changed',
  /** An enemy died at a point — GameScene drops a floor splat. Payload: {x, y}. */
  EnemyDied: 'enemy-died',
} as const;
