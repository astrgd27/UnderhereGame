import { TILE } from './constants';
import type { Room } from './room';

import type { Box } from './geom';

export type { Box };

const EPS = 1e-4;

function overlapsSolid(room: Room, x: number, y: number, w: number, h: number): boolean {
  const c0 = Math.floor(x / TILE);
  const c1 = Math.floor((x + w - EPS) / TILE);
  const r0 = Math.floor(y / TILE);
  const r1 = Math.floor((y + h - EPS) / TILE);
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      if (room.isSolid(col, row)) return true;
    }
  }
  return false;
}

/**
 * Move a box by (dx, dy), stopping flush against solid tiles. Axes are
 * resolved one at a time, so the box slides along walls. Mutates `box` and
 * reports which axes were blocked. Per-step movement must be under one tile.
 */
export function moveAndSlide(
  room: Room,
  box: Box,
  dx: number,
  dy: number,
): { hitX: boolean; hitY: boolean } {
  let hitX = false;
  let hitY = false;

  if (dx !== 0) {
    const nx = box.x + dx;
    if (overlapsSolid(room, nx, box.y, box.w, box.h)) {
      hitX = true;
      box.x = dx > 0
        ? Math.floor((nx + box.w - EPS) / TILE) * TILE - box.w
        : (Math.floor(nx / TILE) + 1) * TILE;
    } else {
      box.x = nx;
    }
  }

  if (dy !== 0) {
    const ny = box.y + dy;
    if (overlapsSolid(room, box.x, ny, box.w, box.h)) {
      hitY = true;
      box.y = dy > 0
        ? Math.floor((ny + box.h - EPS) / TILE) * TILE - box.h
        : (Math.floor(ny / TILE) + 1) * TILE;
    } else {
      box.y = ny;
    }
  }

  return { hitX, hitY };
}

export function boxOverlapsSolid(room: Room, box: Box): boolean {
  return overlapsSolid(room, box.x, box.y, box.w, box.h);
}
