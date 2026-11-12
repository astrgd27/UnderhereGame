import type { Button, VirtualPad } from '../core/pad';

/**
 * Standard-mapping gamepad indices. A and B follow the Nintendo positions:
 * A is the right face button, B the bottom one.
 */
const BUTTON_MAP: ReadonlyArray<readonly [number, Button]> = [
  [1, 'a'], [0, 'b'],
  [4, 'l'], [5, 'r'],
  [6, 'l'], [7, 'r'],
  [8, 'select'], [9, 'start'],
  [12, 'up'], [13, 'down'], [14, 'left'], [15, 'right'],
];

const STICK_DEADZONE = 0.4;
const SOURCE = 'gamepad';

/**
 * Gamepads are polled, not event-driven. Call this once per logic step,
 * before `pad.poll()`.
 */
export function readGamepads(pad: VirtualPad): void {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads
    ? navigator.getGamepads()
    : [];
  const held = new Set<Button>();
  let any = false;

  for (const gp of pads) {
    if (!gp || !gp.connected) continue;
    any = true;
    for (const [index, button] of BUTTON_MAP) {
      if (gp.buttons[index]?.pressed) held.add(button);
    }
    const sx = gp.axes[0] ?? 0;
    const sy = gp.axes[1] ?? 0;
    if (sx < -STICK_DEADZONE) held.add('left');
    if (sx > STICK_DEADZONE) held.add('right');
    if (sy < -STICK_DEADZONE) held.add('up');
    if (sy > STICK_DEADZONE) held.add('down');
  }

  if (!any) {
    pad.clear(SOURCE);
    return;
  }
  for (const [, button] of BUTTON_MAP) pad.set(SOURCE, button, held.has(button));
}
