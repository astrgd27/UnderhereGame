import * as Phaser from 'phaser';
import { TILE } from '../core/constants';
import { FixedStep } from '../core/fixedStep';
import { HERO_BOX_H, HERO_BOX_W, makeHero, stepHero, type Hero } from '../core/hero';
import type { VirtualPad } from '../core/pad';
import { makeTestRoom, type Room } from '../core/room';
import { readGamepads } from '../input/gamepad';
import { HERO_H, HERO_TEXTURE, HERO_W, ROOM_TEXTURE, heroFrame, paintHero, paintRoom } from './placeholderArt';

/** Logic steps per walk-cycle frame. */
const WALK_FRAME_STEPS = 10;

export class RoomScene extends Phaser.Scene {
  private readonly clock = new FixedStep();
  private room!: Room;
  private hero!: Hero;
  private heroSprite!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Ellipse;
  /** Total logic steps run; exposed for tests and the debug readout. */
  steps = 0;

  constructor(private readonly pad: VirtualPad) {
    super('room');
  }

  create(): void {
    this.room = makeTestRoom();
    paintRoom(this, this.room);
    paintHero(this);

    this.add.image(0, 0, ROOM_TEXTURE).setOrigin(0, 0);
    this.hero = makeHero(7 * TILE + (TILE - HERO_BOX_W) / 2, 6 * TILE);
    this.shadow = this.add.ellipse(0, 0, 12, 5, 0x080c14, 0.45);
    this.heroSprite = this.add.image(0, 0, HERO_TEXTURE, heroFrame('down', 0)).setOrigin(0, 0);
    this.cameras.main.setBounds(0, 0, this.room.widthPx, this.room.heightPx);
    this.cameras.main.setRoundPixels(true);
    this.draw();
  }

  update(_time: number, delta: number): void {
    const steps = this.clock.advance(delta);
    for (let i = 0; i < steps; i++) {
      readGamepads(this.pad);
      this.pad.poll();
      stepHero(this.hero, this.pad, this.room);
      this.steps += 1;
    }
    if (steps > 0) this.draw();
  }

  /** Sprites are always placed on whole pixels; logic keeps the fractions. */
  private draw(): void {
    const { hero } = this;
    const x = Math.round(hero.x) - (HERO_W - HERO_BOX_W) / 2;
    const y = Math.round(hero.y) + HERO_BOX_H - HERO_H;
    const frame = hero.moving && Math.floor(hero.walkSteps / WALK_FRAME_STEPS) % 2 === 1 ? 1 : 0;
    this.heroSprite.setPosition(x, y).setFrame(heroFrame(hero.facing, frame));
    this.shadow.setPosition(Math.round(hero.x) + HERO_BOX_W / 2, Math.round(hero.y) + HERO_BOX_H - 1);
  }

  debugState(): { x: number; y: number; facing: string; moving: boolean; steps: number } {
    const { x, y, facing, moving } = this.hero;
    return { x, y, facing, moving, steps: this.steps };
  }
}
