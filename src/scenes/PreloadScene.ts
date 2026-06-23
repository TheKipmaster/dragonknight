import Phaser from 'phaser';
import { TILE, TEX, DECALS, SPLAT, TRAP, SPAWNER } from '../config/constants';
import { ROOM_IDS } from '../world/rooms';
import {
  collectTemplateNames,
  inlineTemplates,
  parseTemplateObject,
  type TiledMap,
  type TiledObject,
} from '../world/tiledTemplates';

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
    this.makeRect(TEX.spawner, TILE, TILE, 0x8a2f4f, 0x3a0f1f); // fleshy nest maroon
    this.makeRect(TEX.key, 10, 12, 0xffd34d, 0x8a6a12);
    this.makeSplat();
    this.makeGlyph();
    this.makeSpawnMark();

    // Phaser doesn't expand Tiled object templates; resolve them before any
    // Room is built (see tiledTemplates.ts), then enter the game.
    this.resolveTemplatesThenStart();
  }

  /**
   * Inline every `.tx` template referenced by a preloaded map. The `.tx` files
   * aren't known until the maps are in cache, so this is a second load pass:
   * fetch the referenced templates, patch the cached map JSON, then start.
   */
  private resolveTemplatesThenStart(): void {
    const names = new Set<string>();
    for (const id of ROOM_IDS) {
      const entry = this.cache.tilemap.get(id);
      if (entry) for (const n of collectTemplateNames(entry.data as TiledMap)) names.add(n);
    }

    if (names.size === 0) {
      this.startGame();
      return;
    }

    const key = (n: string) => `tpl:${n}`;
    for (const n of names) this.load.xml(key(n), `templates/${n}`);

    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      const templates = new Map<string, TiledObject>();
      for (const n of names) {
        const doc = this.cache.xml.get(key(n)) as Document | undefined;
        if (doc) templates.set(n, parseTemplateObject(doc));
      }
      for (const id of ROOM_IDS) {
        const entry = this.cache.tilemap.get(id);
        if (entry) inlineTemplates(entry.data as TiledMap, templates);
      }
      this.startGame();
    });
    this.load.start();
  }

  private startGame(): void {
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

  /**
   * Generate one irregular death-splat blob: several overlapping circles jittered
   * around the centre, baked into a square texture sized to fit the largest. One
   * texture serves all splats; variety comes from per-spawn rotation/scale.
   */
  private makeSplat(): void {
    const r = SPLAT.radius;
    const size = r * 2; // texture is a tight square around the blob's reach
    const c = size / 2;
    const g = this.add.graphics();
    g.fillStyle(SPLAT.color, 1);
    g.fillCircle(c, c, r * 0.6); // a solid core so the blob never looks hollow
    for (let i = 0; i < SPLAT.blobs; i++) {
      const angle = (i / SPLAT.blobs) * Math.PI * 2;
      const dist = r * 0.4;
      const blobR = r * Phaser.Math.FloatBetween(0.3, 0.5);
      g.fillCircle(c + Math.cos(angle) * dist, c + Math.sin(angle) * dist, blobR);
    }
    g.generateTexture(TEX.splat, size, size);
    g.destroy();
  }

  /**
   * Generate the Trap's placeholder rune: two concentric rings with radial
   * ticks, baked white so the Trap can tint it (TRAP.color) and vary alpha to
   * read its armed/dormant state. Swapped for real art in the art pass.
   */
  private makeGlyph(): void {
    const s = TRAP.glyphSize;
    const c = s / 2;
    const outer = c - 1;
    const g = this.add.graphics();
    g.lineStyle(1.5, 0xffffff, 1);
    g.strokeCircle(c, c, outer);
    g.strokeCircle(c, c, outer * 0.5);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      g.lineBetween(
        c + Math.cos(a) * outer * 0.5,
        c + Math.sin(a) * outer * 0.5,
        c + Math.cos(a) * outer,
        c + Math.sin(a) * outer,
      );
    }
    g.generateTexture(TEX.trap, s, s);
    g.destroy();
  }

  /**
   * Generate the Spawner's incoming-spawn telegraph reticle: a ring with a centre
   * dot, baked white so the Spawner can tint it (SPAWNER.markColor) and pulse its
   * alpha/scale to read as a building threat. One texture serves every marker.
   */
  private makeSpawnMark(): void {
    const s = SPAWNER.markSize;
    const c = s / 2;
    const g = this.add.graphics();
    g.lineStyle(2, 0xffffff, 1);
    g.strokeCircle(c, c, c - 1);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(c, c, 2);
    g.generateTexture(TEX.spawnMark, s, s);
    g.destroy();
  }
}
