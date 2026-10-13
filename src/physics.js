// HOOP LAB — basketball physics. Pure JS, no rendering dependencies.
// Units: meters, seconds, kilograms. Y is up. Court length runs along X, width along Z.
const HoopPhysics = (() => {
  'use strict';

  // ---------------------------------------------------------------- constants
  const K = {
    G: 9.81,
    BALL_R: 0.1195,          // regulation men's ball, 0.239 m diameter
    BALL_M: 0.62,
    // --- aerodynamics (flight). Re = v*D/nu ~ 1.6e4 * v: every normal shot (4-13 m/s) is subcritical.
    AIR_RHO: 1.204,          // kg/m^3, dry air at 20 °C, sea level
    AIR_NU: 1.516e-5,        // m^2/s, kinematic viscosity of air at 20 °C
    CD: 0.50,                // subcritical drag coefficient (smooth sphere 0.47; pebbled, seamed ball ~0.5)
    CD_CRISIS: 0.30,         // drag after the drag crisis (rough sphere, supercritical)
    RE_CRISIS0: 2.2e5,       // drag crisis starts (~14 m/s: heaves only). Roughness moves it below the
    RE_CRISIS1: 3.6e5,       //   smooth-sphere 3.5e5; smooth cubic blend in between, no kink in the force
    CL_PER_S: 1.0,           // Magnus lift slope dCL/dS at low spin parameter S = r*w_perp/v
    CL_MAX: 0.5,             // lift saturates at high spin: CL = S / (1/CL_PER_S + S/CL_MAX)  (= S/(1+2S))
    SPIN_DECAY: 0.0022,      // 1/m: aerodynamic spin-down dw/dt = -SPIN_DECAY*|v|*w (~1.8 %/s at 8 m/s)
    BALL_E0: 0.862,          // ball COR on rigid hardwood at zero speed ...
    BALL_E_SLOPE: 0.0125,    // ... falling 0.0125 per m/s (viscoelastic): 6 m/s (72 in drop) -> 0.79
    BALL_E_MIN: 0.55,
    BALL_BALL_E: 0.78,       // ball-ball restitution (two inflated balls; ~ball on hardwood at half the speed)
    BALL_BALL_MU: 0.55,      // pebbled rubber on pebbled rubber
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
  K.K_DRAG = 0.5 * K.AIR_RHO * K.CD * K.AREA / K.BALL_M;       // subcritical drag accel / v^2 (0 = no drag)
  K.K_MAGNUS = 0.5 * K.AIR_RHO * K.AREA * K.BALL_R * K.CL_PER_S / K.BALL_M; // low-spin lift accel / |w x v| (0 = no lift)
  K.RE_PER_V = 2 * K.BALL_R / K.AIR_NU;                        // Reynolds number per m/s
  K.CD_DROP = 1 - K.CD_CRISIS / K.CD;                          // fractional drag drop across the crisis
  K.CL_SAT = K.CL_PER_S / K.CL_MAX;
  K.BALL_I = (2 / 3) * K.BALL_M * K.BALL_R * K.BALL_R; // thin-shell approximation
  // court markings (NBA), distances from hoop center unless noted
  K.THREE_ARC = 7.239;       // 23 ft 9 in
  K.THREE_CORNER = 6.706;    // 22 ft
  K.COLLEGE_THREE = 6.75;    // 22 ft 1.75 in
  K.FT_DIST = 4.572 - (K.HOOP_FROM_BASELINE - K.BOARD_FROM_BASELINE); // FT line 15 ft from board face
  K.LANE_W = 4.877; K.LANE_L = 5.791; K.FT_CIRCLE_R = 1.829; K.RA_R = 1.219;
  K.CENTER_R = 1.829; K.CENTER_INNER_R = 0.61; K.HASH_FROM_BASE = 8.534;

  // Contact materials. Restitution = ballCOR(normal impact speed) * e, where ballCOR is the ball's own
  // viscoelastic COR on a rigid surface (BALL_E0 - BALL_E_SLOPE*v, see K) and e is the surface factor
  // (1 = rigid hardwood; <1 = the surface itself absorbs energy). mu = Coulomb friction (spin coupling).
  const MAT = {
    floor:   { e: 1.00, mu: 0.55 },  // NBA spec: 72 in drop -> 49-54 in bounce (top of ball)
    rim:     { e: 0.86, mu: 0.42 },  // steel ring, further reduced by location-dependent compliance (sphereRim)
    neck:    { e: 0.70, mu: 0.40 },  // bracket / spring housing
    board:   { e: 0.88, mu: 0.25 },  // tempered glass in a padded frame: e ~0.65-0.7, low friction
    pad:     { e: 0.42, mu: 0.50 },
    wall:    { e: 0.65, mu: 0.40 },
    bleach:  { e: 0.58, mu: 0.50 },
  };
  // ball's own coefficient of restitution vs normal impact speed (inflated size-7 ball on a rigid surface)
  function ballCOR(v) { const e = K.BALL_E0 - K.BALL_E_SLOPE * v; return e < K.BALL_E_MIN ? K.BALL_E_MIN : e; }

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
      hs: [ { prevY: 0, entered: false, entryVx: 0, entryVy: 0, entryVz: 0, scored: false, above: false },
            { prevY: 0, entered: false, entryVx: 0, entryVy: 0, entryVz: 0, scored: false, above: false } ],
    };
  }

  function placeBall(b, x, y, z, vx = 0, vy = 0, vz = 0, wx = 0, wy = 0, wz = 0) {
    b.px = x; b.py = y; b.pz = z; b.vx = vx; b.vy = vy; b.vz = vz; b.wx = wx; b.wy = wy; b.wz = wz;
    b.resting = false; b.restTime = 0; b.airTime = 0;
    for (let i = 0; i < 2; i++) { const h = b.hs[i]; h.prevY = y; h.entered = false; h.scored = false; h.above = false; }
  }

  // ---------------------------------------------------------------- contact resolution
  // n = unit normal pointing from surface toward ball center; pen = penetration depth (>0)
  function resolve(b, nx, ny, nz, pen, mat, kind, hoopIdx, ev, eMul = 1) {
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
    const e = ballCOR(speedN) * mat.e * eMul * fade;
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
      let d = b.px - box.minX, ox = -1, oy = 0, oz = 0, t;   // least-penetration axis (allocation-free)
      if ((t = box.maxX - b.px) < d) { d = t; ox = 1; }
      if ((t = b.py - box.minY) < d) { d = t; ox = 0; oy = -1; }
      if ((t = box.maxY - b.py) < d) { d = t; ox = 0; oy = 1; }
      if ((t = b.pz - box.minZ) < d) { d = t; ox = 0; oy = 0; oz = -1; }
      if ((t = box.maxZ - b.pz) < d) { d = t; ox = 0; oy = 0; oz = 1; }
      resolve(b, ox, oy, oz, d + r, mat, kind, hi, ev);
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
    const nx = dx / d, ny = dy / d, nz = dz / d;
    // Ring compliance. The ring is cantilevered from the bracket at the back and the breakaway spring
    // sits there too: the back is stiff, the front (farthest from the support) flexes down and soaks up
    // energy -- mostly for impacts from above. Ring + net damping also eat a larger share of slow,
    // "soft touch" contacts, so soft shots die on the rim (the shooter's roll); hard impacts on the
    // front load the breakaway spring (NBA breakaway releases around 1 kN, ~6 m/s ball impact).
    const front = 0.5 * (1 - ux * H.side);                  // 0 at the bracket, 1 at the front of the ring
    const down = ny > 0 ? ny : 0;                           // ball above the tube
    const vn = -(b.vx * nx + b.vy * ny + b.vz * nz);
    const soft = vn < 0.6 ? 1 : vn > 2.2 ? 0 : (2.2 - vn) / 1.6;
    const brk = vn < 4.5 ? 0 : vn > 7.5 ? 1 : (vn - 4.5) / 3;
    const loss = front * (0.10 + 0.16 * down) + down * (0.12 * soft + 0.12 * brk * front);
    resolve(b, nx, ny, nz, lim - d, MAT.rim, 'rim', hi, ev, 1 - loss);
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
  // gravity + quadratic drag with a Reynolds-dependent Cd (drag crisis) + Magnus lift from spin.
  // Drag:   a = -(rho*A/2m) * Cd(Re) * |v| * v,      Cd = CD below RE_CRISIS0, CD_CRISIS above RE_CRISIS1.
  // Magnus: a = (rho*A/2m) * CL(S) * |v|^2 along w x v, CL(S) = S/(1/CL_PER_S + S/CL_MAX),
  //         S = r*|w x v|/|v|^2 (only the spin component perpendicular to v makes lift). Written as
  //         K_MAGNUS * (w x v) / (1 + CL_SAT*S): no division by |w| or |v|, bounded as v -> 0.
  // Allocation-free (runs 2x per substep per ball).
  function accel(vx, vy, vz, wx, wy, wz, out) {
    const v2 = vx * vx + vy * vy + vz * vz, sp = Math.sqrt(v2);
    let kd = K.K_DRAG * sp;
    const re = sp * K.RE_PER_V;
    if (re > K.RE_CRISIS0) {
      const t = re >= K.RE_CRISIS1 ? 1 : (re - K.RE_CRISIS0) / (K.RE_CRISIS1 - K.RE_CRISIS0);
      kd *= 1 - K.CD_DROP * t * t * (3 - 2 * t);
    }
    const cx = wy * vz - wz * vy, cy = wz * vx - wx * vz, cz = wx * vy - wy * vx;
    let km = K.K_MAGNUS;
    if (km !== 0 && v2 > 1e-12) km /= 1 + K.CL_SAT * K.BALL_R * Math.sqrt(cx * cx + cy * cy + cz * cz) / v2;
    out[0] = -kd * vx + km * cx;
    out[1] = -K.G - kd * vy + km * cy;
    out[2] = -kd * vz + km * cz;
  }
  const A1 = [0, 0, 0], A2 = [0, 0, 0];

  // Heun / RK2 for velocity, trapezoidal position update (exact for constant acceleration, so the
  // drag-free limit is exact). Spin is held over the step, then decays with the aerodynamic torque.
  // Works on any object with p*, v*, w* fields (the game also uses it for the aim-guide preview).
  function integrateFree(b, h) {
    accel(b.vx, b.vy, b.vz, b.wx, b.wy, b.wz, A1);
    const vx1 = b.vx + A1[0] * h, vy1 = b.vy + A1[1] * h, vz1 = b.vz + A1[2] * h;
    accel(vx1, vy1, vz1, b.wx, b.wy, b.wz, A2);
    const nvx = b.vx + 0.5 * (A1[0] + A2[0]) * h;
    const nvy = b.vy + 0.5 * (A1[1] + A2[1]) * h;
    const nvz = b.vz + 0.5 * (A1[2] + A2[2]) * h;
    b.px += 0.5 * (b.vx + nvx) * h; b.py += 0.5 * (b.vy + nvy) * h; b.pz += 0.5 * (b.vz + nvz) * h;
    b.vx = nvx; b.vy = nvy; b.vz = nvz;
    // spin-down: w *= exp(-SPIN_DECAY*|v|*h); the exponent is ~1e-5 per substep, so 1/(1+x) is exact enough
    const sd = 1 / (1 + K.SPIN_DECAY * Math.sqrt(nvx * nvx + nvy * nvy + nvz * nvz) * h);
    b.wx *= sd; b.wy *= sd; b.wz *= sd;
  }

  // exact rotation for constant w over the step: q <- dq(w*h) ⊗ q (world-frame angular velocity)
  function integrateOrientation(b, h) {
    const wx = b.wx, wy = b.wy, wz = b.wz;
    const w = Math.sqrt(wx * wx + wy * wy + wz * wz);
    if (w < 1e-9) return;
    const half = 0.5 * w * h, s = Math.sin(half) / w, dw = Math.cos(half);
    const dx = wx * s, dy = wy * s, dz = wz * s;
    const qx = b.qx, qy = b.qy, qz = b.qz, qw = b.qw;
    const nx = dw * qx + dx * qw + dy * qz - dz * qy;
    const ny = dw * qy + dy * qw + dz * qx - dx * qz;
    const nz = dw * qz + dz * qw + dx * qy - dy * qx;
    const nw = dw * qw - dx * qx - dy * qy - dz * qz;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw) || 1;
    b.qx = nx / l; b.qy = ny / l; b.qz = nz / l; b.qw = nw / l;
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
      integrateOrientation(b, h);
      // scoring: ball center crossing the plane of the ring top, downward, inside the inner ring
      for (let hi = 0; hi < 2; hi++) {
        const H = HOOPS[hi], st = b.hs[hi];
        const rx = b.px - H.cx, rz = b.pz - H.cz;
        const rho = Math.hypot(rx, rz);
        if (prevY >= K.RIM_TOP && b.py < K.RIM_TOP && b.vy < 0 && Math.abs(rx) < 2.5) {
          if (sev) sev('cross', hi, { rho, x: b.px, z: b.pz, vx: b.vx, vy: b.vy, vz: b.vz });
        }
        // the ball must come from above the ring (st.above) and its center must be inside the inner ring
        // while just below the ring top. Also catches balls that roll around the rim and drop in with the
        // center crossing the plane outside RIM_IN_R (resting on the tube) and only then falling inside.
        if (b.py >= K.RIM_TOP && rho < K.RIM_R + K.BALL_R) st.above = true;
        else if (b.py < K.RIM_TOP - 0.45 || rho > 1.2) st.above = false;
        if (st.above && !st.entered && !st.scored && b.vy < 0 && b.py < K.RIM_TOP && b.py > K.RIM_TOP - 0.22 && rho < K.RIM_IN_R) {
          st.entered = true; st.entryVx = b.vx; st.entryVy = b.vy; st.entryVz = b.vz;
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
