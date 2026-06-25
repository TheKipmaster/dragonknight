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
  /** A Dialogue begins (ADR 0014). Payload: the DialogueScript. The UI scene
   *  shows the box and starts the first line; Game pauses *itself* in response. */
  DialogueStart: 'dialogue-start',
  /** A Dialogue line was advanced (reveal completed, or stepped to the next
   *  line). Fired by the box for any interested listener (e.g. an SFX hook); the
   *  protocol works without a listener. */
  DialogueAdvance: 'dialogue-advance',
  /** A Dialogue ended — the last line was advanced past (ADR 0014). The UI box
   *  hides; Game resumes itself; a `playDialogue` promise resolves on this. */
  DialogueEnd: 'dialogue-end',
} as const;
