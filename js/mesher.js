// Rendering: flat ground, road and river strips, mesh buildings and trees, block-built interiors,
// chunk streaming and the distant view. Everything is merged by chunk to stay light on phones.
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  const { B, OPAQUE, CROSS, CUT, NOFACE, T_TOP, T_SIDE, T_BOT, PLANT_H, tileIndex: TI } = G.blocks;
  const W = G.world;
  const { CS, VS, TOP } = W;
  const STR = VS * VS;
  const AO = [0.5, 0.68, 0.85, 1];
  const FACE = [[0.86, 0.7], [1, 0.6], [0.78, 0.78]]; // [+side, -side] brightness for x, y, z

  // Shared uniforms: updated once per frame by the day/night cycle.
  const U = {
    uTime: { value: 0 },
    uSun: { value: new THREE.Color(1, 1, 1) },
    uFogColor: { value: new THREE.Color(0.7, 0.8, 0.9) },
    uFogNear: { value: 60 },
    uFogFar: { value: 14000 },
  };
  const FOG_GLSL = `
    uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
    vec3 applyFog(vec3 c, float dist) { return mix(c, uFogColor, 1.0 - exp(-max(dist - uFogNear, 0.0) / uFogFar)); }
  `;

  let voxelMat, waterMat, entityMat, glassMat, farMat, groundMat, tilesTex;
  function initMaterials(anisotropy) {
    tilesTex = G.blocks.makeTextureArray(anisotropy);
    voxelMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      side: THREE.DoubleSide,
      uniforms: Object.assign({ uTiles: { value: tilesTex } }, U),
      vertexShader: `
        in vec2 aUv; in vec2 aData;
        out vec2 vUv; flat out float vLayer; out float vLight; out vec3 vView;
        void main() {
          vUv = aUv; vLayer = aData.x; vLight = aData.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        precision highp sampler2DArray;
        uniform sampler2DArray uTiles; uniform vec3 uSun;
        ${FOG_GLSL}
        in vec2 vUv; flat in float vLayer; in float vLight; in vec3 vView;
        out vec4 fragColor;
        void main() {
          vec4 t = texture(uTiles, vec3(vUv, vLayer));
          if (t.a < 0.5) discard;
          fragColor = vec4(applyFog(t.rgb * vLight * uSun, length(vView)), 1.0);
        }`,
    });
    waterMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      uniforms: Object.assign({}, U),
      vertexShader: `
        out vec3 vW; out float vDist;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          vec4 mv = viewMatrix * w;
          vDist = length(mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uSun; uniform float uTime;
        ${FOG_GLSL}
        in vec3 vW; in float vDist;
        out vec4 fragColor;
        void main() {
          vec2 p = vW.xz;
          float n = sin(p.x * 0.9 + uTime * 0.9) + sin(p.y * 0.7 - uTime * 0.7) + sin((p.x + p.y) * 0.4 + uTime * 0.5);
          vec3 c = mix(vec3(0.20, 0.36, 0.44), vec3(0.36, 0.54, 0.62), n * 0.14 + 0.5);
          fragColor = vec4(applyFog(c * uSun, vDist), 0.92);
        }`,
    });
    entityMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      side: THREE.DoubleSide,
      uniforms: Object.assign({}, U),
      vertexShader: `
        in vec3 aColor; out vec3 vC; out float vDist;
        void main() { vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = length(mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        uniform vec3 uSun;
        ${FOG_GLSL}
        in vec3 vC; in float vDist; out vec4 fragColor;
        void main() { fragColor = vec4(applyFog(vC * uSun, vDist), 1.0); }`,
    });
    glassMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: Object.assign({ uAlpha: { value: 0.28 } }, U),
      vertexShader: `in vec3 aColor; out vec3 vC; void main() { vC = aColor; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uSun; uniform float uAlpha; in vec3 vC; out vec4 fragColor; void main() { fragColor = vec4(vC * uSun, uAlpha); }`,
    });
    G.mats = { voxelMat, waterMat, entityMat, glassMat, U, tilesTex };
  }

  // ---------- geometry buffer ----------
  let buf = new Float32Array(1 << 20), nf = 0;
  const FLOATS = 7;
  function pushVert(x, y, z, u, v, layer, light) {
    if (nf + FLOATS > buf.length) { const b = new Float32Array(buf.length * 2); b.set(buf); buf = b; }
    buf[nf++] = x; buf[nf++] = y; buf[nf++] = z; buf[nf++] = u; buf[nf++] = v; buf[nf++] = layer; buf[nf++] = light;
  }
  function takeGeometry() {
    const ib = new THREE.InterleavedBuffer(buf.slice(0, nf), FLOATS);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0));
    geo.setAttribute('aUv', new THREE.InterleavedBufferAttribute(ib, 2, 3));
    geo.setAttribute('aData', new THREE.InterleavedBufferAttribute(ib, 2, 5));
    geo.computeBoundingSphere();
    return geo;
  }
  // a, b, c, d are [x, y, z, u, v, light], counter-clockwise.
  function quad(a, b, c, d, layer) {
    for (const v of [a, b, c, a, c, d]) pushVert(v[0], v[1], v[2], v[3], v[4], layer, v[5]);
  }
  function tri(a, b, c, layer) {
    for (const v of [a, b, c]) pushVert(v[0], v[1], v[2], v[3], v[4], layer, v[5]);
  }
  const wallLight = (nx, nz) => 0.74 + 0.2 * (nx * 0.6 + nz * 0.8);

  // A vertical rectangle from (x0,z0) to (x1,z1), textured in metres, darker at its foot.
  function wallQuad(x0, z0, x1, z1, y0, y1, layer, l, foot, uStart) {
    const len = Math.hypot(x1 - x0, z1 - z0), u0 = uStart || 0;
    quad([x0, y0, z0, u0, y0, l * foot], [x1, y0, z1, u0 + len, y0, l * foot], [x1, y1, z1, u0 + len, y1, l], [x0, y1, z0, u0, y1, l], layer);
  }
  function decal(x0, z0, x1, z1, y0, y1, layer, l) {
    quad([x0, y0, z0, 0, 0, l], [x1, y0, z1, 1, 0, l], [x1, y1, z1, 1, 1, l], [x0, y1, z0, 0, 1, l], layer);
  }
  function emitBox(x, y0, z, w, h, d, layer, ox, oy, oz) {
    const X0 = x - w / 2 - ox, X1 = x + w / 2 - ox, Z0 = z - d / 2 - oz, Z1 = z + d / 2 - oz, Y0 = y0 - oy, Y1 = y0 + h - oy;
    wallQuad(X0, Z0, X1, Z0, Y0, Y1, layer, wallLight(0, -1), 1);
    wallQuad(X1, Z1, X0, Z1, Y0, Y1, layer, wallLight(0, 1), 1);
    wallQuad(X1, Z0, X1, Z1, Y0, Y1, layer, wallLight(1, 0), 1);
    wallQuad(X0, Z1, X0, Z0, Y0, Y1, layer, wallLight(-1, 0), 1);
    quad([X0, Y1, Z0, 0, 0, 1], [X1, Y1, Z0, 1, 0, 1], [X1, Y1, Z1, 1, 1, 1], [X0, Y1, Z1, 0, 1, 1], layer);
  }
  function emitPrism(x, z, r0, r1, y0, y1, segs, layer, ox, oy, oz) {
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * 6.2832, b = ((i + 1) / segs) * 6.2832;
      const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      const la = 0.72 + 0.22 * (ca * 0.6 + sa * 0.8), lb = 0.72 + 0.22 * (cb * 0.6 + sb * 0.8);
      const ua = (i / segs) * 2, ub = ((i + 1) / segs) * 2;
      quad([x + ca * r0 - ox, y0 - oy, z + sa * r0 - oz, ua, 0, la * 0.85], [x + cb * r0 - ox, y0 - oy, z + sb * r0 - oz, ub, 0, lb * 0.85],
        [x + cb * r1 - ox, y1 - oy, z + sb * r1 - oz, ub, (y1 - y0) * 0.5, lb], [x + ca * r1 - ox, y1 - oy, z + sa * r1 - oz, ua, (y1 - y0) * 0.5, la], layer);
    }
  }

  // ---------- generic buildings: real footprints, flat walls, sloped roofs, separate windows ----------
  function doorEdge(b) {
    if (b.doorEdge !== undefined) return b.doorEdge;
    let best = 1e12, edge = 0;
    for (let k = 0; k < b.p.length; k += 2) {
      const n = (k + 2) % b.p.length;
      const mx = (b.p[k] + b.p[n]) / 2, mz = (b.p[k + 1] + b.p[n + 1]) / 2;
      if (Math.hypot(b.p[n] - b.p[k], b.p[n + 1] - b.p[k + 1]) < 2.2) continue;
      let d = 900;
      for (const s of W.lookup(mx, mz).roads) d = Math.min(d, W.segDist(mx, mz, s).d);
      if (d < best) { best = d; edge = k; }
    }
    b.doorEdge = edge;
    return edge;
  }
  function emitBuilding(b, ox, oy, oz) {
    const base = b.base - oy, wallT = T_SIDE[B[b.wall]], winT = T_SIDE[B[b.win]], roofT = T_TOP[B[b.roof]];
    const gable = b.pitch > 0 && b.rectish;
    const top = base + b.h, wallTop = gable ? top : top + 0.4; // flat roofs get a small parapet
    const n = b.p.length;
    const floorH = b.k === 'civic' ? 3.5 : 3;
    const floors = Math.max(1, Math.round(b.h / floorH));
    const dEdge = doorEdge(b);
    for (let k = 0; k < n; k += 2) {
      const m = (k + 2) % n;
      const x0 = b.p[k] - ox, z0 = b.p[k + 1] - oz, x1 = b.p[m] - ox, z1 = b.p[m + 1] - oz;
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.05) continue;
      const dx = (x1 - x0) / len, dz = (z1 - z0) / len;
      const nx = b.ccw ? dz : -dz, nz = b.ccw ? -dx : dx;
      const l = wallLight(nx, nz);
      wallQuad(x0, z0, x1, z1, base, wallTop, wallT, l, 0.78);
      if (b.k === 'house') wallQuad(x0 + nx * 0.03, z0 + nz * 0.03, x1 + nx * 0.03, z1 + nz * 0.03, base, base + 0.4, TI.concrete, l, 0.8);
      const off = 0.05, px = nx * off, pz = nz * off;
      const isDoorEdge = k === dEdge;
      const midT = len / 2;
      if (isDoorEdge && b.k !== 'shed') {
        decal(x0 + dx * (midT - 0.5) + px, z0 + dz * (midT - 0.5) + pz, x0 + dx * (midT + 0.5) + px, z0 + dz * (midT + 0.5) + pz, base, base + 2.1, TI.door, l);
      }
      if (winT !== wallT && len >= 2.4) {
        const count = Math.max(1, Math.floor(len / (b.k === 'house' ? 3.4 : 3)));
        const hw = 0.62;
        for (let f = 0; f < floors; f++) {
          const wy = base + f * floorH + 1.05;
          for (let w = 0; w < count; w++) {
            const t = ((w + 0.5) / count) * len;
            if (isDoorEdge && f === 0 && Math.abs(t - midT) < 1.2) continue;
            decal(x0 + dx * (t - hw) + px, z0 + dz * (t - hw) + pz, x0 + dx * (t + hw) + px, z0 + dz * (t + hw) + pz, wy, wy + 1.35, winT, l);
          }
        }
      }
    }
    if (gable) {
      const P = (u, v, y, tu, tv, li) => [b.cx + u * b.ax - v * b.az - ox, y, b.cz + u * b.az + v * b.ax - oz, tu, tv, li];
      const o = 0.4, rise = b.roofRise, vm = (b.v0 + b.v1) / 2, half = (b.v1 - b.v0) / 2;
      const drop = (o * rise) / half;
      const U0 = b.u0 - o, U1 = b.u1 + o, V0 = b.v0 - o, V1 = b.v1 + o, slope = Math.hypot(half + o, rise + drop);
      const lA = 0.86, lB = 0.98;
      quad(P(U0, V0, top - drop, 0, 0, lA), P(U1, V0, top - drop, U1 - U0, 0, lA), P(U1, vm, top + rise, U1 - U0, slope, lA), P(U0, vm, top + rise, 0, slope, lA), roofT);
      quad(P(U0, V1, top - drop, 0, 0, lB), P(U1, V1, top - drop, U1 - U0, 0, lB), P(U1, vm, top + rise, U1 - U0, slope, lB), P(U0, vm, top + rise, 0, slope, lB), roofT);
      for (const u of [b.u0, b.u1]) {
        const li = wallLight(b.ax * (u === b.u0 ? -1 : 1), b.az * (u === b.u0 ? -1 : 1));
        tri(P(u, b.v0, top, b.v0, 0, li), P(u, b.v1, top, b.v1, 0, li), P(u, vm, top + rise, vm, rise, li), wallT);
      }
      // Under the overhang
      quad(P(U0, V0, top - drop, 0, 0, 0.5), P(U1, V0, top - drop, 1, 0, 0.5), P(U1, V1, top - drop, 1, 1, 0.5), P(U0, V1, top - drop, 0, 1, 0.5), TI.planks);
      if (b.k === 'house' && (b.i & 1)) {
        const c = P((b.u0 + b.u1) * 0.3, vm + half * 0.3, 0, 0, 0, 1);
        emitBox(c[0] + ox, top + rise * 0.5 + oy, c[2] + oz, 0.6, rise * 0.5 + 0.8, 0.6, TI.brick_red, ox, oy, oz);
      }
    } else {
      if (!b.tris) {
        const contour = [];
        for (let k = 0; k < n; k += 2) contour.push(new THREE.Vector2(b.p[k], b.p[k + 1]));
        b.tris = THREE.ShapeUtils.triangulateShape(contour, []);
      }
      for (const t of b.tris) {
        const v = (i) => [b.p[i * 2] - ox, top, b.p[i * 2 + 1] - oz, b.p[i * 2], b.p[i * 2 + 1], 0.92];
        tri(v(t[0]), v(t[1]), v(t[2]), T_TOP[B.FLAT_ROOF]);
      }
    }
    if (b.tower) {
      emitPrism(b.tx, b.tz, 1.5, 1.2, b.base, b.base + b.h + 11, 8, TI.plaster, ox, oy, oz);
      emitPrism(b.tx, b.tz, 1.4, 0.05, b.base + b.h + 11, b.base + b.h + 14, 8, TI[b.tower], ox, oy, oz);
    }
  }

  // Pitched roof over a hand-built block structure.
  function emitRoof(o, ox, oy, oz) {
    const y = o.y - oy, rise = o.rise;
    const X0 = o.x0 - ox, X1 = o.x1 - ox, Z0 = o.z0 - oz, Z1 = o.z1 - oz;
    const lA = 0.86, lB = 0.98;
    if (o.ridge === 'x') {
      const zm = (Z0 + Z1) / 2, s = Math.hypot(zm - Z0, rise), w = X1 - X0;
      quad([X0, y, Z0, 0, 0, lA], [X1, y, Z0, w, 0, lA], [X1, y + rise, zm, w, s, lA], [X0, y + rise, zm, 0, s, lA], o.roofT);
      quad([X0, y, Z1, 0, 0, lB], [X1, y, Z1, w, 0, lB], [X1, y + rise, zm, w, s, lB], [X0, y + rise, zm, 0, s, lB], o.roofT);
      for (const x of [X0 + 0.3, X1 - 0.3]) tri([x, y, Z0, Z0, 0, 0.8], [x, y, Z1, Z1, 0, 0.8], [x, y + rise, zm, zm, rise, 0.8], o.wallT);
    } else {
      const xm = (X0 + X1) / 2, s = Math.hypot(xm - X0, rise), w = Z1 - Z0;
      quad([X0, y, Z0, 0, 0, lA], [X0, y, Z1, w, 0, lA], [xm, y + rise, Z1, w, s, lA], [xm, y + rise, Z0, 0, s, lA], o.roofT);
      quad([X1, y, Z0, 0, 0, lB], [X1, y, Z1, w, 0, lB], [xm, y + rise, Z1, w, s, lB], [xm, y + rise, Z0, 0, s, lB], o.roofT);
      for (const z of [Z0 + 0.3, Z1 - 0.3]) tri([X0, y, z, X0, 0, 0.8], [X1, y, z, X1, 0, 0.8], [xm, y + rise, z, xm, rise, 0.8], o.wallT);
    }
    quad([X0, y - 0.01, Z0, 0, 0, 0.5], [X1, y - 0.01, Z0, X1 - X0, 0, 0.5], [X1, y - 0.01, Z1, X1 - X0, Z1 - Z0, 0.5], [X0, y - 0.01, Z1, 0, Z1 - Z0, 0.5], TI.planks);
  }

  // ---------- trees: tapered trunks, a few branches, and crowns of crossed leaf cards ----------
  const ICO = (() => {
    const t = (1 + Math.sqrt(5)) / 2;
    const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((p) => { const l = Math.hypot(...p); return p.map((c) => c / l); });
    const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    return { v, f };
  })();
  function emitBlob(cx, cy, cz, rx, ry, rz, layer, seed, dim) {
    const pts = ICO.v.map((p, i) => {
      const j = 0.82 + W.hash(seed + i, seed * 3) * 0.36;
      return [cx + p[0] * rx * j, cy + p[1] * ry * j, cz + p[2] * rz * j, (cx + p[0] * rx) * 0.45 + p[2] * rz * 0.45, (cy + p[1] * ry) * 0.45, (0.5 + 0.3 * (p[1] * 0.5 + 0.5)) * (dim || 1)];
    });
    for (const f of ICO.f) tri(pts[f[0]], pts[f[1]], pts[f[2]], layer);
  }
  // Two crossed quads (an X), w wide and h tall, turned by ang, leaning by tilt.
  function emitCard(cx, cy, cz, w, h, ang, tilt, layer, l0, l1) {
    for (const a of [ang, ang + Math.PI / 2]) {
      const ux = (Math.cos(a) * w) / 2, uz = (Math.sin(a) * w) / 2, hy = h / 2;
      const px = -Math.sin(a) * tilt * hy, pz = Math.cos(a) * tilt * hy;
      quad([cx - ux - px, cy - hy, cz - uz - pz, 0, 0, l0], [cx + ux - px, cy - hy, cz + uz - pz, 1, 0, l0], [cx + ux + px, cy + hy, cz + uz + pz, 1, 1, l1], [cx - ux + px, cy + hy, cz - uz + pz, 0, 1, l1], layer);
    }
  }
  function emitBranch(x, y, z, len, ang, up, r, layer) {
    const ex = x + Math.cos(ang) * len * (1 - up), ez = z + Math.sin(ang) * len * (1 - up), ey = y + len * up;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * 6.2832, b = ((i + 1) / 4) * 6.2832;
      quad([x + Math.cos(a) * r, y + Math.sin(a) * r, z, 0, 0, 0.6], [x + Math.cos(b) * r, y + Math.sin(b) * r, z, 0.5, 0, 0.6], [ex + Math.cos(b) * r * 0.4, ey + Math.sin(b) * r * 0.4, ez, 0.5, 1, 0.7], [ex + Math.cos(a) * r * 0.4, ey + Math.sin(a) * r * 0.4, ez, 0, 1, 0.7], layer);
    }
  }
  function emitTree(t, ox, oy, oz) {
    const x = t.x - ox, z = t.z - oz, y = t.y - oy, h = t.h, seed = Math.floor(t.x * 7 + t.z * 13);
    const R = (i) => W.hash(seed + i * 31, seed * 7 - i);
    const type = t.type || (t.birch ? 'birch' : 'broad');
    if (type === 'pine') {
      emitPrism(x, z, 0.24, 0.07, y, y + h * 0.97, 6, TI.bark, 0, 0, 0);
      emitPrism(x, z, 1.35, 0.05, y + h * 0.28, y + h, 6, TI.foliage, 0, 0, 0);
      const ch = h * 0.78, cy = y + h * 0.24 + ch / 2;
      emitCard(x, cy, z, 3.9, ch, R(1) * 3.14, 0, TI.leaf_pine, 0.7, 1);
      emitCard(x, cy, z, 3.9, ch, R(1) * 3.14 + 0.785, 0, TI.leaf_pine, 0.65, 0.95);
      return;
    }
    const spec = {
      birch: { trunk: 0.72, r0: 0.17, bark: TI.birch_bark, leaf: TI.leaf_birch, rx: 1.7, ry: h * 0.3, cy: 0.7, n: 9, card: 2.0, blob: TI.birch_foliage },
      poplar: { trunk: 0.45, r0: 0.3, bark: TI.bark, leaf: TI.leaf_broad, rx: 1.15, ry: h * 0.42, cy: 0.6, n: 10, card: 1.9, blob: TI.foliage },
      broad: { trunk: 0.42, r0: 0.28, bark: TI.bark, leaf: TI.leaf_broad, rx: 2.5, ry: h * 0.3, cy: 0.66, n: 10, card: 2.4, blob: TI.foliage },
      willow: { trunk: 0.48, r0: 0.34, bark: TI.bark, leaf: TI.leaf_willow, rx: 3.0, ry: h * 0.28, cy: 0.62, n: 11, card: 2.8, blob: TI.foliage },
    }[type] || { trunk: 0.45, r0: 0.28, bark: TI.bark, leaf: TI.leaf_broad, rx: 2.4, ry: h * 0.3, cy: 0.66, n: 10, card: 2.4, blob: TI.foliage };
    const lean = (R(2) - 0.5) * 0.4, lx = Math.cos(R(3) * 6.28) * lean, lz = Math.sin(R(3) * 6.28) * lean;
    const ty = y + h * spec.trunk;
    emitPrism(x, z, spec.r0, spec.r0 * 0.45, y, ty, 6, spec.bark, 0, 0, 0);
    const cx = x + lx, cz = z + lz, cy = y + h * spec.cy;
    for (let i = 0; i < 3; i++) emitBranch(x, y + h * (0.35 + i * 0.1), z, spec.rx * 0.7, R(10 + i) * 6.28, 0.55, spec.r0 * 0.35, spec.bark);
    emitBlob(cx, cy, cz, spec.rx * 0.62, spec.ry * 0.7, spec.rx * 0.62, spec.blob, seed, 0.85);
    for (let i = 0; i < spec.n; i++) {
      const a = R(20 + i) * 6.2832, rr = Math.sqrt(R(40 + i)), up = R(60 + i) * 2 - 1;
      const px = cx + Math.cos(a) * spec.rx * rr * 0.8, pz = cz + Math.sin(a) * spec.rx * rr * 0.8;
      const py = cy + up * spec.ry * 0.75 - (type === 'willow' ? spec.card * 0.25 : 0);
      const light = 0.62 + 0.3 * (up * 0.5 + 0.5) + 0.08 * rr;
      emitCard(px, py, pz, spec.card, spec.card * (type === 'willow' ? 1.35 : 1), R(80 + i) * 3.14, (R(90 + i) - 0.5) * 0.5, spec.leaf, light * 0.85, light);
    }
  }

  // ---------- metal fences: one textured strip per run, posts and rails are in the texture ----------
  function emitFences(c, ox, oy, oz) {
    const x0 = c.cx * CS, z0 = c.cz * CS, y0 = TOP - oy, HGT = 2.0;
    for (const f of c.fences) {
      const l = wallLight(f.dz, -f.dx);
      const flush = (t0, t1) => {
        const e = Math.min(f.len, t1);
        const ax = f.ax + f.dx * t0 - ox, az = f.az + f.dz * t0 - oz, bx = f.ax + f.dx * e - ox, bz = f.az + f.dz * e - oz;
        quad([ax, y0, az, t0 / 3, 0, l * 0.82], [bx, y0, bz, e / 3, 0, l * 0.82], [bx, y0 + HGT, bz, e / 3, 1, l], [ax, y0 + HGT, az, t0 / 3, 1, l], TI.fence_metal);
      };
      let start = -1, last = -1;
      for (let t = 0; t <= f.len + 1e-6; t += 0.5) {
        const px = f.ax + f.dx * t, pz = f.az + f.dz * t;
        const ok = px >= x0 && px < x0 + CS && pz >= z0 && pz < z0 + CS && W.fenceAllowedAt(f, t);
        if (ok) { if (start < 0) start = t; last = t; }
        else if (start >= 0) { flush(start, last + 0.5); start = -1; }
      }
      if (start >= 0) flush(start, last + 0.5);
    }
  }

  // ---------- greedy meshing of block-built structures ----------
  const mask = new Int32Array(VS * 256);
  function meshVolume(c) {
    const { vol, H } = c;
    nf = 0;
    const strides = [1, STR, VS];
    const lo = [1, 0, 1], hi = [VS - 1, H, VS - 1];
    const x = [0, 0, 0];
    const getOcc = (px, py, pz) => (py < 0 ? 1 : py >= H ? 0 : OPAQUE[vol[px + pz * VS + py * STR]]);

    for (let d = 0; d < 3; d++) {
      const u = (d + 1) % 3, v = (d + 2) % 3;
      const nu = hi[u] - lo[u], nv = hi[v] - lo[v];
      for (let side = 1; side >= -1; side -= 2) {
        const faceLight = FACE[d][side > 0 ? 0 : 1];
        for (x[d] = lo[d]; x[d] < hi[d]; x[d]++) {
          let any = false, n = 0;
          for (x[v] = lo[v]; x[v] < hi[v]; x[v]++) for (x[u] = lo[u]; x[u] < hi[u]; x[u]++, n++) {
            mask[n] = 0;
            const idx = x[0] + x[2] * VS + x[1] * STR;
            const a = vol[idx];
            if (!a || CROSS[a] || NOFACE[a]) continue;
            const ny = x[d] + side;
            let nb;
            if (d === 1 && ny < 0) continue;
            if (d === 1 && ny >= H) nb = 0;
            else nb = vol[idx + side * strides[d]];
            if (OPAQUE[nb] || (CUT[a] && nb === a)) continue;
            const t = d === 1 ? (side > 0 ? T_TOP[a] : T_BOT[a]) : T_SIDE[a];
            let k0 = 3, k1 = 3, k2 = 3, k3 = 3;
            if (!CUT[a]) {
              const px = x[0] + (d === 0 ? side : 0), py = x[1] + (d === 1 ? side : 0), pz = x[2] + (d === 2 ? side : 0);
              const o = (du, dv) => { const q = [px, py, pz]; q[u] += du; q[v] += dv; return getOcc(q[0], q[1], q[2]); };
              const s0 = o(-1, 0), s1 = o(1, 0), s2 = o(0, -1), s3 = o(0, 1);
              const c00 = o(-1, -1), c10 = o(1, -1), c11 = o(1, 1), c01 = o(-1, 1);
              const ao = (a1, a2, cc) => (a1 && a2 ? 0 : 3 - (a1 + a2 + cc));
              k0 = ao(s0, s2, c00); k1 = ao(s1, s2, c10); k2 = ao(s1, s3, c11); k3 = ao(s0, s3, c01);
            }
            mask[n] = 1 + t + (k0 << 12) + (k1 << 14) + (k2 << 16) + (k3 << 18);
            any = true;
          }
          if (!any) continue;
          n = 0;
          for (let j = 0; j < nv; j++) for (let i = 0; i < nu;) {
            const m = mask[n];
            if (!m) { i++; n++; continue; }
            let w = 1;
            while (i + w < nu && mask[n + w] === m) w++;
            let h = 1;
            outer: for (; j + h < nv; h++) {
              for (let q = 0; q < w; q++) if (mask[n + q + h * nu] !== m) break outer;
            }
            for (let l = 0; l < h; l++) for (let q = 0; q < w; q++) mask[n + q + l * nu] = 0;
            const layer = (m - 1) & 0xfff;
            const a0 = AO[(m >> 12) & 3], a1 = AO[(m >> 14) & 3], a2 = AO[(m >> 16) & 3], a3 = AO[(m >> 18) & 3];
            const p = [0, 0, 0];
            p[d] = x[d] + (side > 0 ? 1 : 0);
            const ui = lo[u] + i, vi = lo[v] + j;
            const put = (du, dv, ao) => {
              p[u] = ui + du; p[v] = vi + dv;
              let tu, tv;
              if (d === 0) { tu = p[2]; tv = p[1]; } else if (d === 2) { tu = p[0]; tv = p[1]; } else { tu = p[0]; tv = p[2]; }
              pushVert(p[0], p[1], p[2], tu, tv, layer, ao * faceLight);
            };
            if (a0 + a2 >= a1 + a3) { put(0, 0, a0); put(w, 0, a1); put(w, h, a2); put(0, 0, a0); put(w, h, a2); put(0, h, a3); }
            else { put(0, 0, a0); put(w, 0, a1); put(0, h, a3); put(w, 0, a1); put(w, h, a2); put(0, h, a3); }
            i += w; n += w;
          }
        }
      }
    }
    // Small plants: two crossed quads, offset so they do not line up on a grid.
    for (let y = 0; y < H; y++) for (let k = 1; k < VS - 1; k++) for (let i = 1; i < VS - 1; i++) {
      const id = vol[i + k * VS + y * STR];
      if (!id || !CROSS[id]) continue;
      const t = T_SIDE[id], ph = PLANT_H[id], jx = W.hash(i + c.wx0, k) * 0.5 - 0.25, jz = W.hash(k + c.wz0, i) * 0.5 - 0.25;
      const r = Math.max(0.3, ph * 0.6), cx = i + 0.5 + jx, cz = k + 0.5 + jz;
      const q = (x0, z0, x1, z1) => {
        pushVert(x0, y, z0, 0, 0, t, 0.74); pushVert(x1, y, z1, 1, 0, t, 0.74); pushVert(x1, y + ph, z1, 1, 1, t, 0.95);
        pushVert(x0, y, z0, 0, 0, t, 0.74); pushVert(x1, y + ph, z1, 1, 1, t, 0.95); pushVert(x0, y + ph, z0, 0, 1, t, 0.95);
      };
      q(cx - r * 0.7, cz - r * 0.7, cx + r * 0.7, cz + r * 0.7);
      q(cx - r * 0.7, cz + r * 0.7, cx + r * 0.7, cz - r * 0.7);
    }
    // Meshes that belong to this chunk.
    const ox = c.wx0, oy = c.minY, oz = c.wz0;
    for (const b of c.blds) {
      if (!b.interior) emitBuilding(b, ox, oy, oz);
      else if (b.k === 'mosque') {
        // Dome over the prayer hall, and a slim minaret with a pointed cap.
        const top = b.base + b.h, R = Math.min(b.x1 - b.x0, b.z1 - b.z0) * 0.32, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
        emitPrism(cx, cz, R * 0.9, R * 0.9, top, top + 1.2, 12, TI.plaster, ox, oy, oz);
        let prev = R;
        for (let k = 1; k <= 6; k++) {
          const a = (k / 6) * Math.PI / 2, r = Math.cos(a) * R;
          emitPrism(cx, cz, prev, Math.max(0.05, r), top + 1.2 + Math.sin(((k - 1) / 6) * Math.PI / 2) * R, top + 1.2 + Math.sin(a) * R, 12, TI.dome_green, ox, oy, oz);
          prev = r;
        }
        emitPrism(cx, cz, 0.08, 0.02, top + 1.2 + R, top + 2.8 + R, 6, TI.dome_gold, ox, oy, oz);
        emitPrism(b.tx, b.tz, 0.95, 0.8, top, top + 14, 8, TI.plaster, ox, oy, oz);
        emitPrism(b.tx, b.tz, 1.25, 1.25, top + 10, top + 10.6, 8, TI.plaster, ox, oy, oz);
        emitPrism(b.tx, b.tz, 0.85, 0.02, top + 14, top + 18, 8, TI.dome_green, ox, oy, oz);
        emitPrism(b.tx, b.tz, 0.05, 0.02, top + 18, top + 19.2, 4, TI.dome_gold, ox, oy, oz);
      }
    }
    for (const r of c.roofs) emitRoof(r, ox, oy, oz);
    for (const t of c.trees) emitTree(t, ox, oy, oz);
    emitFences(c, ox, oy, oz);

    let mesh = null;
    if (nf) {
      mesh = new THREE.Mesh(takeGeometry(), voxelMat);
      mesh.position.set(ox, oy, oz);
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    }
    return mesh;
  }

  // ---------- chunk store ----------
  const chunks = new Map();
  const ckey = (cx, cz) => cx * 100000 + cz;
  let scene, radius = 11, activeBounds = W.bounds;

  function ensureChunk(cx, cz) {
    const k = ckey(cx, cz);
    let c = chunks.get(k);
    if (!c) {
      c = W.generateVolume(cx, cz);
      c.cx = cx; c.cz = cz; c.meshed = false;
      chunks.set(k, c);
    }
    return c;
  }
  function meshChunk(c) {
    c.mesh = meshVolume(c);
    c.meshed = true;
    if (c.mesh) scene.add(c.mesh);
  }
  function freeChunk(k, c) {
    if (c.mesh) { scene.remove(c.mesh); c.mesh.geometry.dispose(); }
    chunks.delete(k);
  }
  function blockAt(x, y, z) {
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const c = ensureChunk(cx, cz);
    const j = y - c.minY;
    if (j < 0) return B.GROUND;
    if (j >= c.H) return 0;
    return c.vol[x - c.wx0 + (z - c.wz0) * VS + j * STR];
  }

  const closedDoors = new Map(); // cell key -> door
  const doorKey = (x, y, z) => x + ':' + y + ':' + z;
  function solidAt(x, y, z) {
    if (closedDoors.size && closedDoors.has(doorKey(x, y, z))) return true;
    return G.blocks.SOLID[blockAt(x, y, z)] === 1;
  }
  // Y of the top surface of the highest solid block at or below fromY.
  function groundBelow(x, z, fromY) {
    const ix = Math.floor(x), iz = Math.floor(z);
    for (let y = Math.floor(fromY); y > fromY - 60; y--) if (G.blocks.SOLID[blockAt(ix, y, iz)]) return y + 1;
    return TOP;
  }

  // Loads the nearest missing chunks within a time budget; returns how many remain.
  const pending = [];
  let lastCx = 1e9, lastCz = 1e9, lastR = -1;
  function rebuildQueue(pcx, pcz) {
    pending.length = 0;
    const b = activeBounds;
    const minCx = Math.floor((b.x0 - 64) / CS), maxCx = Math.floor((b.x1 + 64) / CS);
    const minCz = Math.floor((b.z0 - 64) / CS), maxCz = Math.floor((b.z1 + 64) / CS);
    for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
      const d2 = dx * dx + dz * dz;
      if (d2 > radius * radius) continue;
      const cx = pcx + dx, cz = pcz + dz;
      if (cx < minCx || cx > maxCx || cz < minCz || cz > maxCz) continue;
      const c = chunks.get(ckey(cx, cz));
      if (!c || !c.meshed) pending.push([d2, cx, cz]);
    }
    pending.sort((a, b2) => b2[0] - a[0]); // nearest at the end, popped first
  }
  function update(px, pz, budgetMs) {
    const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS);
    if (pcx !== lastCx || pcz !== lastCz || radius !== lastR) {
      lastCx = pcx; lastCz = pcz; lastR = radius;
      rebuildQueue(pcx, pcz);
      const lim = (radius + 3) * (radius + 3);
      for (const [k, c] of chunks) {
        const dx = c.cx - pcx, dz = c.cz - pcz;
        if (dx * dx + dz * dz > lim) freeChunk(k, c);
      }
    }
    const t0 = performance.now();
    while (pending.length && (budgetMs === Infinity || performance.now() - t0 < budgetMs)) {
      const [, cx, cz] = pending.pop();
      const c = ensureChunk(cx, cz);
      if (!c.meshed) meshChunk(c);
    }
    if (farMat) farMat.uniforms.uHoleR.value = Math.max(0, (radius - 1.2) * CS);
    return pending.length;
  }

  // ---------- flat ground: one large quad that follows the camera ----------
  let groundMesh = null;
  function buildGround(groundCanvas) {
    const b = W.bounds;
    const mapTex = new THREE.CanvasTexture(groundCanvas);
    mapTex.colorSpace = THREE.NoColorSpace;
    mapTex.minFilter = THREE.LinearMipmapLinearFilter;
    mapTex.magFilter = THREE.LinearFilter;
    mapTex.anisotropy = 2;
    groundMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2,
      uniforms: Object.assign({
        uTiles: { value: tilesTex }, uMap: { value: mapTex }, uLayer: { value: TI.ground_detail },
        uBounds: { value: new THREE.Vector4(b.x0, b.z0, b.x1, b.z1) },
        uPlay: { value: new THREE.Vector4(b.x0 - 400, b.z0 - 400, b.x1 + 400, b.z1 + 400) },
        uTint: { value: new THREE.Color(1, 1, 1) },
      }, U),
      vertexShader: `
        out vec3 vW;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        precision highp sampler2DArray;
        uniform sampler2DArray uTiles; uniform sampler2D uMap; uniform vec4 uBounds; uniform vec4 uPlay; uniform vec3 uSun; uniform vec3 uTint; uniform float uLayer;
        ${FOG_GLSL}
        in vec3 vW;
        out vec4 fragColor;
        void main() {
          if (vW.x < uPlay.x || vW.z < uPlay.y || vW.x > uPlay.z || vW.z > uPlay.w) discard;
          float vDist = length(vW - cameraPosition);
          vec2 uv = (vW.xz - uBounds.xy) / (uBounds.zw - uBounds.xy);
          vec3 base;
          if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) base = texture(uMap, vec2(uv.x, 1.0 - uv.y)).rgb;
          else base = vec3(0.47, 0.54, 0.31);
          // Two scales of the same noise hide any repetition, near and far.
          float fine = texture(uTiles, vec3(vW.xz * 0.93, uLayer)).r;
          float mid = texture(uTiles, vec3(vW.zx * 0.11, uLayer)).r;
          float broad = texture(uTiles, vec3(vW.xz * 0.0083, uLayer)).g;
          vec3 c = base * uTint * (0.74 + 0.52 * fine) * (0.86 + 0.28 * mid) * (0.86 + 0.28 * broad);
          fragColor = vec4(applyFog(c * uSun, vDist), 1.0);
        }`,
    });
    // A grid with small cells near the camera and large ones far away. One giant quad loses depth
    // precision close to the viewer, and the ground then wins fights against floors just above it.
    const SEG = 40, gp = [], gi = [];
    const warp = (i) => { const t = (i / SEG) * 2 - 1; return Math.sign(t) * Math.pow(Math.abs(t), 3) * 12000; };
    for (let j = 0; j <= SEG; j++) for (let i = 0; i <= SEG; i++) gp.push(warp(i), 0, warp(j));
    for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
      const a = i + j * (SEG + 1), b = a + 1, c = a + SEG + 1, d = c + 1;
      gi.push(a, c, b, b, c, d);
    }
    const groundGeo = new THREE.BufferGeometry();
    groundGeo.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    groundGeo.setIndex(gi);
    groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.position.y = TOP - 0.06;
    groundMesh.frustumCulled = false;
    groundMesh.renderOrder = -50;
    scene.add(groundMesh);
  }

  // ---------- roads, pads and markings: strips in merged cells; water: one transparent mesh ----------
  const TIER = { asphalt: -0.008, gravel: -0.012, dirt: -0.016, slab: -0.02, paint: -0.004, pad: -0.018, runway: -0.01 };
  function buildFlats() {
    const CELLF = 512, groups = new Map();
    const grp = (x, z) => {
      const k = Math.floor(x / CELLF) * 100000 + Math.floor(z / CELLF);
      let g = groups.get(k);
      if (!g) groups.set(k, (g = []));
      return g;
    };
    const SURF = { asphalt: TI.road_asphalt, gravel: TI.road_gravel, dirt: TI.road_dirt };
    // World-aligned UVs make crossing roads of the same surface join with no seam.
    const addStrip = (list, ax, az, bx, bz, w, y, layer) => {
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) return;
      const nx = ((bz - az) / len) * (w / 2), nz = (-(bx - ax) / len) * (w / 2);
      list.push([ax + nx, az + nz, bx + nx, bz + nz, bx - nx, bz - nz, ax - nx, az - nz, y, layer]);
    };
    const addDisc = (list, x, z, r, y, layer) => {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * 6.2832, c = ((i + 1) / 8) * 6.2832;
        list.push([x, z, x + Math.cos(a) * r, z + Math.sin(a) * r, x + Math.cos(c) * r, z + Math.sin(c) * r, x, z, y, layer]);
      }
    };
    for (const r of W.roads) {
      const y = TOP + TIER[r.surf], layer = SURF[r.surf];
      let run = 0;
      for (let i = 0; i + 3 < r.p.length; i += 2) {
        const ax = r.p[i], az = r.p[i + 1], bx = r.p[i + 2], bz = r.p[i + 3], len = Math.hypot(bx - ax, bz - az);
        const list = grp((ax + bx) / 2, (az + bz) / 2);
        addStrip(list, ax, az, bx, bz, r.w, y, layer);
        addDisc(list, ax, az, r.w / 2, y, layer);
        if (i + 5 >= r.p.length) addDisc(list, bx, bz, r.w / 2, y, layer);
        if (r.line && len > 1) {
          // Dashed centre line
          const dx = (bx - ax) / len, dz = (bz - az) / len;
          for (let d = (4 - (run % 8) + 8) % 8; d + 3 < len; d += 8) addStrip(list, ax + dx * d, az + dz * d, ax + dx * (d + 3), az + dz * (d + 3), 0.16, TOP + TIER.paint, TI.paint);
        }
        run += len;
      }
    }
    // Bridges: a concrete slab with low railings.
    const rails = [];
    for (const br of W.D.bridges) {
      let best = null, bd = 3;
      for (const s of W.lookup(br.x, br.z).roads) { const q = W.segDist(br.x, br.z, s); if (q.d < bd) { bd = q.d; best = s; } }
      if (!best) continue;
      const len = best.len, dx = (best.bx - best.ax) / len, dz = (best.bz - best.az) / len, L = 13, hw = best.r.w / 2 + 2.5;
      addStrip(grp(br.x, br.z), br.x - dx * L, br.z - dz * L, br.x + dx * L, br.z + dz * L, hw * 2, TOP + TIER.slab, TI.pad_concrete);
      rails.push([br.x, br.z, dx, dz, L, hw]);
    }
    for (const f of W.flats) addStrip(grp((f.ax + f.bx) / 2, (f.az + f.bz) / 2), f.ax, f.az, f.bx, f.bz, f.w, TOP + TIER[f.tier || 'pad'], TI[f.layer]);

    for (const [, list] of groups) {
      nf = 0;
      let sx = 0, sz = 0;
      for (const q of list) { sx += q[0]; sz += q[1]; }
      const ox = Math.round(sx / list.length), oz = Math.round(sz / list.length);
      for (const q of list) {
        const y = q[8] - TOP, layer = q[9], S = 0.25;
        const v = (x, z) => [x - ox, y, z - oz, x * S, z * S, 1];
        if (q[6] === q[0] && q[7] === q[1]) tri(v(q[0], q[1]), v(q[2], q[3]), v(q[4], q[5]), layer); // part of a round joint
        else quad(v(q[0], q[1]), v(q[2], q[3]), v(q[4], q[5]), v(q[6], q[7]), layer);
      }
      const mesh = new THREE.Mesh(takeGeometry(), voxelMat);
      mesh.position.set(ox, TOP, oz);
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      mesh.renderOrder = -40;
      scene.add(mesh);
    }
    nf = 0;
    for (const [x, z, dx, dz, L, hw] of rails) for (const s of [-1, 1]) {
      const px = -dz * hw * s, pz = dx * hw * s;
      wallQuad(x - dx * L + px - x, z - dz * L + pz - z, x + dx * L + px - x, z + dz * L + pz - z, 0, 0.85, TI.concrete, 0.85, 0.8);
      const mesh = new THREE.Mesh(takeGeometry(), voxelMat);
      mesh.position.set(x, TOP, z);
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      scene.add(mesh);
      nf = 0;
    }

    // Water
    const pos = [];
    const wy = TOP - 0.03;
    const addTri = (a, b, c, d, e, f) => pos.push(a, wy, b, c, wy, d, e, wy, f);
    for (const rv of W.D.rivers) {
      const w = rv.w / 2;
      for (let i = 0; i + 3 < rv.p.length; i += 2) {
        const ax = rv.p[i], az = rv.p[i + 1], bx = rv.p[i + 2], bz = rv.p[i + 3], len = Math.hypot(bx - ax, bz - az) || 1;
        const nx = ((bz - az) / len) * w, nz = (-(bx - ax) / len) * w;
        addTri(ax + nx, az + nz, bx + nx, bz + nz, bx - nx, bz - nz);
        addTri(ax + nx, az + nz, bx - nx, bz - nz, ax - nx, az - nz);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * 6.2832, c = ((k + 1) / 8) * 6.2832;
          addTri(bx, bz, bx + Math.cos(a) * w, bz + Math.sin(a) * w, bx + Math.cos(c) * w, bz + Math.sin(c) * w);
        }
      }
    }
    for (const wt of W.D.waters) {
      const contour = [];
      for (let i = 0; i < wt.p.length; i += 2) contour.push(new THREE.Vector2(wt.p[i], wt.p[i + 1]));
      for (const t of THREE.ShapeUtils.triangulateShape(contour, [])) addTri(contour[t[0]].x, contour[t[0]].y, contour[t[1]].x, contour[t[1]].y, contour[t[2]].x, contour[t[2]].y);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const water = new THREE.Mesh(geo, waterMat);
    water.frustumCulled = false;
    water.renderOrder = 2;
    scene.add(water);
  }

  // ---------- distant view: plain extruded buildings beyond the loaded chunks ----------
  function buildFar() {
    farMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      side: THREE.DoubleSide,
      uniforms: Object.assign({ uHoleC: { value: new THREE.Vector2() }, uHoleR: { value: 300 } }, U),
      vertexShader: `
        in vec3 aColor;
        out vec3 vW; out vec3 vC; out float vDist;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz; vC = aColor;
          vec4 mv = viewMatrix * w;
          vDist = length(mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec2 uHoleC; uniform float uHoleR; uniform vec3 uSun;
        ${FOG_GLSL}
        in vec3 vW; in vec3 vC; in float vDist;
        out vec4 fragColor;
        void main() {
          vec2 d = vW.xz - uHoleC;
          if (dot(d, d) < uHoleR * uHoleR) discard;
          fragColor = vec4(applyFog(vC * uSun, vDist), 1.0);
        }`,
    });
    const positions = [], colors = [], idx = [];
    const WALLC = { WALL_BLUE: 0x6d92b2, WALL_GREEN: 0x7b9d84, WALL_WHITE: 0xd8d4c7, WALL_YELLOW: 0xcfb97a, WALL_TEAL: 0x5e9593, WALL_PEACH: 0xcda68d, WALL_LOG: 0x7e6040, BRICK_WHITE: 0xcfc9b8, BRICK_RED: 0x9c5740, PLASTER: 0xd5d1c5, CONCRETE: 0xa2a19a, METAL: 0x8f979b, PLANKS: 0xa27a4a };
    const ROOFC = { ROOF_RED: 0x9c4d3a, ROOF_GREEN: 0x44755b, ROOF_BLUE: 0x476b90, ROOF_GRAY: 0x808285, ROOF_BROWN: 0x6f4f3a, FLAT_ROOF: 0x605d59, DOME_GREEN: 0x31895f };
    const addV = (x, y, z, c, s) => {
      positions.push(x, y, z);
      colors.push((((c >> 16) & 255) / 255) * s, (((c >> 8) & 255) / 255) * s, ((c & 255) / 255) * s);
      return positions.length / 3 - 1;
    };
    const extrude = (p, base, top, wallC, roofC, rise) => {
      const n = p.length / 2;
      for (let i = 0; i < n; i++) {
        const k = (i + 1) % n;
        const ax = p[i * 2], az = p[i * 2 + 1], bx = p[k * 2], bz = p[k * 2 + 1];
        const s = 0.7 + (0.25 * Math.abs(bz - az)) / (Math.hypot(bx - ax, bz - az) || 1);
        const v0 = addV(ax, base, az, wallC, s), v1 = addV(bx, base, bz, wallC, s), v2 = addV(bx, top, bz, wallC, s), v3 = addV(ax, top, az, wallC, s);
        idx.push(v0, v1, v2, v0, v2, v3);
      }
      const contour = [];
      for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(p[i * 2], p[i * 2 + 1]));
      const first = positions.length / 3;
      for (let i = 0; i < n; i++) addV(contour[i].x, top + rise * 0.6, contour[i].y, roofC, 1);
      for (const t of THREE.ShapeUtils.triangulateShape(contour, [])) idx.push(first + t[0], first + t[1], first + t[2]);
    };
    for (const b of W.buildings) extrude(b.p, b.base, b.base + b.h, WALLC[b.wall] || 0xaaaaaa, ROOFC[b.roof] || 0x808285, b.roofRise);
    for (const f of W.farBoxes) extrude([f.x0, f.z0, f.x1, f.z0, f.x1, f.z1, f.x0, f.z1], TOP, TOP + f.h, f.color, f.roof || 0x605d59, 0);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, farMat);
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  let bgScene = null, terrainMesh = null, bgPlane = null;
  function buildTerrain(T, coarse) {
    bgScene = new THREE.Scene();
    const bin = atob(T.b64), raw = new Int16Array(bin.length / 2);
    for (let i = 0; i < raw.length; i++) raw[i] = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8);
    const stepK = coarse ? 2 : 1, w = Math.floor((T.w - 1) / stepK) + 1, hgt = Math.floor((T.h - 1) / stepK) + 1, R = -T.x0;
    const H = (i, j) => {
      const v = raw[i * stepK + j * stepK * T.w] * T.scale;
      const x = T.x0 + i * stepK * T.step, z = T.z0 + j * stepK * T.step;
      const edge = Math.min(1, (R - Math.max(Math.abs(x), Math.abs(z))) / 1500); // fades to flat at the rim
      return v * Math.max(0, edge);
    };
    const pos = [], col = [], idx = [];
    const L = [0.45, 0.75, 0.35], ll = Math.hypot(...L);
    for (let j = 0; j < hgt; j++) for (let i = 0; i < w; i++) {
      const x = T.x0 + i * stepK * T.step, z = T.z0 + j * stepK * T.step, h = H(i, j);
      pos.push(x, TOP - 0.3 + h, z);
      const hx = H(Math.min(w - 1, i + 1), j) - H(Math.max(0, i - 1), j), hz = H(i, Math.min(hgt - 1, j + 1)) - H(i, Math.max(0, j - 1));
      const d = 2 * stepK * T.step, n = [-hx / d, 1, -hz / d], nl = Math.hypot(...n);
      const lit = 0.55 + 0.45 * Math.max(0, (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / (nl * ll));
      const slope = 1 - n[1] / nl;
      // Steppe grass low down, darker forest on the hills, bare rock where steep or high.
      const patch = 0.5 + 0.5 * Math.sin(x * 0.0011 + Math.sin(z * 0.0007) * 2) * Math.cos(z * 0.0013 - x * 0.0004);
      let c = [0.5, 0.56, 0.31];
      const forest = Math.min(1, Math.max(0, (h - 25) / 120)) * patch;
      c = c.map((v, k) => v + ([0.26, 0.38, 0.22][k] - v) * forest);
      const rock = Math.min(1, Math.max(0, slope * 3.2 - 0.25 + (h - 380) / 300));
      c = c.map((v, k) => v + ([0.5, 0.47, 0.42][k] - v) * rock);
      col.push(c[0] * lit, c[1] * lit, c[2] * lit);
      if (i < w - 1 && j < hgt - 1) { const a = i + j * w; idx.push(a, a + w, a + 1, a + 1, a + w, a + w + 1); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: Object.assign({ uTiles: { value: tilesTex }, uLayer: { value: TI.ground_detail }, uTint: groundMat.uniforms.uTint }, U),
      vertexShader: `
        in vec3 aColor; out vec3 vC; out vec3 vW;
        void main() { vC = aColor; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        precision highp sampler2DArray;
        uniform sampler2DArray uTiles; uniform float uLayer; uniform vec3 uSun; uniform vec3 uTint;
        ${FOG_GLSL}
        in vec3 vC; in vec3 vW; out vec4 fragColor;
        void main() {
          float broad = texture(uTiles, vec3(vW.xz * 0.0083, uLayer)).g, mid = texture(uTiles, vec3(vW.zx * 0.11, uLayer)).r;
          vec3 c = vC * uTint * (0.86 + 0.28 * broad) * (0.9 + 0.2 * mid);
          fragColor = vec4(applyFog(c * uSun, length(vW - cameraPosition)), 1.0);
        }`,
    });
    terrainMesh = new THREE.Mesh(geo, mat);
    terrainMesh.frustumCulled = false;
    bgScene.add(terrainMesh);
    // Beyond the rim: flat land out to the horizon.
    const pg = new THREE.PlaneGeometry(200000, 200000).rotateX(-Math.PI / 2);
    pg.setAttribute('aColor', new THREE.Float32BufferAttribute(new Array(pg.attributes.position.count).fill([0.5, 0.56, 0.31]).flat(), 3));
    bgPlane = new THREE.Mesh(pg, mat);
    bgPlane.position.y = TOP - 4;
    bgPlane.frustumCulled = false;
    bgScene.add(bgPlane);
  }
  // Two passes: the background with a long view distance, then the playable world with precise depth.
  function render(renderer, scene, camera, sky) {
    const near = camera.near, far = camera.far;
    renderer.clear();
    if (bgScene) {
      camera.updateMatrixWorld();
      camera.near = 5; camera.far = 120000; camera.updateProjectionMatrix();
      if (sky && sky.parent !== bgScene) bgScene.add(sky);
      if (bgPlane) { bgPlane.position.x = camera.position.x; bgPlane.position.z = camera.position.z; }
      renderer.render(bgScene, camera);
      camera.near = near; camera.far = far; camera.updateProjectionMatrix();
      renderer.clearDepth();
    }
    renderer.render(scene, camera);
  }

  function setCameraCenter(x, z) {
    if (farMat) farMat.uniforms.uHoleC.value.set(x, z);
    if (groundMesh) { groundMesh.position.x = x; groundMesh.position.z = z; }
  }

  G.voxels = {
    init(s, anisotropy) { scene = s; initMaterials(anisotropy); },
    update, ensureChunk, blockAt, solidAt, groundBelow, buildGround, buildFlats, buildFar, setCameraCenter, chunks, closedDoors, doorKey,
    setRadius(r) { radius = r; },
    getRadius() { return radius; },
    setBounds(b) {
      activeBounds = b; lastCx = 1e9;
      if (groundMat) groundMat.uniforms.uPlay.value.set(b.x0 - 400, b.z0 - 400, b.x1 + 400, b.z1 + 400);
    },
    buildTerrain, render, getBgScene: () => bgScene,
    setGroundTint(r, g, b) { if (groundMat) groundMat.uniforms.uTint.value.setRGB(r, g, b); },
    pendingCount() { return pending.length; },
  };
})();
