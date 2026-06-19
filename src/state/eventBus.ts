import Phaser from 'phaser';

/**
 * Decoupled notification channel between scenes/entities (ADR 0003).
 * The bus carries *events*; authoritative data lives in GameState.
 */
export const eventBus = new Phaser.Events.EventEmitter();

export const GameEvent = {
  PlayerDamaged: 'player-damaged',
  RoomChanged: 'room-changed',
  ItemPickedUp: 'item-picked-up',
} as const;
