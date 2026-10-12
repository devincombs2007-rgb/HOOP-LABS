// HOOP LAB — instant replay: records the real simulated frames and plays them back exactly.
const HoopReplay = (() => {
  'use strict';
  const PIVOTS = ['Hips', 'Spine', 'Neck', 'Head', 'L_Shoulder', 'R_Shoulder', 'L_Elbow', 'R_Elbow', 'L_Wrist', 'R_Wrist', 'L_Hip', 'R_Hip', 'L_Knee', 'R_Knee', 'L_Ankle', 'R_Ankle'];
  const NB = 6;
  const FRAME = 1 + 2 + 3 + PIVOTS.length * 4 + NB * 8; // t, root x/z, hips pos, quats, balls (x,y,z,qx,qy,qz,qw,visible)
  const RATE = 60, SECONDS = 14, CAP = RATE * SECONDS;

  class Recorder {
    constructor() { this.buf = new Float32Array(CAP * FRAME); this.count = 0; this.head = 0; this.acc = 0; }
    reset() { this.count = 0; this.head = 0; }
    capture(t, model, balls) {
      const o = this.head * FRAME, b = this.buf;
      b[o] = t; b[o + 1] = model.root.position.x; b[o + 2] = model.root.position.z;
      const hp = model.nodes.Hips.position; b[o + 3] = hp.x; b[o + 4] = hp.y; b[o + 5] = hp.z;
      let k = o + 6;
      for (const n of PIVOTS) { const q = model.nodes[n].quaternion; b[k++] = q.x; b[k++] = q.y; b[k++] = q.z; b[k++] = q.w; }
      for (let i = 0; i < NB; i++) {
        const bl = balls[i];
        if (bl && bl.visible) { b[k++] = bl.x; b[k++] = bl.y; b[k++] = bl.z; b[k++] = bl.qx; b[k++] = bl.qy; b[k++] = bl.qz; b[k++] = bl.qw; b[k++] = 1; }
        else { for (let j = 0; j < 8; j++) b[k++] = 0; }
      }
      this.head = (this.head + 1) % CAP; this.count = Math.min(CAP, this.count + 1);
    }
    // copy frames with time in [t0, t1] into a standalone clip
    clip(t0, t1, meta) {
      const frames = [];
      for (let i = 0; i < this.count; i++) {
        const idx = (this.head - this.count + i + CAP) % CAP, o = idx * FRAME;
        const t = this.buf[o];
        if (t >= t0 && t <= t1) frames.push(this.buf.slice(o, o + FRAME));
      }
      if (frames.length < 4) return null;
      const data = new Float32Array(frames.length * FRAME);
      frames.forEach((f, i) => data.set(f, i * FRAME));
      return Object.assign({ data, n: frames.length, t0: data[0], t1: data[(frames.length - 1) * FRAME] }, meta);
    }
  }

  // apply clip state at time t (seconds since clip start) — interpolated between recorded frames
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  function apply(clip, t, model, ballMeshes, out) {
    const T = clip.t0 + t, d = clip.data;
    let lo = 0, hi = clip.n - 1;
    if (T <= d[0]) hi = 0; else if (T >= d[(clip.n - 1) * FRAME]) lo = hi = clip.n - 1;
    else { while (hi - lo > 1) { const m = (lo + hi) >> 1; if (d[m * FRAME] <= T) lo = m; else hi = m; } }
    const oa = lo * FRAME, ob = hi * FRAME;
    const span = d[ob] - d[oa], f = span > 1e-6 ? (T - d[oa]) / span : 0;
    const L = (i) => d[oa + i] + (d[ob + i] - d[oa + i]) * f;  // (closure per call is fine: one apply per rendered frame)
    model.root.position.set(L(1), 0, L(2));
    model.nodes.Hips.position.set(L(3), L(4), L(5));
    let k = 6;
    for (const n of PIVOTS) {
      qa.set(d[oa + k], d[oa + k + 1], d[oa + k + 2], d[oa + k + 3]); qb.set(d[ob + k], d[ob + k + 1], d[ob + k + 2], d[ob + k + 3]);
      model.nodes[n].quaternion.copy(qa).slerp(qb, f); k += 4;
    }
    model.root.updateMatrixWorld(true);
    // out[i] = { x, y, z } for each visible ball i, null otherwise (indexed like the game's ball pool; objects reused)
    const pool = out.pool || (out.pool = []);
    out.length = NB;
    for (let i = 0; i < NB; i++) {
      const vis = d[oa + k + 7] > 0.5 && d[ob + k + 7] > 0.5;
      const m = ballMeshes[i];
      if (vis) {
        m.visible = true; m.position.set(L(k), L(k + 1), L(k + 2));
        qa.set(d[oa + k + 3], d[oa + k + 4], d[oa + k + 5], d[oa + k + 6]); qb.set(d[ob + k + 3], d[ob + k + 4], d[ob + k + 5], d[ob + k + 6]);
        m.quaternion.copy(qa).slerp(qb, f);
        const o = pool[i] || (pool[i] = { x: 0, y: 0, z: 0 });
        o.x = m.position.x; o.y = m.position.y; o.z = m.position.z; out[i] = o;
      } else { m.visible = false; out[i] = null; }
      k += 8;
    }
  }

  return { Recorder, apply, FRAME, RATE };
})();
