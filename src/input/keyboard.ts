import type { Button, VirtualPad } from '../core/pad';

/** Physical key positions (KeyboardEvent.code), so layouts like AZERTY work. */
const KEY_MAP: Record<string, Button> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
  KeyZ: 'a', KeyJ: 'a',
  KeyX: 'b', KeyK: 'b',
  KeyC: 'r', KeyL: 'r',
  ShiftLeft: 'l', ShiftRight: 'l',
  Enter: 'start',
  Tab: 'select',
};

const SOURCE = 'keyboard';

export function attachKeyboard(pad: VirtualPad, target: Window = window): () => void {
  const onKey = (event: KeyboardEvent) => {
    const button = KEY_MAP[event.code];
    if (!button) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    pad.set(SOURCE, button, event.type === 'keydown');
  };
  const onBlur = () => pad.clear(SOURCE);

  target.addEventListener('keydown', onKey);
  target.addEventListener('keyup', onKey);
  target.addEventListener('blur', onBlur);
  return () => {
    target.removeEventListener('keydown', onKey);
    target.removeEventListener('keyup', onKey);
    target.removeEventListener('blur', onBlur);
    pad.clear(SOURCE);
  };
}
