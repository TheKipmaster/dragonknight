import Phaser from 'phaser';
import { TILE, TEX, DECALS } from '../config/constants';
import { ROOM_IDS } from '../world/rooms';

/**
 * Loads all assets up front (ADR 0001: per-Room data is preloaded at boot).
 *
 * Real assets — the shared tileset image and every Room's tilemap JSON — are
 * loaded in preload(). Entities still use placeholder primitive textures
 * generated in create(); because they reference logical keys (TEX.*), swapping
 * those for a real spritesheet later won't touch gameplay code.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    // Served from public/ at the site root (see vite defaults).
    this.load.image(TEX.tiles, 'tiles/stone.png');
    for (const [key, path] of Object.entries(DECALS)) {
      this.load.image(key, path); // key doubles as the texture key (see DECALS)
    }
    for (const id of ROOM_IDS) {
      this.load.tilemapTiledJSON(id, `maps/${id}.tmj`);
    }
  }

  create(): void {
    this.makeRect(TEX.player, TILE, TILE, 0x4f8bff, 0x1b3a7a);
    this.makeRect(TEX.wall, TILE, TILE, 0x5a5a6e, 0x33333f);
    this.makeRect(TEX.floor, TILE, TILE, 0x23232f, 0x2b2b3a);
    this.makeRect(TEX.heart, 12, 12, 0xff4d6d, 0x8a1f33);
    this.makeRect(TEX.dummy, TILE, TILE, 0xc9a04e, 0x7a5e23);
    this.makeRect(TEX.walker, TILE, TILE, 0xd64550, 0x7a1f29);
    this.makeRect(TEX.charger, TILE, TILE, 0xb05cf0, 0x5a2080);
    this.makeRect(TEX.key, 10, 12, 0xffd34d, 0x8a6a12);

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
