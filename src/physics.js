// HOOP LAB — basketball physics. Pure JS, no rendering dependencies.
// Units: meters, seconds, kilograms. Y is up. Court length runs along X, width along Z.
const HoopPhysics = (() => {
  'use strict';

  // ---------------------------------------------------------------- constants
  const K = {
    G: 9.81,
    BALL_R: 0.1195,          // regulation men's ball, 0.239 m diameter
    BALL_M: 0.62,
    AIR_RHO: 1.204,
    CD: 0.50,                // drag coefficient for a basketball near Re ~ 1.5e5
    CL_PER_S: 0.60,          // lift coefficient per unit spin parameter (r*w/v)
    COURT_HALF_L: 14.325,    // 94 ft court
    COURT_HALF_W: 7.62,      // 50 ft court
    RIM_TOP: 3.048,          // 10 ft to top of ring
    RIM_IN_R: 0.2286,        // 18 in inner diameter
    RIM_TUBE: 0.0090,        // ring rod radius
    HOOP_FROM_BASELINE: 1.6002, // 5 ft 3 in
    BOARD_FROM_BASELINE: 1.2192, // 4 ft
    BOARD_W: 1.8288, BOARD_H: 1.0668, BOARD_BOTTOM: 2.90, BOARD_T: 0.035,
    NET_DEPTH: 0.44, NET_BOTTOM_R: 0.15,
    ARENA_X: 18.6,           // end walls
    BLEACH_Z: 10.6, BLEACH_WALL_H: 0.9, BLEACH_SLOPE: 0.55, BLEACH_DEPTH: 6.0,
    CEILING: 16.5,           // arena roof
    FIXED_DT: 1 / 120,       // gameplay tick
    PHYS_DT: 1 / 240,        // ball physics base step (adaptive substeps below this)
    MAX_SUBSTEP_MOVE: 0.012, // meters per substep: far below ball radius + rim tube => no tunneling
  };
  K.HOOP_X = K.COURT_HALF_L - K.HOOP_FROM_BASELINE;     // 12.7248
  K.BOARD_X = K.COURT_HALF_L - K.BOARD_FROM_BASELINE;   // 13.1058 (front face)
  K.RIM_R = K.RIM_IN_R + K.RIM_TUBE;                    // torus centerline radius
  K.RIM_Y = K.RIM_TOP - K.RIM_TUBE;                     // torus center height
  K.AREA = Math.PI * K.BALL_R * K.BALL_R;
  K.K_DRAG = 0.5 * K.AIR_RHO * K.CD * K.AREA / K.BALL_M;
  K.K_MAGNUS = 0.5 * K.AIR_RHO * K.AREA * K.BALL_R * K.CL_PER_S / K.BALL_M;
  K.BALL_I = (2 / 3) * K.BALL_M * K.BALL_R * K.BALL_R; // thin-shell approximation
  // court markings (NBA), distances from hoop center unless noted
  K.THREE_ARC = 7.239;       // 23 ft 9 in
  K.THREE_CORNER = 6.706;    // 22 ft
  K.COLLEGE_THREE = 6.75;    // 22 ft 1.75 in
  K.FT_DIST = 4.572 - (K.HOOP_FROM_BASELINE - K.BOARD_FROM_BASELINE); // FT line 15 ft from board face
  K.LANE_W = 4.877; K.LANE_L = 5.791; K.FT_CIRCLE_R = 1.829; K.RA_R = 1.219;
  K.CENTER_R = 1.829; K.CENTER_INNER_R = 0.61; K.HASH_FROM_BASE = 8.534;

  const MAT = {
    floor:   { e: 0.88, mu: 0.55 },
    rim:     { e: 0.60, mu: 0.30 },
    neck:    { e: 0.45, mu: 0.30 },
    board:   { e: 0.66, mu: 0.22 },
    pad:     { e: 0.32, mu: 0.50 },
    wall:    { e: 0.50, mu: 0.40 },
    bleach:  { e: 0.45, mu: 0.50 },
  };

  // ---------------------------------------------------------------- hoops
  function makeHoop(side) { // side = +1 (x>0 end) or -1
    const s = side;
    const H = {
      side: s,
      cx: s * K.HOOP_X, cy: K.RIM_Y, cz: 0,
      // backboard box (axis aligned)
      board: { minX: s > 0 ? K.BOARD_X : -K.BOARD_X - K.BOARD_T, maxX: s > 0 ? K.BOARD_X + K.BOARD_T : -K.BOARD_X,
               minY: K.BOARD_BOTTOM, maxY: K.BOARD_BOTTOM + K.BOARD_H, minZ: -K.BOARD_W / 2, maxZ: K.BOARD_W / 2 },
      // bracket from back of ring to board
      neck: { ax: s * (K.HOOP_X + K.RIM_R), ay: K.RIM_Y - 0.012, az: 0, bx: s * K.BOARD_X, by: K.RIM_Y - 0.04, bz: 0, r: 0.022 },
      // portable stanchion: padded base, padded pole, arm behind board
      base: { minX: s > 0 ? 15.25 : -17.55, maxX: s > 0 ? 17.55 : -15.25, minY: 0, maxY: 1.05, minZ: -0.95, maxZ: 0.95 },
      pole: { ax: s * 16.45, ay: 1.05, az: 0, bx: s * 16.25, by: 3.75, bz: 0, r: 0.13 },
      arm:  { ax: s * 16.25, ay: 3.75, az: 0, bx: s * (K.BOARD_X + K.BOARD_T + 0.05), by: 3.55, bz: 0, r: 0.07 },
    };
    return H;
  }
  const HOOPS = [makeHoop(1), makeHoop(-1)];

  // ---------------------------------------------------------------- ball
  function createBall() {
    return {
      px: 0, py: K.BALL_R, pz: 0,
      vx: 0, vy: 0, vz: 0,
      wx: 0, wy: 0, wz: 0,               // angular velocity (rad/s)
      qx: 0, qy: 0, qz: 0, qw: 1,        // orientation
      held: false,                        // kinematic (in a hand) when true
      resting: false, restTime: 0, airTime: 0,
      onFloor: false,
      // per-hoop scoring state
      hs: [ { prevY: 0, entered: false, entryVx: 0, entryVy: 0, entryVz: 0, scored: false },
            { prevY: 0, entered: false, entryVx: 0, entryVy: 0, entryVz: 0, scored: false } ],
    };
  }

  function placeBall(b, x, y, z, vx = 0, vy = 0, vz = 0, wx = 0, wy = 0, wz = 0) {
    b.px = x; b.py = y; b.pz = z; b.vx = vx; b.vy = vy; b.vz = vz; b.wx = wx; b.wy = wy; b.wz = wz;
    b.resting = false; b.restTime = 0; b.airTime = 0;
    for (const h of b.hs) { h.prevY = y; h.entered = false; h.scored = false; }
  }

  // ---------------------------------------------------------------- contact resolution
  // n = unit normal pointing from surface toward ball center; pen = penetration depth (>0)
  function resolve(b, nx, ny, nz, pen, mat, kind, hoopIdx, ev) {
    b.px += nx * pen; b.py += ny * pen; b.pz += nz * pen;
    const vn = b.vx * nx + b.vy * ny + b.vz * nz;
    if (vn >= 0) return 0;
    const r = K.BALL_R, m = K.BALL_M;
    // contact point relative to center: rc = -n*r ; velocity of contact point vc = v + w x rc
    const rcx = -nx * r, rcy = -ny * r, rcz = -nz * r;
    const vcx = b.vx + (b.wy * rcz - b.wz * rcy);
    const vcy = b.vy + (b.wz * rcx - b.wx * rcz);
    const vcz = b.vz + (b.wx * rcy - b.wy * rcx);
    const vcn = vcx * nx + vcy * ny + vcz * nz;
    let tx = vcx - nx * vcn, ty = vcy - ny * vcn, tz = vcz - nz * vcn;
    const vt = Math.hypot(tx, ty, tz);
    const speedN = -vn;
    // restitution fades at low impact speed so the ball can come to rest / roll on a surface
    const fade = speedN < 0.06 ? 0 : speedN > 0.35 ? 1 : (speedN - 0.06) / 0.29;
    const e = mat.e * fade;
    const jn = (1 + e) * speedN * m;
    let jt = 0;
    if (vt > 1e-9) {
      // effective tangential mass for a sphere: 1 / (1/m + r^2/I)
      const needed = vt / (1 / m + r * r / K.BALL_I);
      jt = Math.min(needed, mat.mu * jn);
      tx /= vt; ty /= vt; tz /= vt;
    }
    const Jx = nx * jn - tx * jt, Jy = ny * jn - ty * jt, Jz = nz * jn - tz * jt;
    b.vx += Jx / m; b.vy += Jy / m; b.vz += Jz / m;
    // dw = I^-1 (rc x J)
    b.wx += (rcy * Jz - rcz * Jy) / K.BALL_I;
    b.wy += (rcz * Jx - rcx * Jz) / K.BALL_I;
    b.wz += (rcx * Jy - rcy * Jx) / K.BALL_I;
    if (ev && speedN > 0.05) ev(kind, hoopIdx, b.px - nx * r, b.py - ny * r, b.pz - nz * r, speedN, jn);
    return speedN;
  }

  function sphereBox(b, box, mat, kind, hi, ev) {
    const r = K.BALL_R;
    const cx = Math.max(box.minX, Math.min(b.px, box.maxX));
    const cy = Math.max(box.minY, Math.min(b.py, box.maxY));
    const cz = Math.max(box.minZ, Math.min(b.pz, box.maxZ));
    let dx = b.px - cx, dy = b.py - cy, dz = b.pz - cz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > r * r) return false;
    if (d2 > 1e-12) {
      const d = Math.sqrt(d2);
      resolve(b, dx / d, dy / d, dz / d, r - d, mat, kind, hi, ev);
    } else { // center inside the box: push out along the axis of least penetration
      const opts = [
        [b.px - box.minX, -1, 0, 0], [box.maxX - b.px, 1, 0, 0],
        [b.py - box.minY, 0, -1, 0], [box.maxY - b.py, 0, 1, 0],
        [b.pz - box.minZ, 0, 0, -1], [box.maxZ - b.pz, 0, 0, 1]];
      opts.sort((a, c) => a[0] - c[0]);
      const o = opts[0];
      resolve(b, o[1], o[2], o[3], o[0] + r, mat, kind, hi, ev);
    }
    return true;
  }

  function sphereCapsule(b, c, mat, kind, hi, ev) {
    const abx = c.bx - c.ax, aby = c.by - c.ay, abz = c.bz - c.az;
    const apx = b.px - c.ax, apy = b.py - c.ay, apz = b.pz - c.az;
    let t = (apx * abx + apy * aby + apz * abz) / (abx * abx + aby * aby + abz * abz);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = c.ax + abx * t, qy = c.ay + aby * t, qz = c.az + abz * t;
    const dx = b.px - qx, dy = b.py - qy, dz = b.pz - qz;
    const d = Math.hypot(dx, dy, dz), lim = K.BALL_R + c.r;
    if (d >= lim || d < 1e-9) return false;
    resolve(b, dx / d, dy / d, dz / d, lim - d, mat, kind, hi, ev);
    return true;
  }

  // rim ring = torus. Closest point on the centerline circle gives an exact contact normal.
  function sphereRim(b, H, hi, ev) {
    const rx = b.px - H.cx, rz = b.pz - H.cz;
    const dh = Math.hypot(rx, rz);
    if (dh > K.RIM_R + K.BALL_R + K.RIM_TUBE + 0.02) return false;
    const ux = dh > 1e-9 ? rx / dh : 1, uz = dh > 1e-9 ? rz / dh : 0;
    const qx = H.cx + ux * K.RIM_R, qy = H.cy, qz = H.cz + uz * K.RIM_R;
    const dx = b.px - qx, dy = b.py - qy, dz = b.pz - qz;
    const d = Math.hypot(dx, dy, dz), lim = K.BALL_R + K.RIM_TUBE;
    if (d >= lim || d < 1e-9) return false;
    resolve(b, dx / d, dy / d, dz / d, lim - d, MAT.rim, 'rim', hi, ev);
    return true;
  }

  // 2D (|z|, y) polyline for the sideline wall + bleacher slope + back wall
  const BLEACH_PTS = (() => {
    const z0 = K.BLEACH_Z, h0 = K.BLEACH_WALL_H, z1 = z0 + K.BLEACH_DEPTH;
    const h1 = h0 + K.BLEACH_DEPTH * K.BLEACH_SLOPE;
    return [[z0, 0], [z0, h0], [z1, h1], [z1, K.CEILING]];
  })();
  function sphereBleachers(b, ev) {
    const sz = b.pz >= 0 ? 1 : -1, az = Math.abs(b.pz);
    if (az < K.BLEACH_Z - K.BALL_R - 0.01) return;
    let best = 1e9, bz = 0, by = 0;
    for (let i = 0; i < BLEACH_PTS.length - 1; i++) {
      const [z0, y0] = BLEACH_PTS[i], [z1, y1] = BLEACH_PTS[i + 1];
      const ez = z1 - z0, ey = y1 - y0;
      let t = ((az - z0) * ez + (b.py - y0) * ey) / (ez * ez + ey * ey);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cz = z0 + ez * t, cy = y0 + ey * t;
      const d = Math.hypot(az - cz, b.py - cy);
      if (d < best) { best = d; bz = cz; by = cy; }
    }
    if (best < K.BALL_R && best > 1e-9) {
      const nz = (az - bz) / best, ny = (b.py - by) / best;
      resolve(b, 0, ny, nz * sz, K.BALL_R - best, MAT.bleach, 'bleachers', -1, ev);
    }
  }

  // ---------------------------------------------------------------- free-flight acceleration
  // gravity + quadratic drag + Magnus lift from spin
  function accel(vx, vy, vz, wx, wy, wz, out) {
    const sp = Math.hypot(vx, vy, vz);
    const kd = K.K_DRAG * sp, km = K.K_MAGNUS;
    out[0] = -kd * vx + km * (wy * vz - wz * vy);
    out[1] = -K.G - kd * vy + km * (wz * vx - wx * vz);
    out[2] = -kd * vz + km * (wx * vy - wy * vx);
  }
  const A1 = [0, 0, 0], A2 = [0, 0, 0];

  function integrateFree(b, h) { // Heun / RK2
    accel(b.vx, b.vy, b.vz, b.wx, b.wy, b.wz, A1);
    const vx1 = b.vx + A1[0] * h, vy1 = b.vy + A1[1] * h, vz1 = b.vz + A1[2] * h;
    accel(vx1, vy1, vz1, b.wx, b.wy, b.wz, A2);
    const nvx = b.vx + 0.5 * (A1[0] + A2[0]) * h;
    const nvy = b.vy + 0.5 * (A1[1] + A2[1]) * h;
    const nvz = b.vz + 0.5 * (A1[2] + A2[2]) * h;
    b.px += 0.5 * (b.vx + nvx) * h; b.py += 0.5 * (b.vy + nvy) * h; b.pz += 0.5 * (b.vz + nvz) * h;
    b.vx = nvx; b.vy = nvy; b.vz = nvz;
  }

  function integrateOrientation(b, h) {
    const { wx, wy, wz } = b;
    let { qx, qy, qz, qw } = b;
    const hx = 0.5 * h;
    const dqx = hx * (wx * qw + wy * qz - wz * qy);
    const dqy = hx * (wy * qw + wz * qx - wx * qz);
    const dqz = hx * (wz * qw + wx * qy - wy * qx);
    const dqw = hx * (-wx * qx - wy * qy - wz * qz);
    qx += dqx; qy += dqy; qz += dqz; qw += dqw;
    const l = Math.hypot(qx, qy, qz, qw) || 1;
    b.qx = qx / l; b.qy = qy / l; b.qz = qz / l; b.qw = qw / l;
  }

  // net: soft zone below the ring that funnels and slows the ball
  function netRadiusAt(y) {
    const t = (K.RIM_Y - y) / K.NET_DEPTH;
    return K.RIM_IN_R + (K.NET_BOTTOM_R - K.RIM_IN_R) * Math.min(1, Math.max(0, t));
  }
  function applyNet(b, H, h) {
    if (b.py > K.RIM_Y || b.py < K.RIM_Y - K.NET_DEPTH - 0.05) return false;
    const rx = b.px - H.cx, rz = b.pz - H.cz;
    const rho = Math.hypot(rx, rz);
    const nr = netRadiusAt(b.py);
    if (rho > nr + K.BALL_R * 0.6) return false;          // outside the net cone
    // ball is inside the netting: drag (strings rubbing) and inward funnel force
    const kh = Math.exp(-5.5 * h), kv = Math.exp(-1.6 * h);
    b.vx *= kh; b.vz *= kh; b.vy *= b.vy < 0 ? kv : 1;
    const over = rho + K.BALL_R * 0.55 - nr;
    if (over > 0 && rho > 1e-6) {
      const push = 40 * over / 0.05;                       // m/s^2, stiffer the more it stretches
      b.vx -= (rx / rho) * push * h; b.vz -= (rz / rho) * push * h;
    }
    b.wx *= Math.exp(-3 * h); b.wy *= Math.exp(-3 * h); b.wz *= Math.exp(-3 * h);
    return true;
  }

  // ---------------------------------------------------------------- one physics step
  // ev(kind, hoopIdx, x, y, z, impactSpeed, impulse) receives contacts;
  // sev(type, hoopIdx, data) receives scoring events: 'cross' (rim plane, descending), 'score', 'out'
  function step(b, dt, ev, sev) {
    if (b.held) return;
    if (b.resting) { b.restTime += dt; return; }
    const sp = Math.hypot(b.vx, b.vy, b.vz);
    let n = Math.ceil((sp * dt) / K.MAX_SUBSTEP_MOVE);
    n = n < 1 ? 1 : n > 24 ? 24 : n;
    const h = dt / n;
    b.airTime += dt;
    for (let s = 0; s < n; s++) {
      const prevY = b.py;
      integrateFree(b, h);
      // collisions (two passes resolve simultaneous rim/board contact)
      let floor = false;
      for (let it = 0; it < 2; it++) {
        if (b.py < K.BALL_R) { floor = true; resolve(b, 0, 1, 0, K.BALL_R - b.py, MAT.floor, 'floor', -1, ev); }
        for (let hi = 0; hi < 2; hi++) {
          const H = HOOPS[hi];
          if (Math.abs(b.px - H.cx) < 5.5) {
            sphereRim(b, H, hi, ev);
            sphereCapsule(b, H.neck, MAT.neck, 'neck', hi, ev);
            sphereBox(b, H.board, MAT.board, 'board', hi, ev);
            sphereBox(b, H.base, MAT.pad, 'stanchion', hi, ev);
            sphereCapsule(b, H.pole, MAT.pad, 'stanchion', hi, ev);
            sphereCapsule(b, H.arm, MAT.pad, 'stanchion', hi, ev);
          }
        }
        if (b.px > K.ARENA_X - K.BALL_R) resolve(b, -1, 0, 0, b.px - (K.ARENA_X - K.BALL_R), MAT.wall, 'wall', -1, ev);
        if (b.px < -K.ARENA_X + K.BALL_R) resolve(b, 1, 0, 0, (-K.ARENA_X + K.BALL_R) - b.px, MAT.wall, 'wall', -1, ev);
        if (b.py > K.CEILING - K.BALL_R) resolve(b, 0, -1, 0, b.py - (K.CEILING - K.BALL_R), MAT.wall, 'ceiling', -1, ev);
        sphereBleachers(b, ev);
      }
      b.onFloor = floor;
      // net
      for (let hi = 0; hi < 2; hi++) applyNet(b, HOOPS[hi], h);
      // rolling resistance + spin damping
      if (floor) {
        const vh = Math.hypot(b.vx, b.vz);
        if (vh > 1e-6) {
          const dec = Math.min(vh, 0.32 * h);
          b.vx -= (b.vx / vh) * dec; b.vz -= (b.vz / vh) * dec;
        }
        b.wy *= Math.exp(-2.5 * h);
      }
      const wd = Math.exp(-0.04 * h);
      b.wx *= wd; b.wy *= wd; b.wz *= wd;
      integrateOrientation(b, h);
      // scoring: ball center crossing the plane of the ring top, downward, inside the inner ring
      for (let hi = 0; hi < 2; hi++) {
        const H = HOOPS[hi], st = b.hs[hi];
        const rx = b.px - H.cx, rz = b.pz - H.cz;
        const rho = Math.hypot(rx, rz);
        if (prevY >= K.RIM_TOP && b.py < K.RIM_TOP && b.vy < 0 && Math.abs(rx) < 2.5) {
          if (sev) sev('cross', hi, { rho, x: b.px, z: b.pz, vx: b.vx, vy: b.vy, vz: b.vz });
          if (rho < K.RIM_IN_R && !st.scored) {
            st.entered = true; st.entryVx = b.vx; st.entryVy = b.vy; st.entryVz = b.vz;
          }
        }
        if (st.entered && !st.scored) {
          if (b.py > K.RIM_TOP + 0.05) st.entered = false;          // popped back out
          else if (b.py < K.RIM_TOP - 0.30 && rho < 0.30) {
            st.scored = true; st.entered = false;
            if (sev) sev('score', hi, { vx: st.entryVx, vy: st.entryVy, vz: st.entryVz });
          }
        }
      }
    }
    // settle detection
    const sp2 = Math.hypot(b.vx, b.vy, b.vz);
    if (b.onFloor && sp2 < 0.05 && Math.abs(b.py - K.BALL_R) < 0.003) {
      b.restTime += dt;
      if (b.restTime > 0.25) { b.resting = true; b.vx = b.vy = b.vz = 0; b.wx = b.wy = b.wz = 0; b.py = K.BALL_R; }
    } else b.restTime = 0;
  }

  // ---------------------------------------------------------------- trajectory tools (no collisions)
  // Simulates free flight from (p, v, w) and returns where the ball center crosses height targetY
  // while descending. Used by the release calibration and the timing-window analysis.
  const FB = { px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0 };
  const CROSS = { ok: false, x: 0, y: 0, z: 0, t: 0, vx: 0, vy: 0, vz: 0, apex: 0 };
  function flightCross(px, py, pz, vx, vy, vz, wx, wy, wz, targetY, h = 1 / 480, tmax = 6) {
    FB.px = px; FB.py = py; FB.pz = pz; FB.vx = vx; FB.vy = vy; FB.vz = vz; FB.wx = wx; FB.wy = wy; FB.wz = wz;
    let t = 0, apex = py;
    CROSS.ok = false;
    while (t < tmax) {
      const oy = FB.py, ox = FB.px, oz = FB.pz, ovx = FB.vx, ovy = FB.vy, ovz = FB.vz;
      integrateFree(FB, h); t += h;
      if (FB.py > apex) apex = FB.py;
      if (FB.vy < 0 && oy >= targetY && FB.py < targetY) {
        const f = (oy - targetY) / (oy - FB.py);
        CROSS.ok = true;
        CROSS.x = ox + (FB.px - ox) * f; CROSS.y = targetY; CROSS.z = oz + (FB.pz - oz) * f;
        CROSS.vx = ovx + (FB.vx - ovx) * f; CROSS.vy = ovy + (FB.vy - ovy) * f; CROSS.vz = ovz + (FB.vz - ovz) * f;
        CROSS.t = t - h + h * f; CROSS.apex = apex;
        return CROSS;
      }
      if (FB.vy < 0 && FB.py < targetY - 0.5) break;   // already below target on the way down
      if (FB.py < 0) break;
    }
    CROSS.apex = apex;
    return CROSS;
  }

  // backspin axis for a horizontal direction (dx, dz): u x up
  function backspinAxis(dx, dz) { return [-dz, 0, dx]; } // (dx,0,dz) x (0,1,0) = (-dz, 0, dx)

  // Finds the launch speed for a given launch angle (radians above horizontal) so the ball,
  // released at p, passes through targetY at the horizontal aim point (ax, az).
  function solveLaunchSpeed(px, py, pz, ax, ay, az, angle, spinRps) {
    let dx = ax - px, dz = az - pz;
    const dist = Math.hypot(dx, dz);
    dx /= dist; dz /= dist;
    const w = spinRps * 2 * Math.PI, axis = backspinAxis(dx, dz);
    const wx = axis[0] * w, wy = 0, wz = axis[2] * w;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const rangeAt = (s) => {
      const c = flightCross(px, py, pz, s * ca * dx, s * sa, s * ca * dz, wx, wy, wz, ay);
      if (!c.ok) return -1e9;
      return (c.x - px) * dx + (c.z - pz) * dz;
    };
    let lo = 1, hi = 45;
    if (rangeAt(hi) < dist) return { speed: hi, ok: false, dist };
    for (let i = 0; i < 44; i++) {
      const mid = 0.5 * (lo + hi);
      if (rangeAt(mid) < dist) lo = mid; else hi = mid;
      if (hi - lo < 1e-5) break;
    }
    return { speed: 0.5 * (lo + hi), ok: true, dist };
  }

  // launch angle that needs the least speed (vacuum approximation): 45 deg + half the elevation angle
  function minSpeedAngle(px, py, pz, ax, ay, az) {
    const d = Math.hypot(ax - px, az - pz);
    return Math.PI / 4 + 0.5 * Math.atan2(ay - py, d);
  }

  // ---------------------------------------------------------------- court helpers
  function nearestHoopIndex(x) { return x >= 0 ? 0 : 1; }
  function distToHoop(x, z, hi) { const H = HOOPS[hi]; return Math.hypot(x - H.cx, z - H.cz); }
  function isThree(x, z, hi) {
    const H = HOOPS[hi];
    const along = (H.side > 0 ? H.cx - x : x - H.cx); // distance toward center court from hoop
    if (Math.abs(z) >= K.THREE_CORNER && along <= Math.sqrt(K.THREE_ARC ** 2 - K.THREE_CORNER ** 2)) return true;
    return Math.hypot(x - H.cx, z - H.cz) > K.THREE_ARC;
  }
  function rangeLabel(d) {
    if (d < 1.5) return 'Layup';
    if (d < 3.8) return 'Paint';
    if (Math.abs(d - K.FT_DIST) < 0.3) return 'Free throw';
    if (d < K.COLLEGE_THREE) return 'Midrange';
    if (d < K.THREE_ARC) return 'College 3';
    if (d < 8.6) return 'NBA 3';
    if (d < 10.0) return 'Hash-mark deep';
    if (d < 11.9) return 'Logo';
    if (d < 13.6) return 'Half-court';
    if (d < 20) return 'Backcourt';
    return 'Full-court heave';
  }

  return {
    K, MAT, HOOPS, createBall, placeBall, step, flightCross, solveLaunchSpeed, minSpeedAngle,
    backspinAxis, netRadiusAt, distToHoop, isThree, rangeLabel, nearestHoopIndex, integrateFree,
  };
})();
if (typeof module !== 'undefined') module.exports = HoopPhysics;
