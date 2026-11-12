/** The GBA button set. The game reads nothing else. */
export const BUTTONS = [
  'up', 'down', 'left', 'right',
  'a', 'b', 'l', 'r',
  'start', 'select',
] as const;
export type Button = (typeof BUTTONS)[number];

type ButtonState = Record<Button, boolean>;

function emptyState(): ButtonState {
  return {
    up: false, down: false, left: false, right: false,
    a: false, b: false, l: false, r: false,
    start: false, select: false,
  };
}

/**
 * One virtual GBA pad fed by any number of sources (keyboard, gamepad,
 * touch). A button is held if any source holds it. `poll()` is called once
 * per logic step so "just pressed" is exact to the step.
 */
export class VirtualPad {
  private readonly sources = new Map<string, ButtonState>();
  private now = emptyState();
  private before = emptyState();
  /** Buttons pressed since the last poll, even if already released. */
  private readonly latched = new Map<string, Set<Button>>();

  /** A source reports a button going down or up. */
  set(source: string, button: Button, down: boolean): void {
    let state = this.sources.get(source);
    if (!state) {
      state = emptyState();
      this.sources.set(source, state);
    }
    state[button] = down;
    // A tap shorter than one logic step still counts as a press.
    if (down) {
      let taps = this.latched.get(source);
      if (!taps) {
        taps = new Set();
        this.latched.set(source, taps);
      }
      taps.add(button);
    }
  }

  /** Release everything a source holds (focus lost, pad unplugged). */
  clear(source: string): void {
    this.sources.delete(source);
    this.latched.delete(source);
  }

  clearAll(): void {
    this.sources.clear();
    this.latched.clear();
  }

  /** Latch the current state. Call once at the start of each logic step. */
  poll(): void {
    this.before = this.now;
    const next = emptyState();
    for (const state of this.sources.values()) {
      for (const button of BUTTONS) {
        if (state[button]) next[button] = true;
      }
    }
    for (const taps of this.latched.values()) {
      for (const button of taps) next[button] = true;
    }
    this.latched.clear();
    this.now = next;
  }

  isDown(button: Button): boolean {
    return this.now[button];
  }

  justPressed(button: Button): boolean {
    return this.now[button] && !this.before[button];
  }

  justReleased(button: Button): boolean {
    return !this.now[button] && this.before[button];
  }

  /** D-pad as -1, 0 or 1 per axis. Opposite directions cancel. */
  axis(): { x: number; y: number } {
    const x = (this.now.right ? 1 : 0) - (this.now.left ? 1 : 0);
    const y = (this.now.down ? 1 : 0) - (this.now.up ? 1 : 0);
    return { x, y };
  }

  snapshot(): Readonly<ButtonState> {
    return { ...this.now };
  }
}
