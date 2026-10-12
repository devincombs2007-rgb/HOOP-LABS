// HOOP LAB — loads the supplied character GLBs (GLTFLoader), prepares their articulated rigid meshes,
// and drives the named pivots with two-bone IK.
const HoopCharacters = (() => {
  'use strict';
  const PIVOTS = ['AvatarRoot', 'Hips', 'Spine', 'Neck', 'Head', 'L_Shoulder', 'R_Shoulder', 'L_Elbow', 'R_Elbow',
    'L_Wrist', 'R_Wrist', 'L_Hip', 'R_Hip', 'L_Knee', 'R_Knee', 'L_Ankle', 'R_Ankle'];
  const RECOLOR = {
    jersey: ['JerseyTorso'], accent: ['LeftJerseyAccent', 'RightJerseyAccent'],
    shorts: ['Waist', 'L_Shorts', 'R_Shorts'], shoe: ['L_Shoe', 'R_Shoe'], sole: ['L_Sole', 'R_Sole'],
  };
  const srgbToLinear = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  function b64ToBuffer(b64) {
    const bin = atob(b64), n = bin.length, u8 = new Uint8Array(n);
    for (let i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
    return u8.buffer;
  }
  function parseGLB(buffer) {
    return new Promise((resolve, reject) => new THREE.GLTFLoader().parse(buffer, '', resolve, reject));
  }

  // Merge every vertex-colored mesh that hangs directly off one pivot into one mesh (same rigid motion),
  // linearizing the sRGB-authored vertex colors and computing smooth normals the files don't include.
  function mergeUnderPivot(pivot, meshes, material) {
    let vCount = 0, iCount = 0;
    const parts = [];
    for (const m of meshes) {
      const g = m.geometry.clone();
      g.applyMatrix4(m.matrix);
      if (!g.attributes.normal) g.computeVertexNormals();
      const n = g.attributes.position.count;
      const idx = g.index ? g.index.count : n;
      parts.push({ g, name: m.name, v0: vCount, n, i0: iCount, ni: idx });
      vCount += n; iCount += idx;
    }
    const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), col = new Float32Array(vCount * 3);
    const index = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
    const ranges = {};
    for (const p of parts) {
      const P = p.g.attributes.position, N = p.g.attributes.normal, C = p.g.attributes.color;
      for (let i = 0; i < p.n; i++) {
        const o = (p.v0 + i) * 3;
        pos[o] = P.getX(i); pos[o + 1] = P.getY(i); pos[o + 2] = P.getZ(i);
        nor[o] = N.getX(i); nor[o + 1] = N.getY(i); nor[o + 2] = N.getZ(i);
        if (C) { col[o] = srgbToLinear(C.getX(i)); col[o + 1] = srgbToLinear(C.getY(i)); col[o + 2] = srgbToLinear(C.getZ(i)); }
        else { col[o] = col[o + 1] = col[o + 2] = 0.8; }
      }
      if (p.g.index) for (let i = 0; i < p.ni; i++) index[p.i0 + i] = p.g.index.getX(i) + p.v0;
      else for (let i = 0; i < p.ni; i++) index[p.i0 + i] = p.v0 + i;
      ranges[p.name] = [p.v0, p.n];
      p.g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = pivot.name + '_merged';
    mesh.castShadow = true; mesh.receiveShadow = true;
    pivot.add(mesh);
    return { mesh, ranges };
  }

  // jersey lettering drawn into a canvas (transparent background so no flat patch shows on the curved torso)
  function letterTexture(text, w, h, mirror, color = '#ffffff', outline = null) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    if (mirror) { g.translate(w, 0); g.scale(-1, 1); }
    let size = h * 0.86;
    g.font = `800 ${size}px "Big Shoulders Display", "Arial Narrow", Impact, sans-serif`;
    while (g.measureText(text).width > w * 0.92 && size > 8) { size *= 0.92; g.font = `800 ${size}px "Big Shoulders Display", "Arial Narrow", Impact, sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (outline) { g.lineWidth = Math.max(2, size * 0.08); g.strokeStyle = outline; g.strokeText(text, w / 2, h / 2 + size * 0.04); }
    g.fillStyle = color; g.fillText(text, w / 2, h / 2 + size * 0.04);
    const t = new THREE.CanvasTexture(c);
    t.flipY = true; // the pack's exporter stores V bottom-up
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }

  class CharacterModel {
    constructor(def, gltf, bodyMaterial) {
      this.def = def;
      this.root = new THREE.Group();
      this.root.name = 'player_' + def.id;
      this.avatar = gltf.scene;
      this.root.add(this.avatar);
      const nodes = {};
      this.avatar.traverse(o => { if (PIVOTS.includes(o.name) && !nodes[o.name]) nodes[o.name] = o; });
      const missing = PIVOTS.filter(n => !nodes[n]);
      if (missing.length) throw new Error(`${def.file} is missing pivots: ${missing.join(', ')}`);
      this.nodes = nodes;
      // collect meshes
      const byPivot = new Map(), textured = [];
      this.avatar.traverse(o => {
        if (!o.isMesh) return;
        if (o.material && o.material.map) textured.push(o);
        else { if (!byPivot.has(o.parent)) byPivot.set(o.parent, []); byPivot.get(o.parent).push(o); }
      });
      this.ranges = new Map();
      this.merged = [];
      for (const [pivot, meshes] of byPivot) {
        for (const m of meshes) pivot.remove(m);
        const { mesh, ranges } = mergeUnderPivot(pivot, meshes, bodyMaterial);
        this.merged.push(mesh);
        for (const k in ranges) this.ranges.set(k, { mesh, range: ranges[k] });
      }
      // lettering planes: replace the baked textures with canvas lettering
      this.letters = {};
      for (const m of textured) {
        const back = /Back/.test(m.name);
        m.material.dispose && m.material.dispose();
        m.material = new THREE.MeshStandardMaterial({ transparent: true, alphaTest: 0.35, roughness: 0.7, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
        m.renderOrder = 2; m.castShadow = false;
        if (!m.geometry.attributes.normal) m.geometry.computeVertexNormals();
        m.position.z += back ? -0.004 : 0.004; // lift off the torso surface
        this.letters[m.name] = { mesh: m, back };
      }
      this.avatar.updateMatrixWorld(true);
      this.measure();
      this.setLettering(def.plate, def.number, '#ffffff');
      this.root.traverse(o => { if (o.isMesh) { o.castShadow = o.castShadow !== false; o.frustumCulled = false; } });
    }

    measure() {
      const N = this.nodes, V = THREE.Vector3;
      const wp = (n) => n.getWorldPosition(new V());
      const ls = this.avatar.getObjectByName('AvatarRoot').getWorldScale(new V()).x;
      // anatomical right = the side at -X when the model faces +Z (the file's L_/R_ prefixes are mirrored)
      const lx = wp(N.L_Shoulder).x;
      const R = lx < 0 ? 'L_' : 'R_', L = lx < 0 ? 'R_' : 'L_';
      this.sideNames = [R, L];
      const side = (p) => ({ shoulder: N[p + 'Shoulder'], elbow: N[p + 'Elbow'], wrist: N[p + 'Wrist'], hip: N[p + 'Hip'], knee: N[p + 'Knee'], ankle: N[p + 'Ankle'] });
      this.limbs = [side(R), side(L)];
      const s0 = this.limbs[0];
      const dims = {
        scale: ls,
        hipsY: wp(N.Hips).y,
        upper: wp(s0.shoulder).distanceTo(wp(s0.elbow)), fore: wp(s0.elbow).distanceTo(wp(s0.wrist)),
        thigh: wp(s0.hip).distanceTo(wp(s0.knee)), shin: wp(s0.knee).distanceTo(wp(s0.ankle)),
        ankleY: wp(s0.ankle).y, hipHalf: Math.abs(wp(s0.hip).x), shoulderHalf: Math.abs(wp(s0.shoulder).x),
        shoulderY: wp(s0.shoulder).y, headY: wp(N.Head).y,
        // local offsets (unscaled) for forward kinematics in the animator
        spineLocal: N.Spine.position.clone(), neckLocal: N.Neck.position.clone(), headLocal: N.Head.position.clone(),
        shoulderLocal: [s0.shoulder.position.clone(), this.limbs[1].shoulder.position.clone()],
        hipLocal: [s0.hip.position.clone(), this.limbs[1].hip.position.clone()],
      };
      // palm center + hand length from the merged wrist mesh bounds
      const wristMesh = s0.wrist.children.find(c => c.isMesh);
      wristMesh.geometry.computeBoundingBox();
      const hb = wristMesh.geometry.boundingBox;
      dims.palm = Math.abs((hb.min.y + hb.max.y) / 2) * ls * 0.85;
      dims.handLen = Math.abs(hb.min.y) * ls;
      const ankleMesh = s0.ankle.children.find(c => c.isMesh);
      ankleMesh.geometry.computeBoundingBox();
      const ab = ankleMesh.geometry.boundingBox;
      dims.toe = ab.max.z * ls; dims.heel = -ab.min.z * ls; dims.soleDrop = -ab.min.y * ls;
      const box = new THREE.Box3().setFromObject(this.avatar);
      dims.height = box.max.y - box.min.y;
      dims.legLen = dims.thigh + dims.shin;
      dims.armLen = dims.upper + dims.fore;
      this.dims = dims;
      // rest-direction corrections (bone rest vector -> local -Y)
      const down = new V(0, -1, 0);
      this.limbRest = this.limbs.map(l => ({
        arm: new THREE.Quaternion().setFromUnitVectors(l.elbow.position.clone().normalize(), down),
        leg: new THREE.Quaternion().setFromUnitVectors(l.knee.position.clone().normalize(), down),
      }));
      this.rest = {};
      for (const k of PIVOTS) this.rest[k] = { p: N[k].position.clone(), q: N[k].quaternion.clone() };
    }

    setLettering(plate, number, color) {
      const L = this.letters;
      const outline = null;
      if (L.FrontNumber) { L.FrontNumber.mesh.material.map && L.FrontNumber.mesh.material.map.dispose(); L.FrontNumber.mesh.material.map = letterTexture(String(number), 256, 232, false, color, outline); L.FrontNumber.mesh.material.needsUpdate = true; }
      if (L.BackNumber) { L.BackNumber.mesh.material.map && L.BackNumber.mesh.material.map.dispose(); L.BackNumber.mesh.material.map = letterTexture(String(number), 256, 180, true, color, outline); L.BackNumber.mesh.material.needsUpdate = true; }
      if (L.BackName) { L.BackName.mesh.material.map && L.BackName.mesh.material.map.dispose(); L.BackName.mesh.material.map = letterTexture(String(plate).toUpperCase().slice(0, 14), 512, 92, true, color, outline); L.BackName.mesh.material.needsUpdate = true; }
    }

    setColors(colors) {
      for (const key in RECOLOR) {
        if (!colors[key]) continue;
        const c = new THREE.Color(colors[key]); // THREE.Color from hex is sRGB; convert to linear for vertex colors
        const lr = srgbToLinear(c.r), lg = srgbToLinear(c.g), lb = srgbToLinear(c.b);
        for (const part of RECOLOR[key]) {
          const r = this.ranges.get(part); if (!r) continue;
          const col = r.mesh.geometry.attributes.color;
          for (let i = r.range[0]; i < r.range[0] + r.range[1]; i++) col.setXYZ(i, lr, lg, lb);
          col.needsUpdate = true;
        }
      }
    }

    resetPose() {
      for (const k of PIVOTS) { this.nodes[k].position.copy(this.rest[k].p); this.nodes[k].quaternion.copy(this.rest[k].q); }
      this.avatar.updateMatrixWorld(true);
    }

    dispose() {
      this.root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.material.map) o.material.map.dispose(); } });
    }
  }

  // ------------------------------------------------------------------ IK pose application
  const V3 = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
  const T = { a: V3(), mid: V3(), end: V3(), d: V3(), dir: V3(), pp: V3(), d1: V3(), d2: V3(), b: V3(), X: V3(), Y: V3(), Z: V3(),
    m: new THREE.Matrix4(), qp: Q(), qu: Q(), qm: Q(), qt: Q(), e: new THREE.Euler(0, 0, 0, 'YXZ'), w: V3(), tmp: V3() };

  function quatFromBasis(X, Y, Z, out) { T.m.makeBasis(X, Y, Z); return out.setFromRotationMatrix(T.m); }
  function setWorldQuat(node, qWorld) {
    node.parent.getWorldQuaternion(T.qp);
    node.quaternion.copy(T.qp.invert().multiply(qWorld));
    node.updateMatrixWorld(true);
  }

  // two-bone IK: returns the middle joint in T.mid and the (reach-clamped) end point in T.end
  function solveTwoBone(a, target, l1, l2, pole) {
    T.d.subVectors(target, a);
    let D = T.d.length();
    const maxD = (l1 + l2) * 0.9995, minD = Math.abs(l1 - l2) + 0.02;
    if (D < 1e-6) { T.d.set(0, -1, 0); D = 1e-6; }
    T.dir.copy(T.d).divideScalar(D);
    D = Math.min(maxD, Math.max(minD, D));
    T.end.copy(a).addScaledVector(T.dir, D);
    const x = (l1 * l1 - l2 * l2 + D * D) / (2 * D);
    const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    T.pp.copy(pole).addScaledVector(T.dir, -pole.dot(T.dir));
    if (T.pp.lengthSq() < 1e-8) { T.pp.set(T.dir.y, -T.dir.x, 0); if (T.pp.lengthSq() < 1e-8) T.pp.set(0, T.dir.z, -T.dir.y); }
    T.pp.normalize();
    T.mid.copy(a).addScaledVector(T.dir, x).addScaledVector(T.pp, h);
  }

  function applyLimb(model, upper, midNode, restCorr, isLeg, a, mid, end) {
    T.d1.subVectors(mid, a).normalize();
    T.d2.subVectors(end, mid).normalize();
    T.b.copy(T.d2).addScaledVector(T.d1, -T.d2.dot(T.d1));
    if (T.b.lengthSq() < 1e-8) T.b.copy(T.pp).negate(); // straight limb: bend away from the pole
    T.b.normalize();
    T.Y.copy(T.d1).negate();
    T.Z.copy(T.b); if (isLeg) T.Z.negate();
    T.X.crossVectors(T.Y, T.Z).normalize();
    T.Z.crossVectors(T.X, T.Y).normalize();
    quatFromBasis(T.X, T.Y, T.Z, T.qu).multiply(restCorr);
    setWorldQuat(upper, T.qu);
    T.Y.copy(T.d2).negate();
    T.Z.crossVectors(T.X, T.Y).normalize();
    quatFromBasis(T.X, T.Y, T.Z, T.qm);
    setWorldQuat(midNode, T.qm);
  }

  function orientEnd(node, fwdAxisY, normalZ) { // fwdAxisY: direction the node's -Y should point; normalZ: where +Z should face
    T.Y.copy(fwdAxisY).negate().normalize();
    T.Z.copy(normalZ).addScaledVector(T.Y, -normalZ.dot(T.Y));
    if (T.Z.lengthSq() < 1e-8) T.Z.set(0, 0, 1);
    T.Z.normalize();
    T.X.crossVectors(T.Y, T.Z).normalize();
    quatFromBasis(T.X, T.Y, T.Z, T.qt);
    setWorldQuat(node, T.qt);
  }
  function orientFoot(node, fwd, up) {
    T.Y.copy(up).normalize();
    T.Z.copy(fwd).addScaledVector(T.Y, -fwd.dot(T.Y)).normalize();
    T.X.crossVectors(T.Y, T.Z).normalize();
    quatFromBasis(T.X, T.Y, T.Z, T.qt);
    setWorldQuat(node, T.qt);
  }

  // pose: { rootX, rootZ, rootYaw, pelvis:Vector3, pelvisQ:Quaternion, chestQ:Quaternion, headYaw, headPitch,
  //         hands:[{wrist:Vector3, pole:Vector3, fingers:Vector3, palm:Vector3}x2], feet:[{ankle, pole, fwd, up}x2] }
  function applyPose(model, pose) {
    const N = model.nodes, d = model.dims;
    model.root.position.set(pose.rootX, 0, pose.rootZ);
    model.root.rotation.set(0, 0, 0);
    model.root.updateMatrixWorld(true);
    // pelvis
    N.Hips.position.copy(pose.pelvis);
    N.AvatarRoot.worldToLocal(N.Hips.position);
    setWorldQuat(N.Hips, pose.pelvisQ);
    // chest
    setWorldQuat(N.Spine, pose.chestQ);
    // neck + head (split the look between both pivots)
    T.e.set(pose.headPitch, pose.headYaw, 0, 'YXZ');
    T.qt.setFromEuler(T.e);
    T.qm.copy(pose.chestQ).slerp(T.qt, 0.45);
    setWorldQuat(N.Neck, T.qm);
    setWorldQuat(N.Head, T.qt);
    // arms
    for (let s = 0; s < 2; s++) {
      const limb = model.limbs[s], h = pose.hands[s];
      limb.shoulder.getWorldPosition(T.a);
      solveTwoBone(T.a, h.wrist, d.upper, d.fore, h.pole);
      T.w.copy(T.mid); T.tmp.copy(T.end);
      applyLimb(model, limb.shoulder, limb.elbow, model.limbRest[s].arm, false, T.a, T.w, T.tmp);
      orientEnd(limb.wrist, h.fingers, h.palm);
    }
    // legs
    for (let s = 0; s < 2; s++) {
      const limb = model.limbs[s], f = pose.feet[s];
      limb.hip.getWorldPosition(T.a);
      solveTwoBone(T.a, f.ankle, d.thigh, d.shin, f.pole);
      T.w.copy(T.mid); T.tmp.copy(T.end);
      applyLimb(model, limb.hip, limb.knee, model.limbRest[s].leg, true, T.a, T.w, T.tmp);
      orientFoot(limb.ankle, f.fwd, f.up);
    }
  }

  // ------------------------------------------------------------------ loading
  async function loadAll(defs, assets, onProgress) {
    const bodyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.0 });
    const out = {};
    let i = 0;
    for (const def of defs) {
      const b64 = assets[def.file];
      if (!b64) throw new Error(`Character file ${def.file} is not bundled`);
      const gltf = await parseGLB(b64ToBuffer(b64));
      out[def.id] = new CharacterModel(def, gltf, bodyMaterial);
      if (onProgress) onProgress(++i / defs.length, def);
    }
    return { models: out, bodyMaterial };
  }

  return { loadAll, applyPose, solveTwoBone, CharacterModel, PIVOTS, b64ToBuffer, parseGLB };
})();
