import * as Phaser from 'phaser';
import { TILE } from '../core/constants';
import { Tile, type Room } from '../core/room';
import type { Facing } from '../core/hero';

/**
 * Placeholder art, drawn pixel by pixel in code so no system waits on final
 * sprites. Everything here is replaced by the art pipeline in phase 3.
 */

const PAL = {
  floorA: '#2b3a4a',
  floorB: '#2f4052',
  floorDot: '#3a4e63',
  wallTop: '#5d6f86',
  wallFace: '#3d4a5e',
  wallDark: '#232c3a',
  pillarTop: '#7fb7a4',
  pillarFace: '#4b8576',
  pillarDark: '#2c5249',
  shadow: 'rgba(8, 12, 20, 0.45)',
  skin: '#f2c9a0',
  hair: '#7a3b2e',
  tunic: '#c8503c',
  tunicDark: '#8e3428',
  boots: '#3a2a26',
  spear: '#e8e2c8',
  outline: '#141820',
};

function px(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

export const ROOM_TEXTURE = 'room-bg';
export const HERO_TEXTURE = 'hero';
export const HERO_W = 16;
export const HERO_H = 24;

/** Paint a whole room into one static texture. */
export function paintRoom(scene: Phaser.Scene, room: Room): void {
  if (scene.textures.exists(ROOM_TEXTURE)) scene.textures.remove(ROOM_TEXTURE);
  const texture = scene.textures.createCanvas(ROOM_TEXTURE, room.widthPx, room.heightPx);
  if (!texture) throw new Error('Could not create room texture');
  const ctx = texture.getContext();

  for (let row = 0; row < room.rows; row++) {
    for (let col = 0; col < room.cols; col++) {
      const x = col * TILE;
      const y = row * TILE;
      px(ctx, (col + row) % 2 === 0 ? PAL.floorA : PAL.floorB, x, y, TILE, TILE);
      px(ctx, PAL.floorDot, x + 3, y + 4);
      px(ctx, PAL.floorDot, x + 11, y + 10);
    }
  }

  for (let row = 0; row < room.rows; row++) {
    for (let col = 0; col < room.cols; col++) {
      const tile = room.get(col, row);
      if (tile === Tile.Floor) continue;
      const x = col * TILE;
      const y = row * TILE;
      const openBelow = !room.isSolid(col, row + 1);
      if (tile === Tile.Wall) {
        px(ctx, PAL.wallTop, x, y, TILE, TILE);
        px(ctx, PAL.wallDark, x, y, TILE, 1);
        px(ctx, PAL.wallDark, x, y, 1, TILE);
        if (openBelow) {
          px(ctx, PAL.wallFace, x, y + 8, TILE, 8);
          px(ctx, PAL.wallDark, x, y + 15, TILE, 1);
          px(ctx, PAL.shadow, x, y + TILE, TILE, 3);
        }
      } else {
        px(ctx, PAL.shadow, x + 1, y + 12, 14, 5);
        px(ctx, PAL.pillarDark, x + 2, y + 1, 12, 14);
        px(ctx, PAL.pillarFace, x + 3, y + 7, 10, 7);
        px(ctx, PAL.pillarTop, x + 3, y + 2, 10, 5);
        px(ctx, PAL.pillarDark, x + 6, y + 3, 4, 3);
      }
    }
  }
  texture.refresh();
}

const FACINGS: readonly Facing[] = ['down', 'up', 'left', 'right'];

export function heroFrame(facing: Facing, step: 0 | 1): string {
  return `${facing}-${step}`;
}

function paintHeroFrame(
  ctx: CanvasRenderingContext2D,
  ox: number,
  facing: Facing,
  step: 0 | 1,
): void {
  const bob = step;
  // Hair and head.
  px(ctx, PAL.outline, ox + 4, 2 + bob, 8, 9);
  px(ctx, PAL.hair, ox + 5, 3 + bob, 6, 7);
  if (facing !== 'up') {
    px(ctx, PAL.skin, ox + 5, 6 + bob, 6, 4);
    if (facing === 'down') {
      px(ctx, PAL.outline, ox + 6, 7 + bob);
      px(ctx, PAL.outline, ox + 9, 7 + bob);
    } else if (facing === 'left') {
      px(ctx, PAL.hair, ox + 9, 6 + bob, 2, 4);
      px(ctx, PAL.outline, ox + 6, 7 + bob);
    } else {
      px(ctx, PAL.hair, ox + 5, 6 + bob, 2, 4);
      px(ctx, PAL.outline, ox + 9, 7 + bob);
    }
  }
  // Tunic.
  px(ctx, PAL.outline, ox + 3, 11 + bob, 10, 8);
  px(ctx, PAL.tunic, ox + 4, 11 + bob, 8, 7);
  px(ctx, PAL.tunicDark, ox + 4, 16 + bob, 8, 2);
  // Legs: alternate which boot is forward.
  const left = step === 0 ? 0 : 1;
  px(ctx, PAL.boots, ox + 5, 19 + left, 2, 4 - left);
  px(ctx, PAL.boots, ox + 9, 19 + (1 - left), 2, 3 + left);
  // Spear, carried on the side she faces, tip up.
  const spearX = facing === 'left' ? ox + 2 : ox + 13;
  if (facing !== 'up') {
    px(ctx, PAL.outline, spearX - 1, 1, 3, 3);
    px(ctx, PAL.spear, spearX, 1, 1, 19);
  } else {
    px(ctx, PAL.spear, spearX, 3, 1, 9);
  }
}

/** Build the hero sheet: four facings by two walk frames. */
export function paintHero(scene: Phaser.Scene): void {
  if (scene.textures.exists(HERO_TEXTURE)) return;
  const frames = FACINGS.length * 2;
  const texture = scene.textures.createCanvas(HERO_TEXTURE, HERO_W * frames, HERO_H);
  if (!texture) throw new Error('Could not create hero texture');
  const ctx = texture.getContext();
  FACINGS.forEach((facing, i) => {
    for (const step of [0, 1] as const) {
      const index = i * 2 + step;
      paintHeroFrame(ctx, index * HERO_W, facing, step);
      texture.add(heroFrame(facing, step), 0, index * HERO_W, 0, HERO_W, HERO_H);
    }
  });
  texture.refresh();
}
