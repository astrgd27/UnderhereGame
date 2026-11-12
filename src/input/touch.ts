import type { Button, VirtualPad } from '../core/pad';

const SOURCE = 'touch';
const DPAD_DEADZONE = 0.22;
const DIRECTIONS: readonly Button[] = ['up', 'down', 'left', 'right'];

/**
 * Wire the on-screen controls. Buttons are elements with `data-btn`; the
 * d-pad is one element with `data-dpad` that reads the thumb's angle from
 * its centre, so sliding between directions works without lifting.
 */
export function attachTouch(pad: VirtualPad, root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-btn]').forEach((el) => {
    const button = el.dataset.btn as Button;
    const pointers = new Set<number>();
    const refresh = () => {
      const down = pointers.size > 0;
      pad.set(SOURCE, button, down);
      el.classList.toggle('held', down);
    };
    el.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      el.setPointerCapture(event.pointerId);
      pointers.add(event.pointerId);
      refresh();
    });
    const up = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      refresh();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  });

  root.querySelectorAll<HTMLElement>('[data-dpad]').forEach((el) => {
    let active: number | null = null;

    const apply = (event: PointerEvent | null) => {
      const held = new Set<Button>();
      if (event) {
        const rect = el.getBoundingClientRect();
        const nx = (event.clientX - rect.left) / rect.width * 2 - 1;
        const ny = (event.clientY - rect.top) / rect.height * 2 - 1;
        if (Math.hypot(nx, ny) >= DPAD_DEADZONE) {
          // Eight sectors of 45 degrees, so diagonals are easy to hold.
          const sector = Math.round(Math.atan2(ny, nx) / (Math.PI / 4));
          if (sector >= -1 && sector <= 1) held.add('right');
          if (sector >= 3 || sector <= -3) held.add('left');
          if (sector >= 1 && sector <= 3) held.add('down');
          if (sector >= -3 && sector <= -1) held.add('up');
        }
      }
      for (const dir of DIRECTIONS) {
        pad.set(SOURCE, dir, held.has(dir));
        el.classList.toggle(`held-${dir}`, held.has(dir));
      }
    };

    el.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (active !== null) return;
      active = event.pointerId;
      el.setPointerCapture(event.pointerId);
      apply(event);
    });
    el.addEventListener('pointermove', (event) => {
      if (event.pointerId === active) apply(event);
    });
    const end = (event: PointerEvent) => {
      if (event.pointerId !== active) return;
      active = null;
      apply(null);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  });

  // Stop long-press menus, text selection and pinch zoom over the controls.
  root.addEventListener('contextmenu', (event) => event.preventDefault());
}

/** Show the touch controls on touch devices, or when forced by `?touch=1`. */
export function enableTouchUi(onChange: () => void): void {
  const body = document.body;
  const turnOn = () => {
    if (body.classList.contains('touch')) return;
    body.classList.add('touch');
    onChange();
  };
  const params = new URLSearchParams(location.search);
  if (params.get('touch') === '1' || matchMedia('(pointer: coarse)').matches) turnOn();
  window.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') turnOn();
  }, { passive: true });
}
