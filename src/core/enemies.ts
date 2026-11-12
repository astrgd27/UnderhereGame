import { TILE } from './constants';
import { DIR, centerOf, distance, facingToward, unitToward, type Box, type Facing, type Vec } from './geom';
import { boxOverlapsSolid, moveAndSlide } from './mover';
import type { Room } from './room';

export type EnemyKind = 'dummy' | 'rusher' | 'guard' | 'shooter';
export type EnemyState = 'idle' | 'windup' | 'attack' | 'recover' | 'stun';

/** Per-kind numbers. Speeds are pixels per step, times are steps. */
export const ENEMY = {
  dummy: { hp: 40, contact: 0, size: 12 },
  rusher: {
    hp: 12, contact: 2, size: 12,
    walk: 0.35, sight: 84, windup: 24, aimUntil: 16,
    chargeSpeed: 2.6, chargeSteps: 36, recover: 26, wallRecover: 44,
  },
  guard: {
    hp: 12, contact: 2, bash: 4, size: 12,
    walk: 0.35, turnEvery: 24, reach: 26, windup: 22,
    bashSpeed: 1.6, bashSteps: 10, recover: 34,
  },
  shooter: {
    hp: 8, contact: 1, shot: 2, size: 12,
    retreat: 0.5, approach: 0.3, near: 56, far: 110,
    windup: 26, shotSpeed: 1.6, recover: 20, reload: 90,
  },
} as const;

export interface Enemy extends Box {
  id: number;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  facing: Facing;
  state: EnemyState;
  /** Counts up in windup and attack, down in recover and stun. */
  t: number;
  cooldown: number;
  /** Guard only: steps until it may turn to face the hero again. */
  turn: number;
  dir: Vec;
  /** Knockback velocity. */
  vx: number;
  vy: number;
  /** Steps left of the white hit flash. */
  flash: number;
  dead: boolean;
}

export interface Projectile extends Box {
  id: number;
  vx: number;
  vy: number;
  damage: number;
  dead: boolean;
}

export interface EnemyWorld {
  room: Room;
  /** Centre of the hero's feet. */
  heroAt: Vec;
  rand(): number;
  shoot(from: Vec, velocity: Vec, damage: number): void;
  emit(type: 'charge' | 'thud' | 'shoot' | 'bash', at: Vec): void;
}

export function makeEnemy(id: number, kind: EnemyKind, col: number, row: number, rand: () => number): Enemy {
  const size = ENEMY[kind].size;
  const hp = ENEMY[kind].hp;
  return {
    id, kind, hp, maxHp: hp,
    x: col * TILE + (TILE - size) / 2, y: row * TILE + (TILE - size) / 2, w: size, h: size,
    facing: 'down', state: 'idle', t: 0,
    cooldown: kind === 'shooter' ? 40 + Math.floor(rand() * 60) : 20 + Math.floor(rand() * 40),
    turn: 0, dir: { x: 0, y: 1 }, vx: 0, vy: 0, flash: 0, dead: false,
  };
}

/** Enemies stay inside the walls; only the hero uses doors. */
function keepInside(e: Enemy, room: Room): void {
  e.x = Math.min(room.widthPx - TILE - e.w, Math.max(TILE, e.x));
  e.y = Math.min(room.heightPx - TILE - e.h, Math.max(TILE, e.y));
}

function walkToward(e: Enemy, room: Room, target: Vec, speed: number): void {
  const d = unitToward(centerOf(e), target);
  moveAndSlide(room, e, d.x * speed, d.y * speed);
}

/** Knock an enemy back and interrupt whatever it was doing. */
export function stunEnemy(e: Enemy, push: Vec, steps: number): void {
  e.vx = push.x;
  e.vy = push.y;
  e.state = 'stun';
  e.t = steps;
  e.flash = 6;
}

export function stepEnemy(e: Enemy, world: EnemyWorld): void {
  const { room, heroAt } = world;
  if (e.flash > 0) e.flash -= 1;

  if (Math.abs(e.vx) > 0.05 || Math.abs(e.vy) > 0.05) {
    moveAndSlide(room, e, e.vx, e.vy);
    e.vx *= 0.8;
    e.vy *= 0.8;
  }

  if (e.state === 'stun') {
    e.t -= 1;
    if (e.t <= 0) {
      e.state = 'idle';
      e.cooldown = Math.max(e.cooldown, 20);
      e.turn = Math.max(e.turn, 10);
    }
    keepInside(e, room);
    return;
  }

  const here = centerOf(e);
  const dist = distance(here, heroAt);

  switch (e.kind) {
    case 'dummy':
      break;

    case 'rusher': {
      const def = ENEMY.rusher;
      if (e.state === 'idle') {
        e.cooldown -= 1;
        e.facing = facingToward(here, heroAt);
        walkToward(e, room, heroAt, def.walk);
        if (dist < def.sight && e.cooldown <= 0) {
          e.state = 'windup';
          e.t = 0;
        }
      } else if (e.state === 'windup') {
        e.t += 1;
        // It tracks the hero early, then commits: the last steps are the tell.
        if (e.t <= def.aimUntil) {
          e.dir = unitToward(here, heroAt);
          e.facing = facingToward(here, heroAt);
        }
        if (e.t >= def.windup) {
          e.state = 'attack';
          e.t = 0;
          world.emit('charge', here);
        }
      } else if (e.state === 'attack') {
        const hit = moveAndSlide(room, e, e.dir.x * def.chargeSpeed, e.dir.y * def.chargeSpeed);
        e.t += 1;
        if (hit.hitX || hit.hitY) {
          e.state = 'recover';
          e.t = def.wallRecover;
          world.emit('thud', here);
        } else if (e.t >= def.chargeSteps) {
          e.state = 'recover';
          e.t = def.recover;
        }
      } else {
        e.t -= 1;
        if (e.t <= 0) {
          e.state = 'idle';
          e.cooldown = 30 + Math.floor(world.rand() * 30);
        }
      }
      break;
    }

    case 'guard': {
      const def = ENEMY.guard;
      if (e.state === 'idle') {
        e.cooldown -= 1;
        e.turn -= 1;
        if (e.turn <= 0) {
          e.facing = facingToward(here, heroAt);
          e.turn = def.turnEvery;
        }
        walkToward(e, room, heroAt, def.walk);
        const inFront = facingToward(here, heroAt) === e.facing;
        if (inFront && dist < def.reach && e.cooldown <= 0) {
          e.state = 'windup';
          e.t = 0;
        }
      } else if (e.state === 'windup') {
        e.t += 1;
        if (e.t >= def.windup) {
          e.state = 'attack';
          e.t = 0;
          e.dir = { ...DIR[e.facing] };
          world.emit('bash', here);
        }
      } else if (e.state === 'attack') {
        moveAndSlide(room, e, e.dir.x * def.bashSpeed, e.dir.y * def.bashSpeed);
        e.t += 1;
        if (e.t >= def.bashSteps) {
          e.state = 'recover';
          e.t = def.recover;
        }
      } else {
        e.t -= 1;
        if (e.t <= 0) {
          e.state = 'idle';
          e.cooldown = 20;
          e.turn = 10;
        }
      }
      break;
    }

    case 'shooter': {
      const def = ENEMY.shooter;
      if (e.state === 'idle') {
        e.cooldown -= 1;
        e.facing = facingToward(here, heroAt);
        if (dist < def.near) {
          const away = unitToward(heroAt, here);
          moveAndSlide(room, e, away.x * def.retreat, away.y * def.retreat);
        } else if (dist > def.far) {
          walkToward(e, room, heroAt, def.approach);
        }
        if (e.cooldown <= 0) {
          e.state = 'windup';
          e.t = 0;
        }
      } else if (e.state === 'windup') {
        e.t += 1;
        e.facing = facingToward(here, heroAt);
        if (e.t >= def.windup) {
          const aim = unitToward(here, heroAt);
          world.shoot(here, { x: aim.x * def.shotSpeed, y: aim.y * def.shotSpeed }, def.shot);
          world.emit('shoot', here);
          e.state = 'recover';
          e.t = def.recover;
        }
      } else {
        e.t -= 1;
        if (e.t <= 0) {
          e.state = 'idle';
          e.cooldown = def.reload + Math.floor(world.rand() * 40);
        }
      }
      break;
    }
  }
  keepInside(e, room);
}

/** Damage dealt by touching this enemy right now. */
export function contactDamage(e: Enemy): number {
  if (e.kind === 'guard') return e.state === 'attack' ? ENEMY.guard.bash : ENEMY.guard.contact;
  return ENEMY[e.kind].contact;
}

export function stepProjectile(p: Projectile, room: Room): void {
  p.x += p.vx;
  p.y += p.vy;
  const outside = p.x < 0 || p.y < 0 || p.x + p.w > room.widthPx || p.y + p.h > room.heightPx;
  if (outside || boxOverlapsSolid(room, p)) p.dead = true;
}
