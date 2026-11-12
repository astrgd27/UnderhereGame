import { TILE } from './constants';
import { Dungeon, makeTestDungeon, type RoomDef } from './dungeon';
import {
  ENEMY, contactDamage, makeEnemy, stepEnemy, stepProjectile, stunEnemy,
  type Enemy, type Projectile,
} from './enemies';
import { DIR, OPPOSITE, centerOf, facingToward, overlaps, type Facing, type Vec } from './geom';
import {
  TUNE, damageHero, heroAttack, heroInvulnerable, hitQuality, makeHero, qualityMultiplier, stepHero,
  type Attack, type Hero, type HitQuality,
} from './hero';
import { moveAndSlide } from './mover';
import type { VirtualPad } from './pad';
import type { Room } from './room';

export type GameEventType =
  | 'thrust' | 'lunge' | 'sweep' | 'dodge' | 'charged'
  | 'hit' | 'block' | 'kill' | 'impale' | 'hurt' | 'death'
  | 'charge' | 'thud' | 'shoot' | 'bash' | 'clear' | 'enter';

/** Something that happened this step, for effects and (later) sound. */
export interface GameEvent {
  type: GameEventType;
  x: number;
  y: number;
  quality?: HitQuality;
}

export interface Transition {
  from: number;
  to: number;
  dir: Facing;
  t: number;
  steps: number;
  /** Hero position in the old room when she left, and in the new room on arrival. */
  exit: Vec;
  entry: Vec;
}

export const TRANSITION_STEPS = 32;
const SPAWN_GRACE = 30;
const DEATH_STEPS = 100;
const BRACE_IMPALE_DAMAGE = 6;
/** Hit-stop: the whole game freezes for a few steps so hits have weight. */
const HITSTOP = { tip: 5, mid: 3, close: 2, sweep: 2, impale: 6, block: 2 } as const;

export class Game {
  readonly dungeon: Dungeon;
  roomId: number;
  hero: Hero;
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  /** Drained by the renderer each frame. */
  events: GameEvent[] = [];
  transition: Transition | null = null;
  hitstop = 0;
  steps = 0;
  cleared = new Set<number>();

  private grace = 0;
  private nextId = 1;
  private seed: number;
  private pendingA = false;
  private pendingR = false;

  constructor(dungeon: Dungeon = makeTestDungeon(), seed = 0x5eed) {
    this.dungeon = dungeon;
    this.seed = seed >>> 0;
    this.roomId = dungeon.start;
    this.hero = this.spawnHero();
    this.populate();
  }

  get def(): RoomDef {
    return this.dungeon.get(this.roomId);
  }

  get room(): Room {
    return this.def.room;
  }

  /** Small deterministic generator so runs can be replayed in tests. */
  private rand = (): number => {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 0x100000000;
  };

  private spawnHero(): Hero {
    const hero = makeHero(3 * TILE, 4 * TILE + 12);
    hero.facing = 'right';
    return hero;
  }

  private emit(type: GameEventType, at: Vec, quality?: HitQuality): void {
    if (this.events.length < 256) this.events.push({ type, x: at.x, y: at.y, quality });
  }

  private populate(): void {
    this.enemies = [];
    this.projectiles = [];
    for (const spawn of this.def.spawns) {
      if (spawn.kind !== 'dummy' && this.cleared.has(this.roomId)) continue;
      this.enemies.push(makeEnemy(this.nextId++, spawn.kind, spawn.col, spawn.row, this.rand));
    }
    this.grace = SPAWN_GRACE;
  }

  /** Back to the first room with full health and every room refilled. */
  reset(): void {
    this.cleared.clear();
    this.roomId = this.dungeon.start;
    this.hero = this.spawnHero();
    this.transition = null;
    this.hitstop = 0;
    this.populate();
    this.emit('enter', centerOf(this.hero));
  }

  /** Advance the whole game by one logic step. The pad must already be polled. */
  step(pad: VirtualPad): void {
    this.steps += 1;
    const aPressed = pad.justPressed('a') || this.pendingA;
    const rPressed = pad.justPressed('r') || this.pendingR;

    // Presses made during a freeze are kept, not lost.
    if (this.hitstop > 0) {
      this.hitstop -= 1;
      this.pendingA = aPressed;
      this.pendingR = rPressed;
      return;
    }
    this.pendingA = false;
    this.pendingR = false;

    if (this.transition) {
      this.transition.t += 1;
      if (this.transition.t >= this.transition.steps) this.finishTransition();
      return;
    }

    const hero = this.hero;
    if (hero.state === 'dead') {
      hero.t += 1;
      if (hero.t >= DEATH_STEPS) this.reset();
      return;
    }

    const axis = pad.axis();
    stepHero(hero, {
      ax: axis.x, ay: axis.y,
      a: pad.isDown('a'), aPressed,
      l: pad.isDown('l'), rPressed,
    }, this.room);
    if (hero.cue) this.emit(hero.cue, centerOf(hero));

    if (this.checkExit()) return;

    const attack = heroAttack(hero);
    if (attack) this.resolveAttack(attack);

    if (this.grace > 0) {
      this.grace -= 1;
    } else {
      const world = {
        room: this.room,
        heroAt: centerOf(hero),
        rand: this.rand,
        shoot: (from: Vec, velocity: Vec, damage: number) => {
          this.projectiles.push({
            id: this.nextId++, x: from.x - 2, y: from.y - 2, w: 4, h: 4,
            vx: velocity.x, vy: velocity.y, damage, dead: false,
          });
        },
        emit: (type: 'charge' | 'thud' | 'shoot' | 'bash', at: Vec) => this.emit(type, at),
      };
      for (const enemy of this.enemies) stepEnemy(enemy, world);
      for (const shot of this.projectiles) stepProjectile(shot, this.room);
      this.resolveContact();
    }

    const before = this.enemies.length;
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    const foes = this.enemies.filter((e) => e.kind !== 'dummy').length;
    if (before > this.enemies.length && foes === 0 && !this.cleared.has(this.roomId)) {
      this.cleared.add(this.roomId);
      this.emit('clear', centerOf(hero));
    }
  }

  private resolveAttack(attack: Attack): void {
    const hero = this.hero;
    const push = DIR[hero.facing];
    for (const enemy of this.enemies) {
      if (enemy.dead || hero.hitIds.has(enemy.id) || !overlaps(attack.rect, enemy)) continue;
      hero.hitIds.add(enemy.id);
      const at = centerOf(enemy);

      // A guard's plate stops anything that comes at its face.
      if (enemy.kind === 'guard' && hero.facing === OPPOSITE[enemy.facing]) {
        moveAndSlide(this.room, hero, -push.x * 3, -push.y * 3);
        this.hitstop = Math.max(this.hitstop, HITSTOP.block);
        this.emit('block', at);
        continue;
      }

      const quality = hitQuality(attack, hero.facing, enemy);
      const damage = Math.round(attack.damage * qualityMultiplier(quality));
      const knock = attack.knock * (quality === 'tip' ? 1.4 : 1);
      enemy.hp -= damage;
      this.emit('hit', at, quality);
      this.hitstop = Math.max(this.hitstop, attack.kind === 'sweep' ? HITSTOP.sweep : HITSTOP[quality]);

      if (enemy.kind === 'dummy') {
        enemy.flash = 6;
        if (enemy.hp <= 0) enemy.hp = enemy.maxHp;
        continue;
      }
      stunEnemy(enemy, { x: push.x * knock, y: push.y * knock }, 14);
      if (enemy.hp <= 0) {
        enemy.dead = true;
        this.emit('kill', at);
      }
    }
  }

  private resolveContact(): void {
    const hero = this.hero;
    if (hero.state === 'dead') return;
    const heroAt = centerOf(hero);
    const wasAlive = hero.hp > 0;

    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.kind === 'dummy' || !overlaps(hero, enemy)) continue;
      if (heroInvulnerable(hero)) continue;
      const at = centerOf(enemy);
      let damage = contactDamage(enemy);
      const braced = hero.state === 'brace' && facingToward(heroAt, at) === hero.facing;

      if (braced && enemy.kind === 'rusher' && enemy.state === 'attack') {
        // It runs itself onto the planted spear.
        const d = DIR[hero.facing];
        enemy.hp -= BRACE_IMPALE_DAMAGE;
        stunEnemy(enemy, { x: d.x * 3.5, y: d.y * 3.5 }, 50);
        moveAndSlide(this.room, hero, -d.x * 2, -d.y * 2);
        this.hitstop = Math.max(this.hitstop, HITSTOP.impale);
        this.emit('impale', at);
        if (enemy.hp <= 0) {
          enemy.dead = true;
          this.emit('kill', at);
        }
        continue;
      }
      if (braced) damage = Math.ceil(damage / 2);
      if (damageHero(hero, damage, at, braced ? 0.5 : 1)) {
        this.emit('hurt', heroAt);
        // The attacker bounces off so it cannot sit on top of her.
        if (enemy.state !== 'stun') stunEnemy(enemy, { x: 0, y: 0 }, 10);
        enemy.flash = 0;
      }
    }

    for (const shot of this.projectiles) {
      if (shot.dead || !overlaps(hero, shot)) continue;
      if (heroInvulnerable(hero)) continue;
      shot.dead = true;
      if (damageHero(hero, shot.damage, centerOf(shot))) this.emit('hurt', heroAt);
    }

    if (wasAlive && hero.hp === 0) this.emit('death', heroAt);
  }

  /** Start a room change if the hero has walked out through a door. */
  private checkExit(): boolean {
    const hero = this.hero;
    const room = this.room;
    const c = centerOf(hero);
    let dir: Facing | null = null;
    if (c.x < 0) dir = 'left';
    else if (c.x > room.widthPx) dir = 'right';
    else if (c.y < 0) dir = 'up';
    else if (c.y > room.heightPx) dir = 'down';
    if (!dir) return false;

    const next = this.dungeon.neighbor(this.roomId, dir);
    if (!next) {
      hero.x = Math.min(room.widthPx - hero.w, Math.max(0, hero.x));
      hero.y = Math.min(room.heightPx - hero.h, Math.max(0, hero.y));
      return false;
    }

    const inset = 3;
    const entry = { x: hero.x, y: hero.y };
    if (dir === 'left') entry.x = next.room.widthPx - hero.w - inset;
    if (dir === 'right') entry.x = inset;
    if (dir === 'up') entry.y = next.room.heightPx - hero.h - inset;
    if (dir === 'down') entry.y = inset;

    this.transition = {
      from: this.roomId, to: next.id, dir, t: 0, steps: TRANSITION_STEPS,
      exit: { x: hero.x, y: hero.y }, entry,
    };
    this.enemies = [];
    this.projectiles = [];
    // Arrive walking, not mid-swing.
    hero.state = 'free';
    hero.t = 0;
    hero.charge = 0;
    hero.buffered = false;
    hero.facing = dir;
    return true;
  }

  private finishTransition(): void {
    const tr = this.transition;
    if (!tr) return;
    this.roomId = tr.to;
    this.hero.x = tr.entry.x;
    this.hero.y = tr.entry.y;
    this.transition = null;
    this.populate();
    this.emit('enter', centerOf(this.hero));
  }
}

export { ENEMY, TUNE };
