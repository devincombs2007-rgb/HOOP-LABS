// HOOP LAB — the gym: hardwood court with NBA markings, hoops, reactive nets, stands, lights, reflections.
const HoopWorld = (() => {
  'use strict';
  const PH = HoopPhysics, K = PH.K;
  const XW = K.ARENA_X, ZW = K.BLEACH_Z;
  const QUALITY = {
    low:    { ppm: 36, shadows: false, shadowSize: 512,  reflect: 0,   pixel: 0.75, netTubes: false, aniso: 2 },
    medium: { ppm: 52, shadows: true,  shadowSize: 1024, reflect: 0,   pixel: 1.0,  netTubes: false, aniso: 4 },
    high:   { ppm: 70, shadows: true,  shadowSize: 2048, reflect: 0.5, pixel: 1.5,  netTubes: false, aniso: 8 },
    ultra:  { ppm: 92, shadows: true,  shadowSize: 4096, reflect: 1.0, pixel: 2.0,  netTubes: false, aniso: 16 },
  };
  const PAINT = '#1F4E86', APRON = '#5b3a22';

  // ------------------------------------------------------------------ floor texture
  function drawCourt(ppm) {
    const W = Math.round(2 * XW * ppm), H = Math.round(2 * ZW * ppm);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const X = (x) => (x + XW) * ppm, Z = (z) => (z + ZW) * ppm;
    // seeded random for stable wood
    let seed = 1337; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    // planks along the court length
    g.fillStyle = '#c99a62'; g.fillRect(0, 0, W, H);
    const plankW = 0.0571 * ppm;
    for (let row = 0, y = 0; y < H; row++, y += plankW) {
      let x = -rnd() * 1.6 * ppm;
      while (x < W) {
        const len = (0.7 + rnd() * 1.9) * ppm;
        const t = rnd();
        const r = 196 + t * 30 - 8, gg = 148 + t * 26 - 6, b = 92 + t * 22 - 4;
        g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
        g.fillRect(x, y, len, plankW + 0.5);
        // grain streaks
        g.globalAlpha = 0.08 + rnd() * 0.06;
        g.strokeStyle = rnd() > 0.5 ? '#7a5428' : '#e8c48c'; g.lineWidth = Math.max(0.5, ppm * 0.004);
        for (let k = 0; k < 2; k++) { const yy = y + plankW * (0.2 + rnd() * 0.6); g.beginPath(); g.moveTo(x, yy); g.bezierCurveTo(x + len * 0.3, yy + (rnd() - 0.5) * plankW * 0.6, x + len * 0.7, yy + (rnd() - 0.5) * plankW * 0.6, x + len, yy); g.stroke(); }
        g.globalAlpha = 0.35; g.fillStyle = '#5a3c1e'; g.fillRect(x, y, Math.max(1, ppm * 0.003), plankW); // butt joint
        g.globalAlpha = 1;
        x += len;
      }
      g.globalAlpha = 0.18; g.fillStyle = '#6b4824'; g.fillRect(0, y, W, Math.max(1, ppm * 0.0025)); g.globalAlpha = 1;
    }
    // apron stain outside the court
    g.save();
    g.beginPath(); g.rect(0, 0, W, H); g.rect(X(-K.COURT_HALF_L), Z(-K.COURT_HALF_W), 2 * K.COURT_HALF_L * ppm, 2 * K.COURT_HALF_W * ppm);
    g.fillStyle = 'rgba(70,38,18,0.55)'; g.fill('evenodd'); g.restore();
    const LW = 0.0508 * ppm;
    const line = (color = '#f4f1ea') => { g.strokeStyle = color; g.lineWidth = LW; g.lineCap = 'butt'; };
    for (const s of [1, -1]) {
      const bx = s * K.COURT_HALF_L, hx = s * K.HOOP_X, ftx = s * (K.COURT_HALF_L - K.LANE_L);
      // painted lane
      g.globalAlpha = 0.88; g.fillStyle = PAINT;
      g.fillRect(Math.min(X(bx), X(ftx)), Z(-K.LANE_W / 2), Math.abs(X(bx) - X(ftx)), K.LANE_W * ppm);
      g.globalAlpha = 1;
      line();
      g.strokeRect(Math.min(X(bx), X(ftx)) + LW / 2, Z(-K.LANE_W / 2) + LW / 2, Math.abs(X(bx) - X(ftx)) - LW, K.LANE_W * ppm - LW);
      // free-throw circle: solid half toward mid-court, dashed half inside the lane
      const a0 = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.beginPath(); g.arc(X(ftx), Z(0), K.FT_CIRCLE_R * ppm - LW / 2, a0, a0 + Math.PI); g.stroke();
      g.setLineDash([0.38 * ppm, 0.3 * ppm]); g.beginPath(); g.arc(X(ftx), Z(0), K.FT_CIRCLE_R * ppm - LW / 2, a0 + Math.PI, a0 + 2 * Math.PI); g.stroke(); g.setLineDash([]);
      // three-point line
      const xm = hx - s * Math.sqrt(K.THREE_ARC ** 2 - K.THREE_CORNER ** 2);
      g.beginPath(); g.moveTo(X(bx), Z(-K.THREE_CORNER)); g.lineTo(X(xm), Z(-K.THREE_CORNER)); g.stroke();
      g.beginPath(); g.moveTo(X(bx), Z(K.THREE_CORNER)); g.lineTo(X(xm), Z(K.THREE_CORNER)); g.stroke();
      const ang = Math.asin(K.THREE_CORNER / K.THREE_ARC);
      g.beginPath();
      if (s > 0) g.arc(X(hx), Z(0), K.THREE_ARC * ppm, Math.PI - ang, Math.PI + ang); else g.arc(X(hx), Z(0), K.THREE_ARC * ppm, -ang, ang);
      g.stroke();
      // restricted area
      g.beginPath();
      if (s > 0) g.arc(X(hx), Z(0), K.RA_R * ppm, Math.PI / 2, 3 * Math.PI / 2); else g.arc(X(hx), Z(0), K.RA_R * ppm, -Math.PI / 2, Math.PI / 2);
      g.stroke();
      const bfx = s * K.BOARD_X;
      g.beginPath(); g.moveTo(X(hx), Z(-K.RA_R)); g.lineTo(X(bfx), Z(-K.RA_R)); g.moveTo(X(hx), Z(K.RA_R)); g.lineTo(X(bfx), Z(K.RA_R)); g.stroke();
      // lane space marks (7, 8 (block), 11, 14 ft from the baseline)
      g.fillStyle = '#f4f1ea';
      for (const [ftv, w] of [[7, 0.0508], [8, 0.3048], [11, 0.0508], [14, 0.0508]]) {
        const mx = bx - s * ftv * 0.3048;
        for (const zs of [1, -1]) g.fillRect(X(mx) - (s > 0 ? w * ppm : 0), zs > 0 ? Z(K.LANE_W / 2) : Z(-K.LANE_W / 2) - 0.1524 * ppm, w * ppm, 0.1524 * ppm);
      }
      // 28-ft hash marks on the sidelines
      const hxm = bx - s * K.HASH_FROM_BASE;
      g.fillRect(X(hxm) - LW / 2, Z(-K.COURT_HALF_W), LW, 0.914 * ppm);
      g.fillRect(X(hxm) - LW / 2, Z(K.COURT_HALF_W) - 0.914 * ppm, LW, 0.914 * ppm);
      // baseline apron lettering
      g.save(); g.translate(X(s * (K.COURT_HALF_L + 1.6)), Z(0)); g.rotate(s > 0 ? -Math.PI / 2 : Math.PI / 2);
      g.font = `800 ${0.95 * ppm}px "Big Shoulders Display", "Arial Narrow", Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(244,236,220,0.82)'; g.fillText('HOOP LAB', 0, 0); g.restore();
    }
    // boundary + half-court
    line();
    g.strokeRect(X(-K.COURT_HALF_L) + LW / 2, Z(-K.COURT_HALF_W) + LW / 2, 2 * K.COURT_HALF_L * ppm - LW, 2 * K.COURT_HALF_W * ppm - LW);
    g.beginPath(); g.moveTo(X(0), Z(-K.COURT_HALF_W)); g.lineTo(X(0), Z(K.COURT_HALF_W)); g.stroke();
    // center circle + original logo
    g.globalAlpha = 0.9; g.fillStyle = PAINT; g.beginPath(); g.arc(X(0), Z(0), K.CENTER_R * ppm, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    g.beginPath(); g.arc(X(0), Z(0), K.CENTER_R * ppm - LW / 2, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(X(0), Z(0), K.CENTER_INNER_R * ppm, 0, Math.PI * 2); g.stroke();
    g.save(); g.translate(X(0), Z(0));
    g.fillStyle = '#E3A33A'; g.font = `800 ${0.78 * ppm}px "Big Shoulders Display", "Arial Narrow", Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.rotate(-Math.PI / 2); g.fillText('HL', 0, 0.04 * ppm);
    g.font = `700 ${0.2 * ppm}px "Barlow", "Arial Narrow", sans-serif`; g.fillStyle = 'rgba(244,241,234,0.9)';
    g.fillText('HOOP LAB', 0, -1.1 * ppm); g.fillText('EST. 2026', 0, 1.12 * ppm);
    g.restore();
    // sideline apron lettering
    g.save(); g.font = `700 ${0.5 * ppm}px "Barlow", "Arial Narrow", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(244,236,220,0.6)';
    g.fillText('TRAINING CENTER', X(0), Z(K.COURT_HALF_W + 1.4));
    g.translate(X(0), Z(-K.COURT_HALF_W - 1.4)); g.rotate(Math.PI); g.fillText('TRAINING CENTER', 0, 0);
    g.restore();
    return c;
  }

  // roughness texture: lines + paint are glossier
  function ballTexture() {
    const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#c4591c'; g.fillRect(0, 0, W, H);
    // pebbling
    const img = g.getImageData(0, 0, W, H), d = img.data;
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 26; d[i] += n; d[i + 1] += n * 0.6; d[i + 2] += n * 0.3; }
    g.putImageData(img, 0, 0);
    g.strokeStyle = '#1b130e'; g.lineWidth = 7;
    g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();                       // equator
    for (const u of [0.25, 0.75]) { g.beginPath(); g.moveTo(u * W, 0); g.lineTo(u * W, H); g.stroke(); } // meridian great circle
    for (const u0 of [0, 0.5]) { // the two curved seams
      g.beginPath();
      for (let k = 0; k <= 64; k++) { const v = k / 64, lat = (v - 0.5) * Math.PI; const u = u0 + 0.13 * Math.cos(lat) ** 0.6; const x = ((u + 1) % 1) * W; if (k === 0) g.moveTo(x, v * H); else g.lineTo(x, v * H); }
      g.stroke();
      g.beginPath();
      for (let k = 0; k <= 64; k++) { const v = k / 64, lat = (v - 0.5) * Math.PI; const u = u0 - 0.13 * Math.cos(lat) ** 0.6; const x = ((u + 1) % 1) * W; if (k === 0) g.moveTo(x, v * H); else g.lineTo(x, v * H); }
      g.stroke();
    }
    return c;
  }

  function textCanvas(lines, w, h, opts = {}) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = opts.bg || '#111'; g.fillRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((l, i) => { g.font = l.font; g.fillStyle = l.color || '#fff'; g.fillText(l.text, w / 2, l.y * h); });
    return c;
  }

  // ------------------------------------------------------------------ verlet net
  class Net {
    constructor(hoop, scene, mat) {
      this.hoop = hoop; this.cols = 12; this.rows = 7;
      const n = this.cols * this.rows;
      this.p = new Float32Array(n * 3); this.o = new Float32Array(n * 3); this.rest = new Float32Array(n * 3);
      for (let k = 0; k < this.rows; k++) for (let j = 0; j < this.cols; j++) {
        const t = k / (this.rows - 1), r = K.RIM_IN_R + 0.004 + (K.NET_BOTTOM_R - K.RIM_IN_R) * t;
        const a = (j + (k % 2) * 0.5) / this.cols * Math.PI * 2;
        const i = (k * this.cols + j) * 3;
        this.rest[i] = hoop.cx + Math.cos(a) * r; this.rest[i + 1] = K.RIM_Y - t * K.NET_DEPTH; this.rest[i + 2] = hoop.cz + Math.sin(a) * r;
      }
      this.p.set(this.rest); this.o.set(this.rest);
      // diamond mesh constraints
      const C = [];
      const idx = (k, j) => k * this.cols + ((j % this.cols) + this.cols) % this.cols;
      for (let k = 0; k < this.rows - 1; k++) for (let j = 0; j < this.cols; j++) {
        const a = idx(k, j);
        const b1 = idx(k + 1, k % 2 ? j + 1 : j), b2 = idx(k + 1, k % 2 ? j : j - 1);
        C.push([a, b1], [a, b2]);
      }
      for (let j = 0; j < this.cols; j++) C.push([idx(this.rows - 1, j), idx(this.rows - 1, j + 1)]);
      this.c = C.map(([a, b]) => [a, b, Math.hypot(this.rest[a * 3] - this.rest[b * 3], this.rest[a * 3 + 1] - this.rest[b * 3 + 1], this.rest[a * 3 + 2] - this.rest[b * 3 + 2])]);
      this.geo = new THREE.BufferGeometry();
      this.lp = new Float32Array(this.c.length * 6);
      this.geo.setAttribute('position', new THREE.BufferAttribute(this.lp, 3));
      this.lines = new THREE.LineSegments(this.geo, mat);
      this.lines.frustumCulled = false;
      scene.add(this.lines);
      this.energy = 0;
      this.writeLines();
    }
    reset() { this.p.set(this.rest); this.o.set(this.rest); this.writeLines(); }
    step(dt, balls) {
      const p = this.p, o = this.o, n = this.cols * this.rows;
      const g = -9.81 * dt * dt, damp = 0.965;
      let moved = 0;
      for (let i = this.cols; i < n; i++) {
        const i3 = i * 3;
        const vx = (p[i3] - o[i3]) * damp, vy = (p[i3 + 1] - o[i3 + 1]) * damp, vz = (p[i3 + 2] - o[i3 + 2]) * damp;
        o[i3] = p[i3]; o[i3 + 1] = p[i3 + 1]; o[i3 + 2] = p[i3 + 2];
        p[i3] += vx; p[i3 + 1] += vy + g; p[i3 + 2] += vz;
        // gentle pull back to the rest shape (net memory / weave stiffness)
        p[i3] += (this.rest[i3] - p[i3]) * 0.012; p[i3 + 1] += (this.rest[i3 + 1] - p[i3 + 1]) * 0.012; p[i3 + 2] += (this.rest[i3 + 2] - p[i3 + 2]) * 0.012;
        moved += Math.abs(vx) + Math.abs(vy) + Math.abs(vz);
      }
      for (let it = 0; it < 3; it++) {
        for (const [a, b, L] of this.c) {
          const a3 = a * 3, b3 = b * 3;
          const dx = p[b3] - p[a3], dy = p[b3 + 1] - p[a3 + 1], dz = p[b3 + 2] - p[a3 + 2];
          const d = Math.hypot(dx, dy, dz) || 1e-6;
          if (d < L * 0.9 && it > 0) continue; // strings go slack, they don't push
          const diff = (d - L) / d * 0.5;
          const pa = a >= this.cols ? 1 : 0, pb = b >= this.cols ? 1 : 0;
          const wa = pa / (pa + pb || 1) * 2, wb = pb / (pa + pb || 1) * 2;
          p[a3] += dx * diff * wa; p[a3 + 1] += dy * diff * wa; p[a3 + 2] += dz * diff * wa;
          p[b3] -= dx * diff * wb; p[b3 + 1] -= dy * diff * wb; p[b3 + 2] -= dz * diff * wb;
        }
        for (const bl of balls) {
          if (Math.abs(bl.x - this.hoop.cx) > 0.6 || Math.abs(bl.z - this.hoop.cz) > 0.6 || bl.y > K.RIM_Y + 0.2 || bl.y < K.RIM_Y - 0.8) continue;
          const R = K.BALL_R + 0.012;
          for (let i = this.cols; i < n; i++) {
            const i3 = i * 3;
            const dx = p[i3] - bl.x, dy = p[i3 + 1] - bl.y, dz = p[i3 + 2] - bl.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < R * R) { const d = Math.sqrt(d2) || 1e-6, k = R / d; p[i3] = bl.x + dx * k; p[i3 + 1] = bl.y + dy * k; p[i3 + 2] = bl.z + dz * k; }
          }
        }
      }
      this.energy = moved;
    }
    writeLines() {
      const p = this.p, L = this.lp;
      let k = 0;
      for (const [a, b] of this.c) { L[k++] = p[a * 3]; L[k++] = p[a * 3 + 1]; L[k++] = p[a * 3 + 2]; L[k++] = p[b * 3]; L[k++] = p[b * 3 + 1]; L[k++] = p[b * 3 + 2]; }
      this.geo.attributes.position.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------------ build
  function build(renderer, quality) {
    const Q = QUALITY[quality] || QUALITY.high;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0f13);
    scene.fog = new THREE.Fog(0x0d0f13, 34, 80);
    const W = {}; W.scene = scene; W.quality = quality;
    // environment map from a simple procedural arena (bright ceiling fixtures, dim walls)
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.BoxGeometry(60, 24, 40), new THREE.MeshBasicMaterial({ color: 0x2a2520, side: THREE.BackSide })));
    const panelMat = new THREE.MeshBasicMaterial({ color: 0xfff3dc });
    for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) { const pnl = new THREE.Mesh(new THREE.PlaneGeometry(6, 2), panelMat); pnl.position.set(i * 9, 11.8, j * 9); pnl.rotation.x = Math.PI / 2; envScene.add(pnl); }
    const floorEnv = new THREE.Mesh(new THREE.PlaneGeometry(40, 24), new THREE.MeshBasicMaterial({ color: 0x7a5530 })); floorEnv.rotation.x = -Math.PI / 2; floorEnv.position.y = -11.9; envScene.add(floorEnv);
    const pmrem = new THREE.PMREMGenerator(renderer);
    W.envMap = pmrem.fromScene(envScene, 0.035).texture;
    scene.environment = W.envMap;
    pmrem.dispose();

    // lights
    W.hemi = new THREE.HemisphereLight(0xfff1dd, 0x3a2a1c, 0.55); scene.add(W.hemi);
    W.sun = new THREE.DirectionalLight(0xfff4e6, 1.25);
    W.sun.position.set(4, 14, 3);
    W.sun.castShadow = Q.shadows;
    W.sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
    const sc = W.sun.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 40;
    W.sun.shadow.bias = -0.0004; W.sun.shadow.normalBias = 0.02;
    scene.add(W.sun); scene.add(W.sun.target);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.35); fill.position.set(-6, 9, -8); scene.add(fill);
    // court "pools" of light over each basket (no shadows)
    for (const s of [1, -1]) { const pl = new THREE.PointLight(0xfff0d8, 0.6, 26, 1.6); pl.position.set(s * 9, 12, 0); scene.add(pl); }

    // floor
    const courtCanvas = drawCourt(Q.ppm);
    const tex = new THREE.CanvasTexture(courtCanvas);
    tex.encoding = THREE.sRGBEncoding; tex.anisotropy = Math.min(Q.aniso, renderer.capabilities.getMaxAnisotropy());
    W.floorMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.36, metalness: 0.0, envMapIntensity: 0.55 });
    W.floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * XW, 2 * ZW), W.floorMat);
    W.floor.rotation.x = -Math.PI / 2; W.floor.receiveShadow = true; scene.add(W.floor);
    setupReflection(W, renderer, Q);

    // hoops
    W.hoopGroups = [];
    W.nets = [];
    const netMat = new THREE.LineBasicMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.92 });
    for (const H of PH.HOOPS) W.hoopGroups.push(buildHoop(scene, H, W));
    for (const H of PH.HOOPS) W.nets.push(new Net(H, scene, netMat));

    buildArena(scene, W, Q);

    // balls
    const btex = new THREE.CanvasTexture(ballTexture()); btex.encoding = THREE.sRGBEncoding; btex.anisotropy = 4;
    W.ballMat = new THREE.MeshStandardMaterial({ map: btex, roughness: 0.78, metalness: 0, envMapIntensity: 0.6 });
    W.ballGeo = new THREE.SphereGeometry(K.BALL_R, 40, 28);
    W.ballMeshes = [];
    for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(W.ballGeo, W.ballMat); m.castShadow = true; m.visible = false; scene.add(m); W.ballMeshes.push(m); }
    // blob shadows (low quality, or as contact darkening)
    const blobC = document.createElement('canvas'); blobC.width = blobC.height = 64;
    const bg = blobC.getContext('2d'); const grad = bg.createRadialGradient(32, 32, 0, 32, 32, 32); grad.addColorStop(0, 'rgba(0,0,0,0.55)'); grad.addColorStop(1, 'rgba(0,0,0,0)'); bg.fillStyle = grad; bg.fillRect(0, 0, 64, 64);
    W.blobMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(blobC), transparent: true, depthWrite: false });
    W.blobs = [];
    for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), W.blobMat); b.rotation.x = -Math.PI / 2; b.position.y = 0.004; b.renderOrder = 1; b.visible = false; scene.add(b); W.blobs.push(b); }

    // spot marker for drills
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.46, 48), new THREE.MeshBasicMaterial({ color: 0xE3A33A, transparent: true, opacity: 0.85, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.006; ring.visible = false; ring.renderOrder = 1; scene.add(ring); W.spotRing = ring;
    // trajectory trail + ideal arc guide
    const trailGeo = new THREE.BufferGeometry(); trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(1200 * 3), 3)); trailGeo.setDrawRange(0, 0);
    W.trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xE3A33A, transparent: true, opacity: 0.9 })); W.trail.frustumCulled = false; scene.add(W.trail);
    const guideGeo = new THREE.BufferGeometry(); guideGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(400 * 3), 3)); guideGeo.setDrawRange(0, 0);
    W.guide = new THREE.Line(guideGeo, new THREE.LineDashedMaterial({ color: 0x9fd4ff, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0.75 })); W.guide.frustumCulled = false; scene.add(W.guide);
    const mk = (c) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: c })); m.visible = false; scene.add(m); return m; };
    W.releaseMarker = mk(0x7CE0A3); W.contactMarkers = [0, 1, 2, 3, 4, 5].map(() => mk(0xFF6B5A));
    W.Q = Q;
    return W;
  }

  function setupReflection(W, renderer, Q) {
    W.reflect = null;
    if (!Q.reflect) return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(256, size.x * Q.reflect * 0.5) | 0, Math.max(256, size.y * Q.reflect * 0.5) | 0, { encoding: THREE.sRGBEncoding });
    const texMatrix = new THREE.Matrix4();
    const uniforms = { tReflect: { value: rt.texture }, uTexMatrix: { value: texMatrix }, uReflect: { value: 0.3 }, uBlur: { value: 0.006 } };
    W.floorMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = 'uniform mat4 uTexMatrix;\nvarying vec4 vReflUv;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvReflUv = uTexMatrix * modelMatrix * vec4(transformed, 1.0);');
      sh.fragmentShader = 'uniform sampler2D tReflect;\nuniform float uReflect;\nuniform float uBlur;\nvarying vec4 vReflUv;\n' + sh.fragmentShader.replace('#include <output_fragment>',
        `vec2 ruv = vReflUv.xy / vReflUv.w;
         vec3 rc = vec3(0.0);
         rc += texture2D(tReflect, ruv).rgb * 0.36;
         rc += texture2D(tReflect, ruv + vec2(uBlur, 0.0)).rgb * 0.16;
         rc += texture2D(tReflect, ruv - vec2(uBlur, 0.0)).rgb * 0.16;
         rc += texture2D(tReflect, ruv + vec2(0.0, uBlur * 1.6)).rgb * 0.16;
         rc += texture2D(tReflect, ruv - vec2(0.0, uBlur * 1.6)).rgb * 0.16;
         float fres = 0.55 + 0.45 * pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 3.0);
         outgoingLight += rc * uReflect * fres;
         #include <output_fragment>`);
    };
    W.floorMat.needsUpdate = true;
    const mirrorCam = new THREE.PerspectiveCamera();
    const tmpV = new THREE.Vector3(), target = new THREE.Vector3();
    W.reflect = {
      rt, uniforms, mirrorCam, scale: Q.reflect,
      render(renderer, scene, camera, hide) {
        camera.getWorldDirection(tmpV);
        target.copy(camera.position).addScaledVector(tmpV, 10);
        mirrorCam.position.set(camera.position.x, -camera.position.y, camera.position.z);
        mirrorCam.up.set(0, -1, 0);
        mirrorCam.lookAt(target.x, -target.y, target.z);
        mirrorCam.projectionMatrix.copy(camera.projectionMatrix);
        mirrorCam.updateMatrixWorld();
        mirrorCam.matrixWorldInverse.copy(mirrorCam.matrixWorld).invert();
        texMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(mirrorCam.projectionMatrix).multiply(mirrorCam.matrixWorldInverse);
        for (const o of hide) o.visible = false;
        const fog = scene.fog; scene.fog = null;
        const sh = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
        renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, mirrorCam); renderer.setRenderTarget(null);
        renderer.shadowMap.autoUpdate = sh; scene.fog = fog;
        for (const o of hide) o.visible = true;
      },
      resize(w, h) { rt.setSize(Math.max(256, w * this.scale * 0.5) | 0, Math.max(256, h * this.scale * 0.5) | 0); },
    };
  }

  function buildHoop(scene, H, W) {
    const s = H.side, grp = new THREE.Group(); scene.add(grp);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x1b4a86, roughness: 0.7 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x2d3138, roughness: 0.45, metalness: 0.6 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xe0521b, roughness: 0.35, metalness: 0.55 });
    // stanchion base (padded) — matches physics box
    const b = H.base;
    const base = new THREE.Mesh(new THREE.BoxGeometry(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ), padMat);
    base.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, 0); base.castShadow = base.receiveShadow = true; grp.add(base);
    const capsule = (c, mat) => {
      const a = new THREE.Vector3(c.ax, c.ay, c.az), e = new THREE.Vector3(c.bx, c.by, c.bz);
      const len = a.distanceTo(e);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(c.r, c.r, len, 20), mat);
      m.position.copy(a).add(e).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), e.clone().sub(a).normalize());
      m.castShadow = true; grp.add(m); return m;
    };
    capsule(H.pole, padMat); capsule(H.arm, steel);
    // backboard: glass + frame + shooter's square
    const bd = H.board;
    const bw = bd.maxZ - bd.minZ, bh = bd.maxY - bd.minY, bx = (bd.minX + bd.maxX) / 2, by = (bd.minY + bd.maxY) / 2;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(K.BOARD_T * 0.6, bh, bw), new THREE.MeshStandardMaterial({ color: 0xcfe3f0, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0.0, envMapIntensity: 1.6, depthWrite: false }));
    glass.position.set(bx, by, 0); glass.renderOrder = 3; grp.add(glass);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.5, metalness: 0.4 });
    const fr = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat); m.position.set(x, y, z); grp.add(m); };
    const ft = 0.035;
    fr(K.BOARD_T, ft, bw, bx, bd.maxY - ft / 2, 0); fr(K.BOARD_T, ft, bw, bx, bd.minY + ft / 2, 0);
    fr(K.BOARD_T, bh, ft, bx, by, bd.minZ + ft / 2); fr(K.BOARD_T, bh, ft, bx, by, bd.maxZ - ft / 2);
    // white border + target square painted on the glass (front face)
    const white = new THREE.MeshBasicMaterial({ color: 0xf6f6f6 });
    const face = s > 0 ? bd.minX - 0.002 : bd.maxX + 0.002;
    const wl = (w, h, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.004, h, w), white); m.position.set(face, y, z); grp.add(m); };
    const sqW = 0.6096, sqH = 0.4572, sqB = K.RIM_TOP + 0.0, lw = 0.0508;
    wl(sqW, lw, sqB + lw / 2, 0); wl(sqW, lw, sqB + sqH - lw / 2, 0); wl(lw, sqH, sqB + sqH / 2, -sqW / 2 + lw / 2); wl(lw, sqH, sqB + sqH / 2, sqW / 2 - lw / 2);
    wl(bw - 0.07, lw, bd.maxY - 0.06, 0); wl(bw - 0.07, lw, bd.minY + 0.06, 0); wl(lw, bh - 0.1, by, bd.minZ + 0.06); wl(lw, bh - 0.1, by, bd.maxZ - 0.06);
    // bottom pad
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, bw + 0.04), padMat); pad.position.set(bx, bd.minY - 0.025, 0); grp.add(pad);
    // shot clock on top
    const clockC = textCanvas([{ text: '24', font: '700 120px "Barlow", sans-serif', color: '#ff3b2f', y: 0.55 }], 256, 160, { bg: '#0b0b0d' });
    const clockTex = new THREE.CanvasTexture(clockC); clockTex.encoding = THREE.sRGBEncoding;
    const clock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.42), [frameMat, frameMat, frameMat, frameMat, new THREE.MeshBasicMaterial({ map: clockTex }), new THREE.MeshBasicMaterial({ map: clockTex })]);
    clock.position.set(bx + s * 0.06, bd.maxY + 0.14, 0); clock.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2; grp.add(clock);
    // rim + bracket
    const rim = new THREE.Mesh(new THREE.TorusGeometry(K.RIM_R, K.RIM_TUBE, 12, 64), rimMat);
    rim.rotation.x = Math.PI / 2; rim.position.set(H.cx, H.cy, H.cz); rim.castShadow = true; grp.add(rim);
    const n = H.neck;
    const neckLen = Math.abs(n.bx - n.ax) + 0.04;
    const neck = new THREE.Mesh(new THREE.BoxGeometry(neckLen, 0.04, 0.16), rimMat); neck.position.set((n.ax + n.bx) / 2, n.ay - 0.01, 0); neck.castShadow = true; grp.add(neck);
    // net hooks
    const hookMat = new THREE.MeshStandardMaterial({ color: 0xd04a18, roughness: 0.4, metalness: 0.5 });
    for (let j = 0; j < 12; j++) { const a = j / 12 * Math.PI * 2; const hk = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.012), hookMat); hk.position.set(H.cx + Math.cos(a) * K.RIM_R, H.cy - 0.016, Math.sin(a) * K.RIM_R); grp.add(hk); }
    grp.userData.rim = rim;
    return grp;
  }

  function buildArena(scene, W, Q) {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.9 });
    const padWall = new THREE.MeshStandardMaterial({ color: 0x1b3e6e, roughness: 0.75 });
    // end walls (padded lower section with lettering, darker upper wall)
    for (const s of [1, -1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(2 * ZW + 14, 17), wallMat);
      wall.position.set(s * XW, 8.5, 0); wall.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; wall.receiveShadow = true; scene.add(wall);
      const pc = textCanvas([{ text: 'HOOP LAB · TRAINING CENTER', font: '800 120px "Big Shoulders Display", "Arial Narrow", Impact, sans-serif', color: '#E3A33A', y: 0.52 }], 2048, 256, { bg: '#1b3e6e' });
      const pt = new THREE.CanvasTexture(pc); pt.encoding = THREE.sRGBEncoding;
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(2 * ZW, 2.0), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.8 }));
      pad.position.set(s * (XW - 0.02), 1.0, 0); pad.rotation.y = wall.rotation.y; scene.add(pad);
    }
    // stands: front pad wall + stepped rows with seats (instanced)
    const rows = 12, rowD = K.BLEACH_DEPTH / rows, rise = K.BLEACH_DEPTH * K.BLEACH_SLOPE / rows;
    const stepMat = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.85 });
    const seatGeo = new THREE.BoxGeometry(0.46, 0.42, 0.4);
    const seatsPerRow = Math.floor((2 * XW - 2) / 0.55);
    const seatMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    const total = rows * seatsPerRow * 2;
    const seats = new THREE.InstancedMesh(seatGeo, seatMat, total);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    let si = 0;
    for (const s of [1, -1]) {
      const front = new THREE.Mesh(new THREE.BoxGeometry(2 * XW, K.BLEACH_WALL_H, 0.12), padWall);
      front.position.set(0, K.BLEACH_WALL_H / 2, s * (K.BLEACH_Z + 0.06)); front.receiveShadow = true; scene.add(front);
      for (let r = 0; r < rows; r++) {
        const z = s * (K.BLEACH_Z + rowD * (r + 0.5)), y = K.BLEACH_WALL_H + rise * r;
        const step = new THREE.Mesh(new THREE.BoxGeometry(2 * XW, rise + 0.02, rowD), stepMat);
        step.position.set(0, y - rise / 2 + 0.01, z); step.receiveShadow = true; scene.add(step);
        for (let k = 0; k < seatsPerRow; k++) {
          const x = -XW + 1 + k * 0.55 + 0.27;
          m4.makeTranslation(x, y + 0.21, z + s * 0.05);
          seats.setMatrixAt(si, m4);
          const band = Math.floor(r / 4) % 2 === 0;
          col.set(band ? 0x1d4a80 : 0x2a2f38);
          if (Math.abs(x) < 4 && r > 2 && r < 9) col.set(0xb27a2a); // gold "HL" block in the middle
          seats.setColorAt(si, col.convertSRGBToLinear());
          si++;
        }
      }
      // back wall behind the stands
      const back = new THREE.Mesh(new THREE.PlaneGeometry(2 * XW + 2, 14), wallMat);
      back.position.set(0, 8, s * (K.BLEACH_Z + K.BLEACH_DEPTH + 0.1)); back.rotation.y = s > 0 ? Math.PI : 0; scene.add(back);
    }
    seats.instanceMatrix.needsUpdate = true; if (seats.instanceColor) seats.instanceColor.needsUpdate = true;
    scene.add(seats);
    // ceiling, trusses, light fixtures
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(2 * XW + 2, 2 * (K.BLEACH_Z + K.BLEACH_DEPTH) + 2), new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 1 }));
    ceil.position.y = K.CEILING; ceil.rotation.x = Math.PI / 2; scene.add(ceil);
    const trussMat = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.7, metalness: 0.4 });
    const tz = 2 * (K.BLEACH_Z + K.BLEACH_DEPTH);
    const trussN = 9;
    const truss = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.6, tz), trussMat, trussN);
    for (let i = 0; i < trussN; i++) { m4.makeTranslation(-XW + (i + 0.5) * (2 * XW / trussN), K.CEILING - 1.2, 0); truss.setMatrixAt(i, m4); }
    scene.add(truss);
    const fixMat = new THREE.MeshBasicMaterial({ color: 0xfff6e3 });
    const fixtures = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.12, 0.6), fixMat, 6 * 4);
    let fi = 0;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { m4.makeTranslation(-14 + i * 5.6, K.CEILING - 1.6, -7.5 + j * 5); fixtures.setMatrixAt(fi++, m4); }
    scene.add(fixtures);
    // center-hung video board (live session stats)
    const vb = document.createElement('canvas'); vb.width = 512; vb.height = 256;
    W.boardCanvas = vb; W.boardTex = new THREE.CanvasTexture(vb); W.boardTex.encoding = THREE.sRGBEncoding;
    const boardMat = new THREE.MeshBasicMaterial({ map: W.boardTex });
    const cube = new THREE.Group();
    const housing = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.3, 4.2), new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.6 }));
    cube.add(housing);
    for (let i = 0; i < 4; i++) { const sc = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 1.95), boardMat); sc.position.set(Math.sin(i * Math.PI / 2) * 2.11, 0, Math.cos(i * Math.PI / 2) * 2.11); sc.rotation.y = i * Math.PI / 2; cube.add(sc); }
    cube.position.set(0, 12.6, 0); scene.add(cube);
    W.updateBoard = (a, b, c) => {
      const g = vb.getContext('2d');
      g.fillStyle = '#07080a'; g.fillRect(0, 0, 512, 256);
      g.fillStyle = '#E3A33A'; g.font = '800 44px "Big Shoulders Display", "Arial Narrow", Impact, sans-serif'; g.textAlign = 'center';
      g.fillText('HOOP LAB', 256, 58);
      g.fillStyle = '#f4f1ea'; g.font = '700 74px "Barlow", "Arial Narrow", sans-serif';
      g.fillText(a, 256, 150);
      g.fillStyle = '#9fb0c4'; g.font = '600 30px "Barlow", "Arial Narrow", sans-serif';
      g.fillText(b, 256, 200); g.fillText(c || '', 256, 236);
      W.boardTex.needsUpdate = true;
    };
    W.updateBoard('0 / 0', 'Session', '');
    // exit signs
    for (const s of [1, -1]) {
      const ec = textCanvas([{ text: 'EXIT', font: '700 90px "Barlow", sans-serif', color: '#7dff9a', y: 0.55 }], 256, 128, { bg: '#0a1a0f' });
      const et = new THREE.CanvasTexture(ec); et.encoding = THREE.sRGBEncoding;
      const e = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), new THREE.MeshBasicMaterial({ map: et }));
      e.position.set(s * (XW - 0.03), 3.4, 8); e.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; scene.add(e);
    }
  }

  return { build, QUALITY, Net, drawCourt };
})();
