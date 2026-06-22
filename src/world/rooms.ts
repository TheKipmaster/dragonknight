/**
 * The Dungeon's Room registry — the single list of authored Rooms.
 *
 * ADR 0001 preloads every Room's tilemap JSON at boot, so PreloadScene iterates
 * this list. Each id doubles as the cache key for its `.tmj` (loaded as
 * `maps/<id>.tmj`) and as `GameState.activeRoomId`.
 */
export const ROOM_IDS = ['room-01', 'room-02', 'room-debug', 'entrance', 'trapped-corridor', 'corpse-pile', 'laboratory', 'sanctum'] as const;

export type RoomId = (typeof ROOM_IDS)[number];
