// Node tests for HOOP LAB physics + shot model. Run: node tests/physics.test.js
const PH = require('../src/physics.js');
const SH = require('../src/shotmodel.js');
const RO = require('../src/roster.js');
const K = PH.K;

let pass = 0, fail = 0;
const results = [];
function check(name, cond, info = '') {
  if (cond) pass++; else fail++;
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
}

// simulate a released ball until resolved; returns outcome with contacts
function simulate(b, maxT = 8, hoopIdx = 0) {
  const out = { scored: false, contacts: [], firstContact: null, rimHits: 0, boardHits: 0, floorFirst: false, crossed: null, minRimDist: 9, t: 0 };
  const ev = (kind, hi, x, y, z, speed) => {
    if (kind === 'floor' && !out.firstContact) out.floorFirst = true;
    if (!out.firstContact) out.firstContact = kind;
    out.contacts.push({ kind, hi, x, y, z, speed, t: out.t });
    if (kind === 'rim' && hi === hoopIdx) out.rimHits++;
    if (kind === 'board' && hi === hoopIdx) out.boardHits++;
  };
  const sev = (type, hi, d) => {
    if (type === 'score' && hi === hoopIdx) out.scored = true;
    if (type === 'cross' && hi === hoopIdx && !out.crossed) out.crossed = d;
  };
  const H = PH.HOOPS[hoopIdx];
  for (let t = 0; t < maxT; t += K.PHYS_DT) {
    out.t = t;
    PH.step(b, K.PHYS_DT, ev, sev);
    // track distance from ball center to ring centerline (tunneling check)
    const rx = b.px - H.cx, rz = b.pz - H.cz, dh = Math.hypot(rx, rz);
    const d = Math.hypot(dh - K.RIM_R, b.py - H.cy);
    if (d < out.minRimDist) out.minRimDist = d;
    if (out.scored && t > 0.2 && b.py < 1.2) break;
    if (b.resting) break;
    if (out.contacts.some(c => c.kind === 'floor') && !out.scored && t > 0.5) break;
  }
  return out;
}

function shoot(pos, hoop, d, p, ch, e = 0, opts = {}) {
  const plan = SH.planShot({ pos, hoop, d, p, ch, difficulty: opts.difficulty || 'pro' });
  const rel = SH.releaseFromPlan(plan, { e, body: opts.body, offBalance: opts.offBalance, variance: 'off' });
  const b = PH.createBall();
  PH.placeBall(b, pos.x, pos.y, pos.z, rel.vx, rel.vy, rel.vz, rel.wx, rel.wy, rel.wz);
  const r = simulate(b, 10, hoop);
  return { plan, rel, r };
}

// ---------------------------------------------------------------- 1. integrator vs analytic (vacuum)
{
  const kd = K.K_DRAG, km = K.K_MAGNUS;
  K.K_DRAG = 0; K.K_MAGNUS = 0;
  const b = PH.createBall();
  PH.placeBall(b, -5, 2, 0, 7, 7, 0);
  const T = 0.8; let t = 0;
  while (t < T - 1e-9) { PH.step(b, K.PHYS_DT); t += K.PHYS_DT; }
  const ex = -5 + 7 * T, ey = 2 + 7 * T - 0.5 * K.G * T * T;
  const err = Math.hypot(b.px - ex, b.py - ey);
  check('Projectile matches analytic solution in vacuum', err < 1e-6, `error ${(err * 1000).toFixed(4)} mm after ${T}s`);
  K.K_DRAG = kd; K.K_MAGNUS = km;
}

// ---------------------------------------------------------------- 2. drag + Magnus shape the flight
{
  const b1 = PH.createBall(); PH.placeBall(b1, -10, 2, 0, 8, 8, 0);
  const cp = (c) => ({ x: c.x, ok: c.ok }); // flightCross reuses one result object
  const c1 = cp(PH.flightCross(-10, 2, 0, 8, 8, 0, 0, 0, 0, 2));
  const kd = K.K_DRAG; K.K_DRAG = 0; const km = K.K_MAGNUS; K.K_MAGNUS = 0;
  const c0 = cp(PH.flightCross(-10, 2, 0, 8, 8, 0, 0, 0, 0, 2));
  K.K_DRAG = kd; K.K_MAGNUS = km;
  const cs = cp(PH.flightCross(-10, 2, 0, 8, 8, 0, 0, 0, 2.5 * 2 * Math.PI, 2)); // backspin about +z for +x travel
  check('Air drag shortens the flight', c1.x < c0.x, `vacuum range ${(c0.x + 10).toFixed(3)} m, with drag ${(c1.x + 10).toFixed(3)} m`);
  check('Backspin (Magnus) adds lift / carry', cs.x > c1.x, `no-spin ${(c1.x + 10).toFixed(3)} m, 2.5 rev/s backspin ${(cs.x + 10).toFixed(3)} m`);
}

// ---------------------------------------------------------------- 3. floor bounce energy
{
  const b = PH.createBall();
  PH.placeBall(b, 0, 1.8288 + K.BALL_R, 0); // 72 in drop, measured at bottom of ball
  let bounced = false, apex = 0, t = 0;
  while (t < 3) {
    const vy0 = b.vy; PH.step(b, K.PHYS_DT); t += K.PHYS_DT;
    if (!bounced && vy0 < 0 && b.vy > 0) bounced = true;
    if (bounced) { apex = Math.max(apex, b.py - K.BALL_R); if (b.vy < 0) break; }
  }
  const inch = apex / 0.0254;
  check('Ball dropped from 72 in rebounds 49-56 in (regulation inflation test)', inch > 49 && inch < 56, `rebound ${inch.toFixed(1)} in`);
  let tt = 0; while (!b.resting && tt < 30) { PH.step(b, K.PHYS_DT); tt += K.PHYS_DT; }
  check('Bouncing ball loses energy and comes to rest', b.resting, `rested after ${tt.toFixed(1)} s more`);
}

// ---------------------------------------------------------------- 4. no tunneling through rim or backboard
{
  const rng = SH.makeRng(1234);
  let minD = 9, boardPass = 0, n = 0;
  for (let i = 0; i < 1500; i++) {
    const H = PH.HOOPS[0];
    const ang = rng.uniform() * Math.PI * 2;
    const tx = H.cx + Math.cos(ang) * K.RIM_R, tz = Math.sin(ang) * K.RIM_R; // point on the ring
    const sp = 6 + rng.uniform() * 26; // up to 32 m/s
    const dirx = (rng.uniform() - 0.3), diry = (rng.uniform() - 0.5) * 1.4, dirz = (rng.uniform() - 0.5);
    const l = Math.hypot(dirx, diry, dirz);
    const b = PH.createBall();
    PH.placeBall(b, tx - dirx / l * 0.6, H.cy - diry / l * 0.6, tz - dirz / l * 0.6, dirx / l * sp, diry / l * sp, dirz / l * sp);
    for (let t = 0; t < 0.6; t += K.PHYS_DT) {
      PH.step(b, K.PHYS_DT);
      const rx = b.px - H.cx, rz = b.pz - H.cz;
      const d = Math.hypot(Math.hypot(rx, rz) - K.RIM_R, b.py - H.cy);
      minD = Math.min(minD, d);
    }
    n++;
  }
  check('No rim tunneling: 1500 random impacts up to 32 m/s', minD > K.BALL_R + K.RIM_TUBE - 0.004, `closest approach ${(minD * 1000).toFixed(1)} mm (contact limit ${((K.BALL_R + K.RIM_TUBE) * 1000).toFixed(1)} mm)`);
  for (let i = 0; i < 800; i++) {
    const sp = 8 + rng.uniform() * 24;
    const b = PH.createBall();
    const y = K.BOARD_BOTTOM + 0.15 + rng.uniform() * 0.8, z = (rng.uniform() - 0.5) * 1.5;
    PH.placeBall(b, K.BOARD_X - 1.0, y, z, sp, 0, 0);
    for (let t = 0; t < 0.5; t += K.PHYS_DT) {
      PH.step(b, K.PHYS_DT);
      if (b.px > K.BOARD_X + K.BOARD_T && b.py > K.BOARD_BOTTOM && b.py < K.BOARD_BOTTOM + K.BOARD_H && Math.abs(b.pz) < K.BOARD_W / 2) { boardPass++; break; }
    }
  }
  check('No backboard tunneling: 800 shots up to 32 m/s', boardPass === 0, `${boardPass} passed through`);
}

// ---------------------------------------------------------------- 5. perfectly timed shots score from every range
const spots = [
  ['Layup area', 1.3, 0.7], ['Free throw', K.FT_DIST, 0], ['Midrange', 5.5, -0.6], ['College 3', 6.85, 0.3],
  ['NBA 3', 7.45, -0.5], ['Corner 3', 6.95, 1.48], ['Hash-mark deep', 8.9, 0.2], ['Logo', 10.6, 0], ['Half-court', 12.9, 0.1],
];
const rangeTable = [];
for (const ch of RO.CHARACTERS) {
  const p = ch.sig.params, d = SH.derive(p, ch);
  let made = 0;
  for (const [label, dist, ang] of spots) {
    const H = PH.HOOPS[0];
    const pos = { x: H.cx - Math.cos(ang) * dist, y: 2.25 + ch.heightM * 0.2 + d.jumpH * 0.6, z: Math.sin(ang) * dist };
    const { r, rel, plan } = shoot(pos, 0, d, p, ch, 0);
    if (r.scored) made++;
    const win = SH.timingWindow(plan, {});
    rangeTable.push(`${ch.name.padEnd(14)} ${label.padEnd(15)} ${dist.toFixed(2)} m  speed ${rel.speed.toFixed(2)} m/s  angle ${(rel.angle * 180 / Math.PI).toFixed(1)}°  ${r.scored ? (r.rimHits ? 'MAKE (rim)' : r.boardHits ? 'BANK' : 'SWISH') : 'MISS'}  clean window ${win.lo === null ? 'none' : ((win.lo * 1000).toFixed(0) + '…' + (win.hi * 1000).toFixed(0) + ' ms')}`);
  }
  check(`${ch.name}: perfect release scores from all ${spots.length} ranges`, made === spots.length, `${made}/${spots.length}`);
}
{ // full-court heave toward the far hoop (hoop index 1)
  const ch = RO.CHARACTERS[1], p = ch.sig.params, d = SH.derive(p, ch);
  const pos = { x: 11.8, y: 2.5, z: 2.5 }; // near the far baseline, in front of the other basket
  const { r, rel } = shoot(pos, 1, d, p, ch, 0);
  check('Full-court heave with perfect release reaches and scores', r.scored, `distance ${PH.distToHoop(pos.x, pos.z, 1).toFixed(1)} m, speed ${rel.speed.toFixed(2)} m/s`);
}

// ---------------------------------------------------------------- 6. timing errors are predictable: early = short, late = long
{
  const ch = RO.CHARACTERS[0], p = ch.sig.params, d = SH.derive(p, ch);
  const H = PH.HOOPS[0];
  const pos = { x: H.cx - 7.45, y: 2.55, z: 0 };
  const plan = SH.planShot({ pos, hoop: 0, d, p, ch, difficulty: 'pro' });
  const crossAt = (e) => SH.evalCross(plan, SH.releaseFromPlan(plan, { e, variance: 'off' }), pos).along;
  const a = [-0.08, -0.04, 0, 0.04, 0.08].map(crossAt);
  const mono = a.every((v, i) => i === 0 || v > a[i - 1]);
  check('Timing error maps monotonically to depth: early short, late long', mono && a[0] < -0.1 && a[4] > 0.1, a.map(v => (v * 100).toFixed(1) + 'cm').join(', '));
  const early = shoot(pos, 0, d, p, ch, -0.07).r, late = shoot(pos, 0, d, p, ch, 0.07).r;
  const firstRim = (r) => { const c = r.contacts.find(c => c.kind === 'rim' || c.kind === 'board'); if (!c) return 'none'; const along = (c.x - H.cx); return c.kind === 'board' ? 'board' : along < 0 ? 'front' : 'back'; };
  check('70 ms early misses short (front rim or airball)', !early.scored && ['front', 'none'].includes(firstRim(early)), `first contact: ${firstRim(early)}`);
  check('70 ms late misses long (back rim / board)', !late.scored && ['back', 'board'].includes(firstRim(late)), `first contact: ${firstRim(late)}`);
  // guide hand + elbow make lateral error predictable
  const pl2 = Object.assign({}, p, { guide: 1, elbow: 0 });
  const plan2 = SH.planShot({ pos, hoop: 0, d: SH.derive(pl2, ch), p: pl2, ch, difficulty: 'pro' });
  const lat = SH.evalCross(plan2, SH.releaseFromPlan(plan2, { e: 0.05, variance: 'off' }), pos).lat;
  check('Heavy guide hand + late release pushes the ball toward the shooting-hand side', lat > 0.01, `lateral ${(lat * 100).toFixed(1)} cm`);
  // body drift
  const drift = SH.evalCross(plan, SH.releaseFromPlan(plan, { e: 0, body: { vx: 0, vy: 0, vz: -2.5 }, variance: 'off' }), pos).lat;
  check('Drifting left at release carries the ball left (uncompensated momentum)', drift < -0.01, `lateral ${(drift * 100).toFixed(1)} cm at 2.5 m/s drift`);
}

// ---------------------------------------------------------------- 7. outcome variety from the same physics
{
  const ch = RO.CHARACTERS[2], p = ch.sig.params, d = SH.derive(p, ch);
  const H = PH.HOOPS[0];
  let swish = 0, rimIn = 0, rattle = 0, bank = 0, front = 0, back = 0, side = 0, air = 0, total = 0;
  const rng = SH.makeRng(77);
  for (let i = 0; i < 700; i++) {
    const dist = 3 + rng.uniform() * 6, ang = (rng.uniform() - 0.5) * 2.6;
    const pos = { x: H.cx - Math.cos(ang) * dist, y: 2.6, z: Math.sin(ang) * dist };
    const e = (rng.uniform() - 0.5) * 0.14;
    const plan = SH.planShot({ pos, hoop: 0, d, p, ch, difficulty: 'pro' });
    const rel = SH.releaseFromPlan(plan, { e, variance: 'real', rng });
    const b = PH.createBall(); PH.placeBall(b, pos.x, pos.y, pos.z, rel.vx, rel.vy, rel.vz, rel.wx, rel.wy, rel.wz);
    const r = simulate(b, 10, 0);
    total++;
    if (r.scored) {
      const firstHard = r.contacts.find(c => c.kind === 'rim' || c.kind === 'board');
      if (!firstHard) swish++; else if (firstHard.kind === 'board') bank++; else if (r.rimHits >= 3) rattle++; else rimIn++;
    } else {
      const c = r.contacts.find(c => c.kind === 'rim');
      if (!r.contacts.some(c => c.kind === 'rim' || c.kind === 'board')) air++;
      else if (c) {
        const ox = c.x - H.cx, oz = c.z, dxs = (H.cx - pos.x) / plan.dist, dzs = -pos.z / plan.dist;
        const al = ox * dxs + oz * dzs, la = -ox * dzs + oz * dxs;
        if (Math.abs(la) > Math.abs(al)) side++; else if (al < 0) front++; else back++;
      }
    }
  }
  check('Same physics produces swishes, rim-ins, rattles and front/back/side/air misses',
    swish && rimIn && rattle && front && back && side && air,
    `swish ${swish}, rim-in ${rimIn}, rattle-in(3+ hits) ${rattle}, bank ${bank}, front ${front}, back ${back}, side ${side}, air ${air} of ${total}`);
}

// ---------------------------------------------------------------- 8. intentional bank shot off the glass
{
  const H = PH.HOOPS[0];
  let found = null;
  const pos = { x: H.cx - 3.0, y: 2.5, z: 3.0 }; // 45° angle
  for (let sp = 6.0; sp <= 9.0 && !found; sp += 0.02) for (let ang = 40; ang <= 62 && !found; ang += 0.5) {
    // aim toward a point on the glass above the ring on the near side
    const tx = K.BOARD_X, tz = 0.24;
    let dx = tx - pos.x, dz = tz - pos.z; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    const a = ang * Math.PI / 180, w = 2 * 2 * Math.PI;
    const b = PH.createBall(); PH.placeBall(b, pos.x, pos.y, pos.z, sp * Math.cos(a) * dx, sp * Math.sin(a), sp * Math.cos(a) * dz, -dz * w, 0, dx * w);
    const r = simulate(b, 6, 0);
    if (r.scored && r.firstContact === 'board') found = { sp, ang };
  }
  check('Bank shots off the glass are possible from the 45', !!found, found ? `e.g. ${found.sp.toFixed(2)} m/s at ${found.ang}°` : 'none found');
}

// ---------------------------------------------------------------- 9. determinism
{
  const ch = RO.CHARACTERS[0], p = ch.sig.params, d = SH.derive(p, ch);
  const pos = { x: 5, y: 2.5, z: 1.2 };
  const run = () => { const { rel } = shoot(pos, 0, d, p, ch, 0.031); const b = PH.createBall(); PH.placeBall(b, pos.x, pos.y, pos.z, rel.vx, rel.vy, rel.vz, rel.wx, rel.wy, rel.wz); for (let i = 0; i < 1200; i++) PH.step(b, K.PHYS_DT); return [b.px, b.py, b.pz, b.vx, b.qx, b.qw]; };
  const a = run(), c = run();
  check('Simulation is deterministic (identical input → identical 5 s result)', a.every((v, i) => v === c[i]));
  const r1 = SH.makeRng(9), r2 = SH.makeRng(9);
  check('Seeded human-variance RNG is reproducible', [1, 2, 3].every(() => r1() === r2()));
}

// ---------------------------------------------------------------- 10. jumper presets produce sensible physical attributes
{
  const lines = [];
  for (const ch of RO.CHARACTERS) for (const pr of [ch.sig, ...RO.PRESETS]) {
    const d = SH.derive(pr.params, ch);
    lines.push(`${ch.name.padEnd(14)} ${pr.name.padEnd(28)} release ${(d.releaseTime * 1000).toFixed(0)} ms  jump ${d.jumpH.toFixed(2)} m  comfort ${d.comfort.toFixed(1)} m  sens ${d.sensMech.toFixed(2)}  move-comp ${d.comp.toFixed(2)}  spin ${d.spinRps.toFixed(1)} rps`);
  }
  const mine = SH.derive(RO.presetById('mine').params, RO.CHARACTERS[0]);
  const trad = SH.derive(RO.presetById('traditional').params, RO.CHARACTERS[0]);
  check('"My Real-Life Jumper": more range than a traditional jumper on a much smaller jump', mine.comfort > trad.comfort + 0.5 && mine.jumpH < trad.jumpH * 0.4, `comfort ${mine.comfort.toFixed(1)} vs ${trad.comfort.toFixed(1)} m, jump ${mine.jumpH.toFixed(2)} vs ${trad.jumpH.toFixed(2)} m`);
  const g = SH.derive(RO.CHARACTERS[0].sig.params, RO.CHARACTERS[0]), f = SH.derive(RO.CHARACTERS[1].sig.params, RO.CHARACTERS[1]), w = SH.derive(RO.CHARACTERS[2].sig.params, RO.CHARACTERS[2]);
  check('Signature mechanics differ: guard quickest + deepest, wing highest jump', g.releaseTime < f.releaseTime && g.releaseTime < w.releaseTime && g.comfort > f.comfort && g.comfort > w.comfort && w.jumpH > g.jumpH && w.jumpH > f.jumpH,
    `release ${(g.releaseTime * 1000) | 0}/${(f.releaseTime * 1000) | 0}/${(w.releaseTime * 1000) | 0} ms, comfort ${g.comfort.toFixed(1)}/${f.comfort.toFixed(1)}/${w.comfort.toFixed(1)} m, jump ${g.jumpH.toFixed(2)}/${f.jumpH.toFixed(2)}/${w.jumpH.toFixed(2)} m`);
  results.push('', '--- jumper attribute table ---', ...lines);
}

// ---------------------------------------------------------------- 11. timing windows shrink with distance
{
  const ch = RO.CHARACTERS[0], p = ch.sig.params, d = SH.derive(p, ch);
  const H = PH.HOOPS[0];
  const ws = [4.19, 7.45, 10.6, 12.9, 22].map(dist => {
    const pos = { x: H.cx - dist, y: 2.5, z: 0 };
    const plan = SH.planShot({ pos, hoop: 0, d, p, ch, difficulty: 'pro' });
    return SH.timingWindow(plan, {}).width * 1000;
  });
  check('Clean-entry timing window narrows with distance', ws.every((w, i) => i === 0 || w <= ws[i - 1] + 0.01) && ws[0] > ws[3], ws.map((w, i) => `${[4.19, 7.45, 10.6, 12.9, 22][i]}m: ${w.toFixed(0)}ms`).join(', '));
}

results.push('', '--- perfect-release table (signature jumpers) ---', ...rangeTable);
console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
