import Phaser from 'phaser';
import { TEX } from '../config/constants';
import { GameState } from '../state/GameState';
import { eventBus, GameEvent } from '../state/eventBus';

/**
 * Parallel HUD scene (ADR 0003): layered above Game, camera-independent, and
 * not torn down on Room transitions. Reads Hearts from GameState and redraws
 * when notified via the event bus.
 */
export class UIScene extends Phaser.Scene {
  private hearts: Phaser.GameObjects.Image[] = [];

  constructor() {
    super('UI');
  }

  create(): void {
    this.drawHearts();
    eventBus.on(GameEvent.PlayerDamaged, this.drawHearts, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      eventBus.off(GameEvent.PlayerDamaged, this.drawHearts, this);
    });
  }

  /** Render one icon per full Heart slot; full / half / empty per current health. */
  private drawHearts(): void {
    this.hearts.forEach((h) => h.destroy());
    this.hearts = [];

    const { halfHearts, maxHalfHearts } = GameState.player;
    const slots = Math.ceil(maxHalfHearts / 2);

    for (let i = 0; i < slots; i++) {
      const filledHalves = Phaser.Math.Clamp(halfHearts - i * 2, 0, 2);
      const heart = this.add.image(8 + i * 14, 8, TEX.heart).setOrigin(0, 0);

      if (filledHalves === 0) {
        heart.setAlpha(0.25);
      } else if (filledHalves === 1) {
        heart.setCrop(0, 0, heart.width / 2, heart.height);
      }
      this.hearts.push(heart);
    }
  }
}
