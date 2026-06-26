import Phaser from 'phaser';
import { TILE, TEX, ANIM, DECALS, SPLAT, TRAP, SPAWNER, SWORD } from '../config/constants';
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
    this.load.image(TEX.knightPortrait, 'portraits/knight.png');
    this.load.image(TEX.necromancerPortrait, 'portraits/necromancer.png');
    // Title screen art (ADR 0015), conditioned to its on-screen size by
    // scripts/prep-title.py: the backdrop pre-scaled to 320x480 (scale-to-width,
    // panned through), and the wordmark keyed to RGBA so it floats over the sky.
    this.load.image(TEX.titleBg, 'title-screen.png');
    this.load.image(TEX.titleLogo, 'game-title.png');
    // First entity to graduate from a flat placeholder rect to a real animated
    // spritesheet. The sheet is repacked from the raw art into uniform 32px (≈2
    // tile) cells by scripts/repack-walker.py — sliced left-to-right; animations
    // are defined in create() below.
    this.load.spritesheet(TEX.walker, 'sprites/walker.png', {
      frameWidth: 32,
      frameHeight: 32,
    });
    // The Player's knight, repacked from raw art by scripts/repack-knight-topdown.py
    // into uniform SQUARE cells, each anchored on the body centroid (the rotation
    // pivot) so a single frame can be rotated in-game to face any direction. This
    // size is the repacker's FIXED `CELL` constant — it stays put across art
    // re-drops, so this no longer needs editing every regen (a sword too long to
    // fit fails the script's --check instead).
    this.load.spritesheet(TEX.player, 'sprites/knight.topdown.png', {
      frameWidth: 64,
      frameHeight: 64,
    });
    // The Charger gets the knight's top-down treatment (scripts/repack-charger-
    // topdown.py): uniform SQUARE cells anchored on the body centroid so it can be
    // rotated in-game to face its chase/lunge direction. Its cell is 80px (not the
    // knight's 64) to clear the lunge frame's speed-streaks within the rotation
    // circle; the on-screen body still matches the knight. Like CELL above, this is
    // the repacker's FIXED size and survives art re-drops (a longer reach fails the
    // script's --check instead of silently resizing).
    this.load.spritesheet(TEX.charger, 'sprites/charger.topdown.png', {
      frameWidth: 80,
      frameHeight: 80,
    });
    for (const [key, path] of Object.entries(DECALS)) {
      this.load.image(key, path); // key doubles as the texture key (see DECALS)
    }
    for (const id of ROOM_IDS) {
      this.load.tilemapTiledJSON(id, `maps/${id}.tmj`);
    }
  }

  create(): void {
    // TEX.player is now a loaded spritesheet (see preload), not a generated rect.
    this.makeRect(TEX.wall, TILE, TILE, 0x5a5a6e, 0x33333f);
    this.makeRect(TEX.floor, TILE, TILE, 0x23232f, 0x2b2b3a);
    this.makeRect(TEX.heart, 12, 12, 0xff4d6d, 0x8a1f33);
    this.makeRect(TEX.dummy, TILE, TILE, 0xc9a04e, 0x7a5e23);
    // TEX.walker and TEX.charger are now loaded spritesheets (see preload), not
    // generated rects.
    this.makeRect(TEX.spawner, TILE, TILE, 0x8a2f4f, 0x3a0f1f); // fleshy nest maroon
    this.makeRect(TEX.key, 10, 12, 0xffd34d, 0x8a6a12);
    this.makeSplat();
    this.makeGlyph();
    this.makeSpawnMark();
    this.defineAnimations();

    // Phaser doesn't expand Tiled object templates; resolve them before any
    // Room is built (see tiledTemplates.ts), then enter the game.
    this.resolveTemplatesThenStart();
  }

  /**
   * Register global animations from the loaded spritesheets. Animations live on
   * the scene's AnimationManager (shared, keyed by ANIM.*), not on any one sprite,
   * so this runs once at boot and every Walker thereafter just calls play().
   */
  private defineAnimations(): void {
    // Player (knight): frame 0 idle, 1-2 walk, 3 hurt, 4-5 the sword swing
    // (raise → strike).
    this.anims.create({
      key: ANIM.playerWalk,
      frames: this.anims.generateFrameNumbers(TEX.player, { start: 1, end: 2 }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: ANIM.playerIdle,
      frames: this.anims.generateFrameNumbers(TEX.player, { start: 0, end: 0 }),
      frameRate: 1,
    });
    this.anims.create({
      key: ANIM.playerHurt,
      frames: this.anims.generateFrameNumbers(TEX.player, { start: 3, end: 3 }),
      frameRate: 1,
    });
    // The swing plays once per combo beat. Its duration is pinned to SWORD.swingMs
    // (the hitbox's live window), so the visible slash can never drift out of sync
    // with when the sword actually deals damage — both move together if tuned.
    this.anims.create({
      key: ANIM.playerAttack,
      frames: this.anims.generateFrameNumbers(TEX.player, { start: 4, end: 5 }),
      duration: SWORD.swingMs,
    });

    this.anims.create({
      key: ANIM.walkerWalk,
      frames: this.anims.generateFrameNumbers(TEX.walker, { start: 1, end: 2 }),
      frameRate: 8,
      repeat: -1, // loop forever
    });
    // Idle is a single still frame (the walk cycle's first pose), so a dormant
    // Walker reads as "standing" until it wakes and switches to the walk loop.
    this.anims.create({
      key: ANIM.walkerIdle,
      frames: this.anims.generateFrameNumbers(TEX.walker, { start: 0, end: 0 }),
      frameRate: 1,
    });
    this.anims.create({
      key: ANIM.walkerHurt,
      frames: this.anims.generateFrameNumbers(TEX.walker, { start: 3, end: 3 }),
      frameRate: 1,
    });

    // Charger (skeleton): frame 0 idle, 1-2 walk, 3 hurt (the alert spark),
    // 4 wind-up (shield raised to brace), 5 lunge (the speed-streaks). Each non-
    // walk pose is a single held frame; the FSM in Charger.ts swaps between them.
    this.anims.create({
      key: ANIM.chargerWalk,
      frames: this.anims.generateFrameNumbers(TEX.charger, { start: 1, end: 2 }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: ANIM.chargerIdle,
      frames: this.anims.generateFrameNumbers(TEX.charger, { start: 0, end: 0 }),
      frameRate: 1,
    });
    this.anims.create({
      key: ANIM.chargerWindup,
      frames: this.anims.generateFrameNumbers(TEX.charger, { start: 4, end: 4 }),
      frameRate: 1,
    });
    this.anims.create({
      key: ANIM.chargerHurt,
      frames: this.anims.generateFrameNumbers(TEX.charger, { start: 3, end: 3 }),
      frameRate: 1,
    });
    this.anims.create({
      key: ANIM.chargerLunge,
      frames: this.anims.generateFrameNumbers(TEX.charger, { start: 5, end: 5 }),
      frameRate: 1,
    });
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
      this.startTitle();
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
      this.startTitle();
    });
    this.load.start();
  }

  private startTitle(): void {
    // Hand off to the Title, not straight into Game (ADR 0015). The Title points
    // at Game on "press any key"; Game resets the Run and launches the parallel
    // UI scene itself, so the HUD always reads fresh Run state.
    this.scene.start('Title');
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
