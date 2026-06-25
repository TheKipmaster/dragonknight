import Phaser from 'phaser';
import { TEX } from '../config/constants';
import { GameState } from '../state/GameState';
import { eventBus, GameEvent } from '../state/eventBus';
import { DialogueBox } from '../ui/DialogueBox';

/**
 * Parallel HUD scene (ADR 0003): layered above Game, camera-independent, and
 * not torn down on Room transitions. Reads Hearts from GameState and redraws
 * when notified via the event bus. Its remit widened to narrative overlays
 * (ADR 0006): it also owns the Dialogue box, which — crucially — owns the
 * advance key, since this scene is never paused while Game is (ADR 0014).
 */
export class UIScene extends Phaser.Scene {
  private hearts: Phaser.GameObjects.Image[] = [];
  private keyIcon?: Phaser.GameObjects.Image;
  private keyLabel?: Phaser.GameObjects.Text;
  /** The narrative Dialogue overlay (ADR 0014); public so the smoke harness can
   *  drive its advance() without synthesising key input. */
  dialogueBox!: DialogueBox;

  constructor() {
    super('UI');
  }

  create(): void {
    this.drawHearts();
    this.drawKeys();
    this.dialogueBox = new DialogueBox(this);
    eventBus.on(GameEvent.PlayerDamaged, this.drawHearts, this);
    eventBus.on(GameEvent.KeysChanged, this.drawKeys, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      eventBus.off(GameEvent.PlayerDamaged, this.drawHearts, this);
      eventBus.off(GameEvent.KeysChanged, this.drawKeys, this);
      this.dialogueBox.destroy();
    });
  }

  /** Show a key icon + count below the Hearts while any Keys are held. */
  private drawKeys(): void {
    this.keyIcon?.destroy();
    this.keyLabel?.destroy();
    this.keyIcon = undefined;
    this.keyLabel = undefined;

    const n = GameState.progress.keysHeld;
    if (n <= 0) return;

    this.keyIcon = this.add.image(8, 24, TEX.key).setOrigin(0, 0);
    this.keyLabel = this.add
      .text(22, 24, `x${n}`, { fontFamily: 'monospace', fontSize: '10px', color: '#ffd34d' })
      .setOrigin(0, 0);
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
