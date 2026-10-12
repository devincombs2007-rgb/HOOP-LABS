// HOOP LAB — animation review harness. Boots the real game headless (SwiftShader), drives the player
// synchronously through window.HOOP / HoopPlayer, captures frame strips and measures what is drawn:
//   - jump shot per character (side + front view, ~10 phases), signature comparison sheet
//   - walk / jog / sprint cycle, hard stop, dribble, crossover, step-back (+ step-back jumper)
//   - numeric checks on the posed rig: foot sliding while planted, hand/foot IK reach errors,
//     hands on the ball, knee direction, ball/hand consistency at release.
// Run: node tests/anim_shots.js [only=curry,lebron] [scen=shot,gait,...] [out=tests/shots]
// Images: tests/shots/anim_*.png (gitignored). Exit code 1 if a numeric check fails.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const OUT = path.resolve(ROOT, args.out || 'tests/shots');
const ONLY = (args.only || 'curry,lebron,jordan').split(',');
const SCEN = (args.scen || 'shot,compare,gait,dribble,cross,stepback,pullup').split(',');
const FW = 300, FH = 420;
let pass = 0, fail = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); ok ? pass++ : fail++; };

// ---------------------------------------------------------------- in-page helper
function pageHelper() {
  const G = HOOP.G, K = HoopPhysics.K, R = G.renderer, CAM = G.camera;
  const FR = 1 / 60, TICK = K.FIXED_DT;
  const V = () => new THREE.Vector3();
  // stop the rAF loop: this harness owns time
  window.requestAnimationFrame = () => 0;
  HOOP.setAuto(false); HOOP.pause(false);
  if (window.HoopUI) HoopUI.showMenu(false);
  HOOP.setSetting('variance', 'off');
  const AH = {};
  let sheet = null, sctx = null;
  const tmp = { a: V(), b: V(), c: V(), d: V(), e: V(), toe: V(), heel: V() };
  // ------------------------------------------------ metrics
  const M = AH.M = {};
  AH.resetMetrics = () => {
    Object.assign(M, { frames: 0, slideMax: 0, slideSum: 0, slideFrames: 0, handErrMax: 0, handErrWhere: '', footErrMax: 0, footErrWhere: '',
      kneeInv: 0, kneeInvWhere: '', ballGapMax: 0, ballGapWhere: '', minKneeFlex: 999, prevContact: [null, null], prevPlanted: [false, false], label: '' });
  };
  AH.resetMetrics();
  function footContact(pl, i, out) {
    const m = pl.model, limb = m.limbs[i], an = limb.ankle;
    const mesh = an.children.find((c) => c.isMesh);
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    an.updateMatrixWorld(true);
    tmp.toe.set(0, bb.min.y, bb.max.z * 0.8).applyMatrix4(mesh.matrixWorld);
    tmp.heel.set(0, bb.min.y, bb.min.z * 0.8).applyMatrix4(mesh.matrixWorld);
    if (Math.abs(tmp.toe.y - tmp.heel.y) < 0.012) out.lerpVectors(tmp.toe, tmp.heel, 0.5);
    else out.copy(tmp.toe.y < tmp.heel.y ? tmp.toe : tmp.heel);
    return out;
  }
  AH.sample = (pl) => {
    M.frames++;
    const P = pl.pose, m = pl.model, d = pl.dims;
    // foot sliding (contact point of a planted foot must not move)
    for (let i = 0; i < 2; i++) {
      const ft = pl.feet[i];
      const c = footContact(pl, i, tmp.c);
      const planted = ft.planted && !ft.swinging && c.y < 0.06;
      if (planted && M.prevPlanted[i] && M.prevContact[i]) {
        const s = Math.hypot(c.x - M.prevContact[i].x, c.z - M.prevContact[i].z);
        if (s > M.slideMax) { M.slideMax = s; M.slideWhere = `${M.label} foot${i} t=${pl.time.toFixed(2)}`; }
        M.slideSum += s; M.slideFrames++;
      }
      M.prevPlanted[i] = planted;
      M.prevContact[i] = (M.prevContact[i] || V()).copy(c);
      // leg reach
      const an = m.limbs[i].ankle.getWorldPosition(tmp.a);
      const fe = an.distanceTo(P.feet[i].ankle);
      if (fe > M.footErrMax) { M.footErrMax = fe; M.footErrWhere = `${M.label} foot${i} ${pl.action} t=${pl.time.toFixed(2)}`; }
      // knee direction: bend must point forward-ish (along the foot), never backward
      const hip = m.limbs[i].hip.getWorldPosition(tmp.b), knee = m.limbs[i].knee.getWorldPosition(tmp.d);
      const axis = tmp.e.subVectors(an, hip); const L = axis.length(); axis.divideScalar(L);
      const off = knee.clone().sub(hip); off.addScaledVector(axis, -off.dot(axis));
      const fw = P.feet[i].fwd;
      const bend = off.x * fw.x + off.z * fw.z;
      if (bend < -0.01 && -bend > M.kneeInv) { M.kneeInv = -bend; M.kneeInvWhere = `${M.label} leg${i} ${pl.action} t=${pl.time.toFixed(2)}`; }
      const th = knee.clone().sub(hip).normalize(), sh = an.clone().sub(knee).normalize();
      const flex = Math.acos(Math.max(-1, Math.min(1, th.dot(sh)))) * 180 / Math.PI;
      if (pl.feet[i].planted && flex < M.minKneeFlex) M.minKneeFlex = flex;
    }
    // hands: IK reach and ball contact while the ball is held
    if (pl.hasBall) {
      for (let i = 0; i < 2; i++) {
        const w = m.limbs[i].wrist.getWorldPosition(tmp.a);
        const he = w.distanceTo(P.hands[i].wrist);
        const onBall = pl.handsOnBall ? pl.handsOnBall[i] : (i === 0);
        if (onBall && he > M.handErrMax) { M.handErrMax = he; M.handErrWhere = `${M.label} hand${i} ${pl.action} t=${pl.time.toFixed(2)}`; }
        if (onBall) {
          // palm center = wrist + fingers * palm
          const pc = tmp.b.copy(w).addScaledVector(P.hands[i].fingers, d.palm);
          const gap = pc.distanceTo(pl.ballPos) - K.BALL_R;
          if (gap > M.ballGapMax) { M.ballGapMax = gap; M.ballGapWhere = `${M.label} hand${i} ${pl.action} t=${pl.time.toFixed(2)}`; }
        }
      }
    }
  };
  // ------------------------------------------------ time
  // one rendered frame of play: two fixed ticks then the pose (exactly like the game's frame loop)
  AH.frame = (inp) => {
    const pl = G.player;
    if (inp) { // drive the player directly (movement tests); the game's tick would read keyboard input
      for (let k = 0; k < 2; k++) { G.now += TICK; pl.update(TICK, inp, G.now); for (const e of G.balls) if (e.state === 'held') { e.b.px = pl.ballPos.x; e.b.py = pl.ballPos.y; e.b.pz = pl.ballPos.z; } }
    } else HOOP.advance(FR);
    pl.computePose(FR); HoopCharacters.applyPose(pl.model, pl.pose);
    AH.sample(pl);
  };
  AH.run = (sec, inp) => { const n = Math.round(sec / FR); for (let i = 0; i < n; i++) AH.frame(inp); };
  // ------------------------------------------------ rendering
  function syncBalls() {
    const pl = G.player;
    for (const e of G.balls) {
      const m = G.W.ballMeshes[e.i];
      m.visible = e.active;
      if (!e.active) continue;
      if (e.state === 'held') m.position.copy(pl.ballPos); else m.position.set(e.b.px, e.b.py, e.b.pz);
    }
  }
  AH.cam = (view, opt = {}) => {
    const pl = G.player, yaw = opt.yaw !== undefined ? opt.yaw : pl.yaw;
    const f = V().set(Math.sin(yaw), 0, Math.cos(yaw)), r = V().set(-Math.cos(yaw), 0, Math.sin(yaw));
    const cx = opt.cx !== undefined ? opt.cx : pl.x, cz = opt.cz !== undefined ? opt.cz : pl.z;
    const dist = opt.dist || 7.5, h = opt.h || 1.35, ly = opt.ly || 1.3;
    let dir;
    if (view === 'side') dir = r.clone();               // from the shooter's right (shooting arm side)
    else if (view === 'front') dir = f.clone();         // from the rim looking back at the shooter
    else if (view === 'back') dir = f.clone().negate();
    else if (view === 'left') dir = r.clone().negate();
    else dir = r.clone().multiplyScalar(0.7).add(f.clone().multiplyScalar(0.7)).normalize(); // 3/4
    CAM.fov = opt.fov || 28; CAM.aspect = FW / FH; CAM.updateProjectionMatrix();
    CAM.position.set(cx + dir.x * dist, h, cz + dir.z * dist);
    CAM.lookAt(cx, ly, cz);
  };
  AH.newSheet = (cols, rows) => {
    sheet = document.createElement('canvas'); sheet.width = cols * FW; sheet.height = rows * FH;
    sctx = sheet.getContext('2d'); sctx.fillStyle = '#111'; sctx.fillRect(0, 0, sheet.width, sheet.height);
  };
  AH.snap = (col, row, view, label, opt) => {
    syncBalls();
    AH.cam(view, opt);
    R.render(G.W.scene, CAM);
    sctx.drawImage(R.domElement, col * FW, row * FH, FW, FH);
    sctx.fillStyle = 'rgba(0,0,0,0.55)'; sctx.fillRect(col * FW, row * FH, FW, 22);
    sctx.fillStyle = '#fff'; sctx.font = '13px sans-serif'; sctx.fillText(label, col * FW + 6, row * FH + 15);
    sctx.strokeStyle = '#333'; sctx.strokeRect(col * FW, row * FH, FW, FH);
  };
  AH.sheetData = () => sheet.toDataURL('image/png');
  // ------------------------------------------------ scenarios
  AH.setup = (id, x, z) => {
    HOOP.select(id);
    const pl = G.player;
    HOOP.place(x !== undefined ? x : K.HOOP_X - 6.6, z || 0);
    if (!pl.hasBall) HOOP.giveBall();
    pl.action = 'none'; pl.dribbling = false;
    AH.run(0.8);
    return pl;
  };
  // jump shot strip: side row + front row, phases from the shot timeline
  AH.shotStrip = (id, opts = {}) => {
    const pl = AH.setup(id, opts.x, opts.z);
    AH.resetMetrics(); M.label = id + ' shot';
    if (opts.pre) opts.pre(pl);
    const ok = HOOP.shoot(opts.eMs || 0);
    const s = pl.shot;
    if (!ok || !s) return { err: 'no shot' };
    const ph = [
      ['start', 0.0], ['dip', s.tDip !== undefined ? s.tDip : 0.1], ['load', s.tLoad], ['takeoff', s.tTake],
      ['set', s.tSet !== undefined ? s.tSet : (s.tTake + s.T) / 2], ['release', s.T], ['flick', s.T + 0.09], ['follow', s.T + 0.28],
      ['land', s.landT + 0.04], ['recover', s.landT + 0.4],
    ].sort((a, b) => a[1] - b[1]);
    AH.newSheet(ph.length, 2);
    const info = { T: s.T, tTake: s.tTake, landT: s.landT, tLoad: s.tLoad, catchShoot: s.catchShoot, phases: ph.map((p) => [p[0], +p[1].toFixed(3)]) };
    let k = 0, t = 0, relGap = null;
    const x0 = pl.x, z0 = pl.z, yaw0 = pl.yaw;
    while (k < ph.length && t < 3) {
      if (pl.shot && pl.shot.released && relGap === null) {
        // ball/hand consistency at the release frame: the ball must leave from the shooting hand
        const e = G.lastShot && G.lastShot.entry; relGap = e ? Math.hypot(e.b.px - pl.ballPos.x, e.b.py - pl.ballPos.y, e.b.pz - pl.ballPos.z) : null;
      }
      const st = pl.shot ? pl.shot.t : t;
      if (st >= ph[k][1] - 1e-6 || !pl.shot) {
        const lab = `${id} ${ph[k][0]} t=${st.toFixed(2)}`;
        AH.snap(k, 0, 'side', lab, { cx: x0, cz: z0, yaw: yaw0, ly: 1.45, h: 1.45 });
        AH.snap(k, 1, 'front', lab, { cx: x0, cz: z0, yaw: yaw0, ly: 1.45, h: 1.45 });
        k++;
        continue;
      }
      AH.frame(); t += FR;
    }
    info.metrics = Object.assign({}, M, { prevContact: undefined });
    info.drift = Math.hypot(pl.x - x0, pl.z - z0);
    return info;
  };
  // side-by-side signature comparison at matching phases
  AH.compare = (ids, phaseNames, view) => {
    AH.newSheet(phaseNames.length, ids.length);
    const out = {};
    ids.forEach((id, row) => {
      const pl = AH.setup(id);
      HOOP.shoot(0);
      const s = pl.shot;
      const at = { load: s.tLoad, takeoff: s.tTake, set: s.tSet !== undefined ? s.tSet : (s.tTake + s.T) / 2, release: s.T, follow: s.T + 0.25, land: s.landT + 0.05 };
      const x0 = pl.x, z0 = pl.z, yaw0 = pl.yaw;
      let k = 0, guard = 0;
      while (k < phaseNames.length && guard++ < 400) {
        const tt = at[phaseNames[k]];
        if (!pl.shot || pl.shot.t >= tt - 1e-6) { AH.snap(k, row, view, `${id} ${phaseNames[k]} t=${(pl.shot ? pl.shot.t : 0).toFixed(2)}`, { cx: x0, cz: z0, yaw: yaw0, ly: 1.45, h: 1.45 }); k++; continue; }
        AH.frame();
      }
      out[id] = { T: s.T, tTake: s.tTake, jumpH: pl.derived.jumpH };
    });
    return out;
  };
  // locomotion strip: accelerate along +z from rest, sample frames over a gait cycle at steady speed
  AH.gait = (id, kind, opts = {}) => {
    const pl = AH.setup(id, 0, -6);
    pl.hasBall = !!opts.ball; if (!opts.ball) { const e = G.held; if (e) { e.state = 'free'; e.active = false; G.held = null; } }
    pl.placeAt(0, -6, 0); pl.hasBall = !!opts.ball;
    AH.resetMetrics(); M.label = id + ' ' + kind;
    const inp = { mx: 0, mz: 1, sprint: kind === 'sprint', walk: kind === 'walk' };
    AH.run(opts.warm || 1.6, inp);
    const cols = opts.cols || 8, span = opts.span || (kind === 'walk' ? 1.05 : kind === 'jog' ? 0.62 : 0.5);
    AH.newSheet(cols, 1);
    for (let c = 0; c < cols; c++) {
      AH.snap(c, 0, opts.view || 'side', `${id} ${kind} ${pl.speed().toFixed(1)}m/s`, { ly: 1.1, h: 1.2, dist: 6.5 });
      AH.run(span / cols, inp);
    }
    return Object.assign({ speed: pl.speed() }, M, { prevContact: undefined });
  };
  // run then stop hard: frames through the deceleration
  AH.stop = (id) => {
    const pl = AH.setup(id, 0, -6);
    const e = G.held; if (e) { e.state = 'free'; e.active = false; G.held = null; }
    pl.placeAt(0, -6, 0); pl.hasBall = false;
    AH.resetMetrics(); M.label = id + ' stop';
    AH.run(1.4, { mx: 0, mz: 1, sprint: true, walk: false });
    AH.newSheet(8, 1);
    const cx = pl.x, cz = pl.z + 1.2;
    for (let c = 0; c < 8; c++) { AH.snap(c, 0, 'side', `${id} stop ${pl.speed().toFixed(1)}m/s`, { cx, cz, yaw: 0, ly: 1.1, h: 1.2, dist: 7 }); AH.run(0.09, { mx: 0, mz: 0, sprint: false, walk: false }); }
    return Object.assign({ speed: pl.speed() }, M, { prevContact: undefined });
  };
  // turn in place: face +z then ask to move toward -x slowly (turning steps, no sliding)
  AH.turn = (id) => {
    const pl = AH.setup(id, 0, -6);
    pl.placeAt(0, -6, 0); pl.hasBall = true;
    AH.resetMetrics(); M.label = id + ' turn';
    AH.newSheet(8, 1);
    for (let c = 0; c < 8; c++) { AH.snap(c, 0, '34', `${id} turn yaw=${pl.yaw.toFixed(2)}`, { cx: 0, cz: -6, yaw: 0, ly: 1.1, h: 1.3, dist: 6 }); AH.run(0.12, { mx: -1, mz: -0.2, sprint: false, walk: true }); }
    return Object.assign({}, M, { prevContact: undefined });
  };
  // dribble in place and while jogging; crossover; step-back
  AH.dribble = (id, moving) => {
    const pl = AH.setup(id, 0, -6);
    pl.placeAt(0, -6, 0); pl.hasBall = true;
    AH.resetMetrics(); M.label = id + ' dribble';
    const inp = moving ? { mx: 0, mz: 1, sprint: false, walk: false } : { mx: 0, mz: 0, sprint: false, walk: false };
    if (!moving) { pl.dribbling = true; pl.dribblePhase = 0; pl.forceDribble = true; }
    AH.run(1.0, inp);
    const cols = 8, per = 1 / pl.mv.dribbleHz / cols * (moving ? 1 : 1);
    AH.newSheet(cols, 1);
    for (let c = 0; c < cols; c++) { AH.snap(c, 0, moving ? 'side' : '34', `${id} dribble ph=${(pl.dribblePhase || 0).toFixed(2)}`, { ly: 0.95, h: 1.1, dist: 5.5 }); AH.run(per, inp); }
    pl.forceDribble = false;
    return Object.assign({}, M, { prevContact: undefined });
  };
  AH.cross = (id) => {
    const pl = AH.setup(id, 0, -6);
    pl.placeAt(0, -6, 0); pl.hasBall = true;
    AH.resetMetrics(); M.label = id + ' cross';
    const inp = { mx: 0, mz: 0.5, sprint: false, walk: false };
    AH.run(1.2, inp);
    pl.crossover();
    const cx = pl.x, cz = pl.z;
    AH.newSheet(8, 2);
    const dur = Math.max(0.5, pl.mv.crossTime + 0.25);
    for (let c = 0; c < 8; c++) {
      AH.snap(c, 0, 'front', `${id} cross a=${pl.action} ${pl.actionT.toFixed(2)}`, { cx, cz, yaw: 0, ly: 1.0, h: 1.2, dist: 5.5 });
      AH.snap(c, 1, 'side', `${id} cross`, { cx, cz, yaw: 0, ly: 1.0, h: 1.2, dist: 5.5 });
      AH.run(dur / 8, inp);
    }
    return Object.assign({}, M, { prevContact: undefined });
  };
  AH.stepback = (id, shoot) => {
    const pl = AH.setup(id);
    AH.resetMetrics(); M.label = id + ' stepback';
    pl.dribbling = true; pl.forceDribble = true; AH.run(0.6); pl.forceDribble = false;
    const x0 = pl.x, z0 = pl.z, yaw0 = pl.yaw;
    pl.stepback();
    if (shoot) HOOP.shoot(0);
    const cols = shoot ? 10 : 8, span = shoot ? 1.5 : 0.65;
    AH.newSheet(cols, 1);
    for (let c = 0; c < cols; c++) { AH.snap(c, 0, 'side', `${id} sb ${pl.action} ${pl.actionT.toFixed(2)}${pl.shot ? ' s' + pl.shot.t.toFixed(2) : ''}`, { cx: x0 - 0.5, cz: z0, yaw: yaw0, ly: 1.3, h: 1.35, dist: 7 }); AH.run(span / cols); }
    return Object.assign({ moved: Math.hypot(pl.x - x0, pl.z - z0) }, M, { prevContact: undefined });
  };
  // pull-up off the dribble: jog toward the rim then shoot
  AH.pullup = (id) => {
    const pl = AH.setup(id, K.HOOP_X - 9.5, 0);
    pl.placeAt(K.HOOP_X - 9.5, 0, Math.PI / 2); pl.hasBall = true;
    AH.resetMetrics(); M.label = id + ' pullup';
    AH.run(0.9, { mx: 1, mz: 0, sprint: false, walk: false });
    const x0 = pl.x + 0.6;
    HOOP.shoot(0);
    const s = pl.shot;
    AH.newSheet(10, 1);
    const span = s.landT + 0.45;
    for (let c = 0; c < 10; c++) { AH.snap(c, 0, 'side', `${id} pullup ${pl.shot ? pl.shot.t.toFixed(2) : '-'}`, { cx: x0, cz: 0, yaw: Math.PI / 2, ly: 1.4, h: 1.4, dist: 7.5 }); AH.run(span / 10); }
    return Object.assign({ T: s.T, catchShoot: s.catchShoot, pullUp: s.pullUp }, M, { prevContact: undefined });
  };
  return AH;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: FW, height: FH } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForFunction(() => window.HOOP && window.HOOP.G.ready, null, { timeout: 120000 });
  await page.evaluate(() => HOOP.setSetting('quality', 'medium'));
  await page.evaluate(`window.AH = (${pageHelper.toString()})()`);
  const save = async (name) => {
    const url = await page.evaluate(() => AH.sheetData());
    const file = path.join(OUT, name);
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log('  wrote', path.relative(ROOT, file));
  };
  const fmt = (m) => `slide max ${(m.slideMax * 1000).toFixed(1)} mm/frame (${m.slideWhere || '-'}), handIK ${(m.handErrMax * 1000).toFixed(0)} mm (${m.handErrWhere || '-'}), footIK ${(m.footErrMax * 1000).toFixed(0)} mm (${m.footErrWhere || '-'}), ballGap ${(m.ballGapMax * 1000).toFixed(0)} mm (${m.ballGapWhere || '-'}), kneeInv ${(m.kneeInv * 1000).toFixed(0)} mm (${m.kneeInvWhere || '-'}), minKneeFlex ${m.minKneeFlex.toFixed(1)}°`;
  const judge = (name, m, o = {}) => {
    console.log(`  ${name}: ${fmt(m)}`);
    check(`${name}: planted feet do not slide`, m.slideMax < (o.slide || 0.006), `${(m.slideMax * 1000).toFixed(1)} mm/frame`);
    check(`${name}: hands reach their targets on the ball`, m.handErrMax < (o.hand || 0.02), `${(m.handErrMax * 1000).toFixed(0)} mm`);
    check(`${name}: legs reach their targets`, m.footErrMax < (o.foot || 0.02), `${(m.footErrMax * 1000).toFixed(0)} mm`);
    check(`${name}: knees never bend backwards`, m.kneeInv < 0.015, `${(m.kneeInv * 1000).toFixed(0)} mm`);
    if (o.gap !== false) check(`${name}: ball stays in the hands`, m.ballGapMax < (o.gap || 0.04), `${(m.ballGapMax * 1000).toFixed(0)} mm`);
  };

  for (const id of ONLY) {
    if (SCEN.includes('shot')) {
      const r = await page.evaluate((id) => AH.shotStrip(id), id);
      console.log(`${id} shot`, JSON.stringify({ T: r.T, tTake: r.tTake, landT: r.landT, drift: r.drift && r.drift.toFixed(2) }));
      await save(`anim_shot_${id}.png`);
      judge(`${id} jump shot`, r.metrics);
    }
    if (SCEN.includes('gait')) {
      for (const kind of ['walk', 'jog', 'sprint']) {
        const r = await page.evaluate(({ id, kind }) => AH.gait(id, kind), { id, kind });
        await save(`anim_gait_${id}_${kind}.png`);
        judge(`${id} ${kind} (${r.speed.toFixed(1)} m/s)`, r, { gap: false });
      }
      const st = await page.evaluate((id) => AH.stop(id), id);
      await save(`anim_stop_${id}.png`);
      judge(`${id} hard stop`, st, { gap: false });
      const tu = await page.evaluate((id) => AH.turn(id), id);
      await save(`anim_turn_${id}.png`);
      judge(`${id} turn in place`, tu, { gap: false });
    }
    if (SCEN.includes('dribble')) {
      const r0 = await page.evaluate((id) => AH.dribble(id, false), id);
      await save(`anim_dribble_${id}_stand.png`);
      judge(`${id} stationary dribble`, r0, { gap: false });
      const r1 = await page.evaluate((id) => AH.dribble(id, true), id);
      await save(`anim_dribble_${id}_move.png`);
      judge(`${id} moving dribble`, r1, { gap: false });
    }
    if (SCEN.includes('cross')) {
      const r = await page.evaluate((id) => AH.cross(id), id);
      await save(`anim_cross_${id}.png`);
      judge(`${id} crossover`, r, { gap: false });
    }
    if (SCEN.includes('stepback')) {
      const r = await page.evaluate((id) => AH.stepback(id, false), id);
      await save(`anim_stepback_${id}.png`);
      judge(`${id} step-back (${r.moved.toFixed(2)} m)`, r, { gap: false });
      const r2 = await page.evaluate((id) => AH.stepback(id, true), id);
      await save(`anim_stepback_shot_${id}.png`);
      judge(`${id} step-back jumper`, r2, { gap: false });
    }
    if (SCEN.includes('pullup')) {
      const r = await page.evaluate((id) => AH.pullup(id), id);
      await save(`anim_pullup_${id}.png`);
      judge(`${id} pull-up (T ${r.T.toFixed(2)}, pullUp ${r.pullUp})`, r, { gap: false });
    }
  }
  if (SCEN.includes('compare')) {
    for (const view of ['side', 'front']) {
      const r = await page.evaluate((view) => AH.compare(['curry', 'lebron', 'jordan'], ['load', 'takeoff', 'set', 'release', 'follow', 'land'], view), view);
      if (view === 'side') console.log('compare', JSON.stringify(r));
      await save(`anim_compare_${view}.png`);
    }
  }
  check('No console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
