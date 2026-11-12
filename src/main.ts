import * as Phaser from 'phaser';
import { SCREEN_H, SCREEN_W } from './core/constants';
import { VirtualPad } from './core/pad';
import { fitScreen } from './core/scale';
import { RoomScene } from './game/RoomScene';
import { attachKeyboard } from './input/keyboard';
import { attachTouch, enableTouchUi } from './input/touch';

const pad = new VirtualPad();
const scene = new RoomScene(pad);
const screen = document.getElementById('screen') as HTMLElement;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: screen,
  width: SCREEN_W,
  height: SCREEN_H,
  backgroundColor: '#000000',
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  disableContextMenu: true,
  banner: false,
  audio: { noAudio: true },
  scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER },
  scene,
});

/** Size the canvas to the largest whole-number scale that fits its area. */
function resize(): void {
  const fit = fitScreen(screen.clientWidth, screen.clientHeight, window.devicePixelRatio || 1);
  const canvas = game.canvas;
  canvas.style.width = `${fit.cssWidth}px`;
  canvas.style.height = `${fit.cssHeight}px`;
  canvas.style.imageRendering = 'pixelated';
  screen.dataset.scale = String(fit.devicePixelsPerPixel);
}

attachKeyboard(pad);
attachTouch(pad, document.getElementById('app') as HTMLElement);
enableTouchUi(resize);

new ResizeObserver(resize).observe(screen);
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pad.clearAll();
});
resize();

// Read-only hook for the browser smoke test and for debugging in the console.
declare global {
  interface Window {
    __underhere?: { state: () => unknown; pad: () => unknown; renderer: () => string };
  }
}
window.__underhere = {
  state: () => (scene.sys?.isActive() ? scene.debugState() : null),
  pad: () => pad.snapshot(),
  renderer: () => (game.renderer?.type === Phaser.WEBGL ? 'webgl' : 'canvas'),
};
