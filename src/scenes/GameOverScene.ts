import Phaser from 'phaser';
import { GAME_OVER, VIEW_WIDTH } from '../config/constants';

/**
 * The Game Over screen (CONTEXT.md; ADR 0013): the defeat sibling of the Title.
 * Like the Title, it is *stateless* — it holds no GameState and cannot touch
 * Hearts, Rooms, or progress — and it is a *screen*, not a Cutscene: it takes the
 * screen fully and hands back to the Title rather than returning control in-world.
 *
 * Death (GameScene.onPlayerDied) fades the Game to black and starts this scene;
 * it fades up over that same black, holds on the red wordmark, and a press (past a
 * short input guard) fades back out and returns to the Title. The Run is *not*
 * reset here — entering Game from the Title is what wipes it (ADR 0015).
 */
export class GameOverScene extends Phaser.Scene {
  /** True once a return has been committed, so a second press can't double-fire. */
  private leaving = false;
  /** Wall-clock time (ms) before which input is ignored, so a key still held from
   *  the dying Run (mashing through death) can't instantly skip this beat. */
  private inputReadyAt = 0;

  constructor() {
    super('GameOver');
  }

  create(): void {
    this.leaving = false;
    this.inputReadyAt = this.time.now + GAME_OVER.inputDelayMs;
    // We arrive on the death-fade's black; fade up over it so the beat reads.
    this.cameras.main.fadeIn(GAME_OVER.fadeInMs, 0, 0, 0);

    this.add
      .text(VIEW_WIDTH / 2, GAME_OVER.titleY, GAME_OVER.titleText, {
        fontFamily: 'monospace',
        fontSize: GAME_OVER.titleFontSize,
        color: GAME_OVER.titleColor,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(10);

    // Pulsing prompt: the affordance that a press continues, mirroring the Title.
    const prompt = this.add
      .text(VIEW_WIDTH / 2, GAME_OVER.promptY, GAME_OVER.promptText, {
        fontFamily: 'monospace',
        fontSize: GAME_OVER.promptFontSize,
        color: GAME_OVER.promptColor,
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.tweens.add({
      targets: prompt,
      alpha: { from: 1, to: GAME_OVER.promptMinAlpha },
      duration: GAME_OVER.promptPulseMs,
      yoyo: true,
      repeat: -1,
    });

    // Any key or click returns to the Title. Listeners are cleaned up on shutdown
    // so the next death rebinds fresh rather than stacking.
    this.input.keyboard?.on('keydown', this.tryReturn, this);
    this.input.on('pointerdown', this.tryReturn, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', this.tryReturn, this);
      this.input.off('pointerdown', this.tryReturn, this);
    });
  }

  /** Fade back to black and hand off to the Title (which on the next Game entry
   *  resets the Run). Guarded by the input delay and the one-shot flag. */
  private tryReturn(): void {
    if (this.leaving || this.time.now < this.inputReadyAt) return;
    this.leaving = true;
    this.cameras.main.fadeOut(GAME_OVER.fadeOutMs, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('Title');
    });
  }
}
