// World description. The ground is flat. Voxels here are only for collision and block-built interiors;
// generic buildings, trees, roads and water are drawn as smooth meshes by mesher.js.
// Every column is a pure function of (x, z), so chunks can be generated in any order.
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  const { B } = G.blocks;
  const D = window.AKYAR;
  const CELL = 32;
  const GROUND_Y = 29;      // block index of the ground layer
  const TOP = GROUND_Y + 1; // the walkable surface

  // Other countries share one template, placed far beyond the fog so it can never be seen from Akyar.
  const ABROAD = { x0: 20000, z0: 0, roadZ: -12, hotelX: 20613, taxiStartX: 20190, taxiZ: -10 };
  ABROAD.bounds = { x0: ABROAD.x0 - 30, x1: ABROAD.x0 + 760, z0: -70, z1: 130 };
  const bounds = D.meta.bounds;

  function addAbroadTemplate() {
    let roadName = D.roadNames.indexOf('Airport Road');
    if (roadName < 0) roadName = D.roadNames.push('Airport Road') - 1;
    const { x0, z0, roadZ } = ABROAD;
    D.roads.push(['secondary', roadName, 'asphalt', [x0 + 40, z0 + roadZ, x0 + 740, z0 + roadZ]]);
    const rect = (bx0, bz0, bx1, bz1) => [bx0, bz0, bx1, bz0, bx1, bz1, bx0, bz1];
    const kinds = ['apartments', 'big', 'house', 'apartments', 'house', 'big'];
    let k = 0;
    // North side of the street
    for (let x = x0 + 70; x < x0 + 730; x += 36) {
      const w = 22 + (k % 3) * 4;
      D.buildings.push({ k: kinds[k % 6], n: '', l: kinds[k % 6] === 'apartments' ? 4 + (k % 2) : 0, p: rect(x, z0 + roadZ - 26, x + w, z0 + roadZ - 12) });
      k++;
    }
    // South side, between the airport and the hotel, then beyond it
    for (const x of [x0 + 400, x0 + 436, x0 + 472, x0 + 508, x0 + 544, x0 + 650, x0 + 690]) {
      const w = 20 + (k % 3) * 4;
      D.buildings.push({ k: kinds[k % 6], n: '', l: kinds[k % 6] === 'apartments' ? 3 + (k % 3) : 0, p: rect(x, z0 + roadZ + 12, x + w, z0 + roadZ + 26) });
      k++;
    }
  }
  addAbroadTemplate();

  // Landuse raster
  const lu = D.landuse;
  const luGrid = new Uint8Array(lu.w * lu.h);
  { let p = 0; for (let i = 0; i < lu.rle.length; i += 2) { luGrid.fill(lu.rle[i], p, p + lu.rle[i + 1]); p += lu.rle[i + 1]; } }
  const LU = { GRASS: 0, FOREST: 1, INDUSTRIAL: 2, CEMETERY: 3, STEPPE: 4, WETLAND: 5, PITCH: 6, PARKING: 7, CONSTRUCTION: 8, PLAYGROUND: 9 };
  function landuse(x, z) {
    const i = Math.floor((x - lu.x0) / lu.step), j = Math.floor((z - lu.z0) / lu.step);
    if (i < 0 || j < 0 || i >= lu.w || j >= lu.h) return LU.STEPPE;
    return luGrid[i + j * lu.w];
  }

  function hash(x, z) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const hashI = (x, z, n) => Math.floor(hash(x, z) * n);

  // ---------- spatial index ----------
  const index = new Map();
  const cellOf = (v) => Math.floor(v / CELL);
  const ikey = (cx, cz) => cx * 100000 + cz;
  function addToIndex(kind, item, x0, z0, x1, z1) {
    for (let cz = cellOf(z0); cz <= cellOf(z1); cz++) for (let cx = cellOf(x0); cx <= cellOf(x1); cx++) {
      const k = ikey(cx, cz);
      let e = index.get(k);
      if (!e) index.set(k, (e = { roads: [], blds: [], rivers: [], waters: [], sites: [], fences: [] }));
      e[kind].push(item);
    }
  }
  const EMPTY = { roads: [], blds: [], rivers: [], waters: [], sites: [], fences: [] };
  const lookup = (x, z) => index.get(ikey(cellOf(x), cellOf(z))) || EMPTY;

  function pointInPoly(p, x, z) {
    let c = false;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      const zi = p[i + 1], zj = p[j + 1];
      if (zi > z !== zj > z && x < ((p[j] - p[i]) * (z - zi)) / (zj - zi) + p[i]) c = !c;
    }
    return c;
  }

  // Roads
  const roadWidth = { secondary: 9, tertiary: 8, unclassified: 6, residential: 6, service: 4, track: 3, footway: 2, path: 2, living_street: 5, pedestrian: 3, cycleway: 2, steps: 2, primary: 10, trunk: 10, motorway: 10 };
  const roads = D.roads.map((r) => {
    const t = r[0], s = r[2];
    let surf;
    if (['asphalt', 'paved', 'concrete'].includes(s)) surf = 'asphalt';
    else if (['unpaved', 'dirt', 'ground', 'sand', 'compacted'].includes(s)) surf = 'dirt';
    else if (s === 'gravel') surf = 'gravel';
    else if (t === 'secondary' || t === 'tertiary' || t === 'unclassified') surf = 'asphalt';
    else if (t === 'residential') surf = 'gravel';
    else surf = 'dirt';
    return { type: t, name: D.roadNames[r[1]], w: roadWidth[t] || 4, surf, line: t === 'secondary' || t === 'tertiary', p: r[3] };
  });
  roads.forEach((r) => {
    let run = 0;
    for (let i = 0; i + 3 < r.p.length; i += 2) {
      const ax = r.p[i], az = r.p[i + 1], bx = r.p[i + 2], bz = r.p[i + 3];
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const m = r.w / 2 + 4;
      addToIndex('roads', { r, ax, az, bx, bz, len, run }, Math.min(ax, bx) - m, Math.min(az, bz) - m, Math.max(ax, bx) + m, Math.max(az, bz) + m);
      run += len;
    }
  });

  // Rivers and ponds
  D.rivers.forEach((rv) => {
    for (let i = 0; i + 3 < rv.p.length; i += 2) {
      const ax = rv.p[i], az = rv.p[i + 1], bx = rv.p[i + 2], bz = rv.p[i + 3];
      const m = rv.w / 2 + 6;
      addToIndex('rivers', { ax, az, bx, bz, w: rv.w }, Math.min(ax, bx) - m, Math.min(az, bz) - m, Math.max(ax, bx) + m, Math.max(az, bz) + m);
    }
  });
  D.waters.forEach((wt) => {
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (let i = 0; i < wt.p.length; i += 2) { x0 = Math.min(x0, wt.p[i]); x1 = Math.max(x1, wt.p[i]); z0 = Math.min(z0, wt.p[i + 1]); z1 = Math.max(z1, wt.p[i + 1]); }
    addToIndex('waters', wt, x0, z0, x1, z1);
  });

  // ---------- buildings ----------
  const WALLSETS = [
    ['WALL_BLUE', 'WIN_BLUE'], ['WALL_GREEN', 'WIN_GREEN'], ['WALL_WHITE', 'WIN_WHITE'], ['WALL_YELLOW', 'WIN_YELLOW'],
    ['WALL_TEAL', 'WIN_TEAL'], ['WALL_PEACH', 'WIN_PEACH'], ['WALL_LOG', 'WIN_LOG'], ['BRICK_WHITE', 'WIN_WHITEBRICK'],
  ];
  const ROOFS = ['ROOF_RED', 'ROOF_GREEN', 'ROOF_BLUE', 'ROOF_GRAY', 'ROOF_BROWN'];
  const byChunk = new Map(); // meshes are emitted by the chunk that holds the building's centre
  const chunkList = (x, z, field) => {
    const k = ikey(cellOf(x), cellOf(z));
    let e = byChunk.get(k);
    if (!e) byChunk.set(k, (e = { blds: [], roofs: [], trees: [] }));
    return e[field];
  };

  const buildings = D.buildings.map((d, i) => {
    const p = d.p;
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9, sx = 0, sz = 0;
    let longest = 0, ax = 1, az = 0;
    for (let k = 0; k < p.length; k += 2) {
      x0 = Math.min(x0, p[k]); x1 = Math.max(x1, p[k]); z0 = Math.min(z0, p[k + 1]); z1 = Math.max(z1, p[k + 1]);
      sx += p[k]; sz += p[k + 1];
      const n = (k + 2) % p.length, ex = p[n] - p[k], ez = p[n + 1] - p[k + 1], l = Math.hypot(ex, ez);
      if (l > longest) { longest = l; ax = ex / l; az = ez / l; }
    }
    const n = p.length / 2;
    const b = { i, k: d.k, name: d.n, p, x0, z0, x1, z1, cx: sx / n, cz: sz / n, ax, az, base: TOP };
    // Local axes of the footprint, for gable roofs.
    let v0 = 1e9, v1 = -1e9, u0 = 1e9, u1 = -1e9, area = 0;
    for (let k = 0; k < p.length; k += 2) {
      const dx = p[k] - b.cx, dz = p[k + 1] - b.cz;
      const v = -dx * az + dz * ax, u = dx * ax + dz * az;
      v0 = Math.min(v0, v); v1 = Math.max(v1, v); u0 = Math.min(u0, u); u1 = Math.max(u1, u);
      const m = (k + 2) % p.length;
      area += p[k] * p[m + 1] - p[m] * p[k + 1];
    }
    b.v0 = v0; b.v1 = v1; b.u0 = u0; b.u1 = u1;
    b.ccw = area > 0;
    b.rectish = Math.abs(area / 2) / Math.max(1, (v1 - v0) * (u1 - u0)) > 0.82;
    const r = hash(i, 91);
    const levels = d.l;
    switch (d.k) {
      case 'shed': b.h = 2.6; b.wall = hash(i, 3) < 0.5 ? 'METAL' : 'PLANKS'; b.win = b.wall; b.roof = 'ROOF_GRAY'; b.pitch = 0.35; break;
      case 'house': { const w = WALLSETS[hashI(i, 17, WALLSETS.length)]; b.h = (levels || 1) * 3; b.wall = w[0]; b.win = w[1]; b.roof = ROOFS[hashI(i, 29, ROOFS.length)]; b.pitch = 0.55; break; }
      case 'apartments': b.h = (levels || 5) * 3; b.wall = 'BRICK_WHITE'; b.win = 'WIN_WHITEBRICK'; b.roof = 'FLAT_ROOF'; b.pitch = 0; break;
      case 'civic': b.h = (levels || 2 + (r < 0.5 ? 1 : 0)) * 3.5; b.wall = r < 0.5 ? 'BRICK_RED' : 'PLASTER'; b.win = r < 0.5 ? 'WIN_BRICK' : 'WIN_PLASTER'; b.roof = 'FLAT_ROOF'; b.pitch = 0; break;
      case 'retail': b.h = (levels || 1) * 4.5; b.wall = 'PLASTER'; b.win = 'WIN_PLASTER'; b.roof = 'FLAT_ROOF'; b.pitch = 0; break;
      case 'shop': b.h = 5; b.wall = 'PLASTER'; b.win = 'WIN_PLASTER'; b.roof = 'FLAT_ROOF'; b.pitch = 0; break;
      case 'industrial': b.h = 6; b.wall = 'METAL'; b.win = 'METAL'; b.roof = 'ROOF_GRAY'; b.pitch = 0.2; break;
      case 'work': b.h = 6; b.wall = 'BRICK_RED'; b.win = 'WIN_BRICK'; b.roof = 'FLAT_ROOF'; b.pitch = 0; break;
      case 'big': b.h = (levels || 2) * 3 + 1; b.wall = r < 0.5 ? 'CONCRETE' : 'BRICK_RED'; b.win = r < 0.5 ? 'WIN_CONCRETE' : 'WIN_BRICK'; b.roof = 'ROOF_GRAY'; b.pitch = 0.15; break;
      case 'mosque': b.h = 7; b.wall = 'PLASTER'; b.win = 'WIN_PLASTER'; b.roof = 'DOME_GREEN'; b.pitch = 0.5; b.tower = 'dome_green'; break;
      case 'church': b.h = 7; b.wall = 'PLASTER'; b.win = 'WIN_PLASTER'; b.roof = 'ROOF_BLUE'; b.pitch = 0.6; b.tower = 'dome_gold'; break;
      default: b.h = 3; b.wall = 'CONCRETE'; b.win = 'CONCRETE'; b.roof = 'ROOF_GRAY'; b.pitch = 0.3;
    }
    if (b.tower) { b.tx = p[0] + (b.cx - p[0]) * 0.18; b.tz = p[1] + (b.cz - p[1]) * 0.18; }
    b.roofRise = b.pitch ? Math.min(b.k === 'big' || b.k === 'industrial' ? 2.5 : 4.5, ((v1 - v0) / 2) * b.pitch) : 0;
    b.top = b.base + b.h + b.roofRise + (b.tower ? 12 : 1);
    addToIndex('blds', b, x0 - 1, z0 - 1, x1 + 1, z1 + 1);
    chunkList(b.cx, b.cz, 'blds').push(b);
    return b;
  });

  function buildingAt(x, z) {
    const list = lookup(x, z).blds;
    const px = x + 0.5, pz = z + 0.5;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (px >= b.x0 && px <= b.x1 && pz >= b.z0 && pz <= b.z1 && pointInPoly(b.p, px, pz)) return b;
    }
    return null;
  }
  const inB = (b, x, z) => pointInPoly(b.p, x + 0.5, z + 0.5);

  // ---------- special sites registered by sites.js ----------
  const sites = [];
  function addSite(s) {
    sites.push(s);
    addToIndex('sites', s, s.x0, s.z0, s.x1, s.z1);
  }
  // Extras drawn as meshes: pitched roofs, yard trees, flat pads and markings, far-view boxes.
  const flats = [], farBoxes = [];
  const addRoof = (o) => chunkList((o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2, 'roofs').push(o);
  const addFlat = (o) => flats.push(o);
  const addFarBox = (o) => farBoxes.push(o);
  function addTree(x, z, type, h) { chunkList(x, z, 'trees').push({ x, z, y: TOP, type, h, fixed: true }); }

  // ---------- metal fences: private house plots get a 2 m corrugated fence with a car gate ----------
  const fences = [];
  function addFence(f) {
    f.len = Math.hypot(f.bx - f.ax, f.bz - f.az);
    if (f.len < 0.5) return;
    f.dx = (f.bx - f.ax) / f.len; f.dz = (f.bz - f.az) / f.len;
    f.gaps = f.gaps || [];
    fences.push(f);
    addToIndex('fences', f, Math.min(f.ax, f.bx) - 1, Math.min(f.az, f.bz) - 1, Math.max(f.ax, f.bx) + 1, Math.max(f.az, f.bz) + 1);
  }
  // Fences stop at buildings, roads, water and hand-built sites.
  function fenceBlocked(x, z) {
    const e = lookup(x, z);
    for (const st of e.sites) if (x >= st.x0 - 0.5 && x <= st.x1 + 0.5 && z >= st.z0 - 0.5 && z <= st.z1 + 0.5) return true;
    for (const b of e.blds) if (x >= b.x0 - 0.6 && x <= b.x1 + 0.6 && z >= b.z0 - 0.6 && z <= b.z1 + 0.6 && (pointInPoly(b.p, x, z) || pointInPoly(b.p, x + 0.6, z) || pointInPoly(b.p, x - 0.6, z) || pointInPoly(b.p, x, z + 0.6) || pointInPoly(b.p, x, z - 0.6))) return true;
    for (const r of e.roads) if (segDist(x, z, r).d < r.r.w / 2 + 0.7) return true;
    for (const rv of e.rivers) if (segDist(x, z, rv).d < rv.w / 2 + 1.5) return true;
    return false;
  }
  function fenceAllowedAt(f, t) {
    for (const g of f.gaps) if (t >= g[0] && t <= g[1]) return false;
    if (f.force) return true;
    return !fenceBlocked(f.ax + f.dx * t, f.az + f.dz * t);
  }
  function buildHouseFences() {
    const plots = [];
    for (const b of buildings) {
      if (b.k !== 'house') continue;
      let best = null, bd = 45;
      for (let oz = -32; oz <= 32; oz += 32) for (let ox = -32; ox <= 32; ox += 32) for (const sg of lookup(b.cx + ox, b.cz + oz).roads) {
        if (sg.r.type === 'footway' || sg.r.type === 'path' || sg.r.type === 'track') continue;
        const q = segDist(b.cx, b.cz, sg);
        if (q.d < bd) { bd = q.d; best = { sg, q }; }
      }
      if (!best) continue;
      const sg = best.sg, tx = (sg.bx - sg.ax) / sg.len, tz = (sg.bz - sg.az) / sg.len;
      let nx = -tz, nz = tx;
      const qx = sg.ax + tx * sg.len * best.q.t, qz = sg.az + tz * sg.len * best.q.t;
      const side = (b.cx - qx) * nx + (b.cz - qz) * nz < 0 ? -1 : 1;
      nx *= side; nz *= side;
      const base = best.q.t * sg.len;
      let s0 = 1e9, s1 = -1e9, d0 = 1e9, d1 = -1e9;
      for (let k = 0; k < b.p.length; k += 2) {
        const px = b.p[k] - qx, pz = b.p[k + 1] - qz, a = px * tx + pz * tz, o = px * nx + pz * nz;
        s0 = Math.min(s0, a); s1 = Math.max(s1, a); d0 = Math.min(d0, o); d1 = Math.max(d1, o);
      }
      // Village streets are wide: fences stand well back from the road, but never in front of the house.
      let front = sg.r.w / 2 + 3.5;
      if (d0 < front + 1) front = d0 - 1.5;
      if (front < sg.r.w / 2 + 1.6 || s1 - s0 > 40) continue;
      plots.push({ sg, side, tx, tz, nx, nz, start: base + s0 - 2.5, end: base + s1 + 4.5, hs0: base + s0, hs1: base + s1, front, back: Math.min(Math.max(d1 + 9, front + 20), front + 40), shared: false });
    }
    // Neighbours along the same stretch of road share the fence between them.
    const groups = new Map();
    for (const p of plots) { const k = p.sg; if (!groups.has(k)) groups.set(k, { 1: [], '-1': [] }); groups.get(k)[p.side].push(p); }
    for (const [sg, sides] of groups) for (const key of ['1', '-1']) {
      const list = sides[key].sort((a, b) => a.hs0 - b.hs0);
      for (let i = 0; i + 1 < list.length; i++) {
        const a = list[i], b = list[i + 1];
        if (a.end > b.start) { const m = (a.hs1 + b.hs0) / 2; a.end = m; b.start = m; b.shared = true; }
      }
      for (const p of list) {
        const P = (along, out) => [sg.ax + p.tx * along + p.nx * out, sg.az + p.tz * along + p.nz * out];
        const w = p.end - p.start;
        const [ax, az] = P(p.start, p.front), [bx, bz] = P(p.end, p.front);
        addFence({ ax, az, bx, bz, gaps: w > 9 ? [[w - 4.6, w - 1.2]] : [] });
        const [cx, cz] = P(p.end, p.back);
        addFence({ ax: bx, az: bz, bx: cx, bz: cz });
        if (!p.shared) { const [dx, dz] = P(p.start, p.back); addFence({ ax, az, bx: dx, bz: dz }); }
        const [ex, ez] = P(p.start, p.back);
        addFence({ ax: ex, az: ez, bx: cx, bz: cz });
      }
    }
  }

  function segDist(x, z, s) {
    const dx = s.bx - s.ax, dz = s.bz - s.az;
    const l2 = dx * dx + dz * dz || 1;
    let t = ((x - s.ax) * dx + (z - s.az) * dz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = s.ax + t * dx, qz = s.az + t * dz;
    return { d: Math.hypot(x - qx, z - qz), t };
  }

  // Full description of a column. Result object is reused, so copy what you keep.
  const out = { ground: GROUND_Y, surf: B.GROUND, water: -1, deck: -1, b: null, road: false, site: null, sand: false, luClass: 0, roadName: '' };
  function column(x, z) {
    const e = lookup(x, z);
    const px = x + 0.5, pz = z + 0.5;
    let water = false, sand = false;
    const rv = e.rivers;
    for (let i = 0; i < rv.length; i++) {
      const s = rv[i], q = segDist(px, pz, s), r = s.w / 2;
      if (q.d <= r) water = true;
      if (q.d <= r + 4) sand = true;
    }
    const wp = e.waters;
    for (let i = 0; i < wp.length; i++) if (pointInPoly(wp[i].p, px, pz)) { water = true; sand = true; }

    let site = null;
    const st = e.sites;
    for (let i = 0; i < st.length; i++) {
      const s = st[i];
      if (px >= s.x0 && px <= s.x1 && pz >= s.z0 && pz <= s.z1) { site = s; water = false; }
    }
    out.b = null; out.road = false; out.deck = -1; out.site = site; out.luClass = landuse(px, pz); out.sand = sand;
    out.ground = GROUND_Y; out.surf = B.GROUND; out.water = -1; out.roadName = ''; out.fence = false;
    if (site) return out;

    const list = e.blds;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (px >= b.x0 && px <= b.x1 && pz >= b.z0 && pz <= b.z1 && pointInPoly(b.p, px, pz)) { out.b = b; return out; }
    }
    const rd = e.roads;
    let roadD = 1e9;
    for (let i = 0; i < rd.length; i++) {
      const s = rd[i], q = segDist(px, pz, s);
      // Bridge decks are wider than the road, so a car that is slightly off-centre stays dry.
      if (water && s.r.type !== 'footway' && s.r.type !== 'path' && q.d <= s.r.w / 2 + 2.5) out.deck = GROUND_Y;
      if (q.d <= s.r.w / 2 && q.d < roadD) { roadD = q.d; out.road = true; out.roadName = s.r.name; }
    }
    if (water && out.deck < 0) out.water = GROUND_Y;
    out.fence = false;
    if (!out.road && out.water < 0) {
      const fe = e.fences;
      for (let i = 0; i < fe.length; i++) {
        const f = fe[i];
        const t = (px - f.ax) * f.dx + (pz - f.az) * f.dz;
        if (t < 0 || t > f.len) continue;
        const d = Math.abs((px - f.ax) * f.dz - (pz - f.az) * f.dx);
        if (d < 0.5 && fenceAllowedAt(f, t)) { out.fence = true; break; }
      }
    }
    return out;
  }

  // ---------- trees: far fewer than before, one candidate per 6x6 cell ----------
  function treeAt(cellX, cellZ) {
    const r = hash(cellX * 3 + 11, cellZ * 7 - 5);
    const tx = cellX * 6 + hashI(cellX, cellZ + 1000, 6), tz = cellZ * 6 + hashI(cellX + 1000, cellZ, 6);
    const c = landuse(tx, tz);
    let density = c === LU.FOREST ? 0.05 : c === LU.WETLAND ? 0.02 : c === LU.CEMETERY ? 0.03 : c === LU.GRASS ? 0.002 : c === LU.STEPPE ? 0.0003 : 0;
    // Willows line the riverbanks.
    let riverside = false;
    for (const rv of lookup(tx, tz).rivers) { const d = segDist(tx + 0.5, tz + 0.5, rv).d - rv.w / 2; if (d > 4 && d < 15) riverside = true; }
    if (riverside) density = Math.max(density, 0.035);
    if (r > density) return null;
    for (const [ox, oz] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const q = column(tx + ox, tz + oz);
      if (q.b || q.road || q.site || q.water >= 0 || q.sand) return null;
    }
    const k = hash(cellX + 7, cellZ + 3), hh = hash(cellX + 2, cellZ);
    let type;
    if (riverside && c !== LU.FOREST) type = k < 0.7 ? 'willow' : 'birch';
    else if (c === LU.FOREST) type = k < 0.45 ? 'pine' : 'birch';
    else if (c === LU.CEMETERY) type = k < 0.5 ? 'birch' : 'poplar';
    else type = k < 0.35 ? 'poplar' : k < 0.7 ? 'birch' : 'broad';
    const H = { pine: [9, 4], poplar: [12, 4], birch: [8, 3], broad: [6, 3], willow: [7, 2] }[type];
    return { x: tx + 0.5, z: tz + 0.5, y: TOP, type, h: H[0] + hh * H[1] };
  }

  // Sparse low plants, so the flat ground is not bare up close.
  function floraAt(x, z, cls) {
    const r = hash(x + 91, z - 37);
    if (cls === LU.STEPPE) return r < 0.012 ? B.DRY_PLANT : r < 0.014 ? B.FLOWER_YELLOW : 0;
    if (cls === LU.GRASS || cls === LU.FOREST) return r < 0.016 ? B.GRASS_PLANT : r < 0.018 ? B.FLOWER_BLUE : r < 0.02 ? B.FLOWER_WHITE : 0;
    return 0;
  }

  // ---------- chunk volumes ----------
  const CS = 32, VS = 34; // volume has a 1-block margin on each side, so meshes need no neighbours
  function generateVolume(cx, cz) {
    const wx0 = cx * CS - 1, wz0 = cz * CS - 1;
    const minY = GROUND_Y - 1;
    let maxY = GROUND_Y + 6;
    const near = sites.filter((s) => s.stamp && s.x1 >= wx0 && s.x0 <= wx0 + VS && s.z1 >= wz0 && s.z0 <= wz0 + VS);
    near.forEach((s) => { if (s.top > maxY) maxY = s.top; });
    const interiors = lookup(wx0 + 17, wz0 + 17).blds.filter((b) => b.interior);
    interiors.forEach((b) => { if (b.top + 1 > maxY) maxY = b.top + 1; });
    const H = maxY - minY + 1, stride = VS * VS;
    const vol = new Uint8Array(stride * H);
    const set = (x, y, z, id) => {
      const i = x - wx0, k = z - wz0, j = y - minY;
      if (i < 0 || k < 0 || i >= VS || k >= VS || j < 0 || j >= H) return;
      vol[i + k * VS + j * stride] = id;
    };
    for (let k = 0; k < VS; k++) for (let i = 0; i < VS; i++) {
      const x = wx0 + i, z = wz0 + k, base = i + k * VS;
      const c = column(x, z);
      vol[base] = B.GROUND; vol[base + stride] = B.GROUND;
      if (c.b) {
        const b = c.b;
        if (!(b.interior && b.interior(x, z, set))) for (let y = TOP; y < TOP + 4; y++) vol[base + (y - minY) * stride] = B.INVIS;
      } else if (c.water >= 0) {
        for (let y = TOP; y < TOP + 3; y++) vol[base + (y - minY) * stride] = B.WATER_WALL;
      } else if (c.fence) {
        vol[base + 2 * stride] = B.INVIS; vol[base + 3 * stride] = B.INVIS;
      } else if (!c.road && !c.site && !c.sand) {
        const f = floraAt(x, z, c.luClass);
        if (f) vol[base + 2 * stride] = f;
      }
    }
    // Trees whose trunks stand in this chunk (crowns are meshes and never block anyone).
    const trees = [];
    const inner = (t) => t.x >= cx * CS && t.x < (cx + 1) * CS && t.z >= cz * CS && t.z < (cz + 1) * CS;
    for (let tz = Math.floor((cz * CS) / 6) - 1; tz <= Math.floor(((cz + 1) * CS) / 6); tz++) for (let tx = Math.floor((cx * CS) / 6) - 1; tx <= Math.floor(((cx + 1) * CS) / 6); tx++) {
      const t = treeAt(tx, tz);
      if (t && inner(t)) trees.push(t);
    }
    const extra = byChunk.get(ikey(cx, cz));
    if (extra) extra.trees.forEach((t) => trees.push(t));
    for (const s of near) s.stamp(set);
    for (const t of trees) for (let y = TOP; y < TOP + 3; y++) set(Math.floor(t.x), y, Math.floor(t.z), B.INVIS);
    const fenceSet = new Set();
    for (let oz = 0; oz < CS; oz += CELL) for (let ox = 0; ox < CS; ox += CELL) lookup(cx * CS + ox, cz * CS + oz).fences.forEach((f) => fenceSet.add(f));
    return { vol, minY, H, wx0, wz0, cx, cz, trees, blds: extra ? extra.blds : [], roofs: extra ? extra.roofs : [], fences: [...fenceSet] };
  }

  // English street names. The data keeps the Russian originals from OpenStreetMap; the screen shows these.
  const EN_NAMES = { 'улица Акмуллы': 'Akmulla St', 'проспект Салавата Юлаева': 'Salavat Yulaev Ave', 'улица Салавата Юлаева': 'Salavat Yulaev St', 'улица Таналык': 'Tanalyk St' };
  const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  const romanize = (s) => s.replace(/[А-Яа-яЁё]/g, (ch) => { const l = ch.toLowerCase(), t = TR[l] === undefined ? '' : TR[l]; return ch === l ? t : t.charAt(0).toUpperCase() + t.slice(1); });
  const enCache = new Map();
  function enName(ru) {
    if (!ru) return '';
    let e = enCache.get(ru);
    if (e !== undefined) return e;
    e = EN_NAMES[ru];
    if (!e) {
      let s = ru, suffix = '';
      for (const [word, en] of [['улица', 'St'], ['проспект', 'Ave'], ['переулок', 'Lane']]) {
        if (new RegExp('(^|\\s)' + word + '(\\s|$)').test(s)) { s = s.replace(word, '').trim(); suffix = ' ' + en; }
      }
      e = romanize(s) + suffix;
    }
    enCache.set(ru, e);
    return e;
  }

  function roadNameAt(x, z) {
    const c = column(Math.floor(x), Math.floor(z));
    if (c.road && c.roadName) return enName(c.roadName);
    // otherwise the closest named road nearby
    const list = lookup(x, z).roads;
    let best = 26, name = '';
    for (const s of list) { if (!s.r.name) continue; const q = segDist(x, z, s); if (q.d < best) { best = q.d; name = s.r.name; } }
    return enName(name);
  }

  G.world = {
    D, bounds, ABROAD, CS, VS, TOP, GROUND_Y, column, generateVolume, treeAt, fences, addFence, fenceAllowedAt, buildHouseFences, landuse, LU, roads, buildings, buildingAt, inB, addSite, addRoof, addFlat, addFarBox, addTree, flats, farBoxes, sites,
    hash, hashI, roadNameAt, enName, pointInPoly, lookup, segDist, elevation: () => GROUND_Y + 0.5,
  };
})();
