// Browser smoke test: boots the built game in real Chrome, checks the
// screen is integer-scaled, and walks the hero with keyboard and touch.
// Run with `npm run build && npm run test:e2e`.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4173;
const BASE = `http://localhost:${PORT}/`;
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

function check(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`ok - ${message}`);
}

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Preview server did not start');
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  await waitForServer();
  browser = await chromium.launch({
    channel: process.env.CHROME_PATH ? undefined : 'chrome',
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  const state = (page) => page.evaluate(() => window.__underhere.state());
  const ready = (page) => page.waitForFunction(() => window.__underhere?.state()?.steps > 5);

  // Desktop: keyboard.
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  desktop.on('pageerror', (e) => errors.push(String(e)));
  desktop.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await desktop.goto(BASE);
  await ready(desktop);
  console.log(`renderer: ${await desktop.evaluate(() => window.__underhere.renderer())}`);

  const canvas = await desktop.evaluate(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return { w: c.width, h: c.height, cssW: r.width, cssH: r.height };
  });
  check(canvas.w === 240 && canvas.h === 160, 'canvas renders at 240x160');
  check(canvas.cssW === 1200 && canvas.cssH === 800, 'canvas is shown at a whole 5x scale in a 1280x800 window');

  const before = await state(desktop);
  await desktop.keyboard.down('ArrowRight');
  await desktop.waitForTimeout(400);
  await desktop.keyboard.up('ArrowRight');
  const afterRight = await state(desktop);
  check(afterRight.x > before.x + 15 && afterRight.facing === 'right', 'arrow key walks the hero right');

  await desktop.keyboard.down('KeyW');
  await desktop.waitForTimeout(3000);
  await desktop.keyboard.up('KeyW');
  const atWall = await state(desktop);
  check(atWall.y === 16 && atWall.facing === 'up', 'hero stops flush against the top wall');

  // Logic rate: count steps over one second of wall-clock time.
  const s0 = await state(desktop);
  await desktop.waitForTimeout(1000);
  const s1 = await state(desktop);
  const rate = s1.steps - s0.steps;
  check(rate >= 54 && rate <= 66, `logic runs at about 60 steps per second (measured ${rate})`);
  await desktop.screenshot({ path: `${OUT}desktop.png` });

  // Tablet: touch controls beside the screen.
  const tablet = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  tablet.on('pageerror', (e) => errors.push(String(e)));
  await tablet.goto(`${BASE}?touch=1`);
  await ready(tablet);
  const layout = await tablet.evaluate(() => {
    const rect = (sel) => document.querySelector(sel).getBoundingClientRect();
    const c = rect('canvas');
    const l = rect('#left');
    const r = rect('#right');
    const d = rect('[data-dpad]');
    return { c, l, r, d, dpr: devicePixelRatio };
  });
  const scale = (layout.c.width * layout.dpr) / 240;
  check(Number.isInteger(scale) && scale >= 2, `tablet canvas is a whole device-pixel scale (${scale}x)`);
  check(layout.l.right <= layout.c.left + 0.5 && layout.r.left >= layout.c.right - 0.5, 'touch controls do not overlap the screen');

  const t0 = await state(tablet);
  const cx = layout.d.x + layout.d.width / 2;
  const cy = layout.d.y + layout.d.height / 2;
  const cdp = await tablet.context().newCDPSession(tablet);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
  });
  await touch('touchStart', cx - layout.d.width * 0.35, cy);
  await tablet.waitForTimeout(400);
  const mid = await state(tablet);
  await tablet.screenshot({ path: `${OUT}tablet.png` });
  await touch('touchEnd');
  await tablet.waitForTimeout(100);
  const t1 = await state(tablet);
  check(mid.x < t0.x - 15 && mid.facing === 'left', 'touch d-pad walks the hero left');
  check(t1.moving === false, 'hero stops when the thumb lifts');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  console.log('\nSmoke test passed.');
} finally {
  await browser?.close();
  server.kill();
}
