// input.js — keyboard and mouse controls, gathered into one axes object
// the flight model consumes each frame. Keyboard is primary; holding the
// mouse button and steering with it nudges the same axes, and the wheel
// trims the throttle.

export function createInput() {
  const keys = new Set();
  const state = {
    pitch: 0,        // -1 nose down .. +1 nose up
    roll: 0,         // -1 bank left .. +1 bank right
    yaw: 0,          // rudder
    throttleAxis: 0, // -1 idle .. +1 full (while held)
    brake: false,
    mouseSteer: { x: 0, y: 0, active: false },
  };
  const toggles = { gear: null, action: null }; // assign callbacks in main

  addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.code === 'KeyG' && !e.repeat && toggles.gear) toggles.gear();
    if ((e.code === 'Enter' || e.code === 'Space') && toggles.action) toggles.action();
    keys.add(e.code);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  let dragging = false;
  addEventListener('mousedown', (e) => { dragging = true; state.mouseSteer.active = true; });
  addEventListener('mouseup', () => { dragging = false; state.mouseSteer.active = false; state.mouseSteer.x = 0; state.mouseSteer.y = 0; });
  addEventListener('mousemove', (e) => {
    if (!dragging) return;
    state.mouseSteer.x = Math.max(-1, Math.min(1, (e.clientX / innerWidth - 0.5) * 2.4));
    state.mouseSteer.y = Math.max(-1, Math.min(1, (e.clientY / innerHeight - 0.5) * 2.4));
  });
  addEventListener('wheel', (e) => {
    state.wheelTrim = Math.max(-1, Math.min(1, (state.wheelTrim || 0) - Math.sign(e.deltaY) * 0.08));
  }, { passive: true });

  function axis(posCodes, negCodes) {
    let v = 0;
    for (const c of posCodes) if (keys.has(c)) v += 1;
    for (const c of negCodes) if (keys.has(c)) v -= 1;
    return Math.max(-1, Math.min(1, v));
  }

  // Refresh the derived axes; call once per frame before stepping physics.
  function poll() {
    state.pitch = axis(['ArrowUp', 'KeyW'], ['ArrowDown', 'KeyS']); // +1 = nose up
    state.roll = axis(['ArrowRight', 'KeyD'], ['ArrowLeft', 'KeyA']);
    state.yaw = axis(['KeyE'], ['KeyQ']);
    state.throttleAxis = axis(['ShiftLeft', 'ShiftRight', 'KeyR', 'Equal'], ['KeyF', 'Minus']);
    state.brake = keys.has('Space') || keys.has('KeyB');
    if (state.mouseSteer.active) {
      state.roll = Math.max(-1, Math.min(1, state.roll + state.mouseSteer.x * 0.8));
      state.pitch = Math.max(-1, Math.min(1, state.pitch - state.mouseSteer.y * 0.7));
    }
    return state;
  }

  return { state, poll, toggles };
}
