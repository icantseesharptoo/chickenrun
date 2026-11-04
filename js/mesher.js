// Greedy voxel mesher, chunk streaming, GLSL materials and the low-detail far landscape.
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  const { B, SOLID, OPAQUE, CROSS, CUT, T_TOP, T_SIDE, T_BOT } = G.blocks;
  const W = G.world;
  const { CS, VS } = W;
  const STR = VS * VS;
  const AO = [0.42, 0.62, 0.82, 1];
  const FACE = [[0.86, 0.68], [1, 0.52], [0.76, 0.76]]; // [+side, -side] brightness for x, y, z

  // Shared uniforms: updated once per frame by the day/night cycle.
  const U = {
    uTime: { value: 0 },
    uSun: { value: new THREE.Color(1, 1, 1) },
    uFogColor: { value: new THREE.Color(0.7, 0.8, 0.9) },
    uFogNear: { value: 300 },
    uFogFar: { value: 2600 },
  };

  const FOG_GLSL = `
    uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
    vec3 applyFog(vec3 c, float dist) { return mix(c, uFogColor, clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0)); }
  `;

  let voxelMat, waterMat, entityMat, glassMat, farMat;
  function initMaterials() {
    const tex = G.blocks.makeTextureArray();
    voxelMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      side: THREE.DoubleSide,
      uniforms: Object.assign({ uTiles: { value: tex } }, U),
      vertexShader: `
        in vec2 aUv; in vec2 aData;
        out vec2 vUv; flat out float vLayer; out float vLight; out float vDist;
        void main() {
          vUv = aUv; vLayer = aData.x; vLight = aData.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDist = length(mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        precision highp sampler2DArray;
        uniform sampler2DArray uTiles; uniform vec3 uSun;
        ${FOG_GLSL}
        in vec2 vUv; flat in float vLayer; in float vLight; in float vDist;
        out vec4 fragColor;
        void main() {
          vec4 t = texture(uTiles, vec3(vUv, vLayer));
          if (t.a < 0.5) discard;
          fragColor = vec4(applyFog(t.rgb * vLight * uSun, vDist), 1.0);
        }`,
    });
    waterMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: Object.assign({}, U),
      vertexShader: `
        uniform float uTime;
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
          vec2 p = floor(vW.xz * 4.0) / 4.0;
          float n = sin(p.x * 1.7 + uTime * 0.9) + sin(p.y * 1.3 - uTime * 0.7) + sin((p.x + p.y) * 0.8 + uTime * 0.5);
          vec3 c = mix(vec3(0.20, 0.42, 0.56), vec3(0.34, 0.60, 0.72), n * 0.16 + 0.5);
          fragColor = vec4(applyFog(c * uSun, vDist), 0.78);
        }`,
    });
    entityMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
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
    G.mats = { voxelMat, waterMat, entityMat, glassMat, U };
  }

  // ---------- greedy meshing ----------
  let buf = new Float32Array(1 << 20), nf = 0;
  let wbuf = new Float32Array(1 << 16), wnf = 0;
  const FLOATS = 7;
  function pushVert(x, y, z, u, v, layer, light) {
    if (nf + FLOATS > buf.length) { const b = new Float32Array(buf.length * 2); b.set(buf); buf = b; }
    buf[nf++] = x; buf[nf++] = y; buf[nf++] = z; buf[nf++] = u; buf[nf++] = v; buf[nf++] = layer; buf[nf++] = light;
  }
  function pushWater(x, y, z) {
    if (wnf + 3 > wbuf.length) { const b = new Float32Array(wbuf.length * 2); b.set(wbuf); wbuf = b; }
    wbuf[wnf++] = x; wbuf[wnf++] = y; wbuf[wnf++] = z;
  }
  const mask = new Int32Array(VS * 512);

  function meshVolume(c) {
    const { vol, H } = c;
    nf = 0; wnf = 0;
    const dims = [VS, H, VS];
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
            if (!a || a === B.WATER || CROSS[a]) continue;
            const ny = x[d] + side;
            let nb;
            if (d === 1 && (ny < 0)) continue; // bottom of the world volume
            if (d === 1 && ny >= H) nb = 0;
            else nb = vol[idx + side * strides[d]];
            if (OPAQUE[nb] || (CUT[a] && nb === a)) continue;
            const t = d === 1 ? (side > 0 ? T_TOP[a] : T_BOT[a]) : T_SIDE[a];
            let k0 = 3, k1 = 3, k2 = 3, k3 = 3;
            if (!CUT[a]) {
              // Ambient occlusion from the 8 blocks around the face.
              const px = x[0] + (d === 0 ? side : 0), py = x[1] + (d === 1 ? side : 0), pz = x[2] + (d === 2 ? side : 0);
              const o = (du, dv) => {
                const q = [px, py, pz];
                q[u] += du; q[v] += dv;
                return getOcc(q[0], q[1], q[2]);
              };
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
              // Texture space: side faces keep Y as "up".
              let tu, tv;
              if (d === 0) { tu = p[2]; tv = p[1]; } else if (d === 2) { tu = p[0]; tv = p[1]; } else { tu = p[0]; tv = p[2]; }
              pushVert(p[0], p[1], p[2], tu, tv, layer, ao * faceLight);
            };
            const flip = a0 + a2 < a1 + a3;
            // Two triangles; split along the brighter diagonal to avoid AO artifacts.
            if (!flip) { put(0, 0, a0); put(w, 0, a1); put(w, h, a2); put(0, 0, a0); put(w, h, a2); put(0, h, a3); }
            else { put(0, 0, a0); put(w, 0, a1); put(0, h, a3); put(w, 0, a1); put(w, h, a2); put(0, h, a3); }
            i += w; n += w;
          }
        }
      }
    }

    // Plants and water are emitted one cell at a time.
    for (let y = 0; y < H; y++) for (let k = 1; k < VS - 1; k++) for (let i = 1; i < VS - 1; i++) {
      const id = vol[i + k * VS + y * STR];
      if (!id) continue;
      if (CROSS[id]) {
        const t = T_SIDE[id], l = 0.92;
        const quad = (x0, z0, x1, z1) => {
          pushVert(x0, y, z0, 0, 0, t, l * 0.8); pushVert(x1, y, z1, 1, 0, t, l * 0.8); pushVert(x1, y + 1, z1, 1, 1, t, l);
          pushVert(x0, y, z0, 0, 0, t, l * 0.8); pushVert(x1, y + 1, z1, 1, 1, t, l); pushVert(x0, y + 1, z0, 0, 1, t, l);
        };
        quad(i + 0.15, k + 0.15, i + 0.85, k + 0.85);
        quad(i + 0.15, k + 0.85, i + 0.85, k + 0.15);
      } else if (id === B.WATER) {
        const above = y + 1 < H ? vol[i + k * VS + (y + 1) * STR] : 0;
        const top = y + 0.86;
        const tri = (a, b, cc) => { pushWater(...a); pushWater(...b); pushWater(...cc); };
        if (above !== B.WATER) {
          const a = [i, top, k], b = [i + 1, top, k], cc = [i + 1, top, k + 1], dd = [i, top, k + 1];
          tri(a, b, cc); tri(a, cc, dd);
        }
        const sideF = (nb, a, b) => {
          if (nb === B.WATER || OPAQUE[nb]) return;
          const y1 = above === B.WATER ? y + 1 : top;
          const a0 = [a[0], y, a[1]], b0 = [b[0], y, b[1]], b1 = [b[0], y1, b[1]], a1 = [a[0], y1, a[1]];
          tri(a0, b0, b1); tri(a0, b1, a1);
        };
        sideF(vol[i + 1 + k * VS + y * STR], [i + 1, k], [i + 1, k + 1]);
        sideF(vol[i - 1 + k * VS + y * STR], [i, k], [i, k + 1]);
        sideF(vol[i + (k + 1) * VS + y * STR], [i, k + 1], [i + 1, k + 1]);
        sideF(vol[i + (k - 1) * VS + y * STR], [i, k], [i + 1, k]);
      }
    }

    // Build geometries. Vertices are local to the chunk's corner (wx0, minY, wz0).
    let mesh = null, wmesh = null;
    if (nf) {
      const arr = buf.slice(0, nf);
      const ib = new THREE.InterleavedBuffer(arr, FLOATS);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0));
      geo.setAttribute('aUv', new THREE.InterleavedBufferAttribute(ib, 2, 3));
      geo.setAttribute('aData', new THREE.InterleavedBufferAttribute(ib, 2, 5));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(VS / 2, H / 2, VS / 2), Math.hypot(VS / 2, H / 2, VS / 2) + 1);
      mesh = new THREE.Mesh(geo, voxelMat);
      mesh.position.set(c.wx0, c.minY, c.wz0);
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    }
    if (wnf) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(wbuf.slice(0, wnf), 3));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(VS / 2, H / 2, VS / 2), Math.hypot(VS / 2, H / 2, VS / 2) + 1);
      wmesh = new THREE.Mesh(geo, waterMat);
      wmesh.position.set(c.wx0, c.minY, c.wz0);
      wmesh.matrixAutoUpdate = false; wmesh.updateMatrix();
      wmesh.renderOrder = 2;
    }
    return { mesh, wmesh };
  }

  // ---------- chunk store ----------
  const chunks = new Map();
  const ckey = (cx, cz) => cx * 100000 + cz;
  let scene, radius = 11;

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
    const { mesh, wmesh } = meshVolume(c);
    c.mesh = mesh; c.wmesh = wmesh; c.meshed = true;
    if (mesh) scene.add(mesh);
    if (wmesh) scene.add(wmesh);
  }
  function freeChunk(k, c) {
    if (c.mesh) { scene.remove(c.mesh); c.mesh.geometry.dispose(); }
    if (c.wmesh) { scene.remove(c.wmesh); c.wmesh.geometry.dispose(); }
    chunks.delete(k);
  }
  function remeshAll() { for (const [, c] of chunks) { if (c.mesh) { scene.remove(c.mesh); c.mesh.geometry.dispose(); } if (c.wmesh) { scene.remove(c.wmesh); c.wmesh.geometry.dispose(); } c.mesh = c.wmesh = null; c.meshed = false; } }

  function blockAt(x, y, z) {
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const c = ensureChunk(cx, cz);
    const j = y - c.minY;
    if (j < 0) return B.STONE;
    if (j >= c.H) return 0;
    return c.vol[x - c.wx0 + (z - c.wz0) * VS + j * STR];
  }

  const closedDoors = new Map(); // cell key -> door
  const doorKey = (x, y, z) => x + ':' + y + ':' + z;
  function solidAt(x, y, z) {
    if (closedDoors.size && closedDoors.has(doorKey(x, y, z))) return true;
    return SOLID[blockAt(x, y, z)] === 1;
  }
  // Y of the top surface of the highest solid block at or below fromY.
  function groundBelow(x, z, fromY) {
    const ix = Math.floor(x), iz = Math.floor(z);
    for (let y = Math.floor(fromY); y > fromY - 60; y--) if (SOLID[blockAt(ix, y, iz)]) return y + 1;
    return fromY - 60;
  }

  // Loads the nearest missing chunks within a time budget; returns how many remain.
  const pending = [];
  let lastCx = 1e9, lastCz = 1e9, lastR = -1;
  function rebuildQueue(pcx, pcz) {
    pending.length = 0;
    const b = W.bounds;
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

  // ---------- far landscape: the whole town seen from a distance, including from a future plane ----------
  function buildFar(mapCanvas) {
    const b = W.bounds;
    const mapTex = new THREE.CanvasTexture(mapCanvas);
    mapTex.colorSpace = THREE.NoColorSpace;
    mapTex.minFilter = THREE.LinearMipmapLinearFilter;
    mapTex.magFilter = THREE.LinearFilter;
    mapTex.anisotropy = 4;
    farMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: Object.assign({
        uMap: { value: mapTex }, uHoleC: { value: new THREE.Vector2() }, uHoleR: { value: 300 },
        uBounds: { value: new THREE.Vector4(b.x0, b.z0, b.x1, b.z1) },
      }, U),
      vertexShader: `
        in vec3 aColor; in float aBuilding;
        out vec3 vW; out vec3 vC; out float vDist; out float vB;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz; vC = aColor; vB = aBuilding;
          vec4 mv = viewMatrix * w;
          vDist = length(mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap; uniform vec2 uHoleC; uniform float uHoleR; uniform vec4 uBounds; uniform vec3 uSun;
        ${FOG_GLSL}
        in vec3 vW; in vec3 vC; in float vDist; in float vB;
        out vec4 fragColor;
        void main() {
          vec2 d = vW.xz - uHoleC;
          if (max(abs(d.x), abs(d.y)) < uHoleR * 0.74 || dot(d, d) < uHoleR * uHoleR * 0.88) discard;
          vec3 c;
          if (vB > 0.5) c = vC;
          else {
            vec2 uv = (vW.xz - uBounds.xy) / (uBounds.zw - uBounds.xy);
            float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
            c = inside > 0.5 ? texture(uMap, vec2(uv.x, 1.0 - uv.y)).rgb : vec3(0.60, 0.65, 0.33) * vC;
          }
          fragColor = vec4(applyFog(c * uSun, vDist), 1.0);
        }`,
    });

    const g = W.demFar;
    const positions = [], colors = [], flags = [], idx = [];
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
      const x = g.x0 + i * g.step, z = g.z0 + j * g.step;
      const inside = x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1;
      const y = (inside ? W.elevation(x, z) : W.elevationFar(x, z)) - 1.6;
      positions.push(x, y, z);
      const n = 0.92 + W.hash(i, j) * 0.14;
      colors.push(n, n, n);
      flags.push(0);
      if (i < g.w - 1 && j < g.h - 1) {
        const a = i + j * g.w;
        idx.push(a, a + g.w, a + 1, a + 1, a + g.w, a + g.w + 1);
      }
    }
    // Buildings as extruded footprints.
    const palette = { house: 0xc0b49a, shed: 0x8f9396, big: 0x9d9a90, apartments: 0xd6d0c0, civic: 0xb47b62, retail: 0xdcd8cc, shop: 0xdcd8cc, industrial: 0x90989c, work: 0x90989c, mosque: 0xe6e3da, church: 0xe6e3da };
    const roofs = [0xa84c38, 0x3f7d5c, 0x416f9c, 0x87888a, 0x76503a];
    const addV = (x, y, z, c, s) => {
      positions.push(x, y, z);
      colors.push(((c >> 16) & 255) / 255 * s, ((c >> 8) & 255) / 255 * s, (c & 255) / 255 * s);
      flags.push(1);
      return positions.length / 3 - 1;
    };
    for (const bd of W.buildings) {
      const n = bd.p.length / 2;
      const top = bd.base + bd.h, wallC = palette[bd.k] || 0xaaaaaa;
      const roofC = bd.pitch ? roofs[W.hashI(bd.i, 29, 5)] : 0x63605c;
      for (let i = 0; i < n; i++) {
        const k = (i + 1) % n;
        const ax = bd.p[i * 2], az = bd.p[i * 2 + 1], bx = bd.p[k * 2], bz = bd.p[k * 2 + 1];
        const s = 0.7 + 0.25 * Math.abs(bz - az) / (Math.hypot(bx - ax, bz - az) || 1);
        const v0 = addV(ax, bd.base - 2, az, wallC, s), v1 = addV(bx, bd.base - 2, bz, wallC, s), v2 = addV(bx, top, bz, wallC, s), v3 = addV(ax, top, az, wallC, s);
        idx.push(v0, v1, v2, v0, v2, v3);
      }
      const contour = [];
      for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(bd.p[i * 2], bd.p[i * 2 + 1]));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      const first = positions.length / 3;
      for (let i = 0; i < n; i++) addV(contour[i].x, top + bd.roofRise * 0.6, contour[i].y, roofC, 1);
      for (const t of tris) idx.push(first + t[0], first + t[1], first + t[2]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('aBuilding', new THREE.Float32BufferAttribute(flags, 1));
    geo.setIndex(idx);
    farMat.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(geo, farMat);
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  function setCameraCenter(x, z) { if (farMat) farMat.uniforms.uHoleC.value.set(x, z); }

  G.voxels = {
    init(s) { scene = s; initMaterials(); },
    update, ensureChunk, blockAt, solidAt, groundBelow, buildFar, setCameraCenter, chunks, remeshAll, closedDoors, doorKey,
    setRadius(r) { radius = r; },
    getRadius() { return radius; },
    pendingCount() { return pending.length; },
  };
})();
