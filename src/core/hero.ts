import { DIR, centerOf, type Box, type Facing, type Vec } from './geom';
import { moveAndSlide } from './mover';
import type { Room } from './room';

export type { Facing };

/**
 * Every combat number in one place. Times are logic steps (1/60 s),
 * distances are pixels, health and damage are quarter hearts for the hero
 * and plain points for enemies.
 */
export const TUNE = {
  speed: 1.25,
  maxHp: 12,
  thrust: [
    { startup: 4, active: 5, recovery: 7, reach: 26, damage: 4, advance: 0, knock: 2.2 },
    { startup: 4, active: 5, recovery: 7, reach: 26, damage: 4, advance: 0, knock: 2.2 },
    { startup: 6, active: 6, recovery: 12, reach: 30, damage: 6, advance: 10, knock: 3.4 },
  ],
  spearWidth: 8,
  /** Length of the sweet spot at the end of the spear. */
  tipZone: 10,
  tipMult: 1.5,
  /** Targets nearer than this to the hand take a weak hit. */
  closeZone: 5,
  closeMult: 0.75,
  /** Steps after a thrust during which the next press continues the combo. */
  comboWindow: 14,
  chargeSteps: 40,
  chargeMoveSpeed: 0.5,
  lunge: { startup: 3, dash: 12, dashSpeed: 4, recovery: 14, reach: 28, width: 10, damage: 8, knock: 3.6 },
  sweep: { startup: 3, active: 6, recovery: 9, along: 28, across: 44, damage: 2, knock: 4.5, window: 10 },
  dodge: { steps: 20, moveSteps: 14, distance: 32, invuln: 10, cooldown: 6 },
  hurt: { steps: 10, invuln: 60, knock: 2.4 },
} as const;

/** Kept for phase 0 callers and tests. */
export const HERO_SPEED = TUNE.speed;
const DIAGONAL = Math.SQRT1_2;

/** Collision box at the hero's feet; the sprite is drawn around it. */
export const HERO_BOX_W = 10;
export const HERO_BOX_H = 8;

export type HeroState =
  | 'free' | 'thrust' | 'charge' | 'lunge' | 'sweep'
  | 'dodge' | 'brace' | 'hurt' | 'dead';

/** What the player is asking for on this logic step. */
export interface HeroInput {
  ax: number;
  ay: number;
  a: boolean;
  aPressed: boolean;
  l: boolean;
  rPressed: boolean;
}

export const NO_INPUT: HeroInput = { ax: 0, ay: 0, a: false, aPressed: false, l: false, rPressed: false };

export interface Hero extends Box {
  facing: Facing;
  moving: boolean;
  /** Logic steps spent walking without stopping; drives the walk cycle. */
  walkSteps: number;
  state: HeroState;
  /** Steps spent in the current state. */
  t: number;
  /** Which hit of the thrust combo: 0, 1 or 2. */
  combo: number;
  comboWindow: number;
  /** A was pressed during an action and will be used when it ends. */
  buffered: boolean;
  /** A has been held without a break since the current thrust began. */
  aHeld: boolean;
  charge: number;
  hp: number;
  maxHp: number;
  invuln: number;
  dodgeDir: Vec;
  dodgeCooldown: number;
  /** Steps since the last dodge ended. */
  sinceDodge: number;
  /** Knockback velocity while hurt. */
  vx: number;
  vy: number;
  /** Enemies already struck by the current attack. */
  hitIds: Set<number>;
  /** One-step signal for sound and effects. */
  cue: 'thrust' | 'lunge' | 'sweep' | 'dodge' | 'charged' | null;
}

export function makeHero(x: number, y: number): Hero {
  return {
    x, y, w: HERO_BOX_W, h: HERO_BOX_H,
    facing: 'down', moving: false, walkSteps: 0,
    state: 'free', t: 0, combo: 0, comboWindow: 0, buffered: false, aHeld: false, charge: 0,
    hp: TUNE.maxHp, maxHp: TUNE.maxHp, invuln: 0,
    dodgeDir: { x: 0, y: 1 }, dodgeCooldown: 0, sinceDodge: 999,
    vx: 0, vy: 0, hitIds: new Set(), cue: null,
  };
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

function enter(hero: Hero, state: HeroState): void {
  hero.state = state;
  hero.t = 0;
  hero.buffered = false;
}

function walk(hero: Hero, input: HeroInput, room: Room, speed: number, turn: boolean): void {
  const { ax, ay } = input;
  hero.moving = ax !== 0 || ay !== 0;
  if (!hero.moving) {
    hero.walkSteps = 0;
    return;
  }
  if (turn) hero.facing = nextFacing(hero.facing, ax, ay);
  const s = ax !== 0 && ay !== 0 ? speed * DIAGONAL : speed;
  moveAndSlide(room, hero, ax * s, ay * s);
  hero.walkSteps += 1;
}

function startThrust(hero: Hero, combo: number): void {
  enter(hero, 'thrust');
  hero.combo = combo;
  hero.comboWindow = 0;
  hero.aHeld = true;
  hero.moving = false;
  hero.hitIds.clear();
  hero.cue = 'thrust';
}

function startSweep(hero: Hero): void {
  enter(hero, 'sweep');
  hero.moving = false;
  hero.hitIds.clear();
  hero.sinceDodge = 999;
  hero.cue = 'sweep';
}

function startLunge(hero: Hero): void {
  enter(hero, 'lunge');
  hero.moving = false;
  hero.hitIds.clear();
  hero.cue = 'lunge';
}

function startDodge(hero: Hero, input: HeroInput): void {
  enter(hero, 'dodge');
  hero.moving = false;
  hero.charge = 0;
  if (input.ax !== 0 || input.ay !== 0) {
    const len = Math.hypot(input.ax, input.ay);
    hero.dodgeDir = { x: input.ax / len, y: input.ay / len };
    hero.facing = nextFacing(hero.facing, input.ax, input.ay);
  } else {
    hero.dodgeDir = { ...DIR[hero.facing] };
  }
  hero.cue = 'dodge';
}

/** True while attacks pass through the hero. */
export function heroInvulnerable(hero: Hero): boolean {
  return hero.invuln > 0 || hero.state === 'dead'
    || (hero.state === 'dodge' && hero.t < TUNE.dodge.invuln);
}

/** Advance the hero by one logic step. */
export function stepHero(hero: Hero, input: HeroInput, room: Room): void {
  hero.cue = null;
  if (hero.invuln > 0) hero.invuln -= 1;
  if (hero.dodgeCooldown > 0) hero.dodgeCooldown -= 1;
  if (hero.comboWindow > 0) hero.comboWindow -= 1;
  if (hero.sinceDodge < 999) hero.sinceDodge += 1;
  const canDodge = input.rPressed && hero.dodgeCooldown === 0;

  switch (hero.state) {
    case 'free': {
      if (canDodge) return startDodge(hero, input);
      if (input.aPressed) {
        if (hero.sinceDodge <= TUNE.sweep.window) return startSweep(hero);
        return startThrust(hero, hero.comboWindow > 0 ? (hero.combo + 1) % TUNE.thrust.length : 0);
      }
      if (input.l) {
        enter(hero, 'brace');
        hero.moving = false;
        return;
      }
      walk(hero, input, room, TUNE.speed, true);
      return;
    }

    case 'thrust': {
      const def = TUNE.thrust[hero.combo]!;
      if (def.advance > 0 && hero.t < def.startup) {
        const d = DIR[hero.facing];
        const stepLen = def.advance / def.startup;
        moveAndSlide(room, hero, d.x * stepLen, d.y * stepLen);
      }
      if (!input.a) hero.aHeld = false;
      if (input.aPressed) hero.buffered = true;
      hero.t += 1;
      if (hero.t >= def.startup + def.active && canDodge) return startDodge(hero, input);
      if (hero.t >= def.startup + def.active + def.recovery) {
        if (hero.buffered && hero.combo < TUNE.thrust.length - 1) {
          startThrust(hero, hero.combo + 1);
        } else if (hero.aHeld && input.a) {
          enter(hero, 'charge');
          hero.charge = 0;
        } else {
          const last = hero.combo >= TUNE.thrust.length - 1;
          enter(hero, 'free');
          hero.comboWindow = last ? 0 : TUNE.comboWindow;
        }
      }
      return;
    }

    case 'charge': {
      if (canDodge) return startDodge(hero, input);
      if (!input.a) {
        if (hero.charge >= TUNE.chargeSteps) return startLunge(hero);
        hero.charge = 0;
        enter(hero, 'free');
        return;
      }
      hero.charge += 1;
      if (hero.charge === TUNE.chargeSteps) hero.cue = 'charged';
      walk(hero, input, room, TUNE.chargeMoveSpeed, false);
      return;
    }

    case 'lunge': {
      const def = TUNE.lunge;
      if (hero.t >= def.startup && hero.t < def.startup + def.dash) {
        const d = DIR[hero.facing];
        const hit = moveAndSlide(room, hero, d.x * def.dashSpeed, d.y * def.dashSpeed);
        if (hit.hitX || hit.hitY) hero.t = def.startup + def.dash - 1;
      }
      hero.t += 1;
      if (hero.t >= def.startup + def.dash + def.recovery) {
        hero.charge = 0;
        enter(hero, 'free');
      }
      return;
    }

    case 'sweep': {
      const def = TUNE.sweep;
      hero.t += 1;
      if (hero.t >= def.startup + def.active + def.recovery) enter(hero, 'free');
      return;
    }

    case 'dodge': {
      const def = TUNE.dodge;
      if (hero.t < def.moveSteps) {
        const stepLen = def.distance / def.moveSteps;
        moveAndSlide(room, hero, hero.dodgeDir.x * stepLen, hero.dodgeDir.y * stepLen);
      }
      if (input.aPressed && hero.t >= def.invuln - 2) hero.buffered = true;
      hero.t += 1;
      if (hero.t >= def.steps) {
        const sweep = hero.buffered;
        hero.dodgeCooldown = def.cooldown;
        hero.sinceDodge = 0;
        if (sweep) startSweep(hero);
        else enter(hero, 'free');
      }
      return;
    }

    case 'brace': {
      if (canDodge) return startDodge(hero, input);
      if (!input.l) {
        enter(hero, 'free');
        return;
      }
      // Planted: she can turn to face a threat but not walk.
      if (input.ax !== 0 && input.ay === 0) hero.facing = input.ax < 0 ? 'left' : 'right';
      if (input.ay !== 0 && input.ax === 0) hero.facing = input.ay < 0 ? 'up' : 'down';
      hero.t += 1;
      return;
    }

    case 'hurt': {
      moveAndSlide(room, hero, hero.vx, hero.vy);
      hero.vx *= 0.8;
      hero.vy *= 0.8;
      hero.t += 1;
      if (hero.t >= TUNE.hurt.steps) enter(hero, 'free');
      return;
    }

    case 'dead':
      hero.t += 1;
      return;
  }
}

/** Take damage from a point in the room. Returns false if it was ignored. */
export function damageHero(hero: Hero, amount: number, from: Vec, knockScale = 1): boolean {
  if (heroInvulnerable(hero) || amount <= 0) return false;
  hero.hp = Math.max(0, hero.hp - amount);
  hero.invuln = TUNE.hurt.invuln;
  hero.charge = 0;
  hero.moving = false;
  if (hero.hp === 0) {
    enter(hero, 'dead');
    hero.invuln = 0;
    return true;
  }
  const c = centerOf(hero);
  const len = Math.hypot(c.x - from.x, c.y - from.y) || 1;
  hero.vx = ((c.x - from.x) / len) * TUNE.hurt.knock * knockScale;
  hero.vy = ((c.y - from.y) / len) * TUNE.hurt.knock * knockScale;
  enter(hero, 'hurt');
  return true;
}

export type AttackKind = 'thrust' | 'lunge' | 'sweep';
export type HitQuality = 'tip' | 'mid' | 'close';

export interface Attack {
  kind: AttackKind;
  rect: Box;
  damage: number;
  knock: number;
  /** Where the spear leaves the hand, and how far it reaches. */
  origin: Vec;
  reach: number;
}

/** How far in front of her centre the spear starts. */
const HAND = 6;

/** The spear's box for a given reach, pointing the way she faces. */
export function spearRect(hero: Hero, reach: number, width: number): { rect: Box; origin: Vec } {
  const c = centerOf(hero);
  const d = DIR[hero.facing];
  const origin = { x: c.x + d.x * HAND, y: c.y + d.y * HAND };
  let rect: Box;
  if (d.x > 0) rect = { x: origin.x, y: c.y - width / 2, w: reach, h: width };
  else if (d.x < 0) rect = { x: origin.x - reach, y: c.y - width / 2, w: reach, h: width };
  else if (d.y > 0) rect = { x: c.x - width / 2, y: origin.y, w: width, h: reach };
  else rect = { x: c.x - width / 2, y: origin.y - reach, w: width, h: reach };
  return { rect, origin };
}

/** The hit box of whatever the hero is doing this step, if it can hurt. */
export function heroAttack(hero: Hero): Attack | null {
  if (hero.state === 'thrust') {
    const def = TUNE.thrust[hero.combo]!;
    if (hero.t < def.startup || hero.t >= def.startup + def.active) return null;
    const { rect, origin } = spearRect(hero, def.reach, TUNE.spearWidth);
    return { kind: 'thrust', rect, origin, reach: def.reach, damage: def.damage, knock: def.knock };
  }
  if (hero.state === 'lunge') {
    const def = TUNE.lunge;
    if (hero.t < def.startup || hero.t >= def.startup + def.dash) return null;
    const { rect, origin } = spearRect(hero, def.reach, def.width);
    return { kind: 'lunge', rect, origin, reach: def.reach, damage: def.damage, knock: def.knock };
  }
  if (hero.state === 'sweep') {
    const def = TUNE.sweep;
    if (hero.t < def.startup || hero.t >= def.startup + def.active) return null;
    const c = centerOf(hero);
    const d = DIR[hero.facing];
    const w = d.x !== 0 ? def.along : def.across;
    const h = d.x !== 0 ? def.across : def.along;
    const mid = { x: c.x + d.x * (def.along / 2 - 4), y: c.y + d.y * (def.along / 2 - 4) };
    const rect = { x: mid.x - w / 2, y: mid.y - h / 2, w, h };
    return { kind: 'sweep', rect, origin: c, reach: def.along, damage: def.damage, knock: def.knock };
  }
  return null;
}

/**
 * Where along the spear a target was struck. Only thrusts have a sweet
 * spot: the last `tipZone` pixels hit hard, the first `closeZone` hit weakly.
 */
export function hitQuality(attack: Attack, facing: Facing, target: Box): HitQuality {
  if (attack.kind !== 'thrust') return 'mid';
  const o = attack.origin;
  let near: number;
  if (facing === 'right') near = target.x - o.x;
  else if (facing === 'left') near = o.x - (target.x + target.w);
  else if (facing === 'down') near = target.y - o.y;
  else near = o.y - (target.y + target.h);
  near = Math.max(0, near);
  if (near >= attack.reach - TUNE.tipZone) return 'tip';
  if (near <= TUNE.closeZone) return 'close';
  return 'mid';
}

export function qualityMultiplier(quality: HitQuality): number {
  return quality === 'tip' ? TUNE.tipMult : quality === 'close' ? TUNE.closeMult : 1;
}
