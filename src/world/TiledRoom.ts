import Phaser from 'phaser';
import { TEX, TILE, TILESET_NAME } from '../config/constants';
import type { DoorTrigger, Room } from './Room';

/**
 * A Room backed by a Tiled map (ADR 0001).
 *
 * The map JSON is preloaded at boot under the Room's id; `activate()` builds the
 * live tilemap, renders its layers, turns the `walls` layer into native tile
 * collision, bounds the camera, and reads spawn points from the object layer.
 *
 * Map authoring contract (see scripts/gen-tiles.py):
 *   - tile layers `floor` (visual) and `walls` (visual *and* collision: any
 *     non-empty tile is solid);
 *   - object layer `objects` holding named point objects (spawn markers). The
 *     `start` spawn is the default; doors are parsed by the transition layer
 *     later, not here.
 */
export class TiledRoom implements Room {
  readonly id: string;

  widthPx = 0;
  heightPx = 0;
  readonly spawn = new Phaser.Math.Vector2();

  /** All named spawn markers, so a door can place the Player by name. */
  readonly spawns = new Map<string, Phaser.Math.Vector2>();

  readonly doors: DoorTrigger[] = [];

  private map?: Phaser.Tilemaps.Tilemap;
  private layers: Phaser.Tilemaps.TilemapLayer[] = [];
  private wallLayer?: Phaser.Tilemaps.TilemapLayer;
  /** Colliders this Room created; torn down on deactivate so they never leak
   *  across a transition (the wall layer they reference is being destroyed). */
  private readonly colliders: Phaser.Physics.Arcade.Collider[] = [];

  constructor(
    private scene: Phaser.Scene,
    id: string,
  ) {
    this.id = id;
  }

  async load(): Promise<void> {
    /* Tilemap JSON + tileset image are preloaded at boot (ADR 0001). */
  }

  activate(): void {
    const map = this.scene.make.tilemap({ key: this.id });
    this.map = map;

    // First arg is the tileset *name* embedded in the .tmj; second is the loaded
    // image key. Phaser ignores the image path inside the JSON and binds here.
    const tileset = map.addTilesetImage(TILESET_NAME, TEX.tiles);
    if (!tileset) {
      throw new Error(`Room ${this.id}: tileset "${TILESET_NAME}" not found in map`);
    }

    const floor = map.createLayer('floor', tileset, 0, 0);
    const walls = map.createLayer('walls', tileset, 0, 0);
    if (!floor || !walls) {
      throw new Error(`Room ${this.id}: expected 'floor' and 'walls' tile layers`);
    }
    floor.setDepth(-10);
    walls.setDepth(0);
    // Every non-empty tile in the walls layer collides (empty cells are -1).
    walls.setCollisionByExclusion([-1]);

    this.layers = [floor, walls];
    this.wallLayer = walls;
    this.widthPx = map.widthInPixels;
    this.heightPx = map.heightInPixels;

    this.readObjects(map);

    this.scene.physics.world.setBounds(0, 0, this.widthPx, this.heightPx);
    this.scene.cameras.main.setBounds(0, 0, this.widthPx, this.heightPx);
  }

  /**
   * Read the `objects` layer: named point objects become spawn markers (`start`
   * is the default), and `door` rectangles become overlap zones carrying where
   * they lead. Doors are invisible Zones — visual-free trigger volumes.
   */
  private readObjects(map: Phaser.Tilemaps.Tilemap): void {
    this.spawns.clear();
    this.doors.length = 0;
    const objects = map.getObjectLayer('objects')?.objects ?? [];

    for (const obj of objects) {
      const x = obj.x ?? 0;
      const y = obj.y ?? 0;
      if (obj.point && obj.name) {
        this.spawns.set(obj.name, new Phaser.Math.Vector2(x, y));
      } else if (obj.name === 'door') {
        const props = this.props(obj);
        const targetRoom = props.targetRoom;
        const targetSpawn = props.targetSpawn;
        if (!targetRoom || !targetSpawn) continue;
        const w = obj.width || TILE;
        const h = obj.height || TILE;
        const zone = this.scene.add.zone(x + w / 2, y + h / 2, w, h);
        this.scene.physics.add.existing(zone, true); // static body for overlap
        this.doors.push({ zone, targetRoom, targetSpawn });
      }
    }

    const start = this.spawns.get('start') ?? [...this.spawns.values()][0];
    if (start) this.spawn.copy(start);
    else this.spawn.set(this.widthPx / 2, this.heightPx / 2);
  }

  /** Flatten a Tiled object's custom properties into a string lookup. */
  private props(obj: Phaser.Types.Tilemaps.TiledObject): Record<string, string> {
    const out: Record<string, string> = {};
    for (const p of obj.properties ?? []) out[p.name] = String(p.value);
    return out;
  }

  spawnAt(name: string): Phaser.Math.Vector2 | undefined {
    return this.spawns.get(name)?.clone();
  }

  addColliders(obj: Phaser.Types.Physics.Arcade.ArcadeColliderType): void {
    if (this.wallLayer) {
      this.colliders.push(this.scene.physics.add.collider(obj, this.wallLayer));
    }
  }

  isSolidAt(x: number, y: number): boolean {
    const tile = this.wallLayer?.getTileAtWorldXY(x, y);
    return tile != null && tile.index !== -1;
  }

  deactivate(): void {
    for (const collider of this.colliders) collider.destroy();
    this.colliders.length = 0;
    for (const door of this.doors) door.zone.destroy();
    this.doors.length = 0;
    for (const layer of this.layers) layer.destroy();
    this.layers = [];
    this.wallLayer = undefined;
    this.map?.destroy();
    this.map = undefined;
    this.spawns.clear();
  }

  destroy(): void {
    this.deactivate();
  }
}
