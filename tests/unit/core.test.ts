import { describe, expect, it } from 'vitest';
import { SCREEN_H, SCREEN_W, STEP_MS, TILE } from '../../src/core/constants';
import { FixedStep } from '../../src/core/fixedStep';
import { HERO_SPEED, makeHero, stepHero } from '../../src/core/hero';
import { boxOverlapsSolid, moveAndSlide } from '../../src/core/mover';
import { VirtualPad } from '../../src/core/pad';
import { Room, makeTestRoom } from '../../src/core/room';
import { fitScreen } from '../../src/core/scale';

describe('fitScreen', () => {
  it('uses the largest whole-number scale that fits', () => {
    expect(fitScreen(1920, 1080).devicePixelsPerPixel).toBe(6);
    expect(fitScreen(960, 640)).toEqual({ devicePixelsPerPixel: 4, cssWidth: 960, cssHeight: 640 });
    expect(fitScreen(959, 640).devicePixelsPerPixel).toBe(3);
  });

  it('is limited by the tighter axis', () => {
    expect(fitScreen(2000, 330).devicePixelsPerPixel).toBe(2);
  });

  it('never goes below 1', () => {
    expect(fitScreen(100, 50).devicePixelsPerPixel).toBe(1);
    expect(fitScreen(0, 0).cssWidth).toBe(SCREEN_W);
  });

  it('keeps game pixels whole in device pixels on high-density screens', () => {
    const fit = fitScreen(600, 400, 2);
    expect(fit.devicePixelsPerPixel).toBe(5);
    expect(fit.cssWidth).toBe(600);
    expect(fit.cssHeight).toBe((SCREEN_H * 5) / 2);
  });
});

describe('FixedStep', () => {
  it('runs one step per 60 Hz frame', () => {
    const clock = new FixedStep();
    let total = 0;
    for (let i = 0; i < 600; i++) total += clock.advance(STEP_MS);
    expect(total).toBe(600);
  });

  it('runs the same number of steps at 144 Hz and 30 Hz', () => {
    const fast = new FixedStep();
    const slow = new FixedStep();
    let a = 0;
    let b = 0;
    for (let i = 0; i < 1440; i++) a += fast.advance(1000 / 144);
    for (let i = 0; i < 300; i++) b += slow.advance(1000 / 30);
    expect(a).toBe(600);
    expect(b).toBe(600);
  });

  it('does not fast-forward after a long pause', () => {
    const clock = new FixedStep();
    expect(clock.advance(5000)).toBe(5);
    expect(clock.advance(STEP_MS)).toBe(1);
  });

  it('ignores zero and negative time', () => {
    const clock = new FixedStep();
    expect(clock.advance(0)).toBe(0);
    expect(clock.advance(-10)).toBe(0);
  });
});

describe('VirtualPad', () => {
  it('holds a button while any source holds it', () => {
    const pad = new VirtualPad();
    pad.set('keyboard', 'a', true);
    pad.set('touch', 'a', true);
    pad.poll();
    pad.set('keyboard', 'a', false);
    pad.poll();
    expect(pad.isDown('a')).toBe(true);
    pad.set('touch', 'a', false);
    pad.poll();
    expect(pad.isDown('a')).toBe(false);
    expect(pad.justReleased('a')).toBe(true);
  });

  it('reports a press for exactly one step', () => {
    const pad = new VirtualPad();
    pad.set('keyboard', 'r', true);
    pad.poll();
    expect(pad.justPressed('r')).toBe(true);
    pad.poll();
    expect(pad.justPressed('r')).toBe(false);
    expect(pad.isDown('r')).toBe(true);
  });

  it('cancels opposite directions', () => {
    const pad = new VirtualPad();
    pad.set('keyboard', 'left', true);
    pad.set('keyboard', 'right', true);
    pad.set('keyboard', 'up', true);
    pad.poll();
    expect(pad.axis()).toEqual({ x: 0, y: -1 });
  });

  it('releases everything when a source is cleared', () => {
    const pad = new VirtualPad();
    pad.set('keyboard', 'down', true);
    pad.clear('keyboard');
    pad.poll();
    expect(pad.isDown('down')).toBe(false);
  });
});

describe('moveAndSlide', () => {
  const room = Room.fromText([
    '#####',
    '#...#',
    '#.o.#',
    '#...#',
    '#####',
  ]);

  it('moves freely over floor', () => {
    const box = { x: 20, y: 20, w: 10, h: 8 };
    expect(moveAndSlide(room, box, 1.25, 0)).toEqual({ hitX: false, hitY: false });
    expect(box.x).toBe(21.25);
  });

  it('stops flush against a wall on each side', () => {
    const right = { x: 60, y: 20, w: 10, h: 8 };
    expect(moveAndSlide(room, right, 8, 0).hitX).toBe(true);
    expect(right.x).toBe(4 * TILE - 10);

    const left = { x: 18, y: 20, w: 10, h: 8 };
    moveAndSlide(room, left, -8, 0);
    expect(left.x).toBe(TILE);

    const down = { x: 20, y: 54, w: 10, h: 8 };
    expect(moveAndSlide(room, down, 0, 8).hitY).toBe(true);
    expect(down.y).toBe(4 * TILE - 8);

    const up = { x: 20, y: 18, w: 10, h: 8 };
    moveAndSlide(room, up, 0, -8);
    expect(up.y).toBe(TILE);
  });

  it('slides along a wall when moving diagonally into it', () => {
    const box = { x: 20, y: TILE, w: 10, h: 8 };
    const hit = moveAndSlide(room, box, 1, -1);
    expect(hit).toEqual({ hitX: false, hitY: true });
    expect(box).toMatchObject({ x: 21, y: TILE });
  });

  it('treats pillars and the outside of the room as solid', () => {
    expect(room.isSolid(2, 2)).toBe(true);
    expect(room.isSolid(-1, 0)).toBe(true);
    expect(room.isSolid(9, 9)).toBe(true);
  });
});

describe('hero', () => {
  const hold = (pad: VirtualPad, ...buttons: Parameters<VirtualPad['set']>[1][]) => {
    pad.clearAll();
    for (const button of buttons) pad.set('test', button, true);
    pad.poll();
  };

  it('walks at 75 pixels per second', () => {
    const room = makeTestRoom();
    const pad = new VirtualPad();
    const hero = makeHero(5 * TILE, 5 * TILE + 4);
    const startX = hero.x;
    hold(pad, 'right');
    for (let i = 0; i < 20; i++) stepHero(hero, pad, room);
    expect(hero.x - startX).toBeCloseTo(20 * HERO_SPEED);
    expect(hero.facing).toBe('right');
  });

  it('is no faster on the diagonal', () => {
    const room = makeTestRoom();
    const pad = new VirtualPad();
    const hero = makeHero(5 * TILE, 5 * TILE + 4);
    const start = { x: hero.x, y: hero.y };
    hold(pad, 'right', 'down');
    for (let i = 0; i < 10; i++) stepHero(hero, pad, room);
    expect(Math.hypot(hero.x - start.x, hero.y - start.y)).toBeCloseTo(10 * HERO_SPEED);
  });

  it('keeps her facing when a second direction is added', () => {
    const room = makeTestRoom();
    const pad = new VirtualPad();
    const hero = makeHero(5 * TILE, 5 * TILE + 4);
    hold(pad, 'up');
    stepHero(hero, pad, room);
    hold(pad, 'up', 'left');
    stepHero(hero, pad, room);
    expect(hero.facing).toBe('up');
    hold(pad, 'left');
    stepHero(hero, pad, room);
    expect(hero.facing).toBe('left');
  });

  it('can never be pushed into a wall, whatever the input', () => {
    const room = makeTestRoom();
    const pad = new VirtualPad();
    const hero = makeHero(7 * TILE, 6 * TILE);
    const patterns = [['up'], ['up', 'left'], ['left'], ['down', 'left'], ['down'], ['down', 'right'], ['right'], ['up', 'right']] as const;
    let seed = 12345;
    for (let i = 0; i < 20000; i++) {
      if (i % 37 === 0) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        hold(pad, ...patterns[seed % patterns.length]!);
      }
      stepHero(hero, pad, room);
      expect(boxOverlapsSolid(room, hero)).toBe(false);
    }
  });
});
