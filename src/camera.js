// HOOP LAB — camera rig: gameplay orbit, broadcast, side-view, behind-shooter, ball-follow, free.
const HoopCamera = (() => {
  'use strict';
  const PH = HoopPhysics, K = PH.K;
  const MODES = ['game', 'broadcast', 'side', 'behind', 'ball'];
  const LABEL = { game: 'Gameplay', broadcast: 'Broadcast', side: 'Side view', behind: 'Behind the shooter', ball: 'Ball follow', free: 'Free' };
  const V = () => new THREE.Vector3();

  class Rig {
    constructor(camera) {
      this.cam = camera;
      this.mode = 'game';
      this.yaw = Math.PI / 2; this.pitch = 0.22; this.dist = 4.6;
      this.settings = { sens: 1, invertY: false, dist: 4.6, height: 0.35, fov: 55, smoothing: 0.5 };
      this.pos = V(); this.look = V(); this.tPos = V(); this.tLook = V();
      this.lastManual = 0; this.init = false;
      this.free = { target: V(), yaw: 0, pitch: 0.3, dist: 6 };
      this.tmp = V(); this.tmp2 = V();
    }
    forward(out = V()) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
    cycle() { const i = MODES.indexOf(this.mode); this.mode = MODES[(i + 1) % MODES.length]; return LABEL[this.mode]; }
    setMode(m) { this.mode = m; }

    manual(dx, dy, now) {
      const s = this.settings.sens * 0.0032;
      if (dx || dy) this.lastManual = now;
      if (this.mode === 'free') { this.free.yaw -= dx * s; this.free.pitch = Math.max(-0.2, Math.min(1.45, this.free.pitch + dy * s * (this.settings.invertY ? -1 : 1))); return; }
      this.yaw -= dx * s;
      this.pitch = Math.max(-0.12, Math.min(1.2, this.pitch + dy * s * (this.settings.invertY ? -1 : 1)));
    }
    zoom(z) {
      if (this.mode === 'free') { this.free.dist = Math.max(1.5, Math.min(30, this.free.dist * (1 + z * 0.1))); return; }
      this.settings.dist = Math.max(2.4, Math.min(11, this.settings.dist * (1 + z * 0.08)));
    }

    // ctx: { player (x,z,yaw), hoop index, shooting, ball (x,y,z,vx,vy,vz) or null, dt, now }
    update(ctx) {
      const { dt, now } = ctx;
      const H = PH.HOOPS[ctx.hoop];
      const px = ctx.px, pz = ctx.pz, py = ctx.py;
      let snap = !this.init;
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
        }
      } else if (this.mode === 'free') {
        const F = this.free, cp = Math.cos(F.pitch);
        this.tPos.set(F.target.x - Math.sin(F.yaw) * F.dist * cp, F.target.y + Math.sin(F.pitch) * F.dist, F.target.z - Math.cos(F.yaw) * F.dist * cp);
        this.tLook.copy(F.target); snap = true;
      }
      // keep inside the building
      this.tPos.x = Math.max(-K.ARENA_X + 0.4, Math.min(K.ARENA_X - 0.4, this.tPos.x));
      this.tPos.z = Math.max(-K.BLEACH_Z - 5, Math.min(K.BLEACH_Z + 5, this.tPos.z));
      const az = Math.abs(this.tPos.z);
      const minY = az > K.BLEACH_Z ? K.BLEACH_WALL_H + (az - K.BLEACH_Z) * K.BLEACH_SLOPE + 0.8 : 0.35;
      this.tPos.y = Math.max(minY, Math.min(K.CEILING - 2, this.tPos.y));
      const k = snap ? 1 : 1 - Math.exp(-(this.mode === 'game' ? 14 : this.mode === 'ball' ? 6 : 4) * (1.15 - this.settings.smoothing * 0.6) * dt);
      if (snap) { this.pos.copy(this.tPos); this.look.copy(this.tLook); this.init = true; }
      else { this.pos.lerp(this.tPos, k); this.look.lerp(this.tLook, Math.min(1, k * 1.4)); }
      this.cam.position.copy(this.pos);
      this.cam.lookAt(this.look);
      const fov = this.mode === 'broadcast' ? 34 : this.mode === 'side' ? 40 : this.settings.fov;
      if (Math.abs(this.cam.fov - fov) > 0.05) { this.cam.fov += (fov - this.cam.fov) * Math.min(1, dt * 6); this.cam.updateProjectionMatrix(); }
    }
    snapNext() { this.init = false; }
  }
  return { Rig, MODES, LABEL };
})();
