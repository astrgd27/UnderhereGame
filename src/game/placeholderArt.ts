import * as Phaser from 'phaser';
import { TILE } from '../core/constants';
import { Tile, type Room } from '../core/room';
import type { EnemyKind } from '../core/enemies';
import type { Facing } from '../core/geom';

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

export function roomTexture(id: number): string {
  return `room-${id}`;
}
export const HERO_TEXTURE = 'hero';
export const HERO_W = 16;
export const HERO_H = 24;

/** Paint a whole room into one static texture. */
export function paintRoom(scene: Phaser.Scene, id: number, room: Room): void {
  const key = roomTexture(id);
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, room.widthPx, room.heightPx);
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
      const openBelow = row + 1 < room.rows && !room.isSolid(col, row + 1);
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

export const ENEMY_TEXTURE = 'enemies';
export const ENEMY_SIZE = 16;
const ENEMY_KINDS: readonly EnemyKind[] = ['dummy', 'rusher', 'guard', 'shooter'];

export function enemyFrame(kind: EnemyKind, facing: Facing, flash: boolean): string {
  return `${kind}-${facing}${flash ? '-flash' : ''}`;
}

const FOE = {
  rusher: { body: '#b0483c', dark: '#6e2a24', mark: '#f0b060' },
  guard: { body: '#5a6fa8', dark: '#35426a', mark: '#dfe6f4' },
  shooter: { body: '#8a5fb0', dark: '#523670', mark: '#f0d060' },
  wood: '#a07a4a',
  woodDark: '#5e4426',
  straw: '#d8c070',
};

function paintEnemyFrame(
  ctx: CanvasRenderingContext2D,
  ox: number,
  kind: EnemyKind,
  facing: Facing,
  flash: boolean,
): void {
  const c = (color: string) => (flash ? '#ffffff' : color);
  const p = (color: string, x: number, y: number, w = 1, h = 1) => px(ctx, c(color), ox + x, y, w, h);

  if (kind === 'dummy') {
    p(PAL.outline, 2, 4, 12, 4);
    p(FOE.straw, 3, 5, 10, 2);
    p(PAL.outline, 6, 1, 4, 14);
    p(FOE.wood, 7, 2, 2, 12);
    p(FOE.woodDark, 5, 13, 6, 2);
    return;
  }

  const col = FOE[kind];
  if (kind === 'rusher') {
    p(PAL.outline, 2, 4, 12, 11);
    p(col.body, 3, 5, 10, 9);
    p(col.dark, 3, 12, 10, 2);
    p(col.dark, 1, 7, 1, 2); p(col.dark, 14, 7, 1, 2);
    p(col.dark, 1, 11, 1, 2); p(col.dark, 14, 11, 1, 2);
  } else if (kind === 'guard') {
    p(PAL.outline, 1, 2, 14, 13);
    p(col.body, 2, 3, 12, 11);
    p(col.dark, 2, 12, 12, 2);
  } else {
    p(PAL.outline, 3, 3, 10, 12);
    p(col.body, 4, 4, 8, 10);
    p(col.dark, 4, 12, 8, 2);
  }

  // Eyes and the feature that shows which way it faces.
  if (facing === 'down') { p(PAL.outline, 5, 8); p(PAL.outline, 10, 8); }
  if (facing === 'left') p(PAL.outline, 4, 8);
  if (facing === 'right') p(PAL.outline, 11, 8);

  if (kind === 'guard') {
    // The armour plate covers the side it faces.
    if (facing === 'down') p(col.mark, 2, 11, 12, 3);
    if (facing === 'up') p(col.mark, 2, 3, 12, 3);
    if (facing === 'left') p(col.mark, 2, 3, 3, 11);
    if (facing === 'right') p(col.mark, 11, 3, 3, 11);
  } else {
    if (facing === 'down') p(col.mark, 7, 11, 2, 2);
    if (facing === 'up') p(col.mark, 7, 4, 2, 2);
    if (facing === 'left') p(col.mark, 3, 9, 2, 2);
    if (facing === 'right') p(col.mark, 11, 9, 2, 2);
  }
}

/** One sheet with every enemy, facing and its white hit-flash twin. */
export function paintEnemies(scene: Phaser.Scene): void {
  if (scene.textures.exists(ENEMY_TEXTURE)) return;
  const count = ENEMY_KINDS.length * FACINGS.length * 2;
  const texture = scene.textures.createCanvas(ENEMY_TEXTURE, ENEMY_SIZE * count, ENEMY_SIZE);
  if (!texture) throw new Error('Could not create enemy texture');
  const ctx = texture.getContext();
  let index = 0;
  for (const kind of ENEMY_KINDS) {
    for (const facing of FACINGS) {
      for (const flash of [false, true]) {
        paintEnemyFrame(ctx, index * ENEMY_SIZE, kind, facing, flash);
        texture.add(enemyFrame(kind, facing, flash), 0, index * ENEMY_SIZE, 0, ENEMY_SIZE, ENEMY_SIZE);
        index += 1;
      }
    }
  }
  texture.refresh();
}

export const HEART_TEXTURE = 'hearts';
export const HEART_SIZE = 8;

const HEART_SHAPE = [
  '.XX.XX.',
  'XXXXXXX',
  'XXXXXXX',
  '.XXXXX.',
  '..XXX..',
  '...X...',
];
/** Columns filled for 0 to 4 quarters. */
const HEART_FILL = [0, 2, 4, 5, 7];

export function heartFrame(quarters: number): string {
  return `q${Math.max(0, Math.min(4, quarters))}`;
}

export function paintHearts(scene: Phaser.Scene): void {
  if (scene.textures.exists(HEART_TEXTURE)) return;
  const texture = scene.textures.createCanvas(HEART_TEXTURE, HEART_SIZE * 5, HEART_SIZE);
  if (!texture) throw new Error('Could not create heart texture');
  const ctx = texture.getContext();
  for (let q = 0; q <= 4; q++) {
    HEART_SHAPE.forEach((line, y) => {
      for (let x = 0; x < line.length; x++) {
        if (line[x] !== 'X') continue;
        px(ctx, PAL.outline, q * HEART_SIZE + x, y + 2);
        px(ctx, x < HEART_FILL[q]! ? '#e8504a' : '#4a2a3a', q * HEART_SIZE + x, y + 1);
      }
    });
    texture.add(heartFrame(q), 0, q * HEART_SIZE, 0, HEART_SIZE, HEART_SIZE);
  }
  texture.refresh();
}
