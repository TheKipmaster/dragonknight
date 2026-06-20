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
} as const;
