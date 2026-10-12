// HOOP LAB — shot model: turns jumper mechanics + release timing + balance into ball release conditions.
// Everything here is deterministic except the optional "human variance" term, which uses a seeded RNG.
const HoopShot = (() => {
  'use strict';
  const PH = (typeof HoopPhysics !== 'undefined') ? HoopPhysics : require('./physics.js');
  const K = PH.K;
  const DEG = Math.PI / 180;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  // tuning constants (see README "Shooting physics")
  const KT = 0.36;   // fractional launch-speed error per second of timing error (late = harder)
  const KA = 0.42;   // launch-angle error (rad) per second of timing error (late = flatter)
  const KG = 0.13;   // guide-hand push: lateral angle (rad) per second of timing error, times guide involvement
  const KE = 0.10;   // flared elbow: lateral pull (rad) per second of |timing error|, times elbow flare
  const AIM_PAST = 0.01;  // shooters aim a hair past the center of the ring
  const DIFFICULTY = { casual: 0.62, pro: 1.0, sim: 1.35 };
  const VARIANCE = { off: 0, low: 1, real: 2.6 };

  const DEFAULT_SHOOT = { baseRange: 9.6, kMul: 1, kMulMid: 1, moveComp: 0.88, releaseMul: 1, heave: 1 };
  const DEFAULT_MOVE = { maxLeap: 0.8 };

  // physical / derived attributes of a jumper for a given character
  function derive(p, ch) {
    const s = ch ? ch.shoot : DEFAULT_SHOOT, m = ch ? ch.move : DEFAULT_MOVE;
    const releaseTime = clamp((lerp(0.78, 0.40, p.speed) + 0.07 * p.dip + 0.10 * p.motion + 0.03 * p.knee) * s.releaseMul, 0.34, 1.05);
    const jumpH = lerp(0.015, 0.62, p.jump) * (m.maxLeap / 0.8);
    const power = 0.30 * p.knee + 0.12 * p.dip + 0.22 * p.guide * p.extension + 0.14 * p.extension
                + 0.12 * (1 - p.setPoint) + 0.10 * p.jump * (1 - p.releaseTiming);
    const comfort = s.baseRange + 2.8 * (power - 0.35);
    const sensMech = 1 + 0.28 * p.elbow + 0.18 * Math.abs(p.lean) - 0.08 * (p.flick - 0.5) + 0.05 * p.motion;
    const comp = clamp(s.moveComp * (1 - 0.12 * p.motion) * (1 - 0.08 * p.elbow) * (0.94 + 0.06 * (1 - Math.abs(p.lean))), 0.3, 0.98);
    const spinRps = clamp(lerp(1.5, 2.9, p.flick) - 0.35 * p.guide, 1.1, 3.0);
    const arcDeg = lerp(-1.5, 9.0, p.arc);
    return { releaseTime, jumpH, power, comfort, sensMech, comp, spinRps, arcDeg };
  }

  function rangeSens(dist, comfort, heave) {
    const x = Math.max(0, dist - comfort) / heave;
    return 1 + 0.12 * x + 0.010 * x * x;
  }

  function sensitivity(d, ch, dist, difficulty) {
    const s = ch ? ch.shoot : DEFAULT_SHOOT;
    const t = clamp((dist - 5.8) / 1.2, 0, 1);
    const charK = lerp(s.kMulMid, s.kMul, t);
    return charK * d.sensMech * rangeSens(dist, d.comfort, s.heave) * (DIFFICULTY[difficulty] || 1);
  }

  // Plan = the shooter's intended release velocity for a release point (no errors yet).
  function planShot(o) {
    const H = PH.HOOPS[o.hoop];
    let dx = H.cx - o.pos.x, dz = H.cz - o.pos.z;
    const dist = Math.hypot(dx, dz) || 1e-6;
    dx /= dist; dz /= dist;
    const aimX = H.cx + dx * AIM_PAST, aimZ = H.cz + dz * AIM_PAST, aimY = K.RIM_TOP;
    const th0 = PH.minSpeedAngle(o.pos.x, o.pos.y, o.pos.z, aimX, aimY, aimZ);
    const over = Math.max(0, dist - o.d.comfort);
    const arc = o.d.arcDeg * clamp(1 - over / 5, 0.15, 1);
    const theta = Math.min(th0 + arc * DEG, 80 * DEG);
    const sol = PH.solveLaunchSpeed(o.pos.x, o.pos.y, o.pos.z, aimX, aimY, aimZ, theta, o.d.spinRps);
    return {
      hoop: o.hoop, dx, dz, dist, theta, speed: sol.speed, solved: sol.ok,
      sens: sensitivity(o.d, o.ch, dist, o.difficulty), d: o.d, p: o.p,
      pos: { x: o.pos.x, y: o.pos.y, z: o.pos.z },
    };
  }

  // Applies the timing error e (seconds, + = late), uncompensated body momentum and optional variance.
  function releaseFromPlan(plan, o) {
    const e = o.e || 0, sens = plan.sens, p = plan.p;
    const vScale = (VARIANCE[o.variance] || 0) * Math.sqrt(sens);
    const nS = o.rng && vScale ? o.rng() * 0.0016 * vScale : 0;
    const nY = o.rng && vScale ? o.rng() * 0.0021 * vScale : 0;
    const nA = o.rng && vScale ? o.rng() * 0.0026 * vScale : 0;
    const speed = plan.speed * (1 + KT * e * sens + nS);
    const angle = plan.theta - KA * e * sens + nA;
    const yaw = (KG * p.guide * e - KE * p.elbow * Math.abs(e)) * sens + nY;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const hx = plan.dx * cy - plan.dz * sy, hz = plan.dz * cy + plan.dx * sy; // rotate toward shooter's right
    let vx = speed * Math.cos(angle) * hx, vy = speed * Math.sin(angle), vz = speed * Math.cos(angle) * hz;
    const comp = clamp(plan.d.comp * (1 - 0.45 * (o.offBalance || 0)), 0, 1);
    const b = o.body || { vx: 0, vy: 0, vz: 0 };
    vx += (1 - comp) * b.vx; vy += (1 - comp) * b.vy; vz += (1 - comp) * b.vz;
    const w = plan.d.spinRps * 2 * Math.PI;
    const tilt = clamp(-yaw * 6, -0.5, 0.5);
    const ax = -hz * Math.cos(tilt), ay = Math.sin(tilt), az = hx * Math.cos(tilt);
    const outSpeed = Math.hypot(vx, vy, vz);
    return {
      vx, vy, vz, wx: ax * w, wy: ay * w, wz: az * w,
      speed: outSpeed, angle: Math.atan2(vy, Math.hypot(vx, vz)), yaw, e, sens, comp,
      idealSpeed: plan.speed, idealAngle: plan.theta, dist: plan.dist,
    };
  }

  // Where would this release cross the ring plane, relative to the ring center?
  function evalCross(plan, rel, pos) {
    const H = PH.HOOPS[plan.hoop];
    const c = PH.flightCross(pos.x, pos.y, pos.z, rel.vx, rel.vy, rel.vz, rel.wx, rel.wy, rel.wz, K.RIM_TOP);
    if (!c.ok) return { ok: false, along: -9, lat: 0, beta: 0, clean: false };
    const ox = c.x - H.cx, oz = c.z - H.cz;
    const along = ox * plan.dx + oz * plan.dz, lat = -ox * plan.dz + oz * plan.dx;
    const beta = Math.atan2(-c.vy, Math.hypot(c.vx, c.vz));
    const allowA = K.RIM_R - (K.BALL_R + K.RIM_TUBE) / Math.max(0.05, Math.sin(beta));
    const allowL = K.RIM_R - (K.BALL_R + K.RIM_TUBE);
    const clean = allowA > 0 && (along / allowA) ** 2 + (lat / allowL) ** 2 <= 1;
    return { ok: true, along, lat, beta, clean, apex: c.apex };
  }

  // Timing window (seconds) that produces a clean, rim-free entry for this plan and body state.
  function timingWindow(plan, o = {}) {
    let lo = null, hi = null, bestE = null, bestErr = 1e9;
    const step = 0.002;
    for (let e = -0.16; e <= 0.16 + 1e-9; e += step) {
      const pos = o.posAtE ? o.posAtE(e) : plan.pos;
      const rel = releaseFromPlan(plan, { e, body: o.body, offBalance: o.offBalance, variance: 'off' });
      const r = evalCross(plan, rel, pos);
      const err = r.ok ? Math.abs(r.along) + Math.abs(r.lat) : 9;
      if (err < bestErr) { bestErr = err; bestE = e; }
      if (r.clean) { if (lo === null) lo = e; hi = e; }
    }
    return { lo, hi, best: bestE, width: lo === null ? 0 : hi - lo + step };
  }

  // seeded RNG (mulberry32) returning standard normal samples
  function makeRng(seed) {
    let a = seed >>> 0;
    const uni = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    let spare = null;
    const normal = () => {
      if (spare !== null) { const s = spare; spare = null; return s; }
      let u = 0, v = 0; while (u === 0) u = uni(); v = uni();
      const m = Math.sqrt(-2 * Math.log(u)); spare = m * Math.sin(2 * Math.PI * v); return m * Math.cos(2 * Math.PI * v);
    };
    normal.uniform = uni;
    return normal;
  }

  function gradeTiming(eMs, win) {
    const a = Math.abs(eMs);
    if (win && win.lo !== null && eMs / 1000 >= win.lo - 0.0005 && eMs / 1000 <= win.hi + 0.0005 && a <= 25) return 'Perfect';
    if (a <= 12) return 'Perfect';
    if (a <= 35) return eMs < 0 ? 'Slightly early' : 'Slightly late';
    if (a <= 80) return eMs < 0 ? 'Early' : 'Late';
    return eMs < 0 ? 'Very early' : 'Very late';
  }


  // ---------------------------------------------------------------- game entry points
  // The game loop only talks to these two functions; everything about how a release becomes a
  // ball launch lives in this module. ctx (plain data, built by game.js):
  //   hoop, idealPos {x,y,z} (ball at the ideal release instant), pos {x,y,z} (actual release point),
  //   eSec (timing error, + = late), body {vx,vy,vz} (shooter velocity at release),
  //   bodyIdeal {vx,vy,vz} (at the ideal instant), offBalance, d (derive()), ch (character def),
  //   p (jumper params), difficulty, variance, rng, posAtE(e) -> {x,y,z} (release point for error e)
  function resolveRelease(ctx) {
    const plan = planShot({ hoop: ctx.hoop, pos: ctx.idealPos, d: ctx.d, ch: ctx.ch, p: ctx.p, difficulty: ctx.difficulty });
    const rel = releaseFromPlan(plan, { e: ctx.eSec, body: ctx.body, offBalance: ctx.offBalance, variance: ctx.variance, rng: ctx.rng });
    return { plan, rel };
  }
  // Shot-meter window for the shot that is starting: { lo, hi, best, width } in seconds of timing error.
  function shotWindow(ctx) {
    const plan = planShot({ hoop: ctx.hoop, pos: ctx.idealPos, d: ctx.d, ch: ctx.ch, p: ctx.p, difficulty: ctx.difficulty });
    const win = timingWindow(plan, { posAtE: ctx.posAtE, body: ctx.bodyIdeal, offBalance: ctx.offBalance });
    win.plan = plan;
    return win;
  }

  return { derive, planShot, resolveRelease, shotWindow, releaseFromPlan, evalCross, timingWindow, sensitivity, rangeSens, makeRng, gradeTiming,
           KT, KA, KG, KE, DIFFICULTY, VARIANCE, AIM_PAST };
})();
if (typeof module !== 'undefined') module.exports = HoopShot;
