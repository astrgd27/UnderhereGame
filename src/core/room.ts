import { ROOM_COLS, ROOM_ROWS, TILE } from './constants';

export const enum Tile {
  Floor = 0,
  Wall = 1,
  Pillar = 2,
}

/** A grid of tiles. One screen is 15 x 10; larger rooms are multiples. */
export class Room {
  readonly tiles: Uint8Array;

  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    this.tiles = new Uint8Array(cols * rows);
  }

  get widthPx(): number {
    return this.cols * TILE;
  }

  get heightPx(): number {
    return this.rows * TILE;
  }

  get(col: number, row: number): Tile {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return Tile.Wall;
    return this.tiles[row * this.cols + col] as Tile;
  }

  set(col: number, row: number, tile: Tile): void {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
    this.tiles[row * this.cols + col] = tile;
  }

  /** Everything outside the room counts as solid. */
  isSolid(col: number, row: number): boolean {
    return this.get(col, row) !== Tile.Floor;
  }

  /** Build a room from rows of text: '#' wall, 'o' pillar, anything else floor. */
  static fromText(lines: readonly string[]): Room {
    const rows = lines.length;
    const cols = Math.max(0, ...lines.map((line) => line.length));
    const room = new Room(cols, rows);
    lines.forEach((line, row) => {
      for (let col = 0; col < cols; col++) {
        const ch = line[col] ?? '#';
        room.set(col, row, ch === '#' ? Tile.Wall : ch === 'o' ? Tile.Pillar : Tile.Floor);
      }
    });
    return room;
  }
}

/** The single hand-made room used to prove phase 0. */
export function makeTestRoom(): Room {
  const room = Room.fromText([
    '###############',
    '#.............#',
    '#..o.......o..#',
    '#.............#',
    '#......o......#',
    '#.............#',
    '#.............#',
    '#..o.......o..#',
    '#.............#',
    '###############',
  ]);
  if (room.cols !== ROOM_COLS || room.rows !== ROOM_ROWS) {
    throw new Error('Test room must be exactly one screen');
  }
  return room;
}
