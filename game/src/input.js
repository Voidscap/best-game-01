// Keyboard and mouse, read once a frame. Actions are edge-triggered bits the
// game loop takes and clears, so a held key never double-fires a menu action.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_NOVA = 4;
export const ACTION_MUTE = 8;
export const ACTION_RESTART = 16;

const CONFIRM_KEYS = new Set(['Enter', 'Space']);
const PAUSE_KEYS = new Set(['KeyP', 'Escape']);
const NOVA_KEYS = new Set(['KeyE']);
const MUTE_KEYS = new Set(['KeyM']);
const RESTART_KEYS = new Set(['KeyR']);
const MOVE_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

export function createInput(canvas) {
  const down = new Set();
  let queued = 0;
  let confirmHeld = false;
  const mouse = { x: 0, y: 0, down: false, rightDown: false };

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  window.addEventListener('keydown', (event) => {
    if (MOVE_KEYS.has(event.code) || event.code === 'Space') event.preventDefault();
    if (!event.repeat) {
      if (CONFIRM_KEYS.has(event.code)) queued |= ACTION_CONFIRM;
      if (PAUSE_KEYS.has(event.code)) queued |= ACTION_PAUSE;
      if (NOVA_KEYS.has(event.code)) queued |= ACTION_NOVA;
      if (MUTE_KEYS.has(event.code)) queued |= ACTION_MUTE;
      if (RESTART_KEYS.has(event.code)) queued |= ACTION_RESTART;
    }
    down.add(event.code);
  });
  window.addEventListener('keyup', (event) => down.delete(event.code));
  window.addEventListener('blur', () => down.clear());

  canvas.addEventListener('mousemove', (event) => {
    const point = canvasPoint(event);
    mouse.x = point.x;
    mouse.y = point.y;
  });
  canvas.addEventListener('mousedown', (event) => {
    const point = canvasPoint(event);
    mouse.x = point.x;
    mouse.y = point.y;
    if (event.button === 0) {
      mouse.down = true;
      if (!confirmHeld) {
        queued |= ACTION_CONFIRM;
        confirmHeld = true;
      }
    }
    if (event.button === 2) {
      mouse.rightDown = true;
      queued |= ACTION_NOVA;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) {
      mouse.down = false;
      confirmHeld = false;
    }
    if (event.button === 2) mouse.rightDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    mouse,
    /** The held movement keys as a unit-ish vector {x, y}. */
    direction() {
      let x = 0;
      let y = 0;
      if (down.has('KeyA') || down.has('ArrowLeft')) x -= 1;
      if (down.has('KeyD') || down.has('ArrowRight')) x += 1;
      if (down.has('KeyW') || down.has('ArrowUp')) y -= 1;
      if (down.has('KeyS') || down.has('ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) {
        x *= Math.SQRT1_2;
        y *= Math.SQRT1_2;
      }
      return { x, y };
    },
    firing() {
      return mouse.down || down.has('Space');
    },
    takeActions() {
      const actions = queued;
      queued = 0;
      return actions;
    },
  };
}
