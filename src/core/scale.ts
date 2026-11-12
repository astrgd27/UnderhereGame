import { SCREEN_H, SCREEN_W } from './constants';

export interface ScreenFit {
  /** Whole number of device pixels per game pixel. */
  devicePixelsPerPixel: number;
  /** Size to give the canvas, in CSS pixels. */
  cssWidth: number;
  cssHeight: number;
}

/**
 * Largest whole-number scale of the 240x160 screen that fits the available
 * area. The scale is whole in *device* pixels, so a 2x display can use
 * half-steps in CSS pixels and still map every game pixel to a square block.
 * Never returns less than 1 device pixel per game pixel.
 */
export function fitScreen(availCssW: number, availCssH: number, dpr = 1): ScreenFit {
  const ratio = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
  const byWidth = Math.floor((availCssW * ratio) / SCREEN_W);
  const byHeight = Math.floor((availCssH * ratio) / SCREEN_H);
  const devicePixelsPerPixel = Math.max(1, Math.min(byWidth, byHeight));
  return {
    devicePixelsPerPixel,
    cssWidth: (SCREEN_W * devicePixelsPerPixel) / ratio,
    cssHeight: (SCREEN_H * devicePixelsPerPixel) / ratio,
  };
}
