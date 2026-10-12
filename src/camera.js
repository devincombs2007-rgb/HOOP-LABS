// HOOP LAB — camera rig: gameplay orbit, broadcast, side-view, behind-shooter, ball-follow, rim cam, free (replays),
// plus the menu backdrops (slow gym orbit, character turntable).
const HoopCamera = (() => {
  'use strict';
  const PH = HoopPhysics, K = PH.K;
  const MODES = ['game', 'broadcast', 'side', 'behind', 'ball'];          // V / LB cycles these during play
  const REPLAY = ['side', 'behind', 'rim', 'ball', 'free'];             // replay angles
  const LABEL = { game: 'Gameplay', broadcast: 'Broadcast', side: 'Side view', behind: 'Behind the shooter', ball: 'Ball follow', free: 'Free camera',
    rim: 'Rim cam', orbit: 'Gym', turntable: 'Turntable' };
  const V = () => new THREE.Vector3();
  const DEG = Math.PI / 180;

  class Rig {
    constructor(camera) {
      this.cam = camera;
      this.mode = 'game';
      this.yaw = Math.PI / 2; this.pitch = 0.22; this.dist = 4.6;
      this.settings = { sens: 1, invertY: false, dist: 4.6, height: 0.35, fov: 55, smoothing: 0.5 };
      this.pos = V(); this.look = V(); this.tPos = V(); this.tLook = V();
      this.lastManual = 0; this.init = false;
      this.free = { target: V(), yaw: 0, pitch: 0.3, dist: 6 };
      this.turn = { yaw: 0, pitch: 0.12, dist: 3.7 };   // character-select turntable offsets (drag / right stick)
      this.cineT = 0;
      this.frameShift = 0;                              // px: shifts the subject right (+) to sit in the open part of a menu
      this._shift = { px: 0, w: 0, h: 0 };
      this.tmp = V(); this.tmp2 = V();
    }
    forward(out = V()) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
    cycle() { const i = MODES.indexOf(this.mode); this.mode = MODES[(i + 1) % MODES.length]; return LABEL[this.mode]; }
    setMode(m) { this.mode = m; }

    manual(dx, dy, now) {
      const s = this.settings.sens * 0.0032, inv = this.settings.invertY ? -1 : 1;
      if (dx || dy) this.lastManual = now;
      if (this.mode === 'free') { this.free.yaw -= dx * s; this.free.pitch = Math.max(-0.2, Math.min(1.45, this.free.pitch + dy * s * inv)); return; }
      if (this.mode === 'turntable') { this.turn.yaw -= dx * s; this.turn.pitch = Math.max(-0.1, Math.min(0.7, this.turn.pitch + dy * s * inv)); if (dx || dy) this.turnHeld = 2.5; return; }
      if (this.mode === 'orbit') return;
      this.yaw -= dx * s;
      this.pitch = Math.max(-0.12, Math.min(1.2, this.pitch + dy * s * inv));
    }
    zoom(z) {
      if (this.mode === 'free') { this.free.dist = Math.max(1.5, Math.min(30, this.free.dist * (1 + z * 0.1))); return; }
      if (this.mode === 'turntable') { this.turn.dist = Math.max(2.4, Math.min(7, this.turn.dist * (1 + z * 0.08))); return; }
      this.settings.dist = Math.max(2.4, Math.min(11, this.settings.dist * (1 + z * 0.08)));
    }
    // free camera: move the orbit target along the floor (WASD / left stick), relative to the view
    pan(x, y, dt) {
      if (this.mode !== 'free' || (!x && !y)) return;
      const F = this.free, sp = 3 + F.dist * 0.4;
      const fx = Math.sin(F.yaw), fz = Math.cos(F.yaw);
      F.target.x += (fx * y - fz * x) * sp * dt; F.target.z += (fz * y + fx * x) * sp * dt;
      F.target.x = Math.max(-K.ARENA_X + 1, Math.min(K.ARENA_X - 1, F.target.x));
      F.target.z = Math.max(-K.BLEACH_Z, Math.min(K.BLEACH_Z, F.target.z));
    }

    // ctx: { px, py, pz, yaw, hoop, shooting, aligning, ball {x,y,z,vx,vy,vz} | null, dt, now, view, replay }
    update(ctx) {
      const { dt, now } = ctx;
      const H = PH.HOOPS[ctx.hoop];
      const px = ctx.px, pz = ctx.pz, py = ctx.py;
      let snap = !this.init, rate = 4;
      this.cineT += dt;
      if (this.mode === 'game') {
        // gentle auto-align behind the shooter toward the rim while shooting/holding still, never fighting the mouse
        const idle = now - this.lastManual > 1.4;
        if (ctx.shooting || (idle && ctx.aligning)) {
          const want = Math.atan2(H.cx - px, H.cz - pz);
          let d = want - this.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
          this.yaw += d * (1 - Math.exp(-(ctx.shooting ? 2.2 : 0.9) * dt));
        }
        const dist = this.settings.dist;
        const f = this.forward(this.tmp);
        this.tLook.set(px + f.x * 1.2, py + 1.35 + this.settings.height * 0.4, pz + f.z * 1.2);
        const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
        this.tPos.set(px - f.x * dist * cp, py + 1.55 + this.settings.height + dist * sp, pz - f.z * dist * cp);
        if (ctx.shooting || ctx.aligning) this.keepRimInView(H, 0.78);
        rate = 14;
      } else if (this.mode === 'broadcast') {
        this.tPos.set(Math.max(-11, Math.min(11, px * 0.82)), 7.2, -K.BLEACH_Z - 2.5);
        this.tLook.set(px * 0.95, 1.4, pz * 0.6);
      } else if (this.mode === 'side') {
        const mx = (px + H.cx) / 2, mz = (pz + H.cz) / 2;
        const dx = H.cx - px, dz = H.cz - pz, L = Math.hypot(dx, dz) || 1;
        const nx = -dz / L, nz = dx / L;
        const sgn = (nz * (0 - mz) + nx * (0 - mx)) > 0 ? -1 : 1; // pick the side facing the court center
        const back = Math.max(7, L * 0.62 + 3.5);
        this.tPos.set(mx + nx * back * sgn, 2.6, mz + nz * back * sgn);
        this.tLook.set(mx, 2.1, mz);
      } else if (this.mode === 'behind') {
        const dx = H.cx - px, dz = H.cz - pz, L = Math.hypot(dx, dz) || 1;
        this.tPos.set(px - dx / L * 3.6 + 0.35 * dz / L, py + 2.35, pz - dz / L * 3.6 - 0.35 * dx / L);
        this.tLook.set(px + dx / L * Math.min(L, 6), 2.4, pz + dz / L * Math.min(L, 6));
      } else if (this.mode === 'ball') {
        const b = ctx.ball;
        if (b) {
          const sp = Math.hypot(b.vx, b.vz);
          const bx = sp > 0.5 ? b.vx / sp : Math.sin(this.yaw), bz = sp > 0.5 ? b.vz / sp : Math.cos(this.yaw);
          this.tPos.set(b.x - bx * 3.4, Math.max(0.6, b.y + 1.0), b.z - bz * 3.4);
          this.tLook.set(b.x + bx * 1.5, b.y, b.z + bz * 1.5);
        } else { // no ball in flight: look over the shooter toward the rim
          const dx = H.cx - px, dz = H.cz - pz, L = Math.hypot(dx, dz) || 1;
          this.tPos.set(px - dx / L * 2.6, 2.0, pz - dz / L * 2.6);
          this.tLook.set(px + dx / L * 2, 1.8, pz + dz / L * 2);
        }
        rate = 6;
      } else if (this.mode === 'rim') {
        // mounted above the rim on the backboard side, looking out at the flight with the ring at the bottom of the frame
        const s = H.cx >= 0 ? 1 : -1;
        const dx = px - H.cx, dz = pz - H.cz, L = Math.hypot(dx, dz) || 1;
        this.tPos.set(H.cx + s * 0.18 - dx / L * 0.05 + (-dz / L) * 0.55, K.RIM_TOP + 1.15, H.cz + (dx / L) * 0.55);
        const b = ctx.ball;
        const tx = b ? b.x : px, ty = b ? b.y : 1.6, tz = b ? b.z : pz;
        const w = b ? 0.65 : 0.85;
        this.tLook.set(H.cx + (tx - H.cx) * w, K.RIM_TOP + (ty - K.RIM_TOP) * w - 0.35, H.cz + (tz - H.cz) * w);
        rate = 7;
      } else if (this.mode === 'free') {
        const F = this.free, cp = Math.cos(F.pitch);
        this.tPos.set(F.target.x - Math.sin(F.yaw) * F.dist * cp, F.target.y + Math.sin(F.pitch) * F.dist, F.target.z - Math.cos(F.yaw) * F.dist * cp);
        this.tLook.copy(F.target); snap = true;
      } else if (this.mode === 'orbit') {
        // menu backdrop: a slow cinematic circle around the near basket with the player in frame
        const hx = H.cx, a = this.cineT * 0.07 + 2.2;
        const cx = hx * 0.55 + px * 0.45, cz = pz * 0.4;
        const r = 9.5 + Math.sin(this.cineT * 0.11) * 1.5;
        this.tPos.set(cx - Math.abs(Math.cos(a)) * r * Math.sign(hx || 1), 3.4 + Math.sin(this.cineT * 0.09) * 0.9, cz + Math.sin(a) * r);
        this.tLook.set(cx, 1.9, cz * 0.6);
        rate = 1.5;
      } else if (this.mode === 'turntable') {
        // character select: slow auto-rotation around the player unless the user is dragging
        if (this.turnHeld > 0) this.turnHeld -= dt; else this.turn.yaw += dt * 0.32;
        const T = this.turn, a = ctx.yaw + T.yaw, cp = Math.cos(T.pitch);
        this.tPos.set(px + Math.sin(a) * T.dist * cp, 1.05 + Math.sin(T.pitch) * T.dist + 0.25, pz + Math.cos(a) * T.dist * cp);
        this.tLook.set(px, 1.02, pz);
        rate = 6;
      }
      // keep inside the building
      this.tPos.x = Math.max(-K.ARENA_X + 0.4, Math.min(K.ARENA_X - 0.4, this.tPos.x));
      this.tPos.z = Math.max(-K.BLEACH_Z - 5, Math.min(K.BLEACH_Z + 5, this.tPos.z));
      const az = Math.abs(this.tPos.z);
      const minY = az > K.BLEACH_Z ? K.BLEACH_WALL_H + (az - K.BLEACH_Z) * K.BLEACH_SLOPE + 0.8 : 0.35;
      this.tPos.y = Math.max(minY, Math.min(K.CEILING - 2, this.tPos.y));
      const k = snap ? 1 : 1 - Math.exp(-rate * (1.15 - this.settings.smoothing * 0.6) * dt);
      if (snap) { this.pos.copy(this.tPos); this.look.copy(this.tLook); this.init = true; }
      else { this.pos.lerp(this.tPos, k); this.look.lerp(this.tLook, Math.min(1, k * 1.4)); }
      this.cam.position.copy(this.pos);
      this.cam.lookAt(this.look);
      const fov = this.mode === 'broadcast' ? 34 : this.mode === 'side' ? 40 : this.mode === 'turntable' ? 38 : this.mode === 'rim' ? 62 : this.mode === 'orbit' ? 48 : this.settings.fov;
      if (Math.abs(this.cam.fov - fov) > 0.05) { this.cam.fov += (fov - this.cam.fov) * Math.min(1, snap ? 1 : dt * 6); this.cam.updateProjectionMatrix(); }
      this.applyShift();
    }
    // raise the look point just enough that the rim stays inside the top of the frame (and never past the shooter's feet)
    keepRimInView(H, frac) {
      const P = this.tPos, L = this.tLook;
      const hl = Math.hypot(L.x - P.x, L.z - P.z) || 1, hr = Math.hypot(H.cx - P.x, H.cz - P.z) || 1;
      const lookPitch = Math.atan2(L.y - P.y, hl), rimPitch = Math.atan2(K.RIM_TOP + 0.25 - P.y, hr);
      const half = (this.settings.fov * DEG) / 2 * frac;
      if (rimPitch > lookPitch + half) L.y = P.y + Math.tan(Math.min(rimPitch - half, 0.5)) * hl;
    }
    // shift the projection center so the subject sits in the open part of a menu layout
    applyShift() {
      const w = (typeof window !== 'undefined' && window.innerWidth) || 0, h = (typeof window !== 'undefined' && window.innerHeight) || 0;
      const px = this.mode === 'turntable' || this.mode === 'orbit' ? Math.round(this.frameShift || 0) : 0;
      const S = this._shift;
      if (S.px === px && S.w === w && S.h === h) return;
      S.px = px; S.w = w; S.h = h;
      if (px && w && h) this.cam.setViewOffset(w, h, -px, 0, w, h); else this.cam.clearViewOffset();
    }
    snapNext() { this.init = false; }
  }
  return { Rig, MODES, REPLAY, LABEL };
})();
