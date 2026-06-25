import Phaser from 'phaser';
import { DIALOGUE, TEX, VIEW_HEIGHT, VIEW_WIDTH } from '../config/constants';
import { eventBus, GameEvent } from '../state/eventBus';
import { SPEAKERS, type DialogueScript } from '../narrative/dialogue';

/**
 * The Dialogue box (CONTEXT.md; ADR 0014): a screen-anchored, framed text box
 * rendered in the parallel UI scene. It owns the **advance key** — the UI scene
 * is never paused, so it is the only scene that can read the press while Game is
 * paused (a paused Game stops polling its keys).
 *
 * Flow: on `DialogueStart` it shows and types out line 0; the advance key first
 * *completes* the current line's reveal (two-stage typewriter), then *advances*
 * to the next line; past the last line it hides and emits `DialogueEnd`. It never
 * pauses Game itself — that's Game's job, reacting to the same bus events
 * (ADR 0014: UI and Game never reach into each other).
 */
export class DialogueBox {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly portrait: Phaser.GameObjects.Image;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly bodyText: Phaser.GameObjects.Text;
  private readonly prompt: Phaser.GameObjects.Text;
  private readonly advanceKey: Phaser.Input.Keyboard.Key;
  private readonly boxW: number;
  private readonly boxH: number;

  private script: DialogueScript = [];
  private lineIndex = 0;
  private fullText = '';
  private shown = 0;
  /** The repeating reveal timer; defined only while a line is still typing. */
  private typeEvent?: Phaser.Time.TimerEvent;

  /** Visible while a Dialogue is playing — the smoke test reads this. */
  get isActive(): boolean {
    return this.container.visible;
  }

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.boxW = VIEW_WIDTH - DIALOGUE.marginX * 2;
    this.boxH = DIALOGUE.height;
    const topY = VIEW_HEIGHT - DIALOGUE.marginBottom - this.boxH;

    const bg = scene.add.graphics();
    bg.fillStyle(DIALOGUE.bgColor, DIALOGUE.bgAlpha).fillRect(0, 0, this.boxW, this.boxH);
    bg.lineStyle(1, DIALOGUE.borderColor, 1).strokeRect(0.5, 0.5, this.boxW - 1, this.boxH - 1);

    // Init with any existing texture (hidden); the real bust is swapped in via
    // setTexture once the art pass supplies Portraits. A valid key avoids the
    // missing-texture warning at construction.
    this.portrait = scene.add
      .image(DIALOGUE.padding, DIALOGUE.padding, TEX.heart)
      .setOrigin(0, 0)
      .setVisible(false);

    this.nameText = scene.add
      .text(0, DIALOGUE.padding, '', { fontFamily: 'monospace', fontSize: DIALOGUE.fontSize, color: DIALOGUE.nameColor })
      .setOrigin(0, 0);
    this.bodyText = scene.add
      .text(0, DIALOGUE.padding + DIALOGUE.nameLineH, '', {
        fontFamily: 'monospace',
        fontSize: DIALOGUE.fontSize,
        color: DIALOGUE.textColor,
        wordWrap: { width: this.boxW },
      })
      .setOrigin(0, 0);
    // A small "press to advance" cue, shown only once a line is fully revealed.
    this.prompt = scene.add
      .text(this.boxW - DIALOGUE.padding, this.boxH - DIALOGUE.padding, '▼', {
        fontFamily: 'monospace',
        fontSize: DIALOGUE.fontSize,
        color: DIALOGUE.textColor,
      })
      .setOrigin(1, 1)
      .setVisible(false);

    this.container = scene.add
      .container(DIALOGUE.marginX, topY, [bg, this.portrait, this.nameText, this.bodyText, this.prompt])
      .setDepth(DIALOGUE.depth)
      .setVisible(false);

    this.advanceKey = scene.input.keyboard!.addKey(DIALOGUE.advanceKey);
    this.advanceKey.on('down', this.advance, this);
    eventBus.on(GameEvent.DialogueStart, this.start, this);
  }

  /** Begin a script (DialogueStart handler). Ignores re-entrancy: only one
   *  Dialogue plays at a time (it pauses Game, so nothing in-world can stack). */
  private start(script: DialogueScript): void {
    if (this.isActive || script.length === 0) return;
    this.script = script;
    this.lineIndex = 0;
    this.container.setVisible(true);
    this.showLine();
  }

  /** Lay out and begin typing the current line: resolve the speaker's name +
   *  Portrait, shift the text past the Portrait slot when one is shown, and start
   *  the reveal timer. */
  private showLine(): void {
    const line = this.script[this.lineIndex];
    const speaker = SPEAKERS[line.speaker];

    const portraitKey = speaker.portrait;
    const hasPortrait = !!portraitKey && this.scene.textures.exists(portraitKey);
    if (hasPortrait) {
      this.portrait.setTexture(portraitKey!).setDisplaySize(DIALOGUE.portraitSize, DIALOGUE.portraitSize).setVisible(true);
    } else {
      this.portrait.setVisible(false);
    }

    const textX = hasPortrait ? DIALOGUE.padding * 2 + DIALOGUE.portraitSize : DIALOGUE.padding;
    this.nameText.setX(textX).setText(speaker.name).setVisible(speaker.name.length > 0);
    this.bodyText.setX(textX).setText('');
    this.bodyText.setWordWrapWidth(this.boxW - textX - DIALOGUE.padding);

    this.prompt.setVisible(false);
    this.fullText = line.text;
    this.shown = 0;
    this.typeEvent?.remove();
    this.typeEvent = this.scene.time.addEvent({
      delay: DIALOGUE.typeMs,
      loop: true,
      callback: this.tick,
      callbackScope: this,
    });
  }

  /** Reveal one more character; stop the timer (and show the advance cue) once
   *  the whole line is shown. Runs on the UI clock, which is never paused. */
  private tick(): void {
    this.shown++;
    this.bodyText.setText(this.fullText.slice(0, this.shown));
    if (this.shown >= this.fullText.length) this.finishReveal();
  }

  private get revealing(): boolean {
    return this.typeEvent !== undefined;
  }

  private finishReveal(): void {
    this.typeEvent?.remove();
    this.typeEvent = undefined;
    this.shown = this.fullText.length;
    this.bodyText.setText(this.fullText);
    this.prompt.setVisible(true);
  }

  /** The advance action (advance key + the smoke test): first press completes a
   *  still-typing line; next press steps to the following line, or ends. Public
   *  so the headless smoke harness can drive it without synthesising input. */
  advance(): void {
    if (!this.isActive) return;
    if (this.revealing) {
      this.finishReveal();
      eventBus.emit(GameEvent.DialogueAdvance);
      return;
    }
    this.lineIndex++;
    if (this.lineIndex >= this.script.length) {
      this.end();
    } else {
      eventBus.emit(GameEvent.DialogueAdvance);
      this.showLine();
    }
  }

  private end(): void {
    this.typeEvent?.remove();
    this.typeEvent = undefined;
    this.container.setVisible(false);
    this.script = [];
    eventBus.emit(GameEvent.DialogueEnd);
  }

  /** Drop listeners and objects (UI-scene shutdown). */
  destroy(): void {
    this.advanceKey.off('down', this.advance, this);
    eventBus.off(GameEvent.DialogueStart, this.start, this);
    this.typeEvent?.remove();
    this.container.destroy();
  }
}
