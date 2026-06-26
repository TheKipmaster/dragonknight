import Phaser from 'phaser';
import { TEX, TITLE } from '../config/constants';

/**
 * The Title screen (CONTEXT.md; ADR 0015): the game's entry point and where the
 * loop returns. It holds no GameState — it cannot touch Hearts, Rooms, or
 * progress; the Run is reset by *entering Game*, not here. It only points at the
 * Game scene.
 *
 * The backdrop is pre-scaled to 320x480 (scale-to-width, twice the viewport
 * height). The self-contained animated intro pans the image UP — opening framed
 * low on the castle gate, rising to rest on the sky with the wordmark fading in
 * above the towers — then holds while the prompt pulses. Any key or click
 * (after a short input guard) starts a fresh Run. This is a plain tween, not a
 * Cutscene: no director, no Actors.
 */
export class TitleScene extends Phaser.Scene {
  /** True once a start has been committed, so a second press can't double-fire. */
  private started = false;
  /** Wall-clock time (ms) before which input is ignored, so a key still held
   *  from the previous Run (a death that returned here) can't instantly skip. */
  private inputReadyAt = 0;

  constructor() {
    super('Title');
  }

  create(): void {
    this.started = false;
    this.inputReadyAt = this.time.now + TITLE.inputDelayMs;
    // Fade up from black: smooths the first boot and, crucially, the post-death
    // return, which arrives on a faded-to-black screen (ADR 0015).
    this.cameras.main.fadeIn(TITLE.fadeInMs, 0, 0, 0);

    // Backdrop anchored top-left, shifted up so the BOTTOM of the 480px image
    // (castle gate + bridge) is what's in the 240px viewport at the start.
    const bg = this.add.image(0, -TITLE.panTravel, TEX.titleBg).setOrigin(0, 0);

    // Pan UP: image top travels from -panTravel (castle in view) to 0 (sky in
    // view), revealing towers → mountains → sky, then holds on that frame.
    this.tweens.add({
      targets: bg,
      y: 0,
      duration: TITLE.panMs,
      ease: TITLE.panEase,
    });

    // Wordmark over the sky, fading in to land with the pan's end.
    const logo = this.add
      .image(TITLE.logoX, TITLE.logoY, TEX.titleLogo)
      .setDepth(10)
      .setAlpha(0);
    this.tweens.add({
      targets: logo,
      alpha: 1,
      duration: TITLE.logoFadeMs,
      delay: Math.max(0, TITLE.panMs - TITLE.logoFadeBeforeEnd),
    });

    // "PRESS ANY KEY" prompt: hidden during the reveal, then pulses once the pan
    // settles so the held screen reads as ready-and-waiting.
    const prompt = this.add
      .text(TITLE.logoX, TITLE.promptY, TITLE.promptText, {
        fontFamily: 'monospace',
        fontSize: TITLE.promptFontSize,
        color: TITLE.promptColor,
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setAlpha(0);
    this.tweens.add({
      targets: prompt,
      alpha: { from: 1, to: TITLE.promptMinAlpha },
      duration: TITLE.promptPulseMs,
      delay: TITLE.panMs,
      yoyo: true,
      repeat: -1,
    });

    // Any key or click starts the Run. Listeners are cleaned up on shutdown so a
    // returned-to Title (after death) rebinds fresh rather than stacking.
    this.input.keyboard?.on('keydown', this.tryStart, this);
    this.input.on('pointerdown', this.tryStart, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', this.tryStart, this);
      this.input.off('pointerdown', this.tryStart, this);
    });
  }

  /** Begin a Run: hand off to Game, which resets state and launches the HUD
   *  (ADR 0015). Guarded so the input guard and the one-shot flag both hold. */
  private tryStart(): void {
    if (this.started || this.time.now < this.inputReadyAt) return;
    this.started = true;
    this.scene.start('Game');
  }
}
