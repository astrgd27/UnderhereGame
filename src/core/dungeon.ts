import { ROOM_COLS, ROOM_ROWS } from './constants';
import type { EnemyKind } from './enemies';
import { DIR, type Facing } from './geom';
import { Room, Tile } from './room';

export interface Spawn {
  kind: EnemyKind;
  col: number;
  row: number;
}

export interface RoomDef {
  id: number;
  /** Position on the dungeon grid. North is gy - 1. */
  gx: number;
  gy: number;
  room: Room;
  spawns: Spawn[];
}

export class Dungeon {
  constructor(
    readonly rooms: readonly RoomDef[],
    readonly start: number,
  ) {}

  get(id: number): RoomDef {
    const def = this.rooms.find((r) => r.id === id);
    if (!def) throw new Error(`No room ${id}`);
    return def;
  }

  neighbor(id: number, dir: Facing): RoomDef | undefined {
    const from = this.get(id);
    const d = DIR[dir];
    return this.rooms.find((r) => r.gx === from.gx + d.x && r.gy === from.gy + d.y);
  }
}

/** Door gaps: column 7 on the top and bottom walls, rows 4 and 5 on the sides. */
export const DOOR_COL = 7;
export const DOOR_ROWS = [4, 5] as const;

/** A one-screen room with walls all round, door gaps and pillars. */
export function buildRoom(doors: readonly Facing[], pillars: ReadonlyArray<readonly [number, number]> = []): Room {
  const room = new Room(ROOM_COLS, ROOM_ROWS);
  for (let row = 0; row < ROOM_ROWS; row++) {
    for (let col = 0; col < ROOM_COLS; col++) {
      const edge = row === 0 || col === 0 || row === ROOM_ROWS - 1 || col === ROOM_COLS - 1;
      room.set(col, row, edge ? Tile.Wall : Tile.Floor);
    }
  }
  for (const door of doors) {
    if (door === 'up') room.set(DOOR_COL, 0, Tile.Floor);
    if (door === 'down') room.set(DOOR_COL, ROOM_ROWS - 1, Tile.Floor);
    for (const row of DOOR_ROWS) {
      if (door === 'left') room.set(0, row, Tile.Floor);
      if (door === 'right') room.set(ROOM_COLS - 1, row, Tile.Floor);
    }
  }
  for (const [col, row] of pillars) room.set(col, row, Tile.Pillar);
  return room;
}

/**
 * The hand-made five-room loop for the feel prototype:
 *
 *        [3 shooters]--[4 mixed arena]
 *             |              |
 * [0 start]--[1 rushers]--[2 guard]
 */
export function makeTestDungeon(): Dungeon {
  return new Dungeon([
    {
      id: 0, gx: 0, gy: 0,
      room: buildRoom(['right']),
      spawns: [{ kind: 'dummy', col: 9, row: 2 }, { kind: 'dummy', col: 9, row: 7 }],
    },
    {
      id: 1, gx: 1, gy: 0,
      room: buildRoom(['left', 'right', 'up'], [[4, 2], [10, 7]]),
      spawns: [{ kind: 'rusher', col: 10, row: 3 }, { kind: 'rusher', col: 11, row: 6 }],
    },
    {
      id: 2, gx: 2, gy: 0,
      room: buildRoom(['left', 'up'], [[5, 2], [5, 7]]),
      spawns: [{ kind: 'guard', col: 9, row: 4 }, { kind: 'rusher', col: 11, row: 7 }],
    },
    {
      id: 3, gx: 1, gy: -1,
      room: buildRoom(['down', 'right'], [[4, 5], [10, 5], [7, 3]]),
      spawns: [{ kind: 'shooter', col: 3, row: 2 }, { kind: 'shooter', col: 11, row: 2 }],
    },
    {
      id: 4, gx: 2, gy: -1,
      room: buildRoom(['left', 'down'], [[4, 2], [4, 7]]),
      spawns: [
        { kind: 'guard', col: 8, row: 3 },
        { kind: 'rusher', col: 11, row: 2 },
        { kind: 'rusher', col: 11, row: 7 },
        { kind: 'shooter', col: 12, row: 5 },
      ],
    },
  ], 0);
}
