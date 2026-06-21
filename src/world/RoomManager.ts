import Phaser from 'phaser';
import { TiledRoom } from './TiledRoom';
import type { Room } from './Room';
import type { Player } from '../entities/Player';
import { GameState } from '../state/GameState';
import { eventBus, GameEvent } from '../state/eventBus';

/** Per-Room content hooks: the scene builds/tears down its entity rig here. */
export interface RoomContentHooks {
  /** Called after a Room activates: build entities, register room colliders. */
  onEnter(room: Room): void;
  /** Called before a Room deactivates: destroy the entities built in onEnter. */
  onExit(room: Room): void;
}

const FADE_MS = 150;

/**
 * Owns the single active Room and drives transitions (ADR 0001).
 *
 * Only one Room is live at a time. Walking into a door's overlap zone fades out,
 * tears down the current Room (its tiles, colliders, door zones, and the scene's
 * per-Room entities), activates the target Room, drops the Player at the named
 * spawn, rebinds the camera, and fades back in. The Player persists across the
 * swap — it is the through-line, repositioned rather than rebuilt.
 */
export class RoomManager {
  private current!: Room;
  private transitioning = false;
  /** Door overlaps for the active Room; destroyed and rebuilt each transition. */
  private doorOverlaps: Phaser.Physics.Arcade.Collider[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Player,
    private readonly hooks: RoomContentHooks,
  ) {}

  get room(): Room {
    return this.current;
  }

  /** Boot into the first Room (no fade). */
  enter(roomId: string, spawn = 'start'): void {
    this.current = this.activate(roomId, spawn);
    this.scene.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.scene.cameras.main.roundPixels = true;
    this.hooks.onEnter(this.current);
  }

  /** Transition to another Room, placing the Player at `spawn`. */
  goTo(roomId: string, spawn: string): void {
    if (this.transitioning) return; // ignore re-triggers while a fade is in flight
    this.transitioning = true;

    const cam = this.scene.cameras.main;
    cam.fadeOut(FADE_MS);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.hooks.onExit(this.current);
      this.teardownDoors();
      this.current.deactivate();

      this.current = this.activate(roomId, spawn);
      cam.startFollow(this.player, true, 0.15, 0.15);
      this.hooks.onEnter(this.current);
      eventBus.emit(GameEvent.RoomChanged);

      cam.fadeIn(FADE_MS);
      this.transitioning = false;
    });
  }

  /** Build a Room, place the Player, and wire its doors. Shared by enter/goTo. */
  private activate(roomId: string, spawn: string): Room {
    const room = new TiledRoom(this.scene, roomId);
    room.activate();
    GameState.activeRoomId = roomId;

    const at = room.spawnAt(spawn) ?? room.spawn;
    this.player.placeAt(at.x, at.y);

    for (const door of room.doors) {
      this.doorOverlaps.push(
        this.scene.physics.add.overlap(this.player, door.zone, () =>
          this.goTo(door.targetRoom, door.targetSpawn),
        ),
      );
    }
    return room;
  }

  private teardownDoors(): void {
    for (const overlap of this.doorOverlaps) overlap.destroy();
    this.doorOverlaps = [];
  }
}
