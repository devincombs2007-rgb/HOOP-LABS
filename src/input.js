// HOOP LAB — keyboard, mouse (pointer lock), gamepad and touch input.
const HoopInput = (() => {
  'use strict';
  const keys = new Set();
  const events = [];             // edge events: {type, t}
  const st = { camDX: 0, camDY: 0, zoom: 0, pointerLocked: false, gamepad: null, lastDevice: 'keyboard', touch: false,
    stick: { x: 0, y: 0 }, touchMove: { x: 0, y: 0 }, touchSprint: false };
  let canvas = null, enabled = true, dragging = false, lastMX = 0, lastMY = 0;
  const gpPrev = {};
  const KEYMAP = { Space: 'shoot', KeyX: 'cross', KeyC: 'stepback', KeyR: 'ball', KeyV: 'camera', Escape: 'pause', KeyT: 'replay', KeyH: 'hud', KeyM: 'mute', Tab: 'stats', KeyF: 'fullscreen' };

  function push(type, t) { events.push({ type, t: t ?? performance.now() }); }

  function attach(cv) {
    canvas = cv;
    window.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      st.lastDevice = 'keyboard';
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      keys.add(e.code);
      const a = KEYMAP[e.code];
      if (a === 'shoot') push('shootDown', e.timeStamp);
      else if (a) push(a, e.timeStamp);
    });
    window.addEventListener('keyup', (e) => {
      keys.delete(e.code);
      if (e.code === 'Space') push('shootUp', e.timeStamp);
    });
    window.addEventListener('blur', () => { if (keys.has('Space')) push('shootUp'); keys.clear(); });
    cv.addEventListener('mousedown', (e) => {
      if (!enabled) return;
      st.lastDevice = 'mouse';
      if (st.pointerLocked && e.button === 0) { push('shootDown', e.timeStamp); return; }
      if (e.button === 0 || e.button === 2) { dragging = true; lastMX = e.clientX; lastMY = e.clientY; }
    });
    window.addEventListener('mouseup', (e) => {
      if (st.pointerLocked && e.button === 0) push('shootUp', e.timeStamp);
      dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (st.pointerLocked) { st.camDX += e.movementX; st.camDY += e.movementY; }
      else if (dragging) { st.camDX += e.clientX - lastMX; st.camDY += e.clientY - lastMY; lastMX = e.clientX; lastMY = e.clientY; }
    });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); st.zoom += Math.sign(e.deltaY); }, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { st.pointerLocked = document.pointerLockElement === canvas; });
    window.addEventListener('gamepadconnected', (e) => { st.gamepad = e.gamepad.id; push('gamepadConnected'); });
    window.addEventListener('gamepaddisconnected', () => { st.gamepad = null; push('gamepadDisconnected'); });
    setupTouch();
  }

  function requestLock() {
    if (!canvas || st.touch || !canvas.requestPointerLock) return;
    try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* optional */ }
  }
  function releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  function pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (!gp) return null;
    const b = (i) => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5);
    const t = gp.timestamp || performance.now();
    const edge = (i, down, up) => {
      const now = b(i), was = !!gpPrev[i];
      if (now && !was && down) push(down, t);
      if (!now && was && up) push(up, t);
      gpPrev[i] = now;
    };
    edge(2, 'shootDown', 'shootUp'); // X / Square
    edge(0, 'cross');                // A / Cross
    edge(1, 'stepback');             // B / Circle
    edge(3, 'ball');                 // Y / Triangle
    edge(4, 'camera');               // LB
    edge(9, 'pause');                // Start / Options
    edge(8, 'replay');               // Back / View
    edge(12, 'zoomIn'); edge(13, 'zoomOut');
    const dz = (v) => Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85;
    const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    if (Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0 || gp.buttons.some(x => x.pressed)) st.lastDevice = 'gamepad';
    return { lx, ly, rx, ry, sprint: b(7) || b(5), walk: b(6) };
  }

  // touch: left half = virtual stick, right side buttons + camera drag
  const touchIds = { stick: null, cam: null };
  function setupTouch() {
    const root = document.getElementById('touch');
    if (!root) return;
    const knob = root.querySelector('.stick-knob'), base = root.querySelector('.stick');
    let sx = 0, sy = 0;
    window.addEventListener('touchstart', (e) => {
      if (!st.touch) { st.touch = true; document.body.classList.add('is-touch'); }
      st.lastDevice = 'touch';
      for (const t of e.changedTouches) {
        const btn = t.target.closest && t.target.closest('[data-touch]');
        if (btn) { const a = btn.dataset.touch; if (a === 'shoot') push('shootDown', e.timeStamp); else push(a, e.timeStamp); btn.classList.add('on'); btn.dataset.tid = t.identifier; continue; }
        if (t.target !== canvas && !t.target.closest('#touch')) continue;
        if (t.clientX < window.innerWidth * 0.45 && touchIds.stick === null) { touchIds.stick = t.identifier; sx = t.clientX; sy = t.clientY; base.style.left = (sx - 60) + 'px'; base.style.top = (sy - 60) + 'px'; base.classList.add('on'); }
        else if (touchIds.cam === null) { touchIds.cam = t.identifier; lastMX = t.clientX; lastMY = t.clientY; }
      }
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === touchIds.stick) {
          let dx = (t.clientX - sx) / 55, dy = (t.clientY - sy) / 55; const m = Math.hypot(dx, dy);
          if (m > 1) { dx /= m; dy /= m; }
          st.touchMove.x = dx; st.touchMove.y = dy; st.touchSprint = m > 1.6;
          knob.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
        } else if (t.identifier === touchIds.cam) { st.camDX += (t.clientX - lastMX) * 1.4; st.camDY += (t.clientY - lastMY) * 1.4; lastMX = t.clientX; lastMY = t.clientY; }
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === touchIds.stick) { touchIds.stick = null; st.touchMove.x = st.touchMove.y = 0; st.touchSprint = false; knob.style.transform = ''; base.classList.remove('on'); }
        if (t.identifier === touchIds.cam) touchIds.cam = null;
        root.querySelectorAll('[data-touch].on').forEach(b => { if (+b.dataset.tid === t.identifier) { b.classList.remove('on'); if (b.dataset.touch === 'shoot') push('shootUp', e.timeStamp); } });
      }
    };
    window.addEventListener('touchend', end); window.addEventListener('touchcancel', end);
  }

  // Sample continuous input. Returns local-space move (x = right, y = forward) magnitude <= 1.
  function sample() {
    const gp = pollGamepad();
    let x = 0, y = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    let sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    let walk = keys.has('KeyQ');
    let camX = 0, camY = 0;
    if (gp) {
      if (Math.abs(gp.lx) + Math.abs(gp.ly) > 0) { x = gp.lx; y = -gp.ly; }
      camX = gp.rx; camY = gp.ry; sprint = sprint || gp.sprint; walk = walk || gp.walk;
    }
    if (st.touch && (st.touchMove.x || st.touchMove.y)) { x = st.touchMove.x; y = -st.touchMove.y; sprint = st.touchSprint; }
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    const out = { x, y, sprint, walk, camDX: st.camDX, camDY: st.camDY, padCamX: camX, padCamY: camY, zoom: st.zoom, shootHeld: keys.has('Space') };
    st.camDX = st.camDY = 0; st.zoom = 0;
    return out;
  }
  function drain() { const e = events.splice(0, events.length); return e; }
  function setEnabled(v) { enabled = v; if (!v) dragging = false; }

  return { attach, sample, drain, requestLock, releaseLock, setEnabled, state: st, keys, push };
})();
