import Phaser from 'phaser';
import { TILE, TEX } from '../config/constants';

/**
 * Loads all assets up front (ADR 0001: per-Room data is preloaded at boot).
 *
 * For now there are no real assets — we generate placeholder primitive textures
 * at runtime. Because entities reference logical texture keys (TEX.*), swapping
 * these for a real spritesheet later won't touch gameplay code.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  create(): void {
    this.makeRect(TEX.player, TILE, TILE, 0x4f8bff, 0x1b3a7a);
    this.makeRect(TEX.wall, TILE, TILE, 0x5a5a6e, 0x33333f);
    this.makeRect(TEX.floor, TILE, TILE, 0x23232f, 0x2b2b3a);
    this.makeRect(TEX.heart, 12, 12, 0xff4d6d, 0x8a1f33);
    this.makeRect(TEX.dummy, TILE, TILE, 0xc9a04e, 0x7a5e23);
    this.makeRect(TEX.walker, TILE, TILE, 0xd64550, 0x7a1f29);

    this.scene.start('Game');
    this.scene.launch('UI'); // parallel HUD scene (ADR 0003)
  }

  /** Generate a filled rectangle texture with a 1px inner border. */
  private makeRect(
    key: string,
    w: number,
    h: number,
    fill: number,
    border: number,
  ): void {
    const g = this.add.graphics();
    g.fillStyle(border, 1).fillRect(0, 0, w, h);
    g.fillStyle(fill, 1).fillRect(1, 1, w - 2, h - 2);
    g.generateTexture(key, w, h);
    g.destroy();
  }
}
