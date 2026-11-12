import * as Phaser from 'phaser';
import { SCREEN_H, SCREEN_W } from '../core/constants';
import { ENEMY } from '../core/enemies';
import { FixedStep } from '../core/fixedStep';
import { Game, type GameEvent } from '../core/game';
import { DIR, type Vec } from '../core/geom';
import { HERO_BOX_H, HERO_BOX_W, TUNE, heroAttack, heroInvulnerable, spearRect, type Hero } from '../core/hero';
import type { VirtualPad } from '../core/pad';
import { readGamepads } from '../input/gamepad';
import {
  ENEMY_SIZE, ENEMY_TEXTURE, HEART_SIZE, HEART_TEXTURE, HERO_H, HERO_TEXTURE, HERO_W,
  enemyFrame, heartFrame, heroFrame, paintEnemies, paintHearts, paintHero, paintRoom, roomTexture,
} from './placeholderArt';

/** Logic steps per walk-cycle frame. */
const WALK_FRAME_STEPS = 10;

const COLOR = {
  shaft: 0xe8e2c8,
  tip: 0xffd24a,
  tipCharged: 0xffffff,
  sweep: 0xffffff,
  shot: 0xf0d060,
  shotDark: 0x7a5a10,
  shadow: 0x080c14,
  sparkTip: 0xffd24a,
  sparkMid: 0xffffff,
  sparkClose: 0x9aa4b5,
  sparkBlock: 0x8fd0ff,
  hurt: 0xe8504a,
};

interface Spark {
  x: number;
  y: number;
  age: number;
  life: number;
  color: number;
  size: number;
  burst: boolean;
}

/** Draws the Game. Holds no rules of its own. */
export class PlayScene extends Phaser.Scene {
  readonly game2 = new Game();
  private readonly clock = new FixedStep();
  private bgNow!: Phaser.GameObjects.Image;
  private bgNext!: Phaser.GameObjects.Image;
  private heroSprite!: Phaser.GameObjects.Image;
  private heroShadow!: Phaser.GameObjects.Ellipse;
  private under!: Phaser.GameObjects.Graphics;
  private over!: Phaser.GameObjects.Graphics;
  private readonly foes = new Map<number, Phaser.GameObjects.Image>();
  private hearts: Phaser.GameObjects.Image[] = [];
  private sparks: Spark[] = [];
  private shake = 0;
  private shakeAmp = 0;
  private shownRoom = -1;

  constructor(private readonly pad: VirtualPad) {
    super('play');
  }

  create(): void {
    for (const def of this.game2.dungeon.rooms) paintRoom(this, def.id, def.room);
    paintHero(this);
    paintEnemies(this);
    paintHearts(this);

    this.bgNow = this.add.image(0, 0, roomTexture(this.game2.roomId)).setOrigin(0, 0).setDepth(0);
    this.bgNext = this.add.image(0, 0, roomTexture(this.game2.roomId)).setOrigin(0, 0).setDepth(0).setVisible(false);
    this.under = this.add.graphics().setDepth(1);
    this.heroShadow = this.add.ellipse(0, 0, 12, 5, COLOR.shadow, 0.45).setDepth(2);
    this.heroSprite = this.add.image(0, 0, HERO_TEXTURE, heroFrame('down', 0)).setOrigin(0, 0);
    this.over = this.add.graphics().setDepth(5000);

    const hero = this.game2.hero;
    for (let i = 0; i < hero.maxHp / 4; i++) {
      this.hearts.push(
        this.add.image(4 + i * (HEART_SIZE + 1), 3, HEART_TEXTURE, heartFrame(4))
          .setOrigin(0, 0).setScrollFactor(0).setDepth(9000),
      );
    }
    this.cameras.main.setRoundPixels(true);
    this.draw();
  }

  update(_time: number, delta: number): void {
    const steps = this.clock.advance(delta);
    for (let i = 0; i < steps; i++) {
      readGamepads(this.pad);
      this.pad.poll();
      this.game2.step(this.pad);
      this.consumeEvents();
      this.sparks = this.sparks.filter((s) => ++s.age < s.life);
      if (this.shake > 0) this.shake -= 1;
    }
    if (steps > 0) this.draw();
  }

  private addSpark(at: Vec, color: number, size: number, life: number, burst = false): void {
    this.sparks.push({ x: Math.round(at.x), y: Math.round(at.y), age: 0, life, color, size, burst });
  }

  private rumble(steps: number, amp: number): void {
    this.shake = Math.max(this.shake, steps);
    this.shakeAmp = amp;
  }

  private consumeEvents(): void {
    const events: GameEvent[] = this.game2.events;
    for (const ev of events) {
      switch (ev.type) {
        case 'hit':
          if (ev.quality === 'tip') {
            this.addSpark(ev, COLOR.sparkTip, 7, 12);
            this.rumble(4, 1);
          } else if (ev.quality === 'close') {
            this.addSpark(ev, COLOR.sparkClose, 3, 6);
          } else {
            this.addSpark(ev, COLOR.sparkMid, 5, 9);
          }
          break;
        case 'block':
          this.addSpark(ev, COLOR.sparkBlock, 4, 8);
          break;
        case 'kill':
          this.addSpark(ev, COLOR.sparkMid, 10, 18, true);
          this.rumble(5, 1);
          break;
        case 'impale':
          this.addSpark(ev, COLOR.sparkTip, 9, 16, true);
          this.rumble(8, 2);
          break;
        case 'hurt':
          this.addSpark(ev, COLOR.hurt, 6, 10);
          this.rumble(8, 2);
          break;
        case 'death':
          this.addSpark(ev, COLOR.hurt, 12, 30, true);
          this.rumble(14, 2);
          break;
        case 'thud':
          this.rumble(5, 1);
          break;
        case 'charged':
          this.addSpark(ev, COLOR.tipCharged, 6, 10);
          break;
        default:
          break;
      }
    }
    events.length = 0;
  }

  /** Where the hero's box is in screen space, including the room slide. */
  private heroPlace(): { x: number; y: number; camX: number; camY: number } {
    const g = this.game2;
    const tr = g.transition;
    if (!tr) return { x: g.hero.x, y: g.hero.y, camX: 0, camY: 0 };
    const p = tr.t / tr.steps;
    const d = DIR[tr.dir];
    const offX = d.x * SCREEN_W;
    const offY = d.y * SCREEN_H;
    return {
      x: tr.exit.x + (tr.entry.x + offX - tr.exit.x) * p,
      y: tr.exit.y + (tr.entry.y + offY - tr.exit.y) * p,
      camX: Math.round(offX * p),
      camY: Math.round(offY * p),
    };
  }

  private draw(): void {
    const g = this.game2;
    const tr = g.transition;

    // Rooms: the current one, plus the next one beside it during a slide.
    const base = tr ? tr.from : g.roomId;
    if (this.shownRoom !== base) {
      this.bgNow.setTexture(roomTexture(base));
      this.shownRoom = base;
    }
    if (tr) {
      const d = DIR[tr.dir];
      this.bgNext.setTexture(roomTexture(tr.to)).setPosition(d.x * SCREEN_W, d.y * SCREEN_H).setVisible(true);
    } else {
      this.bgNext.setVisible(false);
    }

    const place = this.heroPlace();
    const jitter = this.shake > 0 ? (this.shake % 2 === 0 ? this.shakeAmp : -this.shakeAmp) : 0;
    this.cameras.main.setScroll(place.camX + jitter, place.camY);

    this.under.clear();
    this.over.clear();
    this.drawHero(g.hero, place.x, place.y);
    this.drawFoes();
    this.drawSparks();
    this.drawHud();
  }

  private drawHero(hero: Hero, hx: number, hy: number): void {
    const bx = Math.round(hx);
    const by = Math.round(hy);
    const walking = (hero.moving || this.game2.transition !== null) && hero.state !== 'brace';
    const cycle = this.game2.transition ? this.game2.transition.t : hero.walkSteps;
    const frame = walking && Math.floor(cycle / WALK_FRAME_STEPS) % 2 === 1 ? 1 : 0;

    // The dodge is a short hop: the sprite lifts, the shadow stays down.
    let lift = 0;
    if (hero.state === 'dodge') {
      const p = Math.min(1, hero.t / TUNE.dodge.moveSteps);
      lift = Math.round(Math.sin(p * Math.PI) * 5);
    }
    const sx = bx - (HERO_W - HERO_BOX_W) / 2;
    const sy = by + HERO_BOX_H - HERO_H - lift;

    const blink = hero.invuln > 0 && Math.floor(hero.invuln / 3) % 2 === 0;
    const dead = hero.state === 'dead';
    this.heroSprite
      .setPosition(sx, sy)
      .setFrame(heroFrame(hero.facing, frame))
      .setDepth(10 + by + HERO_BOX_H)
      .setVisible(!blink && !(dead && hero.t > 30))
      .setAlpha(heroInvulnerable(hero) && hero.state === 'dodge' ? 0.6 : 1);
    this.heroShadow.setPosition(bx + HERO_BOX_W / 2, by + HERO_BOX_H - 1).setVisible(!dead || hero.t <= 30);
    if (blink || dead) return;
    this.drawSpear(hero, bx, by, sx, sy);
  }

  /** The spear is drawn live so its length always matches its hit box. */
  private drawSpear(hero: Hero, bx: number, by: number, sx: number, sy: number): void {
    const g = this.over;
    const d = DIR[hero.facing];
    const dx = bx - hero.x;
    const dy = by - hero.y;

    // Length shown, as a fraction of full reach, by state.
    let reach = 0;
    let charged = false;
    if (hero.state === 'thrust') {
      const def = TUNE.thrust[hero.combo]!;
      const end = def.startup + def.active;
      const p = hero.t < def.startup ? (hero.t + 1) / def.startup
        : hero.t < end ? 1
        : Math.max(0, 1 - (hero.t - end) / def.recovery);
      reach = def.reach * (0.35 + 0.65 * p);
    } else if (hero.state === 'lunge') {
      reach = TUNE.lunge.reach;
      charged = true;
    } else if (hero.state === 'charge') {
      reach = 12;
      charged = hero.charge >= TUNE.chargeSteps && Math.floor(hero.charge / 4) % 2 === 0;
    } else if (hero.state === 'brace') {
      reach = 15;
    } else if (hero.state === 'sweep') {
      reach = TUNE.sweep.along - 6;
    }

    if (reach === 0) {
      // Carried upright at her side.
      const x = hero.facing === 'left' ? sx + 2 : sx + 13;
      g.fillStyle(COLOR.shaft, 1).fillRect(x, sy + 2, 1, 18);
      g.fillStyle(COLOR.tip, 1).fillRect(x - 1, sy, 3, 3);
      return;
    }

    const attack = heroAttack(hero);
    if (attack?.kind === 'sweep') {
      g.fillStyle(COLOR.sweep, 0.3).fillRect(
        Math.round(attack.rect.x + dx), Math.round(attack.rect.y + dy), attack.rect.w, attack.rect.h,
      );
    }

    const { origin } = spearRect(hero, reach, 2);
    const ox = Math.round(origin.x + dx);
    const oy = Math.round(origin.y + dy) - 5;
    const len = Math.round(reach);
    const tip = Math.min(len, TUNE.tipZone);
    const tipColor = charged ? COLOR.tipCharged : COLOR.tip;
    const seg = (from: number, to: number, color: number, thick: number) => {
      const a = Math.min(from, to);
      const n = Math.abs(to - from);
      const half = Math.floor(thick / 2);
      if (d.x !== 0) g.fillStyle(color, 1).fillRect(d.x > 0 ? ox + a : ox - a - n, oy - half, n, thick);
      else g.fillStyle(color, 1).fillRect(ox - half, d.y > 0 ? oy + a : oy - a - n, thick, n);
    };
    seg(-4, len - tip, COLOR.shaft, 2);
    seg(len - tip, len, tipColor, hero.state === 'thrust' || hero.state === 'lunge' ? 4 : 2);
  }

  private drawFoes(): void {
    const g = this.game2;
    const seen = new Set<number>();
    for (const e of g.enemies) {
      seen.add(e.id);
      let sprite = this.foes.get(e.id);
      if (!sprite) {
        sprite = this.add.image(0, 0, ENEMY_TEXTURE).setOrigin(0, 0);
        this.foes.set(e.id, sprite);
      }
      // A wind-up flashes and shakes: that is the tell.
      const telegraph = e.state === 'windup' && Math.floor(e.t / 3) % 2 === 0;
      const wobble = e.state === 'windup' ? (e.t % 2 === 0 ? 1 : -1) : 0;
      const x = Math.round(e.x) - (ENEMY_SIZE - e.w) / 2 + wobble;
      const y = Math.round(e.y) + e.h - ENEMY_SIZE;
      sprite
        .setPosition(x, y)
        .setFrame(enemyFrame(e.kind, e.facing, e.flash > 0 || telegraph))
        .setDepth(10 + Math.round(e.y) + e.h)
        .setAlpha(e.state === 'stun' && e.kind !== 'dummy' ? 0.8 : 1);
      this.under.fillStyle(COLOR.shadow, 0.4).fillRect(Math.round(e.x) + 1, Math.round(e.y) + e.h - 2, e.w - 2, 3);

      // Small health bar once damaged, so tuning is visible.
      if (e.hp < e.maxHp && e.kind !== 'dummy') {
        const w = Math.max(0, Math.round((e.hp / ENEMY[e.kind].hp) * 12));
        this.over.fillStyle(0x141820, 1).fillRect(x + 1, y - 4, 14, 3);
        this.over.fillStyle(0xe8504a, 1).fillRect(x + 2, y - 3, w, 1);
      }
    }
    for (const [id, sprite] of this.foes) {
      if (!seen.has(id)) {
        sprite.destroy();
        this.foes.delete(id);
      }
    }
    for (const p of g.projectiles) {
      const x = Math.round(p.x);
      const y = Math.round(p.y) - 5;
      this.over.fillStyle(COLOR.shotDark, 1).fillRect(x - 1, y - 1, 6, 6);
      this.over.fillStyle(COLOR.shot, 1).fillRect(x, y, 4, 4);
    }
  }

  private drawSparks(): void {
    for (const s of this.sparks) {
      const p = s.age / s.life;
      const r = Math.max(1, Math.round(s.size * (0.4 + 0.6 * p)));
      const alpha = 1 - p * p;
      const y = s.y - 5;
      this.over.fillStyle(s.color, alpha);
      if (s.burst) {
        const o = Math.round(s.size * p * 1.5);
        for (const [mx, my] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          this.over.fillRect(s.x + mx * o - 1, y + my * o - 1, 3, 3);
        }
      } else {
        this.over.fillRect(s.x - r, y - 1, r * 2 + 1, 2);
        this.over.fillRect(s.x - 1, y - r, 2, r * 2 + 1);
      }
    }
  }

  private drawHud(): void {
    const hero = this.game2.hero;
    this.hearts.forEach((heart, i) => {
      heart.setFrame(heartFrame(hero.hp - i * 4));
    });
  }

  debugState(): Record<string, unknown> {
    const g = this.game2;
    const { x, y, facing, moving, state, hp } = g.hero;
    return {
      x, y, facing, moving, state, hp,
      steps: g.steps, room: g.roomId, sliding: g.transition !== null,
      enemies: g.enemies.map((e) => ({ kind: e.kind, hp: e.hp, state: e.state })),
      cleared: [...g.cleared],
    };
  }
}
