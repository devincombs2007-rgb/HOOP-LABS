// HOOP LAB — game core: boots renderer/world/characters, runs the fixed-step simulation
// (player + gameplay at 120 Hz, ball physics 2 × 1/240 s per tick), turns input into shots,
// resolves and classifies every shot from the physics, and exposes a small automation API
// (window.HOOP) used by the browser tests.
const HoopGame = (() => {
  'use strict';
  const PH = HoopPhysics, K = PH.K, SH = HoopShot, RO = HoopRoster;
  const TICK = K.FIXED_DT, PHYS_SUB = Math.round(TICK / K.PHYS_DT);
  const MAX_BALLS = 6;
  const AUTO_RELEASE_LATE = 0.25;   // seconds past the ideal release point before the shot auto-releases
  const PUMP_FAKE_TAP = 0.16;       // shoot taps shorter than this are pump fakes
  const STORE_KEY = 'hooplab.v1';
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;

  const DEFAULT_SETTINGS = {
    quality: 'high', resScale: 1, difficulty: 'pro', variance: 'low', ballReturn: 'rebounder',
    meter: true, guide: false, trail: true, hud: true, camMode: 'game', camSens: 1, camDist: 4.6, fov: 55,
    invertY: false, pointerLock: false, master: 0.8, sfx: 0.9, amb: 0.45, muted: false, autoAlign: true,
  };

  // ---------------------------------------------------------------- state
  const G = {
    ready: false, paused: false, now: 0, frame: 0, fps: 60, settings: Object.assign({}, DEFAULT_SETTINGS),
    renderer: null, camera: null, rig: null, W: null, models: {}, players: {}, player: null, def: null,
    balls: [], held: null, shots: [], lastShot: null, store: null, records: {}, jumpers: {},
    mode: null, meter: { active: false, fill: 0, lo: null, hi: null, T: 0, max: 1, eMs: null, grade: null, green: false },
    shotInput: null, pendingMove: null, replay: null, recorder: null, rng: SH.makeRng(0x5EED1),
    listeners: {}, autoTick: true, perf: { tickMs: 0, renderMs: 0, frameMs: 16.7 },
  };

  function on(evt, fn) { (G.listeners[evt] || (G.listeners[evt] = [])).push(fn); }
  function emit(evt, data) { const l = G.listeners[evt]; if (l) for (const fn of l) { try { fn(data); } catch (e) { console.error(e); } } }

  // ---------------------------------------------------------------- persistence
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  let saveTimer = 0;
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        settings: G.settings, stats: HoopStats.serialize(G.store), jumpers: G.jumpers,
        character: G.def && G.def.id, records: G.records,
      }));
    } catch (e) { /* storage full or blocked: keep playing */ }
  }
  function saveSoon() { saveTimer = 1.0; }

  // ---------------------------------------------------------------- balls
  function makeBallEntry(i) {
    return { i, b: PH.createBall(), active: false, state: 'free', prev: V(), cur: V(), shot: null, pass: null, lastSnd: {}, born: 0 };
  }
  function acquireBall() {
    let e = G.balls.find(x => !x.active);
    if (!e) { // recycle the oldest ball that is not in hand, in flight, or being passed
      let best = null;
      for (const x of G.balls) if (x.state === 'free' && (!x.shot || x.shot.resolved) && (!best || x.born < best.born)) best = x;
      e = best || G.balls[0];
      if (e.shot && !e.shot.resolved) e.shot.resolved = true;
    }
    e.active = true; e.state = 'free'; e.shot = null; e.pass = null; e.born = G.now; e.b.held = false;
    return e;
  }
  function ballMesh(e) { return G.W.ballMeshes[e.i]; }

  function giveBallTo(e, how) {
    const pl = G.player;
    e.state = 'held'; e.b.held = true; e.pass = null; G.held = e;
    pl.reaching = false; pl.reachTarget = null;
    pl.giveBall(G.now, how);
    if (HoopAudio.ready) HoopAudio.S.catchBall(panOf(pl.ballPos));
  }

  // kinematic pass (rebounder / rack / called ball) to the player's hands
  function passTo(e, from, delay = 0) {
    const pl = G.player;
    e.state = 'pass'; e.b.held = true;
    const to = handTarget(V());
    const d = from.distanceTo(to);
    e.pass = { from: from.clone(), t: -delay, dur: clamp(0.32 + d / 11, 0.4, 1.25), h: 0.12 + d * 0.05 };
    e.b.px = from.x; e.b.py = from.y; e.b.pz = from.z;
    pl.reaching = false;
  }
  function handTarget(out) {
    const pl = G.player, f = pl.fwd(pl.yaw), r = pl.right(pl.yaw);
    return out.set(pl.x, pl.dims.hipsY + 0.22 * pl.hs, pl.z).addScaledVector(f, 0.3 * pl.hs).addScaledVector(r, 0.08);
  }
  const _tgt = V();
  function updatePass(e, dt) {
    const p = e.pass, pl = G.player;
    p.t += dt;
    if (p.t < 0) return;
    const u = clamp(p.t / p.dur, 0, 1);
    handTarget(_tgt);
    const x = lerp(p.from.x, _tgt.x, u), z = lerp(p.from.z, _tgt.z, u);
    const y = lerp(p.from.y, _tgt.y, u) + 4 * p.h * u * (1 - u);
    e.b.px = x; e.b.py = y; e.b.pz = z;
    if (u > 0.55 && !pl.hasBall) { pl.reaching = true; pl.reachTarget = pl.reachTarget || V(); pl.reachTarget.set(x, y, z); }
    if (u >= 1) {
      if (!pl.hasBall && !pl.shot) giveBallTo(e, 'pass');
      else { e.state = 'free'; e.b.held = false; PH.placeBall(e.b, x, y, z, 0, -1, 0); }
    }
  }

  // ---------------------------------------------------------------- shot tracking
  let curEntry = null;
  function onContact(kind, hi, x, y, z, v) {
    const e = curEntry, tr = e && e.shot;
    if (tr && !tr.resolved) {
      if (kind === 'rim' || kind === 'neck') {
        if (G.now - tr.lastRimT > 0.05) tr.rimHits++;
        tr.lastRimT = G.now;
        if (!tr.firstRim) tr.firstRim = { x, z };
        if (!tr.firstContact) tr.firstContact = 'rim';
      } else if (kind === 'board') {
        if (!tr.boardHit) tr.boardBeforeRim = tr.rimHits === 0;
        tr.boardHit = true;
        if (!tr.firstContact) tr.firstContact = 'board';
      } else if (kind === 'floor') {
        resolveShot(tr, false, x, z);
      } else tr.otherHit = kind;
    }
    contactSound(e, kind, x, y, z, v);
  }
  function onScoring(type, hi, data) {
    const e = curEntry, tr = e && e.shot;
    if (type === 'cross' && tr && hi === tr.hoop && !tr.cross) {
      tr.cross = { rho: data.rho, x: data.x, z: data.z, entryAngle: Math.atan2(-data.vy, Math.hypot(data.vx, data.vz)) * 180 / Math.PI };
    }
    if (type === 'score') {
      const clean = tr && !tr.resolved && hi === tr.hoop && tr.rimHits === 0 && !tr.boardHit;
      if (HoopAudio.ready) { const H = PH.HOOPS[hi]; const pp = V(H.cx, K.RIM_Y, H.cz); if (clean) HoopAudio.S.swish(1, panOf(pp), distOf(pp)); else HoopAudio.S.netRustle(0.7, panOf(pp), distOf(pp)); }
      if (tr && !tr.resolved && hi === tr.hoop) resolveShot(tr, true);
    }
  }

  function startTracker(e, rel, info, plan) {
    const pl = G.player, s = pl.shot;
    const hoop = pl.targetHoop, x = pl.x, z = pl.z;
    const dist = PH.distToHoop(x, z, hoop);
    const tr = {
      id: G.shots.length + 1, entry: e, hoop, x, z, dist, three: PH.isThree(x, z, hoop), label: PH.rangeLabel(dist),
      releaseT: G.now, eMs: info.eSec * 1000, grade: G.meter.grade, green: G.meter.green,
      relSpeed: rel.speed, relAngle: rel.angle * 180 / Math.PI, idealSpeed: rel.idealSpeed, idealAngle: rel.idealAngle * 180 / Math.PI,
      spinRps: Math.hypot(rel.wx, rel.wy, rel.wz) / (2 * Math.PI), releaseH: info.pos.y,
      catchShoot: !!(s && s.catchShoot), pullUp: !!(s && s.pullUp), moving: pl.speed() > 0.6, offBalance: info.offBalance,
      dx: plan.dx, dz: plan.dz, rimHits: 0, lastRimT: -9, boardHit: false, boardBeforeRim: false, firstRim: null, firstContact: null,
      cross: null, apex: info.pos.y, resolved: false, made: false, result: null, missType: null, path: [], char: G.def.id,
      jumper: G.jumpers[G.def.id] ? G.jumpers[G.def.id].presetId : 'sig', startT: s ? s.start : G.now,
    };
    tr.path.push(info.pos.x, info.pos.y, info.pos.z);
    e.shot = tr;
    G.shots.push(tr);
    if (G.shots.length > 60) G.shots.shift();
    G.lastShot = tr;
    if (G.mode && G.mode.onRelease) handleModeEvents(G.mode.onRelease(tr) || []);
    return tr;
  }

  function resolveShot(tr, made, lx, lz) {
    if (tr.resolved) return;
    tr.resolved = true; tr.made = made; tr.resolveT = G.now;
    const H = PH.HOOPS[tr.hoop];
    if (made) {
      tr.result = tr.boardHit && tr.boardBeforeRim ? 'bank' : tr.rimHits === 0 && !tr.boardHit ? 'swish' : tr.rimHits >= 3 ? 'rattle' : 'rim';
    } else {
      tr.result = 'miss';
      let ref = tr.firstRim, kind = null;
      if (!ref && tr.boardHit) kind = 'board';
      else if (!ref) { ref = tr.cross || (lx !== undefined ? { x: lx, z: lz } : null); kind = 'air'; }
      if (ref) {
        const ox = ref.x - H.cx, oz = ref.z - H.cz;
        const along = ox * tr.dx + oz * tr.dz, lat = -ox * tr.dz + oz * tr.dx;
        const dir = Math.abs(along) >= Math.abs(lat) ? (along < 0 ? 'front' : 'back') : (lat > 0 ? 'right' : 'left');
        if (kind === 'air') tr.missType = 'air-' + (dir === 'front' ? 'short' : dir === 'back' ? 'long' : dir);
        else tr.missType = dir;
      } else tr.missType = kind || 'air';
    }
    tr.entryAngle = tr.cross ? tr.cross.entryAngle : null;
    const rec = HoopStats.addShot(G.store, {
      t: Date.now(), char: tr.char, jumper: tr.jumper, x: tr.x, z: tr.z, hoop: tr.hoop, dist: tr.dist, three: tr.three,
      made, result: tr.result, missType: tr.missType, entryAngle: tr.entryAngle, eMs: tr.eMs, grade: tr.grade,
      relAngle: tr.relAngle, relSpeed: tr.relSpeed, spinRps: tr.spinRps, apex: tr.apex, catchShoot: tr.catchShoot,
      pullUp: tr.pullUp, moving: tr.moving, difficulty: G.settings.difficulty,
    });
    tr.record = rec;
    const sess = HoopStats.aggregate(HoopStats.filter(G.store, 'session'));
    G.W.updateBoard(`${sess.made} / ${sess.att}`, tr.made ? resultLabel(tr) : 'Miss', `${HoopModes.ft(tr.dist)} · ${tr.label}`);
    emit('shotResult', tr);
    if (made && HoopInput.rumble) HoopInput.rumble(0.35, 110);
    if (G.mode && G.mode.onResult) handleModeEvents(G.mode.onResult({ made, dist: tr.dist, eMs: tr.eMs, three: tr.three, result: tr.result }, tr) || []);
    // rebounder: return this ball after it drops
    const ret = currentBallReturn();
    if (ret === 'rebounder') tr.returnAt = G.now + (made ? 0.55 : 0.8);
    saveSoon();
  }
  function resultLabel(tr) { return tr.result === 'swish' ? 'Swish' : tr.result === 'bank' ? 'Bank shot' : tr.result === 'rattle' ? 'Rattled in' : 'Good'; }
  function currentBallReturn() { return (G.mode && G.mode.ballReturn) || G.settings.ballReturn; }

  // ---------------------------------------------------------------- modes
  function handleModeEvents(evs) {
    for (const ev of evs) {
      if (ev.type === 'toast') emit('toast', ev);
      else if (ev.type === 'moveTo') G.pendingMove = { spot: ev.spot, at: G.now + (ev.delay == null ? 0.9 : ev.delay) };
      else if (ev.type === 'buzzer') { if (HoopAudio.ready) HoopAudio.S.ui('buzzer'); emit('buzzer', ev); }
      else if (ev.type === 'done') { if (HoopAudio.ready) HoopAudio.S.ui(ev.newBest ? 'best' : 'confirm'); emit('modeDone', ev); saveSoon(); }
    }
  }
  function startMode(id, cfg = {}) {
    G.mode = HoopModes.create(id, cfg, G.records);
    G.pendingMove = null;
    const sp = G.mode.spot;
    if (sp) moveToSpot(sp, true);
    ensureBallInHand();
    emit('mode', G.mode);
    return G.mode;
  }
  function moveToSpot(sp, teleport) {
    const pl = G.player, H = PH.HOOPS[sp.hoop || 0];
    const yaw = Math.atan2(H.cx - sp.x, H.cz - sp.z);
    pl.targetHoop = sp.hoop || 0;
    if (teleport || Math.hypot(sp.x - pl.x, sp.z - pl.z) > 9 || pl.shot) { if (!pl.shot) { const had = pl.hasBall; pl.placeAt(sp.x, sp.z, yaw); pl.hasBall = had; } }
    else pl.autopilot = { x: sp.x, z: sp.z, yaw };
  }
  function ensureBallInHand() {
    const pl = G.player;
    if (pl.hasBall || G.balls.some(e => e.state === 'pass')) return;
    const e = acquireBall();
    handTarget(_tgt);
    e.b.px = _tgt.x; e.b.py = _tgt.y; e.b.pz = _tgt.z;
    giveBallTo(e, 'spawn');
    pl.ballPos.copy(_tgt);
  }

  // ---------------------------------------------------------------- shooting
  function onShootDown(t) {
    const pl = G.player;
    if (!pl || G.paused || G.replay || G.shotInput) return;
    if (G.mode && G.mode.canShoot && !G.mode.canShoot()) { emit('toast', { text: G.mode.done ? 'Session complete' : 'Not yet', tone: 'info' }); return; }
    if (!pl.hasBall) { callBall(); return; }
    const queued = pl.action === 'stepback';
    if (!pl.startShot(G.now)) return;
    G.shotInput = { downT: t, downSim: G.now, upT: null, releaseAt: null, startSim: queued ? null : G.now };
    if (!queued) prepareMeter();
  }
  function onShootUp(t) {
    const si = G.shotInput, pl = G.player;
    if (!si || si.upT !== null) return;
    si.upT = t;
    const hold = Math.max(0, (t - si.downT) / 1000);
    if (hold < PUMP_FAKE_TAP && pl.shot && !pl.shot.released && pl.pumpFake()) { G.shotInput = null; G.meter.active = false; emit('pumpFake'); return; }
    const delay = si.startSim === null ? null : si.startSim - si.downSim;
    si.releaseAt = delay === null ? null : Math.max(0.12, hold - delay);
    si.hold = hold;
  }

  // plain-data context handed to HoopShot (see shotmodel.js "game entry points")
  function shotCtx(pl, T, info) {
    const ip = pl.shotBallWorld(T, V());
    return {
      hoop: pl.targetHoop, idealPos: { x: ip.x, y: ip.y, z: ip.z }, pos: info ? { x: info.pos.x, y: info.pos.y, z: info.pos.z } : { x: ip.x, y: ip.y, z: ip.z },
      eSec: info ? info.eSec : 0, body: info ? info.bodyV : { vx: pl.vx, vy: pl.bodyVyAt(T), vz: pl.vz },
      bodyIdeal: { vx: pl.vx, vy: pl.bodyVyAt(T), vz: pl.vz }, offBalance: info ? info.offBalance : pl.offBalance,
      d: pl.derived, ch: pl.def, p: pl.jumper, difficulty: G.settings.difficulty, variance: G.settings.variance, rng: G.rng,
      posAtE: (e) => { const q = pl.shotBallWorld(T + e, V()); return { x: q.x, y: q.y, z: q.z }; },
    };
  }

  // shot meter: the clean-entry timing window for this shot (computed once, at shot start)
  function prepareMeter() {
    const pl = G.player, s = pl.shot, M = G.meter;
    M.active = true; M.T = s.T; M.max = s.T + AUTO_RELEASE_LATE; M.fill = 0; M.eMs = null; M.grade = null; M.green = false;
    M.lo = M.hi = null;
    try {
      const win = SH.shotWindow(shotCtx(pl, s.T, null));
      M.lo = win.lo; M.hi = win.hi; M.best = win.best; M.plan = win.plan;
      if (G.settings.guide && win.plan) drawGuide(win.plan);
    } catch (err) { console.warn('timing window failed', err); }
    emit('shotStart', M);
  }

  function doRelease(tRel) {
    const pl = G.player, s = pl.shot, e = G.held;
    const info = pl.release(tRel);
    G.shotInput = null;
    if (!info || !e) return;
    const { plan, rel } = SH.resolveRelease(shotCtx(pl, s.T, info));
    const M = G.meter;
    M.eMs = info.eSec * 1000;
    M.green = M.lo !== null && info.eSec >= M.lo - 0.0005 && info.eSec <= M.hi + 0.0005;
    M.grade = SH.gradeTiming(M.eMs, M.lo !== null ? { lo: M.lo, hi: M.hi } : null);
    M.released = true; M.fill = clamp(tRel / M.max, 0, 1);
    G.held = null;
    e.state = 'free'; e.b.held = false;
    PH.placeBall(e.b, info.pos.x, info.pos.y, info.pos.z, rel.vx, rel.vy, rel.vz, rel.wx, rel.wy, rel.wz);
    e.prev.set(info.pos.x, info.pos.y, info.pos.z);
    const tr = startTracker(e, rel, info, plan);
    if (G.W.releaseMarker) { G.W.releaseMarker.position.copy(info.pos); G.W.releaseMarker.visible = G.settings.trail; }
    if (HoopAudio.ready && M.green) HoopAudio.S.ui('perfect');
    if (HoopInput.rumble) HoopInput.rumble(M.green ? 0.45 : 0.25, M.green ? 90 : 60);
    emit('release', { tr, rel, grade: M.grade, eMs: M.eMs, green: M.green });
    if (currentBallReturn() === 'rapid') G.rapidAt = G.now + 0.5;
  }

  function callBall() {
    const pl = G.player;
    if (pl.hasBall || G.balls.some(e => e.state === 'pass')) return;
    let best = null, bd = 1e9;
    for (const e of G.balls) {
      if (!e.active || e.state !== 'free') continue;
      if (e.shot && !e.shot.resolved) continue;
      const d = Math.hypot(e.b.px - pl.x, e.b.pz - pl.z);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) passTo(best, V(best.b.px, best.b.py, best.b.pz));
    else { const e = acquireBall(); const H = PH.HOOPS[pl.targetHoop]; passTo(e, V(H.cx - Math.sign(H.cx) * 0.6, 1.0, H.cz)); }
  }

  function rackPass() {
    const pl = G.player;
    if (pl.hasBall || G.balls.some(e => e.state === 'pass')) return;
    const e = acquireBall();
    const r = pl.right(pl.yaw), f = pl.fwd(pl.yaw);
    passTo(e, V(pl.x + r.x * 1.1 - f.x * 0.2, 0.95, pl.z + r.z * 1.1 - f.z * 0.2));
  }

  // ---------------------------------------------------------------- simulation tick
  const MV = { mx: 0, mz: 0, sprint: false, walk: false };
  let inputMove = { x: 0, y: 0, sprint: false, walk: false };

  function tick(dt) {
    G.now += dt;
    const pl = G.player;
    // input → world-space move relative to the camera
    const cy = G.rig.yaw;
    const fx = Math.sin(cy), fz = Math.cos(cy), rx = -Math.cos(cy), rz = Math.sin(cy);
    MV.mx = fx * inputMove.y + rx * inputMove.x; MV.mz = fz * inputMove.y + rz * inputMove.x;
    MV.sprint = inputMove.sprint; MV.walk = inputMove.walk;
    if (pl.autopilot && (Math.abs(inputMove.x) + Math.abs(inputMove.y) > 0.3) && !(G.mode && G.mode.requireSpot)) pl.autopilot = null;
    // target hoop: the basket the camera faces (fixed while a shot is in progress)
    if (!pl.shot && !pl.autopilot) {
      const d0 = (PH.HOOPS[0].cx - pl.x) * fx + (PH.HOOPS[0].cz - pl.z) * fz;
      const d1 = (PH.HOOPS[1].cx - pl.x) * fx + (PH.HOOPS[1].cz - pl.z) * fz;
      pl.targetHoop = d0 >= d1 ? 0 : 1;
    }
    // queued shot after a step-back started this tick?
    const si = G.shotInput;
    if (si && si.startSim === null && pl.shot && pl.action === 'shoot') {
      si.startSim = G.now;
      if (si.upT !== null) si.releaseAt = Math.max(0.12, si.hold - (si.startSim - si.downSim));
      prepareMeter();
    }
    // release check (timing is exact: event timestamps, not frame boundaries)
    if (pl.shot && !pl.shot.released && pl.action === 'shoot') {
      const s = pl.shot, at = si ? si.releaseAt : null;
      if (at !== null && at !== undefined && s.t + dt >= at) doRelease(at);
      else if (s.t + dt >= s.T + AUTO_RELEASE_LATE) doRelease(s.T + AUTO_RELEASE_LATE);
    }
    if (G.meter.active && pl.shot && !G.meter.released) G.meter.fill = clamp((pl.shot.t + dt) / G.meter.max, 0, 1);
    if (G.meter.active && !pl.shot) { G.meter.active = false; G.meter.released = false; }
    if (G.shotInput && !pl.shot && pl.action !== 'stepback') G.shotInput = null;

    const evs = pl.update(dt, pl.autopilot ? null : MV, G.now);
    for (const ev of evs) playerEvent(ev);
    if (G.meter.released && !pl.shot) { G.meter.active = false; G.meter.released = false; }

    // balls
    for (const e of G.balls) {
      if (!e.active) continue;
      const b = e.b;
      e.prev.copy(e.cur);
      if (e.state === 'held') { b.px = pl.ballPos.x; b.py = pl.ballPos.y; b.pz = pl.ballPos.z; spinHeld(e, dt); }
      else if (e.state === 'pass') updatePass(e, dt);
      else if (e.state === 'pickup') {
        e.pickT += dt;
        const u = clamp(e.pickT / 0.22, 0, 1);
        handTarget(_tgt);
        b.px = lerp(e.pickFrom.x, _tgt.x, u * u); b.py = lerp(e.pickFrom.y, _tgt.y, u * u); b.pz = lerp(e.pickFrom.z, _tgt.z, u * u);
        pl.ballPos.set(b.px, b.py, b.pz);
        if (u >= 1) giveBallTo(e, 'pickup');
      } else {
        curEntry = e;
        const h = dt / PHYS_SUB;
        for (let k = 0; k < PHYS_SUB; k++) PH.step(b, h, onContact, onScoring);
        curEntry = null;
        const tr = e.shot;
        if (tr && !tr.resolved) {
          if (b.py > tr.apex) tr.apex = b.py;
          if ((G.frame & 1) === 0 && tr.path.length < 3600) tr.path.push(b.px, b.py, b.pz);
          if (G.now - tr.releaseT > 7) resolveShot(tr, false, b.px, b.pz);
        } else if (tr && tr.returnAt && G.now >= tr.returnAt) {
          tr.returnAt = null;
          if (!pl.hasBall && !G.balls.some(x => x.state === 'pass')) passTo(e, V(b.px, Math.max(b.py, 0.3), b.pz));
        }
      }
      e.cur.set(b.px, b.py, b.pz);
    }
    // rapid return (rack feeds a new ball right after the release)
    if (G.rapidAt && G.now >= G.rapidAt) { G.rapidAt = 0; if (!pl.hasBall && !pl.shot) rackPass(); else if (!pl.hasBall) G.rapidAt = G.now + 0.1; }
    // auto pickup of a loose ball the player walks over
    if (!pl.hasBall && !pl.shot && pl.action !== 'pickup' && !G.balls.some(x => x.state === 'pass' || x.state === 'pickup')) {
      for (const e of G.balls) {
        if (!e.active || e.state !== 'free') continue;
        const b = e.b;
        if (e.shot && !e.shot.resolved) continue;
        const d = Math.hypot(b.px - pl.x, b.pz - pl.z);
        if (d < 0.62 * pl.hs && b.py < 1.5 && Math.hypot(b.vx, b.vy, b.vz) < 7) {
          e.state = 'pickup'; e.b.held = true; e.pickT = 0; e.pickFrom = V(b.px, b.py, b.pz);
          pl.action = 'pickup'; pl.actionT = 0; pl.pickupH = b.py; pl.ballPos.set(b.px, b.py, b.pz); pl.dribbling = false;
          break;
        }
      }
    }
    // mode logic
    if (G.mode) {
      handleModeEvents(G.mode.update(dt) || []);
      if (G.pendingMove && G.now >= G.pendingMove.at && !pl.shot) { moveToSpot(G.pendingMove.spot, false); G.pendingMove = null; }
    }
    if (saveTimer > 0) { saveTimer -= dt; if (saveTimer <= 0) save(); }
  }

  const _w = V(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  function spinHeld(e, dt) {
    const w = G.player.ballSpin, b = e.b;
    const wl = w.length();
    if (wl < 1e-4) return;
    _w.copy(w).divideScalar(wl);
    _q.setFromAxisAngle(_w, wl * dt);
    _q2.set(b.qx, b.qy, b.qz, b.qw).premultiply(_q);
    b.qx = _q2.x; b.qy = _q2.y; b.qz = _q2.z; b.qw = _q2.w;
  }

  function playerEvent(ev) {
    if (!HoopAudio.ready) return;
    const pl = G.player, S = HoopAudio.S;
    const p = _tgt.set(pl.x, 0.1, pl.z), pan = panOf(p);
    if (ev.type === 'dribble') S.dribble(ev.v, pan, distOf(p));
    else if (ev.type === 'footstep') S.footstep(1 + (ev.v || 0) * 0.5, pan);
    else if (ev.type === 'squeak') S.squeak(ev.v, pan);
    else if (ev.type === 'land') S.land(ev.v || 2, pan);
  }

  // ---------------------------------------------------------------- audio helpers
  const _cr = V(), _cd = V();
  function panOf(p) {
    if (!G.camera) return 0;
    _cd.copy(p).sub(G.camera.position);
    const d = _cd.length() || 1;
    _cr.set(1, 0, 0).applyQuaternion(G.camera.quaternion);
    return clamp(_cd.dot(_cr) / d, -1, 1) * 0.8;
  }
  function distOf(p) { return G.camera ? G.camera.position.distanceTo(p) : 5; }
  function contactSound(e, kind, x, y, z, v) {
    if (!HoopAudio.ready || !e) return;
    const last = e.lastSnd[kind] || -9;
    if (G.now - last < 0.035) return;
    e.lastSnd[kind] = G.now;
    const p = _tgt.set(x, y, z), pan = panOf(p), dist = distOf(p), S = HoopAudio.S;
    if (kind === 'floor') S.floor(v, pan, dist);
    else if (kind === 'rim' || kind === 'neck') S.rim(v, pan, dist);
    else if (kind === 'board') S.board(v, pan, dist);
    else S.pad(v, pan, dist);
  }

  // ---------------------------------------------------------------- visuals
  function drawGuide(plan) {
    const g = G.W.guide, arr = g.geometry.attributes.position.array;
    const b = { px: plan.pos.x, py: plan.pos.y, pz: plan.pos.z, vx: plan.speed * Math.cos(plan.theta) * plan.dx, vy: plan.speed * Math.sin(plan.theta), vz: plan.speed * Math.cos(plan.theta) * plan.dz, wx: 0, wy: 0, wz: 0 };
    let n = 0;
    for (let i = 0; i < 400; i++) {
      arr[n * 3] = b.px; arr[n * 3 + 1] = b.py; arr[n * 3 + 2] = b.pz; n++;
      PH.integrateFree(b, 1 / 120);
      if (b.vy < 0 && b.py < K.RIM_TOP - 0.3) break;
    }
    g.geometry.setDrawRange(0, n); g.geometry.attributes.position.needsUpdate = true; g.computeLineDistances(); g.visible = true;
  }
  function drawTrail() {
    const t = G.W.trail, tr = G.lastShot;
    if (!tr || !G.settings.trail) { t.visible = false; return; }
    const arr = t.geometry.attributes.position.array, n = Math.min(1200, tr.path.length / 3);
    for (let i = 0; i < n * 3; i++) arr[i] = tr.path[i];
    t.geometry.setDrawRange(0, n); t.geometry.attributes.position.needsUpdate = true; t.visible = n > 1;
  }

  function syncVisuals(alpha) {
    const W = G.W;
    for (const e of G.balls) {
      const m = ballMesh(e);
      m.visible = e.active;
      if (!e.active) continue;
      if (e.state === 'held') m.position.copy(G.player.ballPos);
      else m.position.lerpVectors(e.prev, e.cur, alpha);
      m.quaternion.set(e.b.qx, e.b.qy, e.b.qz, e.b.qw);
    }
    if (!W.Q.shadows) {
      for (let i = 0; i < W.blobs.length; i++) {
        const bl = W.blobs[i], e = G.balls[i];
        if (!e || !e.active) { bl.visible = false; continue; }
        const m = ballMesh(e); bl.visible = true; bl.position.set(m.position.x, 0.004, m.position.z);
        const s = 0.32 + m.position.y * 0.08; bl.scale.set(s, s, s);
      }
    }
    // nets react to nearby balls
    const near = [];
    for (const e of G.balls) if (e.active) near.push({ x: e.cur.x, y: e.cur.y, z: e.cur.z });
    for (const n of W.nets) {
      const close = near.some(b => Math.abs(b.x - n.hoop.cx) < 0.9 && Math.abs(b.z - n.hoop.cz) < 0.9 && b.y < K.RIM_Y + 0.4);
      if (close || n.energy > 1e-4) { n.step(1 / 60, near); n.writeLines(); }
    }
    W.spotRing.visible = !!(G.mode && G.mode.spot && G.mode.requireSpot && !G.mode.done);
    if (W.spotRing.visible) W.spotRing.position.set(G.mode.spot.x, 0.006, G.mode.spot.z);
    if (!G.meter.active) W.guide.visible = false;
    drawTrail();
  }

  // ---------------------------------------------------------------- characters
  function selectCharacter(id) {
    const def = RO.getCharacter(id);
    const prev = G.player;
    for (const k in G.models) G.models[k].root.visible = k === def.id;
    let pl = G.players[def.id];
    if (!pl) { pl = new HoopPlayer.Player(G.models[def.id], def); G.players[def.id] = pl; }
    G.def = def; G.player = pl;
    const j = G.jumpers[def.id] || { presetId: 'sig', params: RO.cloneParams(def.sig.params) };
    G.jumpers[def.id] = j;
    pl.setJumper(j.params, SH.derive(j.params, def));
    if (prev && prev !== pl) {
      pl.placeAt(prev.x, prev.z, prev.yaw); pl.targetHoop = prev.targetHoop;
      if (G.held) { pl.hasBall = false; const e = G.held; G.held = null; giveBallTo(e, 'swap'); }
      prev.hasBall = false;
    } else if (!prev) pl.placeAt(K.HOOP_X - 5.2, 0, Math.PI / 2);
    G.shotInput = null; G.meter.active = false;
    if (!G.held) ensureBallInHand();
    emit('character', def);
    saveSoon();
    return pl;
  }
  function setJumper(params, presetId = 'custom') {
    const pl = G.player;
    G.jumpers[G.def.id] = { presetId, params: RO.cloneParams(params) };
    pl.setJumper(G.jumpers[G.def.id].params, SH.derive(params, G.def));
    saveSoon();
    emit('jumper', G.jumpers[G.def.id]);
  }

  // ---------------------------------------------------------------- rendering setup
  function makeRenderer(canvasHost) {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.domElement.id = 'view';
    if (HoopWorld.configureRenderer) HoopWorld.configureRenderer(r, G.settings.quality);
    if (typeof HoopRender !== 'undefined' && HoopRender.init) HoopRender.init(r, G.settings);
    canvasHost.appendChild(r.domElement);
    r.domElement.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); G.contextLost = true; setPaused(true); emit('contextLost'); });
    r.domElement.addEventListener('webglcontextrestored', () => { G.contextLost = false; applyQuality(G.settings.quality, true); emit('contextRestored'); });
    return r;
  }
  function resize() {
    if (!G.renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    const Q = HoopWorld.QUALITY[G.settings.quality] || HoopWorld.QUALITY.high;
    G.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pixel) * G.settings.resScale);
    G.renderer.setSize(w, h);
    G.camera.aspect = w / h; G.camera.updateProjectionMatrix();
    if (G.W && G.W.reflect) { const s = G.renderer.getDrawingBufferSize(new THREE.Vector2()); G.W.reflect.resize(s.x, s.y); }
    if (typeof HoopRender !== 'undefined' && HoopRender.resize) HoopRender.resize(w, h, G.renderer);
  }
  function attachToWorld() {
    const sc = G.W.scene;
    for (const k in G.models) sc.add(G.models[k].root);
  }
  function applyQuality(q, force) {
    if (!HoopWorld.QUALITY[q]) q = 'high';
    if (!force && G.W && G.settings.quality === q) return;
    G.settings.quality = q;
    const Q = HoopWorld.QUALITY[q];
    G.renderer.shadowMap.enabled = Q.shadows;
    if (HoopWorld.configureRenderer) HoopWorld.configureRenderer(G.renderer, q);
    if (typeof HoopRender !== 'undefined' && HoopRender.setQuality) HoopRender.setQuality(q, G.renderer);
    if (G.W) disposeWorld(G.W);
    resize();
    G.W = HoopWorld.build(G.renderer, q);
    attachToWorld();
    resize();
    for (const k in G.models) G.models[k].root.traverse(o => { if (o.isMesh && o.material && o.material.needsUpdate !== undefined) o.material.needsUpdate = true; });
    saveSoon();
  }
  function disposeWorld(W) {
    for (const k in G.models) W.scene.remove(G.models[k].root);
    W.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); } }
    });
    if (W.reflect) W.reflect.rt.dispose();
    if (W.envMap) W.envMap.dispose();
  }

  // ---------------------------------------------------------------- replay
  function recordFrame() {
    if (!G.recorder || G.replay) return;
    G.recAcc = (G.recAcc || 0) + 1;
    const arr = G._recBalls || (G._recBalls = []);
    arr.length = 0;
    for (const e of G.balls) {
      const m = ballMesh(e);
      arr.push({ visible: e.active, x: m.position.x, y: m.position.y, z: m.position.z, qx: m.quaternion.x, qy: m.quaternion.y, qz: m.quaternion.z, qw: m.quaternion.w });
    }
    G.recorder.capture(G.now, G.player.model, arr);
  }
  function playReplay(speed = 0.5) {
    const tr = G.lastShot;
    if (!tr || !G.recorder) { emit('toast', { text: 'No shot to replay yet', tone: 'info' }); return false; }
    const t0 = tr.startT - 0.6, t1 = Math.min(G.now, (tr.resolveT || G.now) + 1.2);
    const clip = G.recorder.clip(t0, t1, { shot: tr });
    if (!clip) return false;
    G.replay = { clip, t: 0, speed, len: clip.t1 - clip.t0, camMode: G.rig.mode };
    G.rig.setMode('side'); G.rig.snapNext();
    emit('replay', true);
    return true;
  }
  function stopReplay() {
    if (!G.replay) return;
    G.rig.setMode(G.replay.camMode); G.rig.snapNext();
    G.replay = null;
    emit('replay', false);
  }

  // ---------------------------------------------------------------- main loop
  let last = 0, acc = 0, fpsAcc = 0, fpsN = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!G.ready) return;
    const dt = Math.min(0.1, Math.max(0, (ts - (last || ts)) / 1000));
    last = ts;
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 0.5) { G.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
    processInput(dt);
    const t0 = performance.now();
    let alpha = 1;
    if (!G.paused && !G.replay && G.autoTick) {
      acc += dt;
      let n = 0;
      while (acc >= TICK && n < 24) { tick(TICK); acc -= TICK; n++; G.frame++; }
      if (n >= 24) acc = 0;
      alpha = acc / TICK;
    }
    const t1 = performance.now();
    render(dt, alpha);
    G.perf.tickMs = G.perf.tickMs * 0.9 + (t1 - t0) * 0.1;
    G.perf.renderMs = G.perf.renderMs * 0.9 + (performance.now() - t1) * 0.1;
    G.perf.frameMs = G.perf.frameMs * 0.9 + dt * 1000 * 0.1;
  }

  const _ballCtx = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  function render(dt, alpha) {
    const pl = G.player;
    let replayBalls = null;
    if (G.replay) {
      const R = G.replay;
      if (!G.paused) R.t += dt * R.speed;
      if (R.t > R.len + 0.4) R.t = 0;
      replayBalls = [];
      HoopReplay.apply(R.clip, Math.min(R.t, R.len), pl.model, G.W.ballMeshes, replayBalls);
    } else {
      pl.computePose(dt);
      HoopCharacters.applyPose(pl.model, pl.pose);
      if (HoopCharacters.update) HoopCharacters.update(pl.model, dt, pl.pose);
      syncVisuals(alpha);
      recordFrame();
    }
    // camera
    const tr = G.lastShot;
    let ball = null;
    if (tr && !tr.resolved && tr.entry.active) { const b = tr.entry.b; Object.assign(_ballCtx, { x: b.px, y: b.py, z: b.pz, vx: b.vx, vy: b.vy, vz: b.vz }); ball = _ballCtx; }
    else if (replayBalls && replayBalls.length) { Object.assign(_ballCtx, replayBalls[0], { vx: 0, vy: 0, vz: 0 }); ball = _ballCtx; }
    const px = G.replay ? pl.model.root.position.x : pl.x, pz = G.replay ? pl.model.root.position.z : pl.z;
    G.rig.update({ px, py: 0, pz, hoop: G.replay ? G.replay.clip.shot.hoop : pl.targetHoop, shooting: !!pl.shot, aligning: G.settings.autoAlign && pl.hasBall && pl.speed() < 0.3, ball, dt, now: G.now });
    if (G.W.update) G.W.update(dt, G.camera, G);
    if (G.W.reflect) G.W.reflect.render(G.renderer, G.W.scene, G.camera, [G.W.trail, G.W.guide, G.W.spotRing]);
    if (typeof HoopRender !== 'undefined' && HoopRender.render) HoopRender.render(G.renderer, G.W.scene, G.camera, dt, G);
    else G.renderer.render(G.W.scene, G.camera);
    if (typeof HoopPerf !== 'undefined' && HoopPerf.frame) HoopPerf.frame(dt, G);
    if (typeof HoopUI !== 'undefined' && HoopUI.frame) HoopUI.frame(dt);
  }

  function processInput(dt) {
    const s = HoopInput.sample();
    inputMove = { x: s.x, y: s.y, sprint: s.sprint, walk: s.walk };
    if (G.paused) inputMove = { x: 0, y: 0, sprint: false, walk: false };
    const padK = 520 * dt;
    if (!G.paused) {
      G.rig.manual(s.camDX + s.padCamX * padK, s.camDY + s.padCamY * padK, G.now);
      if (s.zoom) G.rig.zoom(s.zoom);
    }
    for (const ev of HoopInput.drain()) {
      if (ev.type === 'shootDown') onShootDown(ev.t);
      else if (ev.type === 'shootUp') onShootUp(ev.t);
      else if (G.paused && ev.type !== 'pause') continue;
      else if (ev.type === 'cross') { if (G.player.crossover()) emit('move', 'crossover'); }
      else if (ev.type === 'stepback') { if (G.player.stepback()) emit('move', 'stepback'); }
      else if (ev.type === 'ball') callBall();
      else if (ev.type === 'camera') { const l = G.rig.cycle(); G.settings.camMode = G.rig.mode; emit('toast', { text: `Camera: ${l}`, tone: 'info' }); }
      else if (ev.type === 'replay') { if (G.replay) stopReplay(); else playReplay(); }
      else if (ev.type === 'zoomIn') G.rig.zoom(-1);
      else if (ev.type === 'zoomOut') G.rig.zoom(1);
      else if (ev.type === 'mute') { G.settings.muted = !G.settings.muted; HoopAudio.setMuted(G.settings.muted); emit('toast', { text: G.settings.muted ? 'Sound off' : 'Sound on', tone: 'info' }); }
      else emit('ui', ev.type); // pause, stats, hud, fullscreen, gamepad connect… handled by the UI
    }
  }

  function setPaused(p) {
    if (G.paused === p) return;
    G.paused = p;
    if (p) { HoopInput.releaseLock(); if (HoopAudio.ready) HoopAudio.suspend(); }
    else if (HoopAudio.ready) HoopAudio.resume();
    emit('pause', p);
  }

  function setSetting(k, v) {
    G.settings[k] = v;
    if (k === 'quality') applyQuality(v);
    else if (k === 'resScale') resize();
    else if (k === 'camSens') G.rig.settings.sens = v;
    else if (k === 'camDist') G.rig.settings.dist = v;
    else if (k === 'fov') G.rig.settings.fov = v;
    else if (k === 'invertY') G.rig.settings.invertY = v;
    else if (k === 'camMode') G.rig.setMode(v);
    else if (k === 'muted') HoopAudio.setMuted(v);
    else if (k === 'master' || k === 'sfx' || k === 'amb') HoopAudio.setVolumes(G.settings.master, G.settings.sfx, G.settings.amb);
    saveSoon();
  }

  // ---------------------------------------------------------------- boot
  async function boot(opts = {}) {
    const saved = load();
    if (saved && saved.settings) Object.assign(G.settings, saved.settings);
    if (opts.settings) Object.assign(G.settings, opts.settings);
    G.store = HoopStats.createStore(saved && saved.stats);
    G.records = (saved && saved.records) || {};
    G.jumpers = (saved && saved.jumpers) || {};
    const host = opts.host || document.getElementById('app') || document.body;
    G.renderer = makeRenderer(host);
    G.camera = new THREE.PerspectiveCamera(G.settings.fov, window.innerWidth / window.innerHeight, 0.05, 160);
    G.rig = new HoopCamera.Rig(G.camera);
    Object.assign(G.rig.settings, { sens: G.settings.camSens, dist: G.settings.camDist, fov: G.settings.fov, invertY: G.settings.invertY });
    G.rig.setMode(HoopCamera.MODES.includes(G.settings.camMode) ? G.settings.camMode : 'game');
    resize();
    emit('progress', { p: 0.1, label: 'Building the gym' });
    await new Promise(r => setTimeout(r, 0));
    G.W = HoopWorld.build(G.renderer, G.settings.quality);
    emit('progress', { p: 0.4, label: 'Loading players' });
    const { models } = await HoopCharacters.loadAll(RO.CHARACTERS, HOOP_ASSETS, (p, def) => emit('progress', { p: 0.4 + 0.5 * p, label: def.name }));
    G.models = models;
    attachToWorld();
    for (let i = 0; i < MAX_BALLS; i++) G.balls.push(makeBallEntry(i));
    G.recorder = new HoopReplay.Recorder();
    selectCharacter((saved && saved.character) || opts.character || RO.CHARACTERS[0].id);
    startMode('free');
    HoopInput.attach(G.renderer.domElement);
    if (HoopAudio.attach) HoopAudio.attach(HoopGame);
    if (typeof HoopPerf !== 'undefined' && HoopPerf.attach) HoopPerf.attach(HoopGame);
    HoopAudio.setVolumes(G.settings.master, G.settings.sfx, G.settings.amb);
    HoopAudio.setMuted(G.settings.muted);
    const unlock = () => { if (HoopAudio.init()) { HoopAudio.setVolumes(G.settings.master, G.settings.sfx, G.settings.amb); HoopAudio.setMuted(G.settings.muted); HoopAudio.resume(); } };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => { if (document.hidden && G.ready) { setPaused(true); save(); } });
    window.addEventListener('beforeunload', save);
    G.ready = true;
    emit('progress', { p: 1, label: 'Ready' });
    emit('loaded', G);
    requestAnimationFrame(frame);
    return G;
  }

  // ---------------------------------------------------------------- automation / test API
  const api = {
    get G() { return G; },
    state() {
      const pl = G.player;
      return {
        ready: G.ready, paused: G.paused, now: G.now, fps: G.fps, perf: Object.assign({}, G.perf), character: G.def && G.def.id,
        mode: G.mode && G.mode.id, modeDone: !!(G.mode && G.mode.done), camera: G.rig && G.rig.mode, replay: !!G.replay,
        player: pl && { x: pl.x, z: pl.z, yaw: pl.yaw, hasBall: pl.hasBall, action: pl.action, shooting: !!pl.shot, targetHoop: pl.targetHoop, height: pl.dims.height },
        balls: G.balls.filter(e => e.active).map(e => ({ i: e.i, state: e.state, x: e.b.px, y: e.b.py, z: e.b.pz, resting: e.b.resting })),
        meter: { active: G.meter.active, lo: G.meter.lo, hi: G.meter.hi, T: G.meter.T, eMs: G.meter.eMs, grade: G.meter.grade, green: G.meter.green },
        lastShot: G.lastShot && shotSummary(G.lastShot), shots: G.shots.length,
        session: HoopStats.aggregate(HoopStats.filter(G.store, 'session')),
      };
    },
    shots() { return G.shots.map(shotSummary); },
    // run the simulation synchronously (no rendering). Use setAuto(false) first for deterministic tests.
    advance(sec) { const n = Math.round(sec / TICK); for (let i = 0; i < n; i++) { tick(TICK); G.frame++; } return api.state(); },
    render() { render(1 / 60, 1); },
    setAuto(v) { G.autoTick = v; },
    place(x, z, yaw) {
      const pl = G.player;
      const hi = x >= 0 ? 0 : 1, H = PH.HOOPS[hi];
      const had = pl.hasBall;
      pl.placeAt(x, z, yaw === undefined ? Math.atan2(H.cx - x, H.cz - z) : yaw);
      pl.hasBall = had; pl.targetHoop = hi;
      G.rig.yaw = pl.yaw; G.rig.snapNext();
      if (!pl.hasBall) ensureBallInHand();
      return api.state();
    },
    // start a shot now and release eMs from the ideal release point (0 = perfect)
    shoot(eMs = 0) {
      const pl = G.player;
      if (!pl.hasBall) ensureBallInHand();
      if (pl.action === 'catch' || pl.action === 'pickup') { pl.action = 'none'; }
      const t = performance.now();
      onShootDown(t);
      if (!pl.shot || !G.shotInput) return false;
      G.shotInput.upT = t; G.shotInput.releaseAt = Math.max(0.05, pl.shot.T + eMs / 1000);
      return true;
    },
    giveBall() { ensureBallInHand(); },
    select: selectCharacter, mode: startMode, setSetting, pause: setPaused, replay: playReplay, stopReplay,
    jumper: setJumper, input: (type, t) => HoopInput.push(type, t),
  };
  function shotSummary(tr) {
    return { id: tr.id, char: tr.char, dist: tr.dist, label: tr.label, three: tr.three, resolved: tr.resolved, made: tr.made, result: tr.result,
      missType: tr.missType, eMs: tr.eMs, grade: tr.grade, green: tr.green, relSpeed: tr.relSpeed, relAngle: tr.relAngle, spinRps: tr.spinRps,
      entryAngle: tr.entryAngle, apex: tr.apex, rimHits: tr.rimHits, boardHit: tr.boardHit, hoop: tr.hoop, releaseH: tr.releaseH };
  }
  if (typeof window !== 'undefined') window.HOOP = api;

  return {
    G, boot, on, emit, selectCharacter, setJumper, startMode, setPaused, setSetting, applyQuality, playReplay, stopReplay,
    callBall, save, api, DEFAULT_SETTINGS, TICK,
  };
})();
