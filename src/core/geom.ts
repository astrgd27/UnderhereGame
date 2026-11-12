export interface Vec {
  x: number;
  y: number;
}

/** Axis-aligned box in room pixels. x, y is the top-left corner. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Facing = 'down' | 'up' | 'left' | 'right';

export const DIR: Readonly<Record<Facing, Vec>> = {
  down: { x: 0, y: 1 },
  up: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const OPPOSITE: Readonly<Record<Facing, Facing>> = {
  down: 'up', up: 'down', left: 'right', right: 'left',
};

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function centerOf(box: Box): Vec {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

/** The cardinal direction that best points from one place to another. */
export function facingToward(from: Vec, to: Vec): Facing {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

/** Unit vector from one place to another; zero if they coincide. */
export function unitToward(from: Vec, to: Vec): Vec {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  return len < 1e-6 ? { x: 0, y: 0 } : { x: dx / len, y: dy / len };
}

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
