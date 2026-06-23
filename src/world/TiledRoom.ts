import Phaser from 'phaser';
import { DECALS, DECAL_DEPTH, SPAWNER, TEX, TILE, TILESET_NAME, TRAP } from '../config/constants';
import type {
  DoorTrigger,
  EnemySpawn,
  ItemSpawn,
  Room,
  SpawnerSpawn,
  TrapSpawn,
  TripwireSpawn,
} from './Room';
import type { NavGrid } from '../components/FlowField';
import { TRIPWIRE_NAMES, type TripwireName } from '../state/tripwires';

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
  readonly items: ItemSpawn[] = [];
  readonly enemies: EnemySpawn[] = [];
  readonly traps: TrapSpawn[] = [];
  readonly spawners: SpawnerSpawn[] = [];
  readonly tripwires: TripwireSpawn[] = [];

  private map?: Phaser.Tilemaps.Tilemap;
  private layers: Phaser.Tilemaps.TilemapLayer[] = [];
  /** Non-tile floor decorations (e.g. the pentagram); torn down with the Room. */
  private readonly decals: Phaser.GameObjects.Image[] = [];
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
   * Read the `objects` layer: `door` rectangles become overlap zones carrying
   * where they lead (and an optional lockId); `key` points become item spawns;
   * other named points become spawn markers (`start` is the default).
   */
  private readObjects(map: Phaser.Tilemaps.Tilemap): void {
    this.spawns.clear();
    this.doors.length = 0;
    this.items.length = 0;
    this.enemies.length = 0;
    this.traps.length = 0;
    this.spawners.length = 0;
    this.tripwires.length = 0;
    const objects = map.getObjectLayer('objects')?.objects ?? [];

    for (const obj of objects) {
      const x = obj.x ?? 0;
      const y = obj.y ?? 0;
      if (obj.name === 'door') {
        const props = this.props(obj);
        if (!props.targetRoom || !props.targetSpawn) {
          // A door with no destination is almost always an authoring slip
          // (misspelled property name, kebab-case instead of camelCase). Fail
          // loud in dev so it surfaces instead of silently doing nothing.
          console.warn(
            `Room ${this.id}: 'door' object #${obj.id} is missing ` +
              `targetRoom/targetSpawn (got: ${Object.keys(props).join(', ') || 'none'}) — skipped`,
          );
          continue;
        }
        const w = obj.width || TILE;
        const h = obj.height || TILE;
        const zone = this.scene.add.zone(x + w / 2, y + h / 2, w, h);
        this.scene.physics.add.existing(zone, true); // static body for overlap
        this.doors.push({
          zone,
          targetRoom: props.targetRoom,
          targetSpawn: props.targetSpawn,
          lockId: props.locked === 'true' ? props.lockId : undefined,
        });
      } else if (obj.type === 'tripwire') {
        // An invisible behaviour region (ADR 0010). A rectangle whose `name` is
        // the Tripwire's logical name (dispatched in code), validated against the
        // TRIPWIRE_NAMES registry; an unknown name is almost always a typo (the
        // only stringly-typed surface left), so fail loud the Door way. `repeat`
        // opts out of the default once-ever firing.
        const name = obj.name ?? '';
        if (!(TRIPWIRE_NAMES as readonly string[]).includes(name)) {
          console.warn(
            `Room ${this.id}: 'tripwire' object #${obj.id} has unknown name "${name}" ` +
              `(known: ${TRIPWIRE_NAMES.join(', ')}) — skipped`,
          );
          continue;
        }
        const p = this.props(obj);
        const w = obj.width || TILE;
        const h = obj.height || TILE;
        const zone = this.scene.add.zone(x + w / 2, y + h / 2, w, h);
        this.scene.physics.add.existing(zone, true); // static body for overlap
        this.tripwires.push({
          id: `${this.id}#${obj.id}`,
          name: name as TripwireName,
          repeat: p.repeat === 'true',
          region: new Phaser.Geom.Rectangle(x, y, w, h),
          props: p,
          zone,
        });
      } else if (obj.point && obj.type === 'enemy') {
        this.enemies.push({id: `${this.id}#${obj.id}`, kind: obj.name, x, y})
      } else if (obj.point && obj.name === 'key') {
        this.items.push({ id: `${this.id}#${obj.id}`, kind: 'key', x, y });
      } else if (obj.point && obj.name === 'trap') {
        // A hidden hazard (ADR 0008). Zero properties = a lethal, standard-bite
        // glyph; any camelCase prop overrides the TRAP default. Values arrive as
        // strings (see props()), so coerce numbers and parse `lethal` the Door way.
        const p = this.props(obj);
        this.traps.push({
          id: `${this.id}#${obj.id}`,
          x,
          y,
          playerDamage: p.playerDamage != null ? Number(p.playerDamage) : TRAP.playerDamage,
          enemyDamage: p.enemyDamage != null ? Number(p.enemyDamage) : TRAP.enemyDamage,
          lethal: p.lethal != null ? p.lethal === 'true' : TRAP.lethal,
          rearmMs: p.rearmMs != null ? Number(p.rearmMs) : TRAP.rearmMs,
          knockback: p.knockback != null ? Number(p.knockback) : TRAP.knockback,
        });
      } else if (obj.point && obj.type === 'spawner') {
        // A destroyable nest (ADR 0009). Zero properties = the SPAWNER defaults;
        // any camelCase prop overrides one scalar (wave recipes/ring stay global).
        // Values arrive as strings (see props()), so coerce the numbers.
        const p = this.props(obj);
        this.spawners.push({
          id: `${this.id}#${obj.id}`,
          x,
          y,
          maxHp: p.maxHp != null ? Number(p.maxHp) : SPAWNER.maxHp,
          aggroRange: p.aggroRange != null ? Number(p.aggroRange) : SPAWNER.aggroRange,
          intervalMs: p.intervalMs != null ? Number(p.intervalMs) : SPAWNER.intervalMs,
          telegraphMs: p.telegraphMs != null ? Number(p.telegraphMs) : SPAWNER.telegraphMs,
          maxLiveChildren:
            p.maxLiveChildren != null ? Number(p.maxLiveChildren) : SPAWNER.maxLiveChildren,
        });
      } else if (obj.point && obj.name && obj.name in DECALS) {
        // A floor decal: the marker name is the texture key (see DECALS). Centred
        // on the marker (image origin defaults to 0.5), drawn above the floor.
        this.decals.push(this.scene.add.image(x, y, obj.name).setDepth(DECAL_DEPTH));
      } else if (obj.point && obj.name) {
        this.spawns.set(obj.name, new Phaser.Math.Vector2(x, y));
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

  buildNavGrid(): NavGrid {
    const map = this.map;
    const walls = this.wallLayer;
    if (!map || !walls) throw new Error(`Room ${this.id}: buildNavGrid() before activate()`);

    const cols = map.width;
    const rows = map.height;
    const solid: boolean[] = new Array(cols * rows);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // Mirror activate()'s rule: any non-empty walls tile is solid (empty = -1/null).
        const tile = walls.getTileAt(col, row);
        solid[row * cols + col] = tile != null && tile.index !== -1;
      }
    }
    return { cols, rows, tile: TILE, solid };
  }

  deactivate(): void {
    for (const collider of this.colliders) collider.destroy();
    this.colliders.length = 0;
    for (const door of this.doors) door.zone.destroy();
    this.doors.length = 0;
    // Tripwire zones are Room-owned (the Door pattern, ADR 0010); their runtimes
    // and overlaps are torn down by the scene's clearContent().
    for (const tw of this.tripwires) tw.zone.destroy();
    this.tripwires.length = 0;
    this.items.length = 0;
    for (const decal of this.decals) decal.destroy();
    this.decals.length = 0;
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
