import { describe, expect, it } from 'vitest';
import { TILE } from '../../src/core/constants';
import { Dungeon, buildRoom, makeTestDungeon } from '../../src/core/dungeon';
import { ENEMY, makeEnemy, type Enemy, type EnemyKind } from '../../src/core/enemies';
import { Game, TRANSITION_STEPS } from '../../src/core/game';
import { centerOf } from '../../src/core/geom';
import {
  NO_INPUT, TUNE, damageHero, heroAttack, heroInvulnerable, hitQuality, makeHero, stepHero,
  type HeroInput,
} from '../../src/core/hero';
import { boxOverlapsSolid } from '../../src/core/mover';
import { BUTTONS, VirtualPad, type Button } from '../../src/core/pad';

const open = buildRoom([]);
const input = (over: Partial<HeroInput>): HeroInput => ({ ...NO_INPUT, ...over });

/** Drive a Game with held buttons for a number of steps. */
function run(game: Game, pad: VirtualPad, steps: number, ...held: Button[]): void {
  for (const b of BUTTONS) pad.set('test', b, held.includes(b));
  for (let i = 0; i < steps; i++) {
    pad.poll();
    game.step(pad);
  }
}

/** A one-room game with chosen enemies and the hero facing right at (x, y). */
function arena(foes: Array<[EnemyKind, number, number]>, x = 4 * TILE, y = 5 * TILE): Game {
  const dungeon = new Dungeon([{
    id: 0, gx: 0, gy: 0, room: buildRoom([]),
    spawns: foes.map(([kind, col, row]) => ({ kind, col, row })),
  }], 0);
  const game = new Game(dungeon);
  game.hero.x = x;
  game.hero.y = y;
  game.hero.facing = 'right';
  return game;
}

/** Put an enemy so its near edge is `gap` pixels beyond the spear's origin. */
function placeAhead(game: Game, enemy: Enemy, gap: number): void {
  const c = centerOf(game.hero);
  enemy.x = c.x + 6 + gap;
  enemy.y = c.y - enemy.h / 2;
}

describe('hero movement', () => {
  it('walks at 75 pixels per second and no faster on the diagonal', () => {
    const hero = makeHero(5 * TILE, 5 * TILE);
    for (let i = 0; i < 20; i++) stepHero(hero, input({ ax: 1 }), open);
    expect(hero.x - 5 * TILE).toBeCloseTo(20 * TUNE.speed);
    expect(hero.facing).toBe('right');

    const diag = makeHero(5 * TILE, 5 * TILE);
    for (let i = 0; i < 10; i++) stepHero(diag, input({ ax: 1, ay: 1 }), open);
    expect(Math.hypot(diag.x - 5 * TILE, diag.y - 5 * TILE)).toBeCloseTo(10 * TUNE.speed);
  });

  it('keeps her facing when a second direction is added', () => {
    const hero = makeHero(5 * TILE, 5 * TILE);
    stepHero(hero, input({ ay: -1 }), open);
    stepHero(hero, input({ ay: -1, ax: -1 }), open);
    expect(hero.facing).toBe('up');
    stepHero(hero, input({ ax: -1 }), open);
    expect(hero.facing).toBe('left');
  });
});

describe('spear', () => {
  it('is only dangerous during the active steps of a thrust', () => {
    const hero = makeHero(5 * TILE, 5 * TILE);
    const def = TUNE.thrust[0];
    stepHero(hero, input({ a: true, aPressed: true }), open);
    expect(hero.state).toBe('thrust');
    let active = 0;
    for (let i = 0; i < 40 && hero.state === 'thrust'; i++) {
      if (heroAttack(hero)) active += 1;
      stepHero(hero, NO_INPUT, open);
    }
    expect(active).toBe(def.active);
    expect(hero.state).toBe('free');
  });

  it('chains three thrusts when A is tapped in rhythm, then resets', () => {
    const hero = makeHero(5 * TILE, 5 * TILE);
    const seen: number[] = [];
    for (let tap = 0; tap < 4; tap++) {
      stepHero(hero, input({ a: true, aPressed: true }), open);
      seen.push(hero.combo);
      while (hero.state === 'thrust') stepHero(hero, NO_INPUT, open);
    }
    expect(seen).toEqual([0, 1, 2, 0]);
  });

  it('drops the combo if the next press comes too late', () => {
    const hero = makeHero(5 * TILE, 5 * TILE);
    stepHero(hero, input({ a: true, aPressed: true }), open);
    while (hero.state === 'thrust') stepHero(hero, NO_INPUT, open);
    for (let i = 0; i < TUNE.comboWindow + 1; i++) stepHero(hero, NO_INPUT, open);
    stepHero(hero, input({ a: true, aPressed: true }), open);
    expect(hero.combo).toBe(0);
  });

  it('rates a hit by where along the spear it lands', () => {
    const hero = makeHero(5 * TILE, 5 * TILE);
    hero.facing = 'right';
    hero.state = 'thrust';
    hero.t = TUNE.thrust[0].startup;
    const attack = heroAttack(hero)!;
    const at = (gap: number) => ({ x: attack.origin.x + gap, y: hero.y - 2, w: 12, h: 12 });
    expect(hitQuality(attack, 'right', at(0))).toBe('close');
    expect(hitQuality(attack, 'right', at(10))).toBe('mid');
    expect(hitQuality(attack, 'right', at(TUNE.thrust[0].reach - 4))).toBe('tip');
  });

  it('deals 1.5x at the tip and 0.75x up close', () => {
    for (const [gap, expected] of [[20, 6], [10, 4], [1, 3]] as const) {
      const game = arena([['dummy', 10, 5]]);
      const dummy = game.enemies[0]!;
      placeAhead(game, dummy, gap);
      const pad = new VirtualPad();
      run(game, pad, 1, 'a');
      run(game, pad, 20);
      expect(dummy.maxHp - dummy.hp).toBe(expected);
    }
  });

  it('hits each enemy once per thrust', () => {
    const game = arena([['dummy', 10, 5]]);
    const dummy = game.enemies[0]!;
    placeAhead(game, dummy, 10);
    const pad = new VirtualPad();
    run(game, pad, 1, 'a');
    run(game, pad, 30);
    expect(dummy.maxHp - dummy.hp).toBe(TUNE.thrust[0].damage);
  });

  it('charges while A is held and lunges three tiles on release', () => {
    const hero = makeHero(3 * TILE, 5 * TILE);
    hero.facing = 'right';
    stepHero(hero, input({ a: true, aPressed: true }), open);
    while (hero.state === 'thrust') stepHero(hero, input({ a: true }), open);
    expect(hero.state).toBe('charge');
    for (let i = 0; i < TUNE.chargeSteps; i++) stepHero(hero, input({ a: true }), open);
    const startX = hero.x;
    stepHero(hero, NO_INPUT, open);
    expect(hero.state).toBe('lunge');
    while (hero.state === 'lunge') stepHero(hero, NO_INPUT, open);
    expect(hero.x - startX).toBe(TUNE.lunge.dash * TUNE.lunge.dashSpeed);
  });

  it('does not lunge if A is released before the charge is full', () => {
    const hero = makeHero(3 * TILE, 5 * TILE);
    stepHero(hero, input({ a: true, aPressed: true }), open);
    while (hero.state === 'thrust') stepHero(hero, input({ a: true }), open);
    for (let i = 0; i < TUNE.chargeSteps - 5; i++) stepHero(hero, input({ a: true }), open);
    stepHero(hero, NO_INPUT, open);
    expect(hero.state).toBe('free');
  });
});

describe('dodge and sweep', () => {
  it('travels two tiles and is invulnerable for the first half', () => {
    const hero = makeHero(4 * TILE, 5 * TILE);
    hero.facing = 'right';
    stepHero(hero, input({ rPressed: true }), open);
    expect(hero.state).toBe('dodge');
    let safe = 0;
    let steps = 0;
    while (hero.state === 'dodge') {
      if (heroInvulnerable(hero)) safe += 1;
      stepHero(hero, NO_INPUT, open);
      steps += 1;
    }
    expect(steps).toBe(TUNE.dodge.steps);
    expect(safe).toBe(TUNE.dodge.invuln);
    expect(hero.x - 4 * TILE).toBeCloseTo(2 * TILE);
  });

  it('goes the way the pad points, or the way she faces', () => {
    const hero = makeHero(6 * TILE, 5 * TILE);
    hero.facing = 'right';
    stepHero(hero, input({ rPressed: true, ay: -1 }), open);
    while (hero.state === 'dodge') stepHero(hero, NO_INPUT, open);
    expect(hero.y).toBeCloseTo(5 * TILE - 2 * TILE);
    expect(hero.x).toBe(6 * TILE);
  });

  it('cannot be chained without a pause', () => {
    const hero = makeHero(4 * TILE, 5 * TILE);
    stepHero(hero, input({ rPressed: true }), open);
    while (hero.state === 'dodge') stepHero(hero, NO_INPUT, open);
    stepHero(hero, input({ rPressed: true }), open);
    expect(hero.state).toBe('free');
  });

  it('turns A straight after a dodge into a sweep', () => {
    const hero = makeHero(4 * TILE, 5 * TILE);
    stepHero(hero, input({ rPressed: true }), open);
    while (hero.state === 'dodge') stepHero(hero, NO_INPUT, open);
    stepHero(hero, NO_INPUT, open);
    stepHero(hero, input({ a: true, aPressed: true }), open);
    expect(hero.state).toBe('sweep');
  });

  it('sweeps enemies standing to the side, which a thrust would miss', () => {
    const game = arena([['dummy', 10, 5]]);
    const dummy = game.enemies[0]!;
    const c = centerOf(game.hero);
    dummy.x = c.x + 8;
    dummy.y = c.y + 8;
    game.hero.state = 'sweep';
    game.hero.t = 0;
    const pad = new VirtualPad();
    run(game, pad, 12);
    expect(dummy.maxHp - dummy.hp).toBe(TUNE.sweep.damage);
  });
});

describe('damage and brace', () => {
  it('loses quarter hearts, gets knocked back and is briefly untouchable', () => {
    const hero = makeHero(5 * TILE, 5 * TILE);
    expect(damageHero(hero, 2, { x: hero.x - 10, y: hero.y + 4 })).toBe(true);
    expect(hero.hp).toBe(TUNE.maxHp - 2);
    expect(hero.state).toBe('hurt');
    expect(hero.vx).toBeGreaterThan(0);
    expect(damageHero(hero, 2, { x: 0, y: 0 })).toBe(false);
    expect(hero.hp).toBe(TUNE.maxHp - 2);
  });

  it('halves contact damage from the front while braced, but not from behind', () => {
    const front = arena([['guard', 10, 5]]);
    const g1 = front.enemies[0]!;
    g1.x = front.hero.x + 6;
    g1.y = front.hero.y - 2;
    const pad = new VirtualPad();
    front.hero.state = 'brace';
    run(front, pad, 31, 'l');
    expect(TUNE.maxHp - front.hero.hp).toBe(ENEMY.guard.contact / 2);

    const behind = arena([['guard', 10, 5]]);
    const g2 = behind.enemies[0]!;
    g2.x = behind.hero.x - 8;
    g2.y = behind.hero.y - 2;
    behind.hero.state = 'brace';
    run(behind, new VirtualPad(), 31, 'l');
    expect(TUNE.maxHp - behind.hero.hp).toBe(ENEMY.guard.contact);
  });

  it('impales a charging rusher on a braced spear', () => {
    const game = arena([['rusher', 10, 5]]);
    const rusher = game.enemies[0]!;
    rusher.y = game.hero.y - 2;
    rusher.x = game.hero.x + 60;
    rusher.cooldown = 0;
    const pad = new VirtualPad();
    run(game, pad, 140, 'l');
    expect(game.hero.hp).toBe(TUNE.maxHp);
    expect(rusher.hp).toBeLessThan(rusher.maxHp);
  });

  it('is hit by a charging rusher when not braced', () => {
    const game = arena([['rusher', 10, 5]]);
    const rusher = game.enemies[0]!;
    rusher.y = game.hero.y - 2;
    rusher.x = game.hero.x + 60;
    rusher.cooldown = 0;
    run(game, new VirtualPad(), 140);
    expect(game.hero.hp).toBeLessThan(TUNE.maxHp);
  });
});

describe('enemies', () => {
  it('a guard blocks thrusts to its face and takes them in the back', () => {
    const game = arena([['guard', 10, 5]]);
    const guard = game.enemies[0]!;
    placeAhead(game, guard, 10);
    guard.facing = 'left';
    guard.turn = 999;
    guard.cooldown = 999;
    const pad = new VirtualPad();
    run(game, pad, 1, 'a');
    run(game, pad, 12);
    expect(guard.hp).toBe(guard.maxHp);

    const game2 = arena([['guard', 10, 5]]);
    const guard2 = game2.enemies[0]!;
    placeAhead(game2, guard2, 10);
    guard2.facing = 'right';
    guard2.turn = 999;
    guard2.cooldown = 999;
    run(game2, pad, 1, 'a');
    run(game2, pad, 12);
    expect(guard2.hp).toBeLessThan(guard2.maxHp);
  });

  it('every attack is telegraphed for at least 18 steps', () => {
    expect(ENEMY.rusher.windup).toBeGreaterThanOrEqual(18);
    expect(ENEMY.guard.windup).toBeGreaterThanOrEqual(18);
    expect(ENEMY.shooter.windup).toBeGreaterThanOrEqual(18);
  });

  it('a shooter fires a shot that damages the hero and dies on walls', () => {
    const game = arena([['shooter', 11, 5]]);
    const shooter = game.enemies[0]!;
    shooter.cooldown = 0;
    const pad = new VirtualPad();
    let sawShot = false;
    for (let i = 0; i < 200 && game.hero.hp === TUNE.maxHp; i++) {
      run(game, pad, 1);
      if (game.projectiles.length > 0) sawShot = true;
    }
    expect(sawShot).toBe(true);
    expect(TUNE.maxHp - game.hero.hp).toBe(ENEMY.shooter.shot);
  });

  it('dies after enough hits and clears the room', () => {
    const game = arena([['shooter', 10, 5]]);
    const pad = new VirtualPad();
    for (let i = 0; i < 6 && game.enemies.length > 0; i++) {
      const foe = game.enemies[0]!;
      placeAhead(game, foe, 18);
      foe.cooldown = 999;
      run(game, pad, 1, 'a');
      run(game, pad, 40);
    }
    expect(game.enemies.length).toBe(0);
    expect(game.cleared.has(0)).toBe(true);
  });

  it('spawns nothing inside a wall', () => {
    for (const def of makeTestDungeon().rooms) {
      for (const spawn of def.spawns) {
        const e = makeEnemy(1, spawn.kind, spawn.col, spawn.row, () => 0.5);
        expect(boxOverlapsSolid(def.room, e)).toBe(false);
      }
    }
  });
});

describe('rooms', () => {
  it('slides to the next room when the hero walks through a door', () => {
    const game = new Game();
    const pad = new VirtualPad();
    const y = game.hero.y;
    for (let i = 0; i < 400 && !game.transition; i++) run(game, pad, 1, 'right');
    expect(game.transition?.to).toBe(1);
    run(game, pad, TRANSITION_STEPS, 'right');
    expect(game.roomId).toBe(1);
    expect(game.hero.x).toBeLessThan(TILE);
    expect(game.hero.y).toBe(y);
    expect(game.enemies.filter((e) => e.kind === 'rusher').length).toBe(2);
  });

  it('cannot leave through a wall', () => {
    const game = new Game();
    const pad = new VirtualPad();
    run(game, pad, 400, 'left');
    expect(game.roomId).toBe(0);
    expect(game.hero.x).toBe(TILE);
  });

  it('every door leads to a room with a matching door', () => {
    const dungeon = makeTestDungeon();
    const sides = [
      ['left', 0, 4, 'right'], ['right', 14, 4, 'left'],
      ['up', 7, 0, 'down'], ['down', 7, 9, 'up'],
    ] as const;
    const back = { left: [14, 4], right: [0, 4], up: [7, 9], down: [7, 0] } as const;
    for (const def of dungeon.rooms) {
      for (const [dir, col, row] of sides) {
        const hasDoor = !def.room.isSolid(col, row);
        const next = dungeon.neighbor(def.id, dir);
        expect(hasDoor).toBe(next !== undefined);
        if (next) expect(next.room.isSolid(back[dir][0], back[dir][1])).toBe(false);
      }
    }
  });

  it('sends the hero back to the start with full health after death', () => {
    const game = arena([['guard', 10, 5]]);
    game.hero.hp = 1;
    const guard = game.enemies[0]!;
    guard.x = game.hero.x + 4;
    guard.y = game.hero.y;
    const pad = new VirtualPad();
    run(game, pad, 40);
    expect(game.hero.state).toBe('dead');
    run(game, pad, 120);
    expect(game.hero.state).toBe('free');
    expect(game.hero.hp).toBe(TUNE.maxHp);
  });
});

describe('soak', () => {
  it('survives 60,000 steps of random input with no broken state', () => {
    const game = new Game();
    const pad = new VirtualPad();
    let seed = 987654321;
    const rand = () => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed / 0x100000000;
    };
    const rooms = new Set<number>();
    for (let i = 0; i < 60000; i++) {
      if (i % 9 === 0) {
        for (const b of BUTTONS) pad.set('test', b, rand() < (b === 'start' || b === 'select' ? 0 : 0.3));
        // Lean right and up so the bot finds doors.
        if (rand() < 0.3) pad.set('test', 'right', true);
      }
      pad.poll();
      game.step(pad);
      game.events.length = 0;
      rooms.add(game.roomId);
      const h = game.hero;
      expect(Number.isFinite(h.x) && Number.isFinite(h.y)).toBe(true);
      expect(h.hp).toBeGreaterThanOrEqual(0);
      expect(h.hp).toBeLessThanOrEqual(h.maxHp);
      if (!game.transition) expect(boxOverlapsSolid(game.room, h)).toBe(false);
      for (const e of game.enemies) {
        expect(Number.isFinite(e.x) && Number.isFinite(e.y)).toBe(true);
        expect(boxOverlapsSolid(game.room, e)).toBe(false);
      }
    }
    expect(rooms.size).toBeGreaterThan(1);
  });
});
