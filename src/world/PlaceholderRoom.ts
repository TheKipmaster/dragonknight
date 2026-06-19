import Phaser from 'phaser';
import { TILE, TEX } from '../config/constants';
import type { Room } from './Room';

/**
 * A hand-built placeholder Room: a bordered space larger than the viewport with
 * a few interior pillars, so we can prove movement, wall collision, and camera
 * scrolling before wiring up Tiled maps.
 */
export class PlaceholderRoom implements Room {
  readonly id: string;
  readonly widthTiles = 30;
  readonly heightTiles = 22;
  readonly widthPx = this.widthTiles * TILE;
  readonly heightPx = this.heightTiles * TILE;
  readonly spawn: Phaser.Math.Vector2;
  readonly walls: Phaser.Physics.Arcade.StaticGroup;

  private floor?: Phaser.GameObjects.TileSprite;

  constructor(private scene: Phaser.Scene, id = 'room-01') {
    this.id = id;
    this.spawn = new Phaser.Math.Vector2(this.widthPx / 2, this.heightPx / 2);
    this.walls = scene.physics.add.staticGroup();
  }

  async load(): Promise<void> {
    /* Assets are generated at boot; nothing to load per-Room in the MVP. */
  }

  activate(): void {
    this.floor = this.scene.add
      .tileSprite(0, 0, this.widthPx, this.heightPx, TEX.floor)
      .setOrigin(0, 0)
      .setDepth(-10);

    // Outer border walls.
    for (let x = 0; x < this.widthTiles; x++) {
      this.addWall(x, 0);
      this.addWall(x, this.heightTiles - 1);
    }
    for (let y = 1; y < this.heightTiles - 1; y++) {
      this.addWall(0, y);
      this.addWall(this.widthTiles - 1, y);
    }

    // A few interior pillars to make the space readable and test collision.
    const pillars: Array<[number, number]> = [
      [10, 8], [10, 9], [19, 8], [19, 9], [14, 14], [15, 14], [14, 15], [15, 15],
    ];
    for (const [gx, gy] of pillars) this.addWall(gx, gy);

    this.scene.physics.world.setBounds(0, 0, this.widthPx, this.heightPx);
    this.scene.cameras.main.setBounds(0, 0, this.widthPx, this.heightPx);
  }

  private addWall(gx: number, gy: number): void {
    const wall = this.walls.create(
      gx * TILE + TILE / 2,
      gy * TILE + TILE / 2,
      TEX.wall,
    ) as Phaser.Physics.Arcade.Sprite;
    wall.refreshBody();
  }

  deactivate(): void {
    this.walls.clear(true, true);
    this.floor?.destroy();
    this.floor = undefined;
  }

  destroy(): void {
    this.deactivate();
  }
}
