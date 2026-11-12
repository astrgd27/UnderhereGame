import { moveAndSlide, type Box } from './mover';
import type { VirtualPad } from './pad';
import type { Room } from './room';

export type Facing = 'down' | 'up' | 'left' | 'right';

/** Pixels per logic step: 75 px per second, about 4.7 tiles. */
export const HERO_SPEED = 1.25;
const DIAGONAL = Math.SQRT1_2;

/** Collision box at the hero's feet; the sprite is drawn around it. */
export const HERO_BOX_W = 10;
export const HERO_BOX_H = 8;

export interface Hero extends Box {
  facing: Facing;
  moving: boolean;
  /** Logic steps spent walking without stopping; drives the walk cycle. */
  walkSteps: number;
}

export function makeHero(x: number, y: number): Hero {
  return { x, y, w: HERO_BOX_W, h: HERO_BOX_H, facing: 'down', moving: false, walkSteps: 0 };
}

/**
 * Four-way facing with eight-way movement, as in the handheld Zeldas: the
 * hero keeps facing the way she was going when a second direction is added,
 * and only turns when the held directions no longer include her facing.
 */
function nextFacing(current: Facing, ax: number, ay: number): Facing {
  const held: Facing[] = [];
  if (ax < 0) held.push('left');
  if (ax > 0) held.push('right');
  if (ay < 0) held.push('up');
  if (ay > 0) held.push('down');
  if (held.length === 0 || held.includes(current)) return current;
  return held[0] as Facing;
}

/** Advance the hero by one logic step. */
export function stepHero(hero: Hero, pad: VirtualPad, room: Room): void {
  const { x: ax, y: ay } = pad.axis();
  hero.moving = ax !== 0 || ay !== 0;
  if (!hero.moving) {
    hero.walkSteps = 0;
    return;
  }
  hero.facing = nextFacing(hero.facing, ax, ay);
  const speed = ax !== 0 && ay !== 0 ? HERO_SPEED * DIAGONAL : HERO_SPEED;
  moveAndSlide(room, hero, ax * speed, ay * speed);
  hero.walkSteps += 1;
}
