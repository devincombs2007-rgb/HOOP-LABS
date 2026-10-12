// HOOP LAB — player controller + procedural animation (foot planting, dribble, moves, jump shot).
// Produces a world-space pose that HoopCharacters.applyPose turns into pivot rotations via IK.
const HoopPlayer = (() => {
  'use strict';
  const PH = HoopPhysics, K = PH.K;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const easeOut = (t) => { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t); };
  const easeIn = (t) => { t = clamp(t, 0, 1); return t * t; };
  const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const BR = K.BALL_R;

  // cubic Hermite through keyed points (Catmull-Rom tangents), non-uniform times
  function hermitePath(keys, t, out) {
    const n = keys.length;
    if (t <= keys[0].t) return out.copy(keys[0].p);
    if (t >= keys[n - 1].t) return out.copy(keys[n - 1].p);
    let i = 0; while (i < n - 2 && t > keys[i + 1].t) i++;
    const k0 = keys[i], k1 = keys[i + 1];
    const kp = keys[Math.max(0, i - 1)], kn = keys[Math.min(n - 1, i + 2)];
    const dt = k1.t - k0.t, u = (t - k0.t) / dt;
    const u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    for (const c of ['x', 'y', 'z']) {
      const m0 = i === 0 ? 0 : (k1.p[c] - kp.p[c]) / (k1.t - kp.t) * dt * (k0.hold ? 0 : 1);
      const m1 = i + 1 === n - 1 ? (k1.vEnd ? k1.vEnd[c] * dt : 0) : (kn.p[c] - k0.p[c]) / (kn.t - k0.t) * dt * (k1.hold ? 0 : 1);
      out[c] = h00 * k0.p[c] + h10 * m0 + h01 * k1.p[c] + h11 * m1;
    }
    return out;
  }

  class Player {
    constructor(model, def) {
      this.model = model; this.def = def; this.dims = model.dims;
      this.mv = def.move;
      this.x = K.HOOP_X - 6; this.z = 0; this.vx = 0; this.vz = 0; this.yaw = Math.PI / 2; this.faceYaw = this.yaw;
      this.hasBall = false; this.action = 'none'; this.actionT = 0;
      this.dribbleHand = 0; this.dribblePhase = 0; this.dribbling = false; this.holdT = 0;
      this.air = false; this.airY = 0; this.airVy = 0;
      this.offBalance = 0; this.lastCatch = -9; this.lastGather = -9; this.time = 0;
      this.targetHoop = 0;
      this.jumper = null; this.derived = null;
      this.shot = null;
      this.autopilot = null;
      this.ballPos = V(); this.ballQ = new THREE.Quaternion(); this.ballSpin = V();
      this.prevBallPos = V();
      this.events = [];
      this.gaitPhase = 0; this.gaitMode = false; this.squeakCd = 0; this.prevSpeed = 0;
      const H = model.dims.height;
      this.hs = H / 1.9812; // proportional scale relative to a 6'6" frame
      // feet: ground positions
      this.feet = [0, 1].map(i => ({ pos: V(), yaw: 0, planted: true, from: V(), to: V(), fromYaw: 0, toYaw: 0, u: 0, dur: 0.3, lift: 0.08, swinging: false, heel: 0 }));
      // smoothed limb targets
      this.sm = { hand: [V(), V()], handInit: false, pelvisDrop: 0, lean: 0, roll: 0, chestYaw: 0 };
      // pose output
      this.pose = {
        rootX: 0, rootZ: 0, pelvis: V(), pelvisQ: new THREE.Quaternion(), chestQ: new THREE.Quaternion(), headYaw: 0, headPitch: 0,
        hands: [0, 1].map(() => ({ wrist: V(), pole: V(), fingers: V(0, -1, 0), palm: V(0, 0, 1) })),
        feet: [0, 1].map(() => ({ ankle: V(), pole: V(), fwd: V(0, 0, 1), up: V(0, 1, 0) })),
      };
      this.tmp = { f: V(), r: V(), u: V(0, 1, 0), a: V(), b: V(), c: V(), d: V(), e: V(), q: new THREE.Quaternion(), eu: new THREE.Euler(0, 0, 0, 'YXZ') };
      this.placeAt(this.x, this.z, this.yaw);
    }

    setJumper(params, derived) { this.jumper = params; this.derived = derived; }

    placeAt(x, z, yaw) {
      this.x = x; this.z = z; this.vx = this.vz = 0; this.yaw = this.faceYaw = yaw;
      this.air = false; this.airY = 0; this.airVy = 0; this.gaitMode = false;
      this.action = 'none'; this.actionT = 0; this.shot = null; this.autopilot = null; this.dribbling = false; this.holdT = 1;
      const f = this.fwd(yaw), r = this.right(yaw);
      for (let i = 0; i < 2; i++) {
        const s = i === 0 ? 1 : -1, ft = this.feet[i];
        ft.pos.set(x, 0, z).addScaledVector(r, s * 0.15 * this.hs).addScaledVector(f, s * 0.03);
        ft.yaw = yaw - s * 0.12; ft.planted = true; ft.swinging = false; ft.heel = 0;
      }
      this.sm.handInit = false;
    }

    fwd(yaw, out = V()) { return out.set(Math.sin(yaw), 0, Math.cos(yaw)); }
    right(yaw, out = V()) { return out.set(-Math.cos(yaw), 0, Math.sin(yaw)); }
    speed() { return Math.hypot(this.vx, this.vz); }
    hoopYaw() { const H = PH.HOOPS[this.targetHoop]; return Math.atan2(H.cx - this.x, H.cz - this.z); }
    distToHoop() { return PH.distToHoop(this.x, this.z, this.targetHoop); }
    busy() { return this.action !== 'none' && this.action !== 'catch'; }
    canShoot() { return this.hasBall && (this.action === 'none' || this.action === 'catch' || this.action === 'stepback'); }
    emit(type, data) { this.events.push(Object.assign({ type }, data)); }

    // ------------------------------------------------------------------ actions
    startShot(now) {
      if (!this.canShoot() || !this.jumper) return false;
      if (this.action === 'stepback') { this.queuedShot = now; return true; }
      const p = this.jumper, d = this.derived;
      const catchShoot = now - this.lastCatch < 0.55 || now - this.lastGather < 0.5;
      const pullUp = this.speed() > 2.2;
      let T = d.releaseTime - (catchShoot ? 0.07 : 0) + (pullUp ? 0.035 : 0);
      T = Math.max(0.3, T);
      const v0 = Math.sqrt(2 * K.G * Math.max(0.005, d.jumpH));
      const tApex = v0 / K.G;
      let tTake = T - lerp(0.03, tApex, p.releaseTiming);
      tTake = Math.max(0.17, tTake);
      const tLoad = Math.max(0.09, tTake - 0.14);
      this.shot = {
        start: now, t: 0, T, v0, tApex, tTake, tLoad, released: false, releaseT: null, catchShoot, pullUp,
        startBall: null, keys: null, dropAfter: null, landed: false, faceYaw: this.hoopYaw(),
        guideOff: T * lerp(0.7, 1.03, p.guide), landT: tTake + 2 * tApex,
      };
      // capture the ball's current position in the body frame (path starts there: no pop)
      const f = this.fwd(this.yaw), r = this.right(this.yaw);
      const rel = this.tmp.a.copy(this.ballPos).sub(V(this.x, 0, this.z));
      this.shot.startBall = { r: rel.dot(r), u: this.ballPos.y, f: rel.dot(f) };
      this.buildShotKeys();
      this.action = 'shoot'; this.actionT = 0; this.dribbling = false;
      this.emit('shotStart', { catchShoot, pullUp });
      return true;
    }

    // ball path keys in the body frame (r, u = height when standing, f)
    buildShotKeys() {
      const s = this.shot, p = this.jumper, d = this.dims, hs = this.hs;
      const sh = { r: d.shoulderHalf, u: d.shoulderY, f: 0.02 };
      const pocket = { r: 0.12, u: lerp(d.hipsY + 0.06, d.shoulderY + 0.02, p.pocket), f: 0.27 * hs };
      const dip = { r: 0.12, u: pocket.u - 0.24 * p.dip * hs, f: pocket.f + 0.03 };
      const setP = { r: 0.06, u: d.shoulderY + lerp(0.2, 0.46, p.setPoint) * hs, f: (0.08 + 0.16 * p.extension) * hs };
      const alpha = clamp(lerp(82, 46, p.extension) + 10 * (p.setPoint - 0.5), 40, 88) * Math.PI / 180;
      const reach = d.armLen * 0.9 + d.palm * 0.9;
      const theta = 52 * Math.PI / 180; // nominal launch direction for the ball-on-hand offset
      const rel = {
        r: sh.r - 0.11 * hs,
        u: sh.u + Math.sin(alpha) * reach + Math.sin(theta) * (BR + 0.012),
        f: sh.f + Math.cos(alpha) * reach + Math.cos(theta) * (BR + 0.012),
      };
      // one-motion path: start -> dip -> rising via point -> release
      const via = { r: lerp(pocket.r, rel.r, 0.5), u: lerp(dip.u, rel.u, 0.45) + 0.04, f: lerp(dip.f, rel.f, 0.5) + 0.03 };
      const tDip = clamp(0.3 * s.T + 0.05 * p.dip, 0.08, 0.26) * (s.catchShoot ? 0.6 : 1);
      s.tDip = tDip;
      const P = (o) => V(o.r, o.u, o.f);
      const start = P(s.startBall);
      const relV = V(-0.2, Math.sin(alpha) * 3.2, Math.cos(alpha) * 3.2); // hand keeps moving through release
      const one = [ { t: 0, p: start }, { t: tDip, p: P(dip) }, { t: lerp(tDip, s.T, 0.5), p: P(via) }, { t: s.T, p: P(rel), vEnd: relV } ];
      const tSet = Math.max(tDip + 0.08, s.T - 0.19), tHold = Math.max(tSet + 0.02, s.T - 0.11);
      const two = [ { t: 0, p: start }, { t: tDip, p: P(dip) }, { t: tSet, p: P(setP), hold: true }, { t: tHold, p: P(setP).add(V(0, 0.015, 0.01)), hold: true }, { t: s.T, p: P(rel), vEnd: relV } ];
      s.keys = { one, two, rel: P(rel), alpha, setP: P(setP), pocket: P(pocket) };
    }

    // ball center in world at shot time t (assumes current root position/yaw)
    shotBallWorld(t, out = V()) {
      const s = this.shot, p = this.jumper;
      const a = hermitePath(s.keys.one, t, this.tmp.c);
      const b = hermitePath(s.keys.two, t, this.tmp.d);
      a.lerp(b, p.motion);
      if (t > s.T) { // follow-through extrapolation (only matters for the hand)
        const k = Math.min(t - s.T, 0.12);
        a.y += Math.sin(s.keys.alpha) * 2.2 * k; a.z += Math.cos(s.keys.alpha) * 2.2 * k;
      }
      const lift = this.pelvisOffsetAt(t);
      const f = this.fwd(this.yaw, this.tmp.f), r = this.right(this.yaw, this.tmp.r);
      out.set(this.x, a.y + lift, this.z).addScaledVector(r, a.x).addScaledVector(f, a.z);
      return out;
    }

    // vertical body offset during the shot relative to standing (load, toe rise, flight, landing)
    pelvisOffsetAt(t) {
      const s = this.shot, p = this.jumper;
      if (!s) return 0;
      const load = lerp(0.035, 0.16, p.knee) * this.hs;
      const toe = 0.035 * this.hs;
      if (t < s.tLoad) return -load * smooth(t / s.tLoad);
      if (t < s.tTake) return -load + (load + toe) * easeOut((t - s.tLoad) / (s.tTake - s.tLoad));
      const tau = t - s.tTake, tAir = 2 * s.tApex;
      if (tau < tAir) return toe + s.v0 * tau - 0.5 * K.G * tau * tau;
      const tl = tau - tAir;
      return toe * Math.max(0, 1 - tl / 0.06) - (0.09 + 0.06 * p.jump) * this.hs * Math.sin(Math.min(1, tl / 0.34) * Math.PI) * Math.exp(-tl * 2);
    }
    bodyVyAt(t) {
      const dt = 0.004;
      return (this.pelvisOffsetAt(t + dt) - this.pelvisOffsetAt(t - dt)) / (2 * dt);
    }

    predictReleasePos(out = V()) { return this.shotBallWorld(this.shot.T, out); }

    // returns release info; the game converts it into ball physics
    release(tRelease) {
      const s = this.shot;
      if (!s || s.released) return null;
      s.released = true; s.releaseT = tRelease;
      const pos = this.shotBallWorld(tRelease, V());
      const bodyV = { vx: this.vx, vy: this.bodyVyAt(tRelease), vz: this.vz };
      this.hasBall = false;
      this.emit('release', {});
      return { pos, eSec: tRelease - s.T, bodyV, offBalance: this.offBalance };
    }

    pumpFake() {
      if (!this.shot || this.shot.released || this.shot.t > 0.16) return false;
      this.shot = null; this.action = 'none'; this.holdT = 0;
      this.emit('pumpFake', {});
      return true;
    }

    crossover() {
      if (!this.hasBall || this.busy()) return false;
      this.action = 'cross'; this.actionT = 0;
      const to = 1 - this.dribbleHand;
      const r = this.right(this.yaw);
      const s = to === 0 ? 1 : -1;
      this.vx += r.x * s * 2.0; this.vz += r.z * s * 2.0;
      this.crossFrom = this.ballPos.clone(); this.crossTo = to;
      this.offBalance = Math.max(this.offBalance, 0.35);
      this.emit('move', { name: 'crossover' });
      return true;
    }

    stepback() {
      if (!this.hasBall || this.busy()) return false;
      this.action = 'stepback'; this.actionT = 0; this.dribbling = false;
      this.faceYaw = this.hoopYaw();
      const f = this.fwd(this.faceYaw);
      const v = this.mv.stepback / 0.42 * 1.55;
      this.vx = -f.x * v; this.vz = -f.z * v;
      this.sbFrom = this.ballPos.clone();
      this.emit('move', { name: 'stepback' });
      return true;
    }

    jump() {
      if (this.hasBall || this.air || this.busy()) return false;
      this.action = 'jump'; this.actionT = 0;
      this.air = true; this.airY = 0; this.airVy = Math.sqrt(2 * K.G * this.mv.maxLeap * 0.85);
      this.emit('jump', {});
      return true;
    }

    giveBall(now, how) { // catch / pickup completion
      this.hasBall = true; this.lastCatch = now; this.dribbling = false; this.holdT = 0;
      if (this.action === 'jump' || this.action === 'pickup') { /* keep landing logic */ }
      if (!this.air) { this.action = 'catch'; this.actionT = 0; }
      this.emit('catch', { how });
    }

    // ------------------------------------------------------------------ update
    update(dt, inp, now) {
      this.time = now;
      this.events.length = 0;
      const mv = this.mv;
      this.offBalance = Math.max(0, this.offBalance - dt * 1.4);
      this.squeakCd -= dt;
      if (this.action !== 'none') this.actionT += dt;
      // ---- desired velocity
      let dx = 0, dz = 0, spd = 0;
      if (this.autopilot) {
        const ap = this.autopilot;
        const ex = ap.x - this.x, ez = ap.z - this.z, dist = Math.hypot(ex, ez);
        if (dist < 0.06) { this.x = ap.x; this.z = ap.z; this.vx *= 0.5; this.vz *= 0.5; this.faceYaw = ap.yaw; if (Math.abs(wrapPi(this.yaw - ap.yaw)) < 0.05 && this.speed() < 0.3) { this.autopilot = null; this.emit('arrived', {}); } }
        else { dx = ex / dist; dz = ez / dist; spd = Math.min(mv.sprint * 0.85, 1.2 + dist * 2.2); }
      } else if (inp) {
        const m = Math.min(1, Math.hypot(inp.mx, inp.mz));
        if (m > 0.08) {
          dx = inp.mx / m; dz = inp.mz / m;
          spd = inp.sprint ? mv.sprint : inp.walk ? mv.walk : lerp(mv.walk, mv.jog, clamp((m - 0.1) / 0.7, 0, 1));
          if (this.hasBall) spd *= 0.93;
        }
      }
      const act = this.action;
      if (act === 'shoot' || act === 'pickup' || act === 'catch') spd *= act === 'catch' ? 0.5 : 0;
      if (act === 'stepback' || act === 'cross') spd = 0;
      // ---- velocity integration (no control in the air)
      if (!this.air && !(act === 'shoot' && this.shot && this.shot.t > this.shot.tTake && this.shot.t < this.shot.landT)) {
        const tx = dx * spd, tz = dz * spd;
        let ex = tx - this.vx, ez = tz - this.vz;
        const el = Math.hypot(ex, ez);
        const cur = this.speed();
        const decel = (act === 'shoot' ? mv.decel * 1.5 : act === 'stepback' || act === 'cross' ? mv.decel * 0.9 : mv.decel);
        const accelerating = (tx * this.vx + tz * this.vz) > 0 && Math.hypot(tx, tz) > cur;
        const a = (accelerating ? mv.accel : decel) * dt;
        if (el > a) { ex *= a / el; ez *= a / el; }
        this.vx += ex; this.vz += ez;
        // squeaks on hard cuts / stops
        if (cur > 3.2 && spd > 1 && (tx * this.vx + tz * this.vz) / (Math.hypot(tx, tz) * cur + 1e-6) < 0.2 && this.squeakCd <= 0) { this.emit('squeak', { v: cur }); this.squeakCd = 0.45; }
        if (this.prevSpeed > 4.5 && cur < 2.0 && this.squeakCd <= 0) { this.emit('squeak', { v: this.prevSpeed }); this.squeakCd = 0.45; }
      } else {
        this.vx *= Math.exp(-0.15 * dt); this.vz *= Math.exp(-0.15 * dt);
      }
      this.prevSpeed = this.speed();
      this.x += this.vx * dt; this.z += this.vz * dt;
      // keep inside the arena floor
      this.x = clamp(this.x, -K.ARENA_X + 0.6, K.ARENA_X - 0.6);
      this.z = clamp(this.z, -K.BLEACH_Z + 0.5, K.BLEACH_Z - 0.5);
      // ---- facing
      const cs = this.speed();
      if (act === 'shoot' || act === 'stepback') this.faceYaw = this.hoopYaw();
      else if (this.autopilot && Math.hypot(this.autopilot.x - this.x, this.autopilot.z - this.z) > 0.3) this.faceYaw = Math.atan2(dx, dz);
      else if (this.autopilot) this.faceYaw = this.autopilot.yaw;
      else if (cs > 0.35 && spd > 0) this.faceYaw = Math.atan2(this.vx, this.vz);
      else if (this.hasBall && cs < 0.35 && !inp?.freeLook) this.faceYaw = this.hoopYaw();
      const turnRate = (act === 'shoot' ? 14 : act === 'none' && this.hasBall && cs < 0.35 ? 6 : mv.turn / (1 + 0.12 * cs));
      const dyaw = wrapPi(this.faceYaw - this.yaw);
      this.yaw += clamp(dyaw, -turnRate * dt, turnRate * dt);
      this.yaw = wrapPi(this.yaw);
      // ---- jump (no ball)
      if (this.air && act === 'jump') {
        this.airVy -= K.G * dt; this.airY += this.airVy * dt;
        if (this.airY <= 0) { this.airY = 0; this.air = false; this.action = this.hasBall ? 'catch' : 'none'; this.actionT = 0; this.emit('land', { v: -this.airVy }); this.replantFeet(0.0); }
      }
      // ---- actions
      if (act === 'shoot') this.updateShot(dt, now);
      else if (act === 'cross' && this.actionT >= mv.crossTime) { this.action = 'none'; this.dribbleHand = this.crossTo; this.dribblePhase = 0.02; this.dribbling = this.speed() > 0.4; }
      else if (act === 'stepback') {
        if (this.actionT >= 0.42) {
          this.action = 'none'; this.lastGather = now; this.offBalance = Math.max(this.offBalance, 0.5); this.holdT = 1;
          if (this.queuedShot !== undefined && this.queuedShot !== null) { this.queuedShot = null; this.startShot(now); this.emit('autoShotFromStepback', {}); }
        }
      } else if (act === 'catch' && this.actionT > 0.18) this.action = 'none';
      else if (act === 'pickup' && this.actionT > 0.26) this.action = 'none';
      // ---- ball handling when not shooting
      if (this.hasBall && this.action !== 'shoot') this.updateBallCarry(dt, now);
      // ---- feet
      this.updateFeet(dt);
      return this.events;
    }

    updateShot(dt, now) {
      const s = this.shot;
      s.t += dt;
      if (s.t >= s.tTake && !s.tookOff) { s.tookOff = true; if (this.derived.jumpH > 0.06) this.emit('jump', {}); }
      if (s.t >= s.landT && !s.landed) { s.landed = true; this.emit('land', { v: s.v0 }); this.replantFeet(0); }
      if (!s.released) this.ballPos.copy(this.shotBallWorld(s.t, this.tmp.e));
      if (s.released && s.t > Math.max(s.landT + 0.32, s.releaseT + 0.55)) {
        this.action = 'none'; this.shot = null;
        if (this.hasBall) this.holdT = 1;
      }
    }

    // dribble / hold / crossover / stepback ball path
    updateBallCarry(dt, now) {
      const f = this.fwd(this.yaw, this.tmp.f), r = this.right(this.yaw, this.tmp.r), d = this.dims, hs = this.hs;
      const root = this.tmp.a.set(this.x, 0, this.z);
      const top = this.mv.dribbleTop * hs;
      const moving = this.speed() > 0.45 || (this.autopilot && Math.hypot(this.autopilot.x - this.x, this.autopilot.z - this.z) > 0.3);
      const holdPos = (out) => out.copy(root).addScaledVector(r, 0.2 * hs).addScaledVector(f, 0.24 * hs).setY(d.hipsY + 0.1 * hs);
      if (this.action === 'cross') {
        const T = this.mv.crossTime, u = this.actionT / T;
        const toS = this.crossTo === 0 ? 1 : -1;
        const fromP = this.crossFrom, toTop = this.tmp.b.copy(root).addScaledVector(r, toS * 0.3 * hs).addScaledVector(f, 0.4 * hs).setY(top);
        const mid = this.tmp.c.copy(root).addScaledVector(f, 0.5 * hs).setY(BR);
        if (u < 0.42) { const k = easeIn(u / 0.42); this.ballPos.lerpVectors(fromP, mid, k); this.ballPos.y = lerp(fromP.y, BR, k); }
        else { if (!this.crossBounced) { this.crossBounced = true; this.emit('dribble', { v: 5 }); } const k = easeOut((u - 0.42) / 0.58); this.ballPos.lerpVectors(mid, toTop, k); }
        this.ballSpin.set(0, 0, 0);
        return;
      }
      this.crossBounced = false;
      if (this.action === 'stepback') {
        const k = smooth(this.actionT / 0.28);
        holdPos(this.tmp.b); this.tmp.b.addScaledVector(r, -0.08).y += 0.12 * hs;
        this.ballPos.lerpVectors(this.sbFrom, this.tmp.b, k);
        return;
      }
      if (this.action === 'pickup') return; // game moves the ball
      if (this.action === 'catch') { this.holdT = 1; }
      // dribble when moving; settle into a hold when standing
      if (moving && !this.dribbling) { this.dribbling = true; this.dribblePhase = 0; }
      const side = this.dribbleHand === 0 ? 1 : -1;
      if (this.dribbling) {
        const hz = this.mv.dribbleHz * (1 + 0.18 * this.speed() / this.mv.sprint);
        const prev = this.dribblePhase;
        this.dribblePhase += dt * hz;
        if (prev < 0.42 && this.dribblePhase >= 0.42) this.emit('dribble', { v: 4 + this.speed() * 0.3 });
        if (this.dribblePhase >= 1) { this.dribblePhase -= 1; if (!moving) { this.dribbling = false; this.holdT = 0; } }
        const ph = this.dribblePhase;
        const base = this.tmp.b.copy(root).addScaledVector(r, side * 0.27 * hs).addScaledVector(f, (0.42 + 0.03 * this.speed()) * hs);
        base.x += this.vx * 0.05; base.z += this.vz * 0.05;
        let y;
        if (ph < 0.42) y = top - (top - BR) * easeIn(ph / 0.42);
        else y = BR + (top - BR) * easeOut((ph - 0.42) / 0.58);
        this.ballPos.set(base.x, y, base.z);
        this.ballSpin.copy(r).multiplyScalar(-this.speed() / BR * 0.9);
        this.dribbleTop = top;
      } else {
        // hold (triple threat) — ease from wherever the ball was
        this.holdT = Math.min(1, this.holdT + dt * 6);
        holdPos(this.tmp.b);
        this.ballPos.lerp(this.tmp.b, this.holdT >= 1 ? 1 : smooth(this.holdT) * 0.5 + 0.1);
        this.ballSpin.set(0, 0, 0);
      }
    }

    replantFeet() {
      const f = this.fwd(this.yaw), r = this.right(this.yaw), p = this.jumper || { footWidth: 0.5, footStagger: 0.3 };
      const halfW = lerp(0.11, 0.28, p.footWidth) * this.hs, stag = p.footStagger * 0.24 * this.hs;
      for (let i = 0; i < 2; i++) {
        const s = i === 0 ? 1 : -1, ft = this.feet[i];
        ft.pos.set(this.x, 0, this.z).addScaledVector(r, s * halfW).addScaledVector(f, s * stag * 0.5 + this.speed() * 0.02);
        ft.yaw = this.yaw - s * 0.18; ft.planted = true; ft.swinging = false; ft.heel = 0;
      }
      this.gaitMode = false;
    }

    // foot placement: cyclic gait when moving, corrective re-steps when standing/turning
    updateFeet(dt) {
      const sp = this.speed();
      const f = this.fwd(this.yaw), r = this.right(this.yaw), hs = this.hs;
      const shooting = this.action === 'shoot' && this.shot;
      const airborne = this.air || (shooting && this.shot.t >= this.shot.tTake && this.shot.t < this.shot.landT);
      if (airborne) { for (const ft of this.feet) ft.planted = false; return; }
      if (shooting && !this.feet[0].planted) this.replantFeet();
      const p = this.jumper || { footWidth: 0.5, footStagger: 0.3 };
      const halfW = (shooting ? lerp(0.11, 0.28, p.footWidth) : sp > 0.6 ? 0.1 : 0.15) * hs;
      const stag = shooting ? p.footStagger * 0.24 * hs : 0.03;
      const desired = (i, lead, out) => {
        const s = i === 0 ? 1 : -1;
        return out.set(this.x + this.vx * lead, 0, this.z + this.vz * lead).addScaledVector(r, s * halfW).addScaledVector(f, s * stag * 0.5);
      };
      const footYaw = (i) => this.yaw - (i === 0 ? 1 : -1) * (sp > 0.6 ? 0.05 : 0.16);
      if (sp > 0.6 && !shooting) {
        // ----- cyclic gait
        const cadence = 1.8 + 0.34 * sp;                 // steps per second
        const stanceFrac = clamp(0.62 - 0.035 * sp, 0.34, 0.62);
        const cycleHz = cadence / 2;
        if (!this.gaitMode) { // pick the phase so the foot furthest behind lifts first
          this.gaitMode = true;
          const rel0 = this.tmp.c.copy(this.feet[0].pos).sub(this.tmp.d.set(this.x, 0, this.z)).dot(f);
          const rel1 = this.tmp.c.copy(this.feet[1].pos).sub(this.tmp.d.set(this.x, 0, this.z)).dot(f);
          this.gaitPhase = rel0 < rel1 ? stanceFrac - 0.001 : stanceFrac + 0.499;
        }
        this.gaitPhase = (this.gaitPhase + dt * cycleHz) % 1;
        const tStance = stanceFrac / cycleHz;
        for (let i = 0; i < 2; i++) {
          const ft = this.feet[i];
          const ph = (this.gaitPhase + 0.5 * i) % 1;
          if (ph < stanceFrac) {
            if (ft.swinging) { ft.swinging = false; ft.planted = true; ft.pos.copy(ft.to); ft.yaw = ft.toYaw; this.emit('footstep', { v: sp }); }
            // heel rises toward toe-off
            ft.heel = smooth((ph / stanceFrac - 0.55) / 0.45) * 0.10 * hs;
          } else {
            const u = (ph - stanceFrac) / (1 - stanceFrac);
            if (!ft.swinging) { ft.swinging = true; ft.planted = false; ft.from.copy(ft.pos); ft.fromYaw = ft.yaw; }
            const remain = (1 - ph) / cycleHz;
            desired(i, remain + tStance * 0.5, ft.to);
            ft.toYaw = footYaw(i);
            ft.pos.lerpVectors(ft.from, ft.to, smooth(u));
            ft.pos.y = Math.sin(u * Math.PI) * (0.06 + 0.022 * sp) * hs;
            ft.yaw = ft.fromYaw + wrapPi(ft.toYaw - ft.fromYaw) * smooth(u);
            ft.heel = (1 - smooth(u * 2)) * 0.10 * hs;
          }
        }
        return;
      }
      // ----- re-step mode (standing, turning, shuffling, shot set-up)
      if (this.gaitMode) { // finish swings
        this.gaitMode = false;
        for (const ft of this.feet) if (ft.swinging) { ft.dur = 0.14; ft.u = 0; ft.from.copy(ft.pos); }
      }
      const dur = shooting ? 0.11 : clamp(0.3 - 0.05 * sp, 0.16, 0.3);
      for (let i = 0; i < 2; i++) {
        const ft = this.feet[i], other = this.feet[1 - i];
        if (ft.swinging) {
          ft.u += dt / ft.dur;
          desired(i, 0.12, ft.to); ft.toYaw = footYaw(i);
          const u = Math.min(1, ft.u);
          ft.pos.lerpVectors(ft.from, ft.to, smooth(u));
          ft.pos.y = Math.sin(u * Math.PI) * 0.06 * hs;
          ft.yaw = ft.fromYaw + wrapPi(ft.toYaw - ft.fromYaw) * smooth(u);
          ft.heel = 0;
          if (u >= 1) { ft.swinging = false; ft.planted = true; ft.pos.y = 0; this.emit('footstep', { v: 0.5 }); }
          continue;
        }
        ft.heel = Math.max(0, ft.heel - dt * 0.6);
        if (other.swinging) continue;
        desired(i, 0.12, this.tmp.c);
        const dev = Math.hypot(ft.pos.x - this.tmp.c.x, ft.pos.z - this.tmp.c.z);
        const yawDev = Math.abs(wrapPi(ft.yaw - footYaw(i)));
        if (dev > (shooting ? 0.05 : 0.09) * hs || yawDev > 0.6) {
          // step the foot with the larger error first
          const odev = Math.hypot(other.pos.x - desired(1 - i, 0.12, this.tmp.d).x, other.pos.z - this.tmp.d.z);
          if (odev > dev * 1.15) continue;
          ft.swinging = true; ft.planted = false; ft.u = 0; ft.dur = dur; ft.from.copy(ft.pos); ft.fromYaw = ft.yaw;
        }
      }
    }

    // ------------------------------------------------------------------ pose generation
    computePose(dt) {
      const P = this.pose, d = this.dims, hs = this.hs, tm = this.tmp, sm = this.sm;
      const yaw = this.yaw;
      const f = this.fwd(yaw, V()), r = this.right(yaw, V()), u = tm.u;
      const sp = this.speed();
      const s = this.action === 'shoot' ? this.shot : null;
      const p = this.jumper;
      P.rootX = this.x; P.rootZ = this.z;
      // ---------- pelvis height
      let drop = 0.035 * hs + (this.hasBall ? 0.025 * hs : 0); // athletic stance
      if (this.gaitMode) drop += (0.03 + 0.008 * sp) * hs + Math.cos(this.gaitPhase * 4 * Math.PI) * (0.012 + 0.004 * sp) * hs;
      if (this.action === 'cross') drop += Math.sin(Math.min(1, this.actionT / this.mv.crossTime) * Math.PI) * 0.07 * hs;
      if (this.action === 'stepback') drop += -Math.sin(Math.min(1, this.actionT / 0.42) * Math.PI) * 0.05 * hs + 0.03 * hs;
      if (this.action === 'catch') drop += Math.sin(Math.min(1, this.actionT / 0.18) * Math.PI) * 0.04 * hs;
      if (this.action === 'pickup') drop += Math.sin(Math.min(1, this.actionT / 0.26) * Math.PI) * clamp(1.05 - this.pickupH, 0.05, 0.42) * hs;
      sm.pelvisDrop += (drop - sm.pelvisDrop) * (1 - Math.exp(-14 * dt));
      let pelvisY = d.hipsY - sm.pelvisDrop + this.airY;
      if (s) pelvisY = d.hipsY - 0.03 * hs + this.pelvisOffsetAt(s.t);
      // keep planted legs reachable
      const reach = d.legLen * 0.995;
      for (const ft of this.feet) {
        if (!ft.planted) continue;
        const hip = tm.a.set(this.x, 0, this.z).addScaledVector(r, (ft === this.feet[0] ? 1 : -1) * d.hipHalf);
        const hd = Math.hypot(ft.pos.x - hip.x, ft.pos.z - hip.z);
        const maxY = d.ankleY + ft.heel + Math.sqrt(Math.max(0.01, reach * reach - hd * hd));
        if (pelvisY > maxY) pelvisY = maxY;
      }
      P.pelvis.set(this.x, pelvisY, this.z);
      // ---------- torso orientation
      let lean = 0.05 + (this.gaitMode ? 0.02 * sp : 0) + (this.hasBall && !s ? 0.06 : 0);
      let roll = 0, chestYawOff = 0;
      if (this.action === 'cross') roll = (this.crossTo === 0 ? -1 : 1) * 0.12 * Math.sin(Math.min(1, this.actionT / this.mv.crossTime) * Math.PI);
      if (this.action === 'stepback') lean = 0.18 - 0.2 * smooth(this.actionT / 0.42);
      if (this.action === 'pickup') lean = 0.25 + 0.35 * Math.sin(Math.min(1, this.actionT / 0.26) * Math.PI) * clamp(1 - this.pickupH, 0, 1);
      if (s) {
        const prog = clamp(s.t / s.T, 0, 1.4);
        lean = lerp(0.12 + 0.06 * p.knee, 0.02 + p.lean * 0.2, smooth((s.t - s.tLoad) / (s.T - s.tLoad + 0.001)));
        chestYawOff = -p.footStagger * 0.22 * (1 - prog * 0.3); // shooting shoulder turned slightly toward the rim
      }
      sm.lean += (lean - sm.lean) * (1 - Math.exp(-10 * dt));
      sm.roll += (roll - sm.roll) * (1 - Math.exp(-12 * dt));
      tm.eu.set(sm.lean * 0.35, yaw, sm.roll * 0.5, 'YXZ'); P.pelvisQ.setFromEuler(tm.eu);
      const armSwingTwist = this.gaitMode ? Math.sin(this.gaitPhase * 2 * Math.PI) * 0.1 : 0;
      tm.eu.set(sm.lean, yaw + chestYawOff + armSwingTwist, sm.roll, 'YXZ'); P.chestQ.setFromEuler(tm.eu);
      // shoulder world positions (forward kinematics from the measured offsets)
      const sc = d.scale;
      const spinePos = tm.b.copy(d.spineLocal).multiplyScalar(sc).applyQuaternion(P.pelvisQ).add(P.pelvis);
      const shoulders = [0, 1].map(i => d.shoulderLocal[this.model.sideNames[i] === this.model.sideNames[0] ? 0 : 1].clone().multiplyScalar(sc).applyQuaternion(P.chestQ).add(spinePos));
      // ---------- head look
      const H = PH.HOOPS[this.targetHoop];
      let lookX, lookY, lookZ;
      if (s || (this.hasBall && sp < 0.5)) { lookX = H.cx; lookY = K.RIM_TOP; lookZ = H.cz; }
      else { lookX = this.x + f.x * 4; lookY = d.headY * 0.92; lookZ = this.z + f.z * 4; }
      const headPos = spinePos.y + (d.neckLocal.y + d.headLocal.y) * sc;
      const hyaw = Math.atan2(lookX - this.x, lookZ - this.z);
      let rel = wrapPi(hyaw - yaw); rel = clamp(rel, -1.1, 1.1);
      P.headYaw = yaw + rel;
      P.headPitch = clamp(-Math.atan2(lookY - headPos, Math.hypot(lookX - this.x, lookZ - this.z)), -0.6, 0.5);
      // ---------- hands
      this.computeHands(dt, f, r, shoulders, s);
      // ---------- feet
      for (let i = 0; i < 2; i++) {
        const ft = this.feet[i], o = P.feet[i];
        const side = i === 0 ? 1 : -1;
        if (!ft.planted && (this.air || (s && s.t >= s.tTake && s.t < s.landT))) {
          // airborne: legs hang under the hips, toes pointed
          const hip = tm.c.copy(d.hipLocal[i]).multiplyScalar(sc).applyQuaternion(P.pelvisQ).add(P.pelvis);
          o.ankle.copy(hip).addScaledVector(u, -d.legLen * 0.93).addScaledVector(f, 0.05 * hs).addScaledVector(r, side * 0.02);
          // blend from takeoff (first 80 ms)
          const tAir = s ? s.t - s.tTake : this.actionT;
          if (tAir < 0.08) { const k = smooth(tAir / 0.08); o.ankle.lerpVectors(tm.d.set(ft.pos.x, d.ankleY + 0.06, ft.pos.z), o.ankle, k); }
          o.fwd.copy(f).addScaledVector(u, -0.5).normalize(); o.up.copy(u).addScaledVector(f, 0.4).normalize();
          ft.pos.set(o.ankle.x, 0, o.ankle.z); ft.yaw = yaw - side * 0.1;
        } else {
          o.ankle.set(ft.pos.x, d.ankleY + ft.pos.y + ft.heel, ft.pos.z);
          this.fwd(ft.yaw, o.fwd);
          o.up.set(0, 1, 0);
          if (ft.heel > 0.005) { o.fwd.addScaledVector(u, -ft.heel * 3).normalize(); o.up.addScaledVector(this.fwd(ft.yaw, tm.d), ft.heel * 3).normalize(); }
        }
        o.pole.copy(f).addScaledVector(r, side * 0.18).normalize(); // knees forward, slightly out
      }
    }

    computeHands(dt, f, r, shoulders, s) {
      const P = this.pose, d = this.dims, hs = this.hs, tm = this.tmp, u = tm.u, sm = this.sm;
      const p = this.jumper;
      const targets = [V(), V()], fingers = [V(), V()], palms = [V(), V()], poles = [V(), V()];
      let snap = [false, false];
      const ball = this.ballPos;
      const handOnBall = (i, dirFromBall, palmFacing, fingerDir) => {
        targets[i].copy(ball).addScaledVector(dirFromBall, BR + 0.012);
        palms[i].copy(palmFacing); fingers[i].copy(fingerDir); snap[i] = true;
      };
      const hang = (i, fwdOff, outOff, upOff) => {
        const side = i === 0 ? 1 : -1;
        targets[i].copy(shoulders[i]).addScaledVector(u, -(d.armLen * 0.9 + d.palm) + upOff).addScaledVector(f, fwdOff).addScaledVector(r, side * outOff);
        fingers[i].set(0, -1, 0).addScaledVector(f, 0.15).normalize(); palms[i].copy(r).multiplyScalar(-side);
      };
      const side0 = 1, side1 = -1;
      poles[0].copy(u).multiplyScalar(-0.5).addScaledVector(f, -1).addScaledVector(r, 0.4).normalize();
      poles[1].copy(u).multiplyScalar(-0.5).addScaledVector(f, -1).addScaledVector(r, -0.4).normalize();

      if (s) {
        // ------------- jump shot
        const T = s.T, t = s.t;
        const prog = clamp(t / T, 0, 1);
        const shotDir = tm.c.copy(f).multiplyScalar(Math.cos(0.9)).addScaledVector(u, Math.sin(0.9)).normalize();
        const under = tm.d.copy(u).multiplyScalar(-0.75).addScaledVector(f, -0.6).addScaledVector(r, 0.15).normalize();
        // palm normal (palm -> ball) turns from "under the ball" to the launch direction
        const nrm = V().copy(under).negate().lerp(shotDir, smooth(prog * 1.1)).normalize();
        const flickStart = T - 0.05 + (p.flick - 0.5) * 0.07;
        const fk = smooth((t - flickStart) / 0.12);
        const cocked = V().copy(u).addScaledVector(nrm, -u.dot(nrm)).normalize().addScaledVector(f, -0.25).normalize();
        const goose = V().copy(f).multiplyScalar(0.55).addScaledVector(u, -0.8).normalize();
        const fing = V().copy(cocked).lerp(goose, fk).normalize();
        if (!s.released) {
          handOnBall(0, V().copy(nrm).negate(), nrm, fing);
        } else {
          // follow-through: arm stays extended toward the rim, wrist goosenecked
          const relBall = this.shotBallWorld(Math.min(t, s.releaseT + 0.12), V());
          targets[0].copy(relBall).addScaledVector(nrm, -(BR + 0.012));
          const hold = t - s.releaseT > 0.55 + 0.2 * p.flick ? smooth((t - s.releaseT - 0.55 - 0.2 * p.flick) / 0.3) : 0;
          if (hold > 0) { const hang0 = V().copy(shoulders[0]).addScaledVector(u, -(d.armLen * 0.85)).addScaledVector(f, 0.15); targets[0].lerp(hang0, hold); }
          palms[0].copy(nrm).lerp(V(0, -1, 0), fk * 0.6).normalize(); fingers[0].copy(fing);
        }
        poles[0].copy(u).multiplyScalar(-1).addScaledVector(r, lerp(0.05, 0.9, p.elbow)).addScaledVector(f, -0.1).normalize();
        // guide hand: side of the ball; heavy involvement wraps it more behind (two-hand push look)
        const wrap = p.guide * 0.7;
        const gdir = V().copy(r).multiplyScalar(-Math.cos(wrap)).addScaledVector(f, -Math.sin(wrap) * 0.7).addScaledVector(u, -0.1).normalize();
        if (!s.released && t < s.guideOff) {
          handOnBall(1, gdir, V().copy(gdir).negate(), V().copy(u).addScaledVector(f, 0.35).normalize());
        } else {
          const tOff = s.released ? Math.min(t, s.guideOff) : s.guideOff;
          const anchor = this.shotBallWorld(Math.min(tOff, T), V()).addScaledVector(gdir, BR + 0.05).addScaledVector(r, -0.06);
          const k = smooth((t - tOff) / 0.12);
          targets[1].copy(anchor).addScaledVector(r, -0.06 * k).addScaledVector(u, -0.04 * k);
          const drop = smooth((t - T - 0.5) / 0.35);
          if (drop > 0) targets[1].lerp(V().copy(shoulders[1]).addScaledVector(u, -(d.armLen * 0.85)).addScaledVector(f, 0.1), drop);
          palms[1].copy(r); fingers[1].copy(u).addScaledVector(f, 0.2).normalize();
        }
        poles[1].copy(u).multiplyScalar(-0.8).addScaledVector(r, -0.9).normalize();
      } else if (this.hasBall) {
        if (this.dribbling || this.action === 'cross') {
          const di = this.action === 'cross' ? (this.actionT < this.mv.crossTime * 0.42 ? 1 - this.crossTo : this.crossTo) : this.dribbleHand;
          const oi = 1 - di;
          const top = (this.mv.dribbleTop) * hs;
          // dribble hand rides the top of the ball near the hand, hovers when the ball is low
          targets[di].copy(ball); targets[di].y = Math.max(ball.y + BR + 0.012, top + BR - 0.05);
          if (ball.y < top - 0.25) targets[di].y = top + BR - 0.03 - 0.04;
          palms[di].set(0, -1, 0); fingers[di].copy(f).addScaledVector(u, -0.3).normalize();
          snap[di] = ball.y > top - 0.22;
          // off arm: protective arm bar
          const os = oi === 0 ? 1 : -1;
          targets[oi].copy(shoulders[oi]).addScaledVector(u, -0.42 * hs).addScaledVector(f, 0.28 * hs).addScaledVector(r, os * 0.12);
          palms[oi].copy(f); fingers[oi].copy(u).addScaledVector(r, -os * 0.4).normalize();
          poles[oi].copy(r).multiplyScalar(os).addScaledVector(u, -0.6).normalize();
          poles[di].copy(r).multiplyScalar(di === 0 ? 1 : -1).addScaledVector(f, -0.7).addScaledVector(u, -0.2).normalize();
        } else {
          // hold: shooting hand behind/top, guide hand on the side
          handOnBall(0, V().copy(f).multiplyScalar(-0.55).addScaledVector(u, 0.55).addScaledVector(r, 0.35).normalize(), V().copy(f).multiplyScalar(0.55).addScaledVector(u, -0.55).normalize(), V().copy(f).addScaledVector(u, 0.3).normalize());
          handOnBall(1, V().copy(r).multiplyScalar(-0.85).addScaledVector(f, 0.25).addScaledVector(u, 0.1).normalize(), V().copy(r), V().copy(f).addScaledVector(u, 0.6).normalize());
          poles[0].copy(f).multiplyScalar(-1).addScaledVector(r, 0.6).addScaledVector(u, -0.4).normalize();
          poles[1].copy(f).multiplyScalar(-1).addScaledVector(r, -0.6).addScaledVector(u, -0.4).normalize();
        }
      } else if (this.action === 'jump') {
        for (let i = 0; i < 2; i++) { const side = i === 0 ? 1 : -1; targets[i].copy(shoulders[i]).addScaledVector(u, d.armLen * 0.95).addScaledVector(f, 0.12).addScaledVector(r, side * -0.05); fingers[i].copy(u); palms[i].copy(f); }
      } else if (this.action === 'pickup' || this.reaching) {
        const tgt = this.reachTarget || ball;
        for (let i = 0; i < 2; i++) { const side = i === 0 ? 1 : -1; targets[i].copy(tgt).addScaledVector(r, side * (BR + 0.03)); fingers[i].copy(f).addScaledVector(u, -0.4).normalize(); palms[i].copy(r).multiplyScalar(-side); }
      } else {
        // free arms: counter-swing with the legs
        const root = tm.a.set(this.x, 0, this.z);
        for (let i = 0; i < 2; i++) {
          const opp = this.feet[i];
          const legFwd = tm.b.copy(opp.pos).sub(root).dot(f);
          const swing = this.gaitMode ? clamp(-legFwd * 0.75, -0.45, 0.5) : 0.04;
          hang(i, 0.07 + swing, 0.07 + 0.02 * this.speed(), Math.max(0, swing) * 0.35 + (this.gaitMode ? 0.12 * Math.min(1, this.speed() / 5) : 0));
          if (this.gaitMode) fingers[i].copy(f).multiplyScalar(0.35).addScaledVector(u, -1).normalize();
        }
      }
      // smoothing (snapped hands are glued to the ball and copy through directly)
      if (!sm.handInit) { sm.hand[0].copy(targets[0]); sm.hand[1].copy(targets[1]); sm.handInit = true; }
      for (let i = 0; i < 2; i++) {
        const k = snap[i] ? 1 : 1 - Math.exp(-(s ? 30 : 22) * dt);
        sm.hand[i].lerp(targets[i], k);
        const h = P.hands[i];
        h.palm.copy(palms[i]); h.fingers.copy(fingers[i]); h.pole.copy(poles[i]);
        h.wrist.copy(sm.hand[i]).addScaledVector(h.fingers, -d.palm);
      }
    }
  }

  return { Player, hermitePath };
})();
