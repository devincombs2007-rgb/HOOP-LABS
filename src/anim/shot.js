// HOOP LAB — jump-shot animation: gather footwork, load, triple extension, set point, release, wrist
// snap, follow-through, flight legs, landing and recovery, with per-character signature styles.
//
// HoopShotAnim.install(Player) puts the shot methods on HoopPlayer.Player.prototype (startShot,
// buildShotKeys, shotBallWorld, pelvisOffsetAt, bodyVyAt, predictReleasePos, release, pumpFake,
// updateShot) and dispatches computePose/updateFeet to the shot versions while action === 'shoot'.
// Entering and leaving a shot cross-fades with the movement pose, so nothing pops.
//
// Timing contract with the shot model: the release instant T comes from HoopShot.derive().releaseTime
// (−0.07 s catch-and-shoot, +0.035 s pull-up) and the flight from derive().jumpH (g = 9.81), so the drawn
// ball (shotBallWorld), release() and bodyVyAt() are exactly what the physics and the meter use.
// All geometry is driven by the 16 Jump Shot Creator params; def.style adds signature modifiers on top
// (see DEFAULT_STYLE), so a custom jumper on any character still keeps that player's flavor.
const HoopShotAnim = (() => {
  'use strict';
  const PH = HoopPhysics, K = PH.K, BR = K.BALL_R, G = K.G, BRC = BR + 0.012, DEG = Math.PI / 180;
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
  const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  // Signature modifiers (all optional in def.style). Distances in meters (scaled by body size), angles in rad.
  const DEFAULT_STYLE = {
    gather: { stand: 'set', catch: 'hop', move: '12' }, // footwork into the shot: 'set' | 'hop' | '12' (1-2 step)
    gatherQuick: 1,     // >1 = faster gather steps / hop
    hopH: 0.03,         // foot clearance of the gather hop
    kneeIn: 0,          // inward knee dip during the load (0..1)
    loadMul: 1,         // knee-load depth multiplier
    pathLine: 0.5,      // 1 = ball rises straight up the middle in one line, 0 = up the shooting side
    pocketR: 0, pocketF: 0,           // pocket offset (right / forward)
    setR: 0.06, setU: 0, setF: 0,     // set point: right of the face center, extra height, extra forward
    relR: 0.10, relElev: 0,           // release: hand right of center, extra arm elevation (deg)
    pause: 0,           // extra hold at the set point (two-motion pause), seconds
    elbowOut: 0,        // extra elbow flare for the look (does not change the shot model)
    closed: 0.1,        // chest rotation at the load (+ = shooting shoulder forward, − = turned away)
    squareTime: 0.16,   // how fast the shoulders square to the rim before the release
    tuck: 0.2,          // knees tucked in the air (0..1)
    together: 0.2,      // legs together in the air (0..1)
    kick: 0, kickLeg: 0, kickDist: 7, // leg kick on deep shots (amount, leg 0 = right, distance where it starts)
    fadeMul: 1, fadeMid: 0, // fade-back drift multiplier (driven by the `lean` param), extra fade in the mid-range
    drift: 0,           // planned forward drift in the air (m)
    landWide: 0, landFwd: 0.04, // landing stance: extra width, feet ahead of the hips
    followHold: 0.6,    // seconds the follow-through is held after the release
    wristHang: 0.6,     // 0 = fingers point flat at the rim, 1 = limp gooseneck
    followRelax: 0.3,   // how relaxed (bent) the follow-through arm is
    guideStay: 0.25, guideOut: 0.06,  // guide hand stays up this long after the release, moves this far off the ball
  };
  const STYLE_KEYS = Object.keys(DEFAULT_STYLE);
  function resolveStyle(def) {
    const s = Object.assign({}, DEFAULT_STYLE);
    const src = (def && def.style) || {};
    for (const k of STYLE_KEYS) if (src[k] !== undefined) s[k] = src[k];
    s.gather = Object.assign({}, DEFAULT_STYLE.gather, src.gather || {});
    return s;
  }

  // ---------------------------------------------------------------- allocation-free cubic Hermite keys
  // keys: [{ t, p:Vector3, hold?, vStart?:Vector3 (first key), vEnd?:Vector3 (last key) }]
  function tan0(keys, i, c, dt) {
    const k0 = keys[i];
    if (i === 0) return k0.vStart ? k0.vStart[c] * dt : 0;
    if (k0.hold) return 0;
    const kp = keys[i - 1], k1 = keys[i + 1];
    return (k1.p[c] - kp.p[c]) / (k1.t - kp.t) * dt;
  }
  function tan1(keys, i, c, dt) {
    const n = keys.length, k1 = keys[i + 1];
    if (i + 1 === n - 1) return k1.vEnd ? k1.vEnd[c] * dt : 0;
    if (k1.hold) return 0;
    const k0 = keys[i], kn = keys[i + 2];
    return (kn.p[c] - k0.p[c]) / (kn.t - k0.t) * dt;
  }
  function herm(keys, t, out) {
    const n = keys.length;
    if (t <= keys[0].t) return out.copy(keys[0].p);
    if (t >= keys[n - 1].t) return out.copy(keys[n - 1].p);
    let i = 0; while (i < n - 2 && t > keys[i + 1].t) i++;
    const k0 = keys[i], k1 = keys[i + 1], dt = k1.t - k0.t, u = (t - k0.t) / dt, u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    out.x = h00 * k0.p.x + h10 * tan0(keys, i, 'x', dt) + h01 * k1.p.x + h11 * tan1(keys, i, 'x', dt);
    out.y = h00 * k0.p.y + h10 * tan0(keys, i, 'y', dt) + h01 * k1.p.y + h11 * tan1(keys, i, 'y', dt);
    out.z = h00 * k0.p.z + h10 * tan0(keys, i, 'z', dt) + h01 * k1.p.z + h11 * tan1(keys, i, 'z', dt);
    return out;
  }
  // scalar Hermite from (y0, slope m0) to (y1, slope m1) over [0, D] evaluated at x
  function herm1(y0, m0, y1, m1, D, x) {
    const u = clamp(x / D, 0, 1), u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * m0 * D + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * m1 * D;
  }

  // drop keys that would not be strictly increasing in time (very short shots / late dribble catches)
  function monotone(keys) {
    const out = [keys[0]], end = keys[keys.length - 1];
    for (let i = 1; i < keys.length - 1; i++) if (keys[i].t > out[out.length - 1].t + 0.012 && keys[i].t < end.t - 0.012) out.push(keys[i]);
    out.push(end);
    return out;
  }

  // ---------------------------------------------------------------- pose snapshots / blending
  function makePose() {
    return {
      rootX: 0, rootZ: 0, pelvis: V3(), pelvisQ: new THREE.Quaternion(), chestQ: new THREE.Quaternion(), headYaw: 0, headPitch: 0,
      hands: [0, 1].map(() => ({ wrist: V3(), pole: V3(), fingers: V3(0, -1, 0), palm: V3(0, 0, 1), grip: 0 })),
      feet: [0, 1].map(() => ({ ankle: V3(), pole: V3(), fwd: V3(0, 0, 1), up: V3(0, 1, 0) })),
    };
  }
  function copyPose(dst, src) {
    dst.rootX = src.rootX; dst.rootZ = src.rootZ; dst.pelvis.copy(src.pelvis); dst.pelvisQ.copy(src.pelvisQ); dst.chestQ.copy(src.chestQ);
    dst.headYaw = src.headYaw; dst.headPitch = src.headPitch;
    for (let i = 0; i < 2; i++) {
      const a = dst.hands[i], b = src.hands[i];
      a.wrist.copy(b.wrist); a.pole.copy(b.pole); a.fingers.copy(b.fingers); a.palm.copy(b.palm); a.grip = b.grip || 0;
      const c = dst.feet[i], e = src.feet[i];
      c.ankle.copy(e.ankle); c.pole.copy(e.pole); c.fwd.copy(e.fwd); c.up.copy(e.up);
    }
    return dst;
  }
  const nlerp = (a, b, w) => { a.lerp(b, w); if (a.lengthSq() < 1e-8) a.copy(b); return a.normalize(); };
  // pose = lerp(pose, from, w); hands flagged in keepHands keep their wrist position (glued to the ball)
  function blendPose(P, from, w, keepHand0, keepHand1) {
    if (w <= 0) return;
    P.pelvis.lerp(from.pelvis, w); P.pelvisQ.slerp(from.pelvisQ, w); P.chestQ.slerp(from.chestQ, w);
    P.headYaw += wrapPi(from.headYaw - P.headYaw) * w; P.headPitch = lerp(P.headPitch, from.headPitch, w);
    for (let i = 0; i < 2; i++) {
      const h = P.hands[i], g = from.hands[i];
      if (!(i === 0 ? keepHand0 : keepHand1)) h.wrist.lerp(g.wrist, w);
      nlerp(h.pole, g.pole, w); nlerp(h.fingers, g.fingers, w); nlerp(h.palm, g.palm, w);
      h.grip = lerp(h.grip || 0, g.grip || 0, w);
      const ft = P.feet[i], fg = from.feet[i];
      ft.ankle.lerp(fg.ankle, w); nlerp(ft.pole, fg.pole, w); nlerp(ft.fwd, fg.fwd, w); nlerp(ft.up, fg.up, w);
    }
  }

  // per-player scratch (no allocations per frame)
  function sa(pl) {
    if (pl._sa) return pl._sa;
    const v = () => V3();
    pl._sa = {
      f: v(), r: v(), u: V3(0, 1, 0), a: v(), b: v(), c: v(), e: v(), g: v(), h: v(), n: v(), fg: v(), pc: v(), bw: v(), bw2: v(), sp: v(),
      sh: [v(), v()], hip: v(), q1: new THREE.Quaternion(), q2: new THREE.Quaternion(), eu: new THREE.Euler(0, 0, 0, 'YXZ'),
      bPrev: v(), ballVel: v(), entry: makePose(), exit: makePose(), tq: new THREE.Quaternion(),
    };
    return pl._sa;
  }
  // body frame (x = right, y = up, z = forward) → world direction
  const toWorld = (A, b, out) => out.set(0, 0, 0).addScaledVector(A.r, b.x).addScaledVector(A.u, b.y).addScaledVector(A.f, b.z);
  // world → body frame
  const toBody = (A, w, out) => out.set(w.dot(A.r), w.y, w.dot(A.f));
  const setFrame = (A, yaw) => { A.f.set(Math.sin(yaw), 0, Math.cos(yaw)); A.r.set(-Math.cos(yaw), 0, Math.sin(yaw)); };

  function install(Player) {
    const PP = Player.prototype;

    PP.shotStyle = function () { return this._shotStyle || (this._shotStyle = resolveStyle(this.def)); };

    // ---------------------------------------------------------------- start
    PP.startShot = function (now) {
      ensureDispatch(Player);
      if (!this.canShoot() || !this.jumper) return false;
      if (this.action === 'stepback') { this.queuedShot = now; return true; }
      const p = this.jumper, dv = this.derived, st = this.shotStyle(), d = this.dims, hs = this.hs, A = sa(this);
      const catchShoot = now - this.lastCatch < 0.55 || now - this.lastGather < 0.5;
      const sp = this.speed();
      const pullUp = sp > 2.2;
      let T = dv.releaseTime - (catchShoot ? 0.07 : 0) + (pullUp ? 0.035 : 0);
      T = Math.max(0.3, T);
      const jumpH = Math.max(0.005, dv.jumpH);
      const v0 = Math.sqrt(2 * G * jumpH), tApex = v0 / G;
      const tTake = Math.max(0.17, T - lerp(0.03, tApex, p.releaseTiming));
      const air = jumpH > 0.02;
      const dist = this.distToHoop();
      // foot roll geometry: the heel lifts around the ball of the foot (b ahead of the ankle, a = ankle height)
      const fb = 0.62 * d.toe, fa = d.ankleY;
      const roll = (phi) => ({ up: fb * Math.sin(phi) + fa * Math.cos(phi) - fa, fwd: fb - fb * Math.cos(phi) + fa * Math.sin(phi) });
      const phiTake = air ? 0.55 : 0.38, phiLand = 0.42;
      const hT = roll(phiTake).up;                               // pelvis rise at toe-off (legs straight, on the toes)
      const L = (lerp(0.035, 0.15, p.knee) + 0.10 * Math.min(jumpH, 0.6)) * hs * st.loadMul;   // knee load depth
      let D = clamp(1.9 * (L + hT) / v0, 0.09, 0.3);             // push-off ≈ uniform acceleration to v0
      D = Math.min(D, 2.9 * (L + hT) / v0);
      let tLoad = tTake - D; if (tLoad < 0.08) { tLoad = 0.08; D = tTake - tLoad; }
      const s = this.shot = {
        start: now, t: 0, T, v0, tApex, tTake, tLoad, D, tAir: 2 * tApex, landT: tTake + 2 * tApex, air, jumpH,
        released: false, releaseT: null, catchShoot, pullUp, landed: false, tookOff: false, faceYaw: this.hoopYaw(), dist,
        y0: clamp(-((this.sm && this.sm.pelvisDrop) || 0.06 * hs), -0.2, 0.03), load: L, hT, phiTake, phiLand, fb, fa,
        takeShift: roll(phiTake).fwd * 0.85, landRollF: roll(phiLand).fwd, landUp: roll(phiLand).up,
        lean0: clamp((this.sm && this.sm.lean) || 0.08, -0.2, 0.5), steps: [], hop: null, entryDone: false,
        halfW: lerp(0.11, 0.28, p.footWidth) * hs, stag: p.footStagger * 0.24 * hs,
        dvx: 0, dvz: 0, land: [V3(), V3()], landYaw: 0, endT: 0,
      };
      // ---- signature air shape: leg kick on deep shots, fade-back / forward drift
      const airK = clamp(jumpH / 0.15, 0, 1);
      s.kick = st.kick * clamp((dist - (st.kickDist - 1.6)) / 2.2, 0, 1) * airK;
      const mid = clamp((6.8 - dist) / 1.5, 0, 1) * clamp((dist - 1.5) / 1.5, 0, 1);
      const fade = Math.max(0, -p.lean) * 1.1 * st.fadeMul * (1 + st.fadeMid * mid) * (1 - 0.4 * clamp((dist - 7) / 2, 0, 1)) + 0.10 * s.kick;
      s.fade = Math.min(0.5 * hs, fade) * airK;                   // backward drift over the flight (m)
      s.drift = st.drift * airK * hs;                             // forward drift (m)
      s.tuck = st.tuck * airK; s.together = st.together * airK;
      s.landT = tTake + 2 * tApex;
      s.endT = s.landT + 0.42;
      // ---- gather footwork
      const moving = sp > 0.8;
      let kind = moving ? st.gather.move : catchShoot ? st.gather.catch : st.gather.stand;
      this.planShotFootwork(kind);
      // ---- torso / timeline values used by the ball path
      s.cyClosed = st.closed + 0.25 * p.footStagger; s.cyRel = 0.14 * p.footStagger;
      s.leanLoad = 0.10 + 0.14 * p.knee; s.leanRel = 0.03 + 0.10 * p.lean - 0.55 * s.fade / hs - 0.05 * s.kick;
      s.flickStart = T - 0.04 + (p.flick - 0.5) * 0.06;
      s.flickDur = lerp(0.16, 0.10, p.speed);
      s.followHold = st.followHold;
      // ball start (body frame) and velocity (from the last ticks)
      setFrame(A, this.yaw);
      s.startBall = toBody(A, A.a.copy(this.ballPos).sub(A.b.set(this.x, 0, this.z)), V3()); s.startBall.y = this.ballPos.y;
      s.startVel = toBody(A, A.a.copy(A.ballVel).addScaledVector(A.f, -this.speed() * 0), V3());
      s.startVel.x -= A.r.x * this.vx + A.r.z * this.vz; s.startVel.z -= A.f.x * this.vx + A.f.z * this.vz;
      if (s.startVel.length() > 4) s.startVel.setLength(4);
      // hands at the start: glued to the ball or reaching for it
      const P = this.pose, poseOk = Math.hypot(P.rootX - this.x, P.rootZ - this.z) < 0.5 && P.hands[0].wrist.lengthSq() > 0.01;
      s.poseOk = poseOk;
      s.h0 = [0, 1].map((i) => {
        const h = P.hands[i];
        const pc = A.pc.copy(h.wrist).addScaledVector(h.fingers, d.palm);
        const gap = pc.distanceTo(this.ballPos) - BRC;
        const glued = poseOk && Math.abs(gap) < 0.05;
        const nW = A.n.copy(pc).sub(this.ballPos); if (nW.lengthSq() < 1e-6) nW.set(0, -1, 0); nW.normalize();
        const rel = A.c.copy(pc).sub(A.b.set(this.x, 0, this.z));
        return { glued, n: toBody(A, nW, V3()), fing: toBody(A, h.fingers, V3()).normalize(), pc: poseOk ? V3(rel.dot(A.r), pc.y, rel.dot(A.f)) : null };
      });
      this.buildShotKeys();
      this.action = 'shoot'; this.actionT = 0; this.dribbling = false;
      this.queuedShot = null;
      this._shotExit = null;
      this.emit('shotStart', { catchShoot, pullUp });
      return true;
    };

    // footwork into the shot: 'hop' (both feet), '12' (1-2 step) or 'set' (re-square only if needed)
    PP.planShotFootwork = function (kind) {
      const s = this.shot, st = this.shotStyle(), q = st.gatherQuick;
      const latest = s.tLoad + 0.03;                         // feet must be down for the push
      const swinging = this.feet.map((ft) => !ft.planted || ft.swinging);
      if (kind === 'hop' && latest > 0.11) {
        const t0 = 0.0, t1 = Math.min(latest - 0.01, t0 + clamp(0.12 / q, 0.08, 0.15));
        s.hop = { t0, t1, h: Math.min(0.03, G * (t1 - t0) * (t1 - t0) / 8) };
        for (let i = 0; i < 2; i++) s.steps.push({ i, t0, t1, lift: st.hopH * this.hs, hop: true });
        s.gatherEnd = t1;
      } else if (kind === '12' && latest > 0.14) {
        const dur = clamp(0.13 / q, 0.08, 0.16);
        // the swinging (or trailing) foot lands first, the other squares up next to it
        let first = swinging[0] && !swinging[1] ? 0 : swinging[1] && !swinging[0] ? 1 : this.trailingFoot();
        const tA1 = Math.min(dur, latest * 0.55), tB0 = tA1 * 0.55, tB1 = Math.min(latest, tB0 + dur);
        s.steps.push({ i: first, t0: 0, t1: tA1, lift: 0.05 * this.hs }, { i: 1 - first, t0: tB0, t1: tB1, lift: 0.045 * this.hs });
        s.gatherEnd = tB1;
      } else {
        // set: only re-square feet that are off the shooting stance (or still in the air from the gait)
        const A = sa(this), tgt = A.g;
        const devs = [0, 1].map((i) => { this.shotStanceTarget(i, 0.12, tgt); const ft = this.feet[i]; return Math.hypot(ft.pos.x - tgt.x, ft.pos.z - tgt.z) + 0.1 * Math.abs(wrapPi(ft.yaw - this.shotFootYaw(i))); });
        const need = [0, 1].map((i) => swinging[i] || devs[i] > 0.06 * this.hs);
        const order = devs[0] >= devs[1] ? [0, 1] : [1, 0];
        let t = 0;
        for (const i of order) if (need[i]) { const t1 = Math.min(latest, t + 0.11); s.steps.push({ i, t0: t, t1, lift: 0.04 * this.hs }); t += 0.06; }
        s.gatherEnd = s.steps.length ? s.steps[s.steps.length - 1].t1 : 0.06;
      }
      s.gatherKind = kind;
    };
    PP.trailingFoot = function () {
      const A = sa(this); setFrame(A, this.yaw);
      const a = (this.feet[0].pos.x - this.x) * A.f.x + (this.feet[0].pos.z - this.z) * A.f.z;
      const b = (this.feet[1].pos.x - this.x) * A.f.x + (this.feet[1].pos.z - this.z) * A.f.z;
      return a < b ? 0 : 1;
    };
    PP.shotFootYaw = function (i) { return this.shot.faceYaw - (i === 0 ? 1 : -1) * 0.16; };
    // where foot i should stand at shot time tEnd (predicted stop point of the body, squared to the rim)
    PP.shotStanceTarget = function (i, tEnd, out) {
      const s = this.shot, A = sa(this);
      const yaw = s.faceYaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
      const sp = this.speed(), dt = Math.max(0, tEnd - s.t);
      let travel = 0;
      if (sp > 1e-3) { const a = this.mv.decel * 1.5, tt = Math.min(dt, sp / a); travel = (sp * tt - 0.5 * a * tt * tt) / sp; }
      const side = i === 0 ? 1 : -1;
      out.set(this.x + this.vx * travel + rx * side * s.halfW + fx * side * s.stag * 0.5, 0, this.z + this.vz * travel + rz * side * s.halfW + fz * side * s.stag * 0.5);
      return out;
    };

    // ---------------------------------------------------------------- torso timeline (pure functions of t)
    PP.shotLeanAt = function (t) {
      const s = this.shot;
      if (t < s.tLoad) return lerp(s.lean0, s.leanLoad, smooth(t / s.tLoad));
      if (t < s.T) return lerp(s.leanLoad, s.leanRel, smooth((t - s.tLoad) / (s.T - s.tLoad)));
      if (t < s.landT) return s.leanRel;
      const tl = t - s.landT, lLand = 0.5 * s.leanRel + 0.12 + 0.05 * Math.min(1, s.v0 / 3);
      if (tl < 0.16) return lerp(s.leanRel, lLand, smooth(tl / 0.16));
      return lerp(lLand, 0.07, smooth((tl - 0.16) / 0.3));
    };
    PP.shotChestYawAt = function (t) {
      const s = this.shot, st = this.shotStyle();
      if (t < s.tLoad) return lerp(0, s.cyClosed, smooth(t / s.tLoad));
      const t1 = s.T - 0.03, t0 = Math.max(s.tLoad, t1 - st.squareTime);
      if (t < t1) return lerp(s.cyClosed, s.cyRel, smooth((t - t0) / (t1 - t0)));
      if (t < s.landT) return s.cyRel;
      return lerp(s.cyRel, 0.03, smooth((t - s.landT) / 0.35));
    };
    PP.shotRollAt = function (t) {
      const s = this.shot;
      if (!s.kick) return 0;
      // body tilts away from the kicking leg while it swings out
      const k = smooth((t - s.tTake) / 0.15) * (1 - smooth((t - s.T - 0.2) / 0.3));
      return -(this.shotStyle().kickLeg === 0 ? 1 : -1) * 0.06 * s.kick * k;
    };
    // forward shift of the pelvis over the feet (sit back in the load, over the toes at take-off/landing)
    PP.shotHipShiftAt = function (t) {
      const s = this.shot, hs = this.hs;
      if (t < s.tLoad) return lerp(0, -0.05 * hs, smooth(t / s.tLoad));
      if (t < s.tTake) return lerp(-0.05 * hs, s.takeShift, smooth((t - s.tLoad) / (s.tTake - s.tLoad)));
      if (!s.air || t < s.landT) return lerp(s.takeShift, s.landShift !== undefined ? s.landShift : s.takeShift, smooth((t - s.tTake) / s.tAir));
      const tl = t - s.landT, ls = s.landShift !== undefined ? s.landShift : s.takeShift;
      if (tl < 0.15) return lerp(ls, -0.03 * hs, smooth(tl / 0.15));
      return lerp(-0.03 * hs, 0, smooth((tl - 0.15) / 0.35));
    };
    // vertical pelvis offset from standing (load, push with velocity continuity, ballistic flight, absorption)
    PP.pelvisOffsetAt = function (t) {
      const s = this.shot;
      if (!s) return 0;
      let y;
      if (t < s.tLoad) {
        y = s.y0 + (-s.load - s.y0) * smooth(t / s.tLoad);
        if (s.hop && t > s.hop.t0 && t < s.hop.t1) y += s.hop.h * Math.sin(Math.PI * (t - s.hop.t0) / (s.hop.t1 - s.hop.t0));
        return y;
      }
      if (t < s.tTake) return herm1(-s.load, 0, s.hT, s.air ? s.v0 : 0, s.tTake - s.tLoad, t - s.tLoad);
      const tau = t - s.tTake;
      if (!s.air) { // set shot: up on the toes, then settle
        if (tau < 0.2) return s.hT;
        return herm1(s.hT, 0, -0.04 * this.hs, 0, 0.3, tau - 0.2);
      }
      if (tau < s.tAir) return s.hT + s.v0 * tau - 0.5 * G * tau * tau;
      const tl = tau - s.tAir;
      const Ld = (0.05 + 0.10 * Math.min(1, s.v0 / 3.3)) * this.hs;
      const tAbs = clamp(2.2 * (s.hT + Ld) / s.v0, 0.09, 0.24);
      if (tl < tAbs) return herm1(s.hT, -s.v0, -Ld, 0, tAbs, tl);
      return herm1(-Ld, 0, -0.055 * this.hs, 0, 0.34, tl - tAbs);
    };
    PP.bodyVyAt = function (t) {
      const dt = 0.004;
      return (this.pelvisOffsetAt(t + dt) - this.pelvisOffsetAt(t - dt)) / (2 * dt);
    };

    // shoulder i in the body frame (x right, y height without the vertical shot offset, z forward) at time t,
    // using exactly the forward kinematics of the pose (pelvis shift, lean, chest yaw/roll)
    PP.shotShoulderBF = function (t, i, out) {
      const d = this.dims, sc = d.scale, A = sa(this);
      const lean = this.shotLeanAt(t), cy = this.shotChestYawAt(t), roll = this.shotRollAt(t);
      A.eu.set(lean * 0.4, cy * 0.35, roll * 0.5, 'YXZ'); A.q1.setFromEuler(A.eu);
      A.sp.copy(d.spineLocal).multiplyScalar(sc).applyQuaternion(A.q1); A.sp.y += d.hipsY; A.sp.z += this.shotHipShiftAt(t);
      A.eu.set(lean, cy, roll, 'YXZ'); A.q2.setFromEuler(A.eu);
      A.h.copy(d.shoulderLocal[i]).multiplyScalar(sc).applyQuaternion(A.q2).add(A.sp);
      return out.set(-A.h.x, A.h.y, A.h.z);
    };
    // approximate head sphere center in the body frame at time t
    PP.shotHeadBF = function (t, out) {
      const d = this.dims, lean = this.shotLeanAt(t);
      const above = d.headY + 0.07 * this.hs - d.hipsY;
      return out.set(0, d.hipsY + above * Math.cos(lean), this.shotHipShiftAt(t) + above * Math.sin(lean) + 0.03 * this.hs);
    };

    // ---------------------------------------------------------------- ball path
    PP.buildShotKeys = function () {
      const s = this.shot, p = this.jumper, d = this.dims, hs = this.hs, st = this.shotStyle();
      const H = d.height, hy = d.headY, forehead = hy + 0.72 * (H - hy);
      const line = clamp(st.pathLine, 0, 1);
      const motion = clamp(p.motion, 0, 1);
      // ---- times
      const tPk = clamp(Math.max(s.gatherEnd || 0, 0.42 * s.tLoad), 0.05, s.tLoad - 0.02);
      const tDip = clamp(s.tLoad + 0.02 * (1 - motion), tPk + 0.03, s.T - 0.2);
      const tSet1 = Math.max(tDip + 0.08, s.T - clamp(0.075 + 0.05 * (1 - p.speed), 0.06, 0.13));
      const tSet2 = Math.max(tDip + 0.08, s.T - clamp(0.13 + 0.12 * motion + st.pause, 0.1, 0.34));
      const tHold2 = Math.min(s.T - 0.07, tSet2 + clamp(0.03 + 0.07 * motion + st.pause * 0.8, 0.02, 0.25));
      s.tPk = tPk; s.tDip = tDip; s.tSet = lerp(tSet1, tSet2, motion); s.tHold = lerp(tSet1, tHold2, motion);
      // ---- points (body frame, height as if standing; the vertical shot offset is added on top)
      const pocket = V3(lerp(0.12, 0.05, line) * hs + st.pocketR, lerp(d.hipsY + 0.06 * hs, d.shoulderY + 0.03 * hs, p.pocket), (0.25 + 0.05 * p.pocket) * hs + st.pocketF);
      const dip = V3(pocket.x + 0.01, pocket.y - 0.22 * p.dip * hs, pocket.z - 0.015);
      const setP = V3(st.setR * hs, lerp(forehead + 0.06 * hs, H + 0.30 * hs, p.setPoint) + st.setU * hs, (0.10 + 0.12 * p.extension) * hs + st.setF * hs);
      const head = this.shotHeadBF(s.tSet, V3()), headR = 0.115 * hs + BR + 0.01;
      const clear = (pt) => { // keep the ball out of the head (push it forward)
        const dy = pt.y - head.y, dx = pt.x - head.x;
        const need = headR * headR - dy * dy - dx * dx;
        if (need > 0) pt.z = Math.max(pt.z, head.z + Math.sqrt(need));
      };
      clear(setP);
      // ---- release: arm extended from the (moving) shoulder
      const shR = this.shotShoulderBF(s.T, 0, V3());
      const alpha = clamp(lerp(80, 50, p.extension) + 10 * (p.setPoint - 0.5) + st.relElev, 42, 86) * DEG;
      const wristR = d.armLen * 0.94;
      const dr = clamp(st.relR * hs - shR.x, -0.6 * wristR, 0.3 * wristR), Rv = Math.sqrt(wristR * wristR - dr * dr);
      const armDir = V3(dr, Rv * Math.sin(alpha), Rv * Math.cos(alpha)).normalize();
      const psiRel = alpha + 70 * DEG;
      const fingRel = V3(-0.08, Math.sin(psiRel), Math.cos(psiRel)).normalize();
      const palmRel = V3(0.04, -Math.cos(psiRel), Math.sin(psiRel)).normalize();
      const rel = V3().copy(shR).addScaledVector(armDir, wristR).addScaledVector(fingRel, d.palm).addScaledVector(palmRel, BRC);
      const launch = V3(0, Math.sin(52 * DEG), Math.cos(52 * DEG));
      const vDir = V3().copy(armDir).add(launch).normalize();
      const vEnd = V3().copy(vDir).multiplyScalar(2.8);
      s.cont = { dir: vDir, C: 0.07, tau: 0.025 };
      // ---- the rise: straight up the middle (line) or up the shooting side
      const via = V3(lerp(lerp(dip.x, setP.x, 0.5) + 0.05 * hs, lerp(dip.x, setP.x, 0.75), line), lerp(dip.y, setP.y, 0.5), lerp(dip.z, setP.z, 0.5) + 0.02);
      clear(via);
      const viaFace = V3(lerp(via.x, setP.x, 0.5), lerp(via.y, setP.y, 0.6), 0); viaFace.z = lerp(via.z, setP.z, 0.6); clear(viaFace);
      // ---- start: pre-catch bounce (ball still low in a dribble) or straight from the hands
      const start = s.startBall.clone();
      let k0 = { t: 0, p: start, vStart: V3(s.startVel.x, clamp(s.startVel.y, -1.5, 3), s.startVel.z) };
      s.pre = null;
      if (start.y < d.hipsY - 0.12 * hs) {
        const pre = this.planShotCatch(start, s.startVel, Math.min(tDip - 0.05, s.tLoad * 0.8), pocket);
        s.pre = pre;
        k0 = { t: pre.t1, p: pre.catchP, vStart: V3(0, clamp(pre.vCatch, -1, 3), 0) };
      }
      const tV = (ta, tb) => lerp(ta, tb, 0.45), tVF = (ta, tb) => lerp(ta, tb, 0.75);
      const one = [k0];
      if (tPk > k0.t + 0.03) one.push({ t: tPk, p: pocket });
      one.push({ t: Math.max(tDip, k0.t + 0.04), p: dip }, { t: tV(tDip, tSet1), p: via }, { t: tVF(tDip, tSet1), p: viaFace }, { t: tSet1, p: setP }, { t: s.T, p: rel, vEnd });
      const two = [k0];
      if (tPk > k0.t + 0.03) two.push({ t: tPk, p: pocket });
      two.push({ t: Math.max(tDip, k0.t + 0.04), p: dip }, { t: tV(tDip, tSet2), p: via }, { t: tVF(tDip, tSet2), p: viaFace }, { t: tSet2, p: setP, hold: true },
        { t: tHold2, p: V3(setP.x, setP.y + 0.015, setP.z + 0.01), hold: true }, { t: s.T, p: rel, vEnd });
      s.keys = { one: monotone(one), two: monotone(two), rel, setP, pocket, dip, alpha, armDir, psiRel, motion };
      // guide hand: comes off between the set point and the release (later for a two-hand push)
      s.guideOff = lerp(s.tSet - 0.04, s.T + 0.005, p.guide);
      s.guideWrap = lerp(0.12, 0.85, p.guide);
    };
    // the ball is still coming up from a dribble: let it bounce and catch it on the way up
    PP.planShotCatch = function (start, vel, tMax, pocket) {
      const d = this.dims, hs = this.hs;
      let uc = d.hipsY - 0.02 * hs;
      const vy = vel.y;
      let tF = 0, vUp;
      if (vy < 0 || start.y < uc - 0.05) {
        if (vy < 0) { tF = (vy + Math.sqrt(vy * vy + 2 * G * Math.max(0, start.y - BR))) / G; vUp = 0.82 * Math.abs(vy - G * tF); }
        else { vUp = vy; }
      } else vUp = vy;
      const base = vy < 0 ? BR : start.y;
      if (vUp * vUp < 2 * G * (uc - base)) uc = base + vUp * vUp / (2 * G) - 0.01;
      let tU = (vUp - Math.sqrt(Math.max(0, vUp * vUp - 2 * G * (uc - base)))) / G;
      // too late for this shot: the hands reach lower to get it sooner
      while (tF + tU > tMax && uc > BR + 0.3) { uc -= 0.05; tU = (vUp - Math.sqrt(Math.max(0, vUp * vUp - 2 * G * (uc - base)))) / G; }
      const t1 = Math.max(0.04, tF + tU);
      const catchP = V3(lerp(start.x, pocket.x, 0.6), uc, Math.max(start.z, 0.28 * hs));
      return { t1, tF, base, vUp, vy0: vy, y0: start.y, from: start.clone(), catchP, vCatch: vUp - G * tU };
    };
    // ball center in the body frame at shot time t (with the post-release continuation of the hand)
    PP.shotPathBF = function (t, out) {
      const s = this.shot, A = sa(this);
      const pre = s.pre;
      if (pre && t < pre.t1) {
        const k = t / pre.t1;
        out.x = lerp(pre.from.x, pre.catchP.x, k); out.z = lerp(pre.from.z, pre.catchP.z, k);
        if (pre.vy0 < 0 && t < pre.tF) out.y = pre.y0 + pre.vy0 * t - 0.5 * G * t * t;
        else { const tt = pre.vy0 < 0 ? t - pre.tF : t; out.y = pre.base + pre.vUp * tt - 0.5 * G * tt * tt; }
        return out;
      }
      const m = s.keys.motion;
      herm(s.keys.one, t, out);
      if (m > 0) { herm(s.keys.two, t, A.bw2); out.lerp(A.bw2, m); }
      if (t > s.T) out.addScaledVector(s.cont.dir, s.cont.C * (1 - Math.exp(-(t - s.T) / s.cont.tau)));
      return out;
    };
    // ball center in world at shot time t (current root position / yaw)
    PP.shotBallWorld = function (t, out) {
      out = out || V3();
      const A = sa(this), a = this.shotPathBF(t, A.bw);
      const yaw = this.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
      out.set(this.x + rx * a.x + fx * a.z, a.y + this.pelvisOffsetAt(t), this.z + rz * a.x + fz * a.z);
      return out;
    };
    PP.predictReleasePos = function (out) { return this.shotBallWorld(this.shot.T, out || V3()); };

    // returns release info; the game converts it into ball physics
    PP.release = function (tRelease) {
      const s = this.shot;
      if (!s || s.released) return null;
      s.released = true; s.releaseT = tRelease;
      const pos = this.shotBallWorld(tRelease, V3());
      // the planned fade / drift is part of the practiced motion (compensated like the jump itself);
      // only momentum carried in from movement reaches the shot model as body velocity
      const k = s.tookOff ? Math.exp(-0.15 * Math.max(0, tRelease - s.tTake)) : 0;
      const bodyV = { vx: this.vx - s.dvx * k, vy: this.bodyVyAt(tRelease), vz: this.vz - s.dvz * k };
      this.hasBall = false;
      this.emit('release', {});
      return { pos, eSec: tRelease - s.T, bodyV, offBalance: this.offBalance };
    };

    PP.pumpFake = function () {
      const s = this.shot;
      if (!s || s.released || s.t > 0.16) return false;
      this.endShot(true);
      this.holdT = 0;
      this.emit('pumpFake', {});
      return true;
    };

    PP.endShot = function () {
      const A = sa(this);
      copyPose(A.exit, this.pose);
      this._shotExit = { t0: this.time, x: this.x, z: this.z };
      for (const ft of this.feet) { ft.planted = true; ft.swinging = false; ft.pos.y = 0; ft.heel = 0; }
      this.action = 'none'; this.actionT = 0; this.shot = null;
      this.gaitMode = false;
      if (this.hasBall) this.holdT = 1;
    };

    // ---------------------------------------------------------------- per tick
    PP.updateShot = function (dt, now) {
      const s = this.shot, A = sa(this);
      s.t += dt;
      const t = s.t;
      if (s.air && t >= s.tTake && !s.tookOff) {
        s.tookOff = true;
        // planned drift (fade back / float forward) starts at take-off
        setFrame(A, this.yaw);
        const fwd = (s.drift - s.fade) / s.tAir;
        s.dvx = A.f.x * fwd; s.dvz = A.f.z * fwd;
        this.vx += s.dvx; this.vz += s.dvz;
        this.planShotLanding();
        if (s.jumpH > 0.06) this.emit('jump', {});
      }
      if (s.air && t >= s.landT && !s.landed) {
        s.landed = true;
        for (let i = 0; i < 2; i++) { const ft = this.feet[i]; ft.pos.copy(s.land[i]); ft.pos.y = 0; ft.yaw = s.landYaw - (i === 0 ? 1 : -1) * 0.2; ft.planted = true; ft.swinging = false; ft.heel = 0; }
        this.emit('land', { v: s.v0 });
      }
      if (!s.released) this.ballPos.copy(this.shotBallWorld(t, A.e));
      const wantsMove = (this._inpMag || 0) > 0.3 && t > s.landT + 0.1;
      if (s.released && (t > Math.max(s.endT, s.releaseT + 0.55) || wantsMove)) this.endShot();
    };
    // landing spots, predicted at take-off from the flight (root drift) and the signature landing stance
    PP.planShotLanding = function () {
      const s = this.shot, st = this.shotStyle(), hs = this.hs, A = sa(this);
      const k = (1 - Math.exp(-0.15 * s.tAir)) / 0.15;
      const lx = this.x + this.vx * k, lz = this.z + this.vz * k;
      const yaw = s.faceYaw; s.landYaw = yaw;
      setFrame(A, yaw);
      const halfW = s.halfW * lerp(1, 0.75, s.together) + st.landWide * hs;
      const ahead = (st.landFwd + 0.35 * s.fade) * hs;   // legs come through ahead of the hips on a fade
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? 1 : -1;
        let fo = side * s.stag * 0.5 * lerp(1, 0.5, s.together) + ahead;
        if (s.kick && i === st.kickLeg) fo += 0.10 * s.kick * hs;
        s.land[i].set(lx, 0, lz).addScaledVector(A.r, side * halfW).addScaledVector(A.f, fo);
      }
      // pelvis over the landing ankles (which sit forward of the foot spot when landing on the toes)
      s.landShift = ahead + s.landRollF * 0.85;
    };

    // feet during the shot: scheduled gather steps on the ground, free in the air, planted after landing
    PP.shotFeet = function (dt) {
      const s = this.shot, t = s.t, A = sa(this);
      if (s.air && t >= s.tTake && t < s.landT) { for (const ft of this.feet) { ft.planted = false; ft.swinging = false; } return; }
      for (const st of s.steps) {
        if (st.done || t < st.t0) continue;
        const ft = this.feet[st.i];
        if (!st.started) { st.started = true; st.from = ft.pos.clone(); st.from.y = 0; st.fromYaw = ft.yaw; ft.planted = false; ft.swinging = true; }
        this.shotStanceTarget(st.i, st.t1, A.g);
        const u = clamp((t - st.t0) / (st.t1 - st.t0), 0, 1);
        ft.pos.lerpVectors(st.from, A.g, smooth(u));
        ft.pos.y = Math.sin(u * Math.PI) * st.lift;
        ft.yaw = st.fromYaw + wrapPi(this.shotFootYaw(st.i) - st.fromYaw) * smooth(u);
        ft.heel = 0;
        if (u >= 1) { st.done = true; ft.pos.y = 0; ft.planted = true; ft.swinging = false; this.emit('footstep', { v: st.hop ? 1.2 : 0.8 }); }
      }
    };

    // ---------------------------------------------------------------- pose
    PP.computeShotPose = function (dt) {
      const s = this.shot, Pz = this.pose, d = this.dims, hs = this.hs, A = sa(this);
      const t = s.t, yaw = this.yaw;
      if (!s.entryDone) { s.entryDone = true; copyPose(A.entry, Pz); s.entryOk = s.poseOk; }
      setFrame(A, yaw);
      const f = A.f, r = A.r, u = A.u;
      Pz.rootX = this.x; Pz.rootZ = this.z;
      const lift = this.pelvisOffsetAt(t);
      Pz.pelvis.set(this.x, d.hipsY + lift, this.z).addScaledVector(f, this.shotHipShiftAt(t));
      const lean = this.shotLeanAt(t), cy = this.shotChestYawAt(t), roll = this.shotRollAt(t);
      A.eu.set(lean * 0.4, yaw + cy * 0.35, roll * 0.5, 'YXZ'); Pz.pelvisQ.setFromEuler(A.eu);
      A.eu.set(lean, yaw + cy, roll, 'YXZ'); Pz.chestQ.setFromEuler(A.eu);
      const sc = d.scale;
      A.sp.copy(d.spineLocal).multiplyScalar(sc).applyQuaternion(Pz.pelvisQ).add(Pz.pelvis);
      for (let i = 0; i < 2; i++) A.sh[i].copy(d.shoulderLocal[i]).multiplyScalar(sc).applyQuaternion(Pz.chestQ).add(A.sp);
      // eyes on the rim the whole time
      const H = PH.HOOPS[this.targetHoop];
      const headY = A.sp.y + (d.neckLocal.y + d.headLocal.y) * sc;
      let rel = wrapPi(Math.atan2(H.cx - this.x, H.cz - this.z) - yaw); rel = clamp(rel, -1.1, 1.1);
      Pz.headYaw = yaw + rel;
      Pz.headPitch = clamp(-Math.atan2(K.RIM_TOP - headY, Math.hypot(H.cx - this.x, H.cz - this.z)), -0.6, 0.5);
      this.shotHandsPose(t, lift);
      this.shotFeetPose(t);
      // cross-fade in from the movement pose (hands glued to the ball are already continuous)
      if (s.entryOk && t < 0.14) blendPose(Pz, A.entry, 1 - smooth(t / 0.14), true, true);
      // keep the movement smoothing state in step so the hand-off at the end is seamless
      const sm = this.sm;
      if (sm) {
        sm.pelvisDrop = d.hipsY - Pz.pelvis.y; sm.lean = lean; sm.roll = roll;
        if (sm.hand) for (let i = 0; i < 2; i++) sm.hand[i].copy(Pz.hands[i].wrist).addScaledVector(Pz.hands[i].fingers, d.palm);
        sm.handInit = true;
      }
    };

    // wrist flexion angle ψ of the shooting hand in the sagittal plane (fingers = cos ψ·fwd + sin ψ·up)
    PP.shotPsiAt = function (t) {
      const s = this.shot, st = this.shotStyle(), k = s.keys;
      const pocket = 95 * DEG, set = 160 * DEG, relA = k.psiRel;
      const goose = -lerp(0.12, 1.15, st.wristHang);
      if (t < s.tPk) return pocket;
      if (t < s.tSet) return lerp(pocket, set, smooth((t - s.tPk) / (s.tSet - s.tPk)));
      if (t < s.flickStart) return lerp(set, relA, smooth((t - s.tSet) / Math.max(0.02, s.flickStart - s.tSet)));
      const fk = smooth((t - s.flickStart) / s.flickDur);
      let psi = lerp(t < s.flickStart ? set : relA, goose, fk);
      const tr = t - s.T - s.followHold;
      if (tr > 0) psi = lerp(psi, -80 * DEG, smooth(tr / 0.45));
      return psi;
    };

    PP.shotHandsPose = function (t, lift) {
      const s = this.shot, Pz = this.pose, d = this.dims, p = this.jumper, st = this.shotStyle(), A = sa(this), hs = this.hs;
      const f = A.f, r = A.r, u = A.u, ball = this.ballPos;
      // ---------------- shooting hand (0)
      const h0 = Pz.hands[0];
      const psi = this.shotPsiAt(t);
      const cps = Math.cos(psi), sps = Math.sin(psi);
      // lateral tilt: hand behind-right of the ball in the pocket, under it at the set, behind it at release
      const lat = t < s.tSet ? lerp(0.35, 0.10, smooth((t - s.tPk) / (s.tSet - s.tPk))) : lerp(0.10, 0.03, smooth((t - s.tSet) / (s.T - s.tSet)));
      A.b.set(-0.10, sps, cps);            // fingers (body frame)
      A.c.set(-lat, cps, -sps);            // contact dir ball → palm (= −palm normal), body frame
      // entry: start from the contact the movement pose had and roll the hand around the ball
      const e0 = s.h0[0], wIn = smooth(t / Math.max(0.08, s.tPk));
      if (e0.glued && wIn < 1) { A.c.lerp(e0.n, 1 - wIn); A.b.lerp(e0.fing, 1 - wIn); }
      A.c.normalize(); A.b.normalize();
      toWorld(A, A.b, A.fg); toWorld(A, A.c, A.n);
      let grip0 = 0.75;
      if (!s.released) {
        A.pc.copy(ball).addScaledVector(A.n, BRC);
        this.shotReach(0, t, A.pc);
      } else {
        // the hand carries on along the shot path, then holds the follow-through relative to the shoulder
        this.shotBallWorld(Math.min(t, s.T + 0.15), A.e);
        A.pc.copy(A.e).addScaledVector(A.n, BRC);
        const tf0 = Math.max(s.T, s.releaseT) + 0.04, wF = smooth((t - tf0) / 0.16);
        if (wF > 0) {
          const elev = s.keys.alpha + 4 * DEG;
          A.h.set(-0.12, Math.sin(elev), Math.cos(elev)).normalize(); toWorld(A, A.h, A.g);
          A.a.copy(A.sh[0]).addScaledVector(A.g, d.armLen * (0.985 - 0.06 * st.followRelax)).addScaledVector(A.fg, d.palm);
          A.pc.lerp(A.a, wF);
        }
        const wR = smooth((t - s.T - s.followHold) / 0.45);
        if (wR > 0) { // relax: arm comes down in front of the body
          A.h.set(0.05, -0.55, 0.6).normalize(); toWorld(A, A.h, A.g);
          A.a.copy(A.sh[0]).addScaledVector(A.g, d.armLen * 0.86).addScaledVector(A.fg, d.palm);
          A.pc.lerp(A.a, wR);
        }
        grip0 = lerp(0.1, 0.35, wR);
      }
      h0.fingers.copy(A.fg); h0.palm.copy(A.n).negate();
      h0.wrist.copy(A.pc).addScaledVector(A.fg, -d.palm);
      h0.grip = grip0;
      // elbow: back/down in the pocket, under the ball at the set point (flared with the param + style)
      const flare = lerp(-0.35, 0.85, clamp(p.elbow + st.elbowOut, 0, 1));
      const kp = smooth((t - s.tPk) / Math.max(0.05, s.tSet - s.tPk));
      A.h.set(lerp(0.45, flare, kp), lerp(-0.55, -1, kp), lerp(-0.8, -0.18, kp)).normalize();
      toWorld(A, A.h, h0.pole);
      // ---------------- guide hand (1)
      const h1 = Pz.hands[1], w = s.guideWrap;
      A.c.set(-Math.cos(w), 0.08, -Math.sin(w) * 0.8).normalize();   // ball → palm (left side, wrapping behind for a push)
      A.b.set(0.12, 0.95, 0.25).normalize();                          // fingers up
      const e1 = s.h0[1];
      if (e1.glued && wIn < 1) { A.c.lerp(e1.n, 1 - wIn).normalize(); A.b.lerp(e1.fing, 1 - wIn).normalize(); }
      toWorld(A, A.c, A.n); toWorld(A, A.b, A.fg);
      if (!s.released && t < s.guideOff) {
        A.pc.copy(ball).addScaledVector(A.n, BRC);
        this.shotReach(1, t, A.pc);
        h1.grip = 0.6;
      } else {
        // stays where it came off the ball (moving with the body), eases off to the side, then drops
        const tOff = Math.min(s.guideOff, s.released ? s.releaseT : s.guideOff);
        this.shotPathBF(tOff, A.bw); A.a.copy(A.c).multiplyScalar(BRC).add(A.bw); // body frame palm at release of the guide
        const k = smooth((t - tOff) / 0.12);
        A.a.x -= st.guideOut * hs * k; A.a.y += 0.02 * k;
        A.pc.set(this.x, A.a.y + lift, this.z).addScaledVector(r, A.a.x).addScaledVector(f, A.a.z);
        const wd = smooth((t - s.T - st.guideStay) / 0.4);
        if (wd > 0) { A.h.set(-0.25, -0.75, 0.35).normalize(); toWorld(A, A.h, A.g); A.a.copy(A.sh[1]).addScaledVector(A.g, d.armLen * 0.85); A.pc.lerp(A.a, wd); A.fg.lerp(A.g, wd).normalize(); }
        h1.grip = 0.15;
      }
      h1.fingers.copy(A.fg); h1.palm.copy(A.n).negate();
      h1.wrist.copy(A.pc).addScaledVector(A.fg, -d.palm);
      A.h.set(-0.9, -0.65, -0.25).normalize(); toWorld(A, A.h, h1.pole);
    };
    // while the ball is still on its way up (dribble gather) or a hand starts away from the ball, reach for it
    PP.shotReach = function (i, t, pc) {
      const s = this.shot, e = s.h0[i];
      if (e.glued || !e.pc) return;
      const tc = Math.max(0.12, s.pre ? s.pre.t1 : 0, i === 1 ? 0.14 : 0.1);
      if (t >= tc) return;
      const A = sa(this);
      A.e.set(this.x, e.pc.y, this.z).addScaledVector(A.r, e.pc.x).addScaledVector(A.f, e.pc.z);
      pc.lerpVectors(A.e, pc, smooth(t / tc));
    };

    // rolled ankle: heel up by phi around the ball of the foot (planted at gp, facing fF)
    function rolledAnkle(s, gp, fF, phi, out) {
      const b = s.fb, a = s.fa;
      return out.copy(gp).addScaledVector(fF, b + (-b * Math.cos(phi) + a * Math.sin(phi))).setY(gp.y + b * Math.sin(phi) + a * Math.cos(phi));
    }
    PP.shotFeetPose = function (t) {
      const s = this.shot, Pz = this.pose, d = this.dims, st = this.shotStyle(), A = sa(this), hs = this.hs;
      const f = A.f, r = A.r, u = A.u;
      const airborne = s.air && t >= s.tTake && t < s.landT;
      const kin = smooth(t / s.tLoad) * (1 - smooth((t - s.tLoad) / Math.max(0.05, s.tTake - s.tLoad)));
      for (let i = 0; i < 2; i++) {
        const ft = this.feet[i], o = Pz.feet[i], side = i === 0 ? 1 : -1;
        A.g.set(Math.sin(ft.yaw), 0, Math.cos(ft.yaw));   // foot forward on the floor
        let phi = 0;
        if (airborne) {
          this.shotAirAnkle(i, t, o.ankle);
          const tau = t - s.tTake, left = s.landT - t;
          phi = lerp(s.phiTake, 0.95, smooth(tau / 0.14));
          if (left < 0.16) phi = lerp(s.phiLand, phi, smooth(left / 0.16));
          const fy = lerp(ft.yaw, s.landYaw - side * 0.2, smooth(tau / s.tAir)); A.g.set(Math.sin(fy), 0, Math.cos(fy));
          if (s.kick && i === st.kickLeg) phi = lerp(phi, 0.6, this.shotKickAt(t));
        } else {
          if (!s.air && t > s.tTake - 0.1) phi = s.phiTake * smooth((t - s.tTake + 0.1) / 0.1) * (1 - smooth((t - s.tTake - 0.25) / 0.15));
          else if (t < s.tTake) phi = s.phiTake * smooth((t - (s.tTake - Math.min(0.12, 0.6 * s.D))) / Math.min(0.12, 0.6 * s.D));
          else if (s.air) phi = s.phiLand * (1 - smooth((t - s.landT) / 0.09));
          if (ft.swinging) { // gather step / hop in the air: toe-off then heel strike
            const st0 = s.steps.find((x) => x.i === i && x.started && !x.done);
            const uu = st0 ? clamp((t - st0.t0) / (st0.t1 - st0.t0), 0, 1) : 0.5;
            phi = 0.35 * Math.sin(Math.PI * uu) * (1 - uu) - 0.12 * Math.sin(Math.PI * uu) * uu;
            o.ankle.copy(ft.pos).setY(d.ankleY + ft.pos.y);
          } else rolledAnkle(s, A.e.copy(ft.pos).setY(0), A.g, phi, o.ankle);
        }
        o.fwd.copy(A.g).multiplyScalar(Math.cos(phi)).addScaledVector(u, -Math.sin(phi)).normalize();
        o.up.copy(u).multiplyScalar(Math.cos(phi)).addScaledVector(A.g, Math.sin(phi)).normalize();
        // knees track over the toes; signature inward dip in the load
        o.pole.copy(f).addScaledVector(r, side * (0.15 - st.kneeIn * 0.75 * kin)).normalize();
      }
    };
    PP.shotKickAt = function (t) {
      const s = this.shot;
      return smooth((t - s.tTake - 0.03) / 0.14) * (1 - smooth((t - s.T - 0.18) / 0.3));
    };
    // airborne ankle: hangs under the hip, tucks / comes together / kicks, blends from take-off to landing spots
    PP.shotAirAnkle = function (i, t, out) {
      const s = this.shot, d = this.dims, st = this.shotStyle(), Pz = this.pose, A = sa(this), hs = this.hs;
      const side = i === 0 ? 1 : -1, tau = t - s.tTake, sA = clamp(tau / s.tAir, 0, 1);
      const f = A.f, r = A.r, u = A.u;
      A.hip.copy(d.hipLocal[i]).multiplyScalar(d.scale).applyQuaternion(Pz.pelvisQ).add(Pz.pelvis);
      const bell = Math.pow(Math.sin(Math.PI * clamp(sA * 1.12, 0, 1)), 0.8);
      const tk = s.tuck * bell;
      let beta = 0.55 * tk, len = d.legLen * (0.975 - 0.16 * tk);
      let lateral = -side * d.hipHalf * 0.75 * s.together * bell;
      if (s.kick) {
        const kk = this.shotKickAt(t) * s.kick;
        if (i === st.kickLeg) { beta = lerp(beta, -0.62, kk); len = lerp(len, d.legLen * 0.97, kk); lateral += side * 0.12 * kk * hs; }
        else beta = lerp(beta, 0.22, kk);
      }
      out.copy(A.hip).addScaledVector(u, -len * Math.cos(beta)).addScaledVector(f, -len * Math.sin(beta) + 0.02 * hs).addScaledVector(r, lateral);
      // from the take-off spot (on the toes) …
      const ft = this.feet[i];
      if (tau < 0.1) {
        A.g.set(Math.sin(ft.yaw), 0, Math.cos(ft.yaw));
        rolledAnkle(s, A.e.copy(ft.pos).setY(0), A.g, s.phiTake, A.c);
        out.lerpVectors(A.c, out, smooth(tau / 0.1));
      }
      // … to the landing spot
      if (sA > 0.66) {
        const fy = s.landYaw - side * 0.2; A.g.set(Math.sin(fy), 0, Math.cos(fy));
        rolledAnkle(s, A.e.copy(s.land[i]), A.g, s.phiLand, A.c);
        out.lerp(A.c, smooth((sA - 0.66) / 0.34));
      }
      return out;
    };

    PP.shotFeetWrapped = true;
  }

  // dispatch: while shooting, the shot module drives the pose and the feet (wraps whatever movement
  // implementation is installed; re-checked at every shot start so later overrides stay covered)
  function ensureDispatch(Player) {
    const PP = Player.prototype;
    if (!PP.computePose.__shot) {
      const base = PP.computePose;
      const fn = function (dt) {
        if (this.action === 'shoot' && this.shot) { this.computeShotPose(dt); return; }
        base.call(this, dt);
        const ex = this._shotExit;
        if (ex) {
          const k = (this.time - ex.t0) / 0.3;
          if (k >= 1 || Math.hypot(this.x - ex.x, this.z - ex.z) > 1.2 || this.action === 'dunk') this._shotExit = null;
          else blendPose(this.pose, sa(this).exit, 1 - smooth(k), false, false);
        }
      };
      fn.__shot = true; PP.computePose = fn;
    }
    if (!PP.updateFeet.__shot) {
      const base = PP.updateFeet;
      const fn = function (dt) { if (this.action === 'shoot' && this.shot) { this.shotFeet(dt); return; } return base.call(this, dt); };
      fn.__shot = true; PP.updateFeet = fn;
    }
    if (!PP.update.__shot) {
      const base = PP.update;
      const fn = function (dt, inp, now) {
        const A = sa(this);
        A.bPrev.copy(this.ballPos);
        this._inpMag = inp ? Math.hypot(inp.mx || 0, inp.mz || 0) : 0;
        const out = base.call(this, dt, inp, now);
        if (dt > 0) A.ballVel.subVectors(this.ballPos, A.bPrev).divideScalar(dt);
        return out;
      };
      fn.__shot = true; PP.update = fn;
    }
  }

  install(HoopPlayer.Player);
  ensureDispatch(HoopPlayer.Player);
  return { install, ensureDispatch, DEFAULT_STYLE, resolveStyle };
})();
