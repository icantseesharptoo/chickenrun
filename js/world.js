// Turns the baked map (data/akyar.js) into voxel columns: terrain, water, roads, buildings, sites.
// Every column is a pure function of (x, z), so chunks can be generated in any order.
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  const { B } = G.blocks;
  const D = window.AKYAR;
  const CELL = 32;
  const BANK = 18;
  const bounds = D.meta.bounds;

  const decode16 = (b64) => {
    const bin = atob(b64), out = new Int16Array(bin.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8);
    return out;
  };
  const dem = Object.assign({}, D.dem, { v: decode16(D.dem.b64) });
  const demFar = Object.assign({}, D.demFar, { v: decode16(D.demFar.b64) });

  function sampleGrid(g, x, z) {
    const fx = Math.max(0, Math.min(g.w - 1.001, (x - g.x0) / g.step));
    const fz = Math.max(0, Math.min(g.h - 1.001, (z - g.z0) / g.step));
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, w = g.w, v = g.v;
    const a = v[ix + iz * w] * (1 - tx) + v[ix + 1 + iz * w] * tx;
    const b = v[ix + (iz + 1) * w] * (1 - tx) + v[ix + 1 + (iz + 1) * w] * tx;
    return (a * (1 - tz) + b * tz) / 10;
  }
  const elevation = (x, z) => sampleGrid(dem, x, z);
  const elevationFar = (x, z) => sampleGrid(demFar, x, z);

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
  function addToIndex(kind, item, x0, z0, x1, z1) {
    for (let cz = cellOf(z0); cz <= cellOf(z1); cz++) for (let cx = cellOf(x0); cx <= cellOf(x1); cx++) {
      const k = cx * 100000 + cz;
      let e = index.get(k);
      if (!e) index.set(k, (e = { roads: [], blds: [], rivers: [], waters: [], sites: [] }));
      e[kind].push(item);
    }
  }
  const EMPTY = { roads: [], blds: [], rivers: [], waters: [], sites: [] };
  const lookup = (x, z) => index.get(cellOf(x) * 100000 + cellOf(z)) || EMPTY;

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

  // Rivers / ponds
  D.rivers.forEach((rv) => {
    for (let i = 0; i + 3 < rv.p.length; i += 2) {
      const ax = rv.p[i], az = rv.p[i + 1], bx = rv.p[i + 2], bz = rv.p[i + 3];
      const m = rv.w / 2 + BANK + 2;
      addToIndex('rivers', { ax, az, bx, bz, w: rv.w, l0: rv.l[i / 2], l1: rv.l[i / 2 + 1] }, Math.min(ax, bx) - m, Math.min(az, bz) - m, Math.max(ax, bx) + m, Math.max(az, bz) + m);
    }
  });
  D.waters.forEach((wt) => {
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (let i = 0; i < wt.p.length; i += 2) {
      x0 = Math.min(x0, wt.p[i]); x1 = Math.max(x1, wt.p[i]); z0 = Math.min(z0, wt.p[i + 1]); z1 = Math.max(z1, wt.p[i + 1]);
      const j = (i + 2) % wt.p.length;
      const ax = wt.p[i], az = wt.p[i + 1], bx = wt.p[j], bz = wt.p[j + 1], m = BANK + 2;
      addToIndex('rivers', { ax, az, bx, bz, w: 0, l0: wt.l, l1: wt.l }, Math.min(ax, bx) - m, Math.min(az, bz) - m, Math.max(ax, bx) + m, Math.max(az, bz) + m);
    }
    addToIndex('waters', wt, x0, z0, x1, z1);
  });

  // ---------- buildings ----------
  const WALLSETS = [
    ['WALL_BLUE', 'WIN_BLUE'], ['WALL_GREEN', 'WIN_GREEN'], ['WALL_WHITE', 'WIN_WHITE'], ['WALL_YELLOW', 'WIN_YELLOW'],
    ['WALL_TEAL', 'WIN_TEAL'], ['WALL_PEACH', 'WIN_PEACH'], ['WALL_LOG', 'WIN_LOG'], ['BRICK_WHITE', 'WIN_WHITEBRICK'],
  ];
  const ROOFS = ['ROOF_RED', 'ROOF_GREEN', 'ROOF_BLUE', 'ROOF_GRAY', 'ROOF_BROWN'];

  const buildings = D.buildings.map((d, i) => {
    const p = d.p;
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9, sx = 0, sz = 0;
    const heights = [];
    let longest = 0, ax = 1, az = 0;
    for (let k = 0; k < p.length; k += 2) {
      x0 = Math.min(x0, p[k]); x1 = Math.max(x1, p[k]); z0 = Math.min(z0, p[k + 1]); z1 = Math.max(z1, p[k + 1]);
      sx += p[k]; sz += p[k + 1];
      heights.push(elevation(p[k], p[k + 1]));
      const n = (k + 2) % p.length, ex = p[n] - p[k], ez = p[n + 1] - p[k + 1], l = Math.hypot(ex, ez);
      if (l > longest) { longest = l; ax = ex / l; az = ez / l; }
    }
    heights.sort((a, b) => a - b);
    const n = p.length / 2;
    const b = { i, k: d.k, name: d.n, p, x0, z0, x1, z1, cx: sx / n, cz: sz / n, ax, az, base: Math.floor(heights[heights.length >> 1]) + 1 };
    // Ridge axis coordinates for pitched roofs.
    let v0 = 1e9, v1 = -1e9;
    for (let k = 0; k < p.length; k += 2) { const v = -(p[k] - b.cx) * az + (p[k + 1] - b.cz) * ax; v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    b.v0 = v0; b.v1 = v1;
    const r = hash(i, 91);
    const levels = d.l;
    switch (d.k) {
      case 'shed': b.h = 3; b.wall = hash(i, 3) < 0.5 ? 'METAL' : 'PLANKS'; b.win = b.wall; b.roof = 'ROOF_GRAY'; b.pitch = 0.45; break;
      case 'house': { const w = WALLSETS[hashI(i, 17, WALLSETS.length)]; b.h = (levels || 1) * 3; b.wall = w[0]; b.win = w[1]; b.roof = ROOFS[hashI(i, 29, ROOFS.length)]; b.pitch = 0.55; break; }
      case 'apartments': b.h = (levels || 5) * 3; b.wall = 'BRICK_WHITE'; b.win = 'WIN_WHITEBRICK'; b.roof = 'FLAT_ROOF'; b.pitch = 0; break;
      case 'civic': b.h = (levels || 2 + (r < 0.5 ? 1 : 0)) * 4; b.wall = r < 0.5 ? 'BRICK_RED' : 'PLASTER'; b.win = r < 0.5 ? 'WIN_BRICK' : 'WIN_PLASTER'; b.roof = 'FLAT_ROOF'; b.pitch = 0; break;
      case 'retail': case 'shop': b.h = (levels || 1) * 5; b.wall = 'PLASTER'; b.win = 'WIN_PLASTER'; b.roof = 'FLAT_ROOF'; b.pitch = 0; break;
      case 'industrial': b.h = 6; b.wall = 'METAL'; b.win = 'METAL'; b.roof = 'ROOF_GRAY'; b.pitch = 0.2; break;
      case 'work': b.h = 6; b.wall = 'BRICK_RED'; b.win = 'WIN_BRICK'; b.roof = 'FLAT_ROOF'; b.pitch = 0; break;
      case 'big': b.h = (levels || 2) * 3 + 1; b.wall = r < 0.5 ? 'CONCRETE' : 'BRICK_RED'; b.win = r < 0.5 ? 'WIN_CONCRETE' : 'WIN_BRICK'; b.roof = 'ROOF_GRAY'; b.pitch = 0.15; break;
      case 'mosque': b.h = 7; b.wall = 'PLASTER'; b.win = 'WIN_PLASTER'; b.roof = 'DOME_GREEN'; b.pitch = 0.7; b.tower = 'DOME_GREEN'; break;
      case 'church': b.h = 7; b.wall = 'PLASTER'; b.win = 'WIN_PLASTER'; b.roof = 'ROOF_BLUE'; b.pitch = 0.7; b.tower = 'DOME_GOLD'; break;
      default: b.h = 3; b.wall = 'CONCRETE'; b.win = 'CONCRETE'; b.roof = 'ROOF_GRAY'; b.pitch = 0.3;
    }
    if (b.tower) { b.tx = Math.floor(p[0] + (b.cx - p[0]) * 0.18); b.tz = Math.floor(p[1] + (b.cz - p[1]) * 0.18); }
    b.roofRise = b.pitch ? Math.min(b.k === 'big' || b.k === 'industrial' ? 3 : 6, Math.ceil(((v1 - v0) / 2) * b.pitch)) : 0;
    b.top = b.base + b.h + b.roofRise + (b.tower ? 12 : 1);
    addToIndex('blds', b, x0 - 1, z0 - 1, x1 + 1, z1 + 1);
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

  // Decorative front door: the footprint edge midpoint nearest a road, walked inward onto a wall cell.
  function doorCell(b) {
    if (b.door !== undefined) return b.door;
    let best = 1e12, bm = null;
    for (let k = 0; k < b.p.length; k += 2) {
      const n = (k + 2) % b.p.length;
      const mx = (b.p[k] + b.p[n]) / 2, mz = (b.p[k + 1] + b.p[n + 1]) / 2;
      let d = 900;
      const near = lookup(mx, mz).roads;
      for (let s = 0; s < near.length; s++) d = Math.min(d, segDist(mx, mz, near[s]).d);
      if (d < best) { best = d; bm = [mx, mz]; }
    }
    let dx = b.cx - bm[0], dz = b.cz - bm[1];
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    b.door = null;
    for (let t = 0; t < 4; t += 0.4) {
      const x = Math.floor(bm[0] + dx * t), z = Math.floor(bm[1] + dz * t);
      if (inB(b, x, z)) { b.door = [x, z]; break; }
    }
    return b.door;
  }

  // ---------- special sites registered by sites.js ----------
  const sites = [];
  function addSite(s) {
    sites.push(s);
    const m = s.blend || 0;
    addToIndex('sites', s, s.x0 - m, s.z0 - m, s.x1 + m, s.z1 + m);
  }

  function segDist(x, z, s) {
    const dx = s.bx - s.ax, dz = s.bz - s.az;
    const l2 = dx * dx + dz * dz || 1;
    let t = ((x - s.ax) * dx + (z - s.az) * dz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = s.ax + t * dx, qz = s.az + t * dz;
    return { d: Math.hypot(x - qx, z - qz), t };
  }
  const smooth = (k) => k * k * (3 - 2 * k);

  // Full description of a column. Result object is reused, so copy what you keep.
  const out = { ground: 0, surf: 0, water: -1, deck: -1, b: null, road: false, site: null, sand: false, luClass: 0 };
  function column(x, z) {
    const e = lookup(x, z);
    const px = x + 0.5, pz = z + 0.5;
    const raw = elevation(px, pz);
    const cls = landuse(px, pz);
    let surf;
    switch (cls) {
      case LU.FOREST: surf = B.FOREST; break;
      case LU.INDUSTRIAL: case LU.CONSTRUCTION: surf = B.GRAVEL; break;
      case LU.STEPPE: surf = B.STEPPE; break;
      case LU.WETLAND: surf = B.FOREST; break;
      case LU.PITCH: surf = B.GRASS; break;
      case LU.PARKING: surf = B.ASPHALT; break;
      case LU.PLAYGROUND: surf = B.SAND; break;
      default: surf = B.GRASS;
    }
    // Outside town proper the map has no landuse tag: blend in dry steppe colouring.
    if (cls === LU.GRASS && hash(x >> 4, z >> 4) < 0.22) surf = B.STEPPE;

    let g = raw, water = -1, sand = false, bestD = 1e9;
    const rv = e.rivers;
    for (let i = 0; i < rv.length; i++) {
      const s = rv[i], q = segDist(px, pz, s), r = s.w / 2;
      if (q.d > r + BANK) continue;
      const edge = q.d - r;
      if (edge < bestD) {
        bestD = edge;
        const lvl = s.l0 + (s.l1 - s.l0) * q.t;
        if (edge <= 0) { water = Math.floor(lvl); g = water - (edge < -2 ? 2 : 1); sand = true; }
        else {
          water = -1;
          const k = smooth(Math.min(1, edge / BANK));
          g = lvl + 1 + (raw - (lvl + 1)) * k;
          sand = edge < 3;
        }
      }
    }
    const wp = e.waters;
    for (let i = 0; i < wp.length; i++) if (pointInPoly(wp[i].p, px, pz)) { water = wp[i].l; g = water - 2; sand = true; }
    if (sand) surf = B.SAND;

    // Sites: flatten to the site's level, blending into terrain around it.
    let site = null;
    const st = e.sites;
    for (let i = 0; i < st.length; i++) {
      const s = st[i];
      const dx = Math.max(s.x0 - px, 0, px - s.x1), dz = Math.max(s.z0 - pz, 0, pz - s.z1);
      const d = Math.hypot(dx, dz);
      if (d === 0) { site = s; g = s.y - 1; water = -1; surf = s.surf || B.GRASS; }
      else if (s.blend && d < s.blend) { g = (s.y - 1) + (g - (s.y - 1)) * smooth(d / s.blend); }
    }

    out.b = null; out.road = false; out.deck = -1; out.site = site; out.luClass = cls; out.sand = sand;

    if (!site) {
      const list = e.blds;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (px >= b.x0 && px <= b.x1 && pz >= b.z0 && pz <= b.z1 && pointInPoly(b.p, px, pz)) {
          out.b = b; out.ground = b.base - 1; out.surf = B.STONE; out.water = -1;
          return out;
        }
      }
      const rd = e.roads;
      let roadD = 1e9;
      for (let i = 0; i < rd.length; i++) {
        const s = rd[i], q = segDist(px, pz, s);
        // Bridge decks are wider than the road, so a car that is slightly off-centre stays dry.
        if (water >= 0 && s.r.type !== 'footway' && s.r.type !== 'path' && q.d <= s.r.w / 2 + 2.5) out.deck = water + 1;
        if (q.d <= s.r.w / 2 && q.d < roadD) {
          roadD = q.d; out.road = true;
          const r = s.r;
          surf = r.surf === 'asphalt' ? B.ASPHALT : r.surf === 'gravel' ? B.GRAVEL : B.DIRT_ROAD;
          if (r.line && q.d < 0.5 && Math.floor((s.run + q.t * s.len) / 4) % 2 === 0) surf = B.ROAD_LINE;
          out.roadName = r.name;
        }
      }
      if (out.road && water >= 0) out.deck = water + 1;
    }
    out.ground = Math.floor(g);
    out.surf = surf;
    out.water = water;
    return out;
  }

  // Stack blocks for an OSM building column into the chunk setter.
  function buildingStack(b, x, z, set) {
    if (b.interior && b.interior(x, z, set)) return;
    const base = b.base, h = b.h, top = base + h;
    const perim = !(inB(b, x + 1, z) && inB(b, x - 1, z) && inB(b, x, z + 1) && inB(b, x, z - 1));
    const wall = B[b.wall], win = B[b.win];
    const door = perim ? doorCell(b) : null;
    const isDoor = door && door[0] === x && door[1] === z;
    const floors = b.k === 'civic' ? 4 : 3;
    for (let y = base; y < top; y++) {
      let c = wall;
      if (perim && win !== wall) {
        const fy = y - base;
        if (fy % floors === 1 && (b.k === 'house' ? (x + z) % 3 !== 0 : (x + z) % 2 === 0)) c = win;
      }
      if (isDoor && y - base < 2) c = B.DOOR_DECOR;
      set(x, y, z, c);
    }
    const roof = B[b.roof];
    if (b.roofRise) {
      const v = -(x + 0.5 - b.cx) * b.az + (z + 0.5 - b.cz) * b.ax;
      const r = Math.min(b.roofRise, Math.floor(Math.min(v - b.v0, b.v1 - v) * b.pitch));
      for (let y = top; y <= top + Math.max(0, r); y++) set(x, y, z, roof);
    } else {
      set(x, top, z, perim ? wall : roof);
    }
    if (b.tower) {
      const dx = x - b.tx, dz = z - b.tz, d = Math.max(Math.abs(dx), Math.abs(dz));
      if (d <= 1) for (let y = top; y < top + 8 - d; y++) set(x, y, z, d === 0 && y > top + 6 ? B[b.tower] : B.PLASTER);
      if (d === 0) for (let y = top + 7; y < top + 11; y++) set(x, y, z, B[b.tower]);
    }
  }

  // ---------- trees: one candidate per 6x6 cell ----------
  function treeAt(cellX, cellZ) {
    const r = hash(cellX * 3 + 11, cellZ * 7 - 5);
    const tx = cellX * 6 + hashI(cellX, cellZ + 1000, 6), tz = cellZ * 6 + hashI(cellX + 1000, cellZ, 6);
    const c = landuse(tx, tz);
    const density = c === LU.FOREST ? 0.6 : c === LU.WETLAND ? 0.35 : c === LU.CEMETERY ? 0.25 : c === LU.GRASS ? 0.035 : c === LU.STEPPE ? 0.006 : 0;
    if (r > density) return null;
    for (const [ox, oz] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const q = column(tx + ox, tz + oz);
      if (q.b || q.road || q.site || q.water >= 0 || q.sand) return null;
    }
    const q = column(tx, tz);
    return { x: tx, z: tz, y: q.ground + 1, birch: hash(cellX + 7, cellZ + 3) < 0.45, h: 7 + hashI(cellX + 2, cellZ, 4) }; // crown clears a car and a walker
  }

  function stampTree(t, set) {
    const trunk = t.birch ? B.BIRCH : B.LOG, leaf = t.birch ? B.BIRCH_LEAVES : B.LEAVES;
    const top = t.y + t.h;
    const R = t.birch ? 2 : 3;
    for (let y = top - R - 1; y <= top + 1; y++) {
      const ry = y - top;
      const rad = ry >= 1 ? 1 : ry === 0 ? R - 1 : R;
      for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
        if (Math.abs(dx) === rad && Math.abs(dz) === rad && hash(t.x + dx * 13 + y, t.z + dz * 5) < 0.6) continue;
        set(t.x + dx, y, t.z + dz, leaf, true);
      }
    }
    for (let y = t.y; y < top; y++) set(t.x, y, t.z, trunk);
  }

  // Surface flora for a plain ground column.
  function floraAt(x, z, surf, lu_) {
    const r = hash(x + 91, z - 37);
    if (surf === B.STEPPE) return r < 0.12 ? B.DRY_PLANT : r < 0.135 ? B.FLOWER_YELLOW : 0;
    if (surf === B.GRASS) {
      if (lu_ === LU.PITCH) return 0;
      return r < 0.08 ? B.GRASS_PLANT : r < 0.09 ? B.FLOWER_BLUE : r < 0.1 ? B.FLOWER_WHITE : r < 0.105 ? B.FLOWER_YELLOW : 0;
    }
    if (surf === B.FOREST) return r < 0.14 ? B.GRASS_PLANT : r < 0.15 ? B.FLOWER_WHITE : 0;
    return 0;
  }

  // ---------- chunk volumes ----------
  const CS = 32, VS = 34; // volume has a 1-block margin on each side, so meshes need no neighbours
  function generateVolume(cx, cz) {
    const wx0 = cx * CS - 1, wz0 = cz * CS - 1;
    const cols = new Array(VS * VS);
    let minG = 1e9, maxG = -1e9;
    for (let k = 0; k < VS; k++) for (let i = 0; i < VS; i++) {
      const c = column(wx0 + i, wz0 + k);
      const copy = { ground: c.ground, surf: c.surf, water: c.water, deck: c.deck, b: c.b, road: c.road, site: c.site, cls: c.luClass };
      cols[i + k * VS] = copy;
      if (copy.ground < minG) minG = copy.ground;
      let t = copy.ground;
      if (copy.water > t) t = copy.water;
      if (copy.deck > t) t = copy.deck;
      if (copy.b && copy.b.top > t) t = copy.b.top;
      if (t > maxG) maxG = t;
    }
    const cell = lookup(wx0 + 2, wz0 + 2);
    cell.sites.forEach((s) => { if (s.top > maxG) maxG = s.top; });
    const minY = minG - 2, maxY = maxG + 14, H = maxY - minY + 1;
    const stride = VS * VS;
    const vol = new Uint8Array(stride * H);
    const set = (x, y, z, id, onlyIfEmpty) => {
      const i = x - wx0, k = z - wz0, j = y - minY;
      if (i < 0 || k < 0 || i >= VS || k >= VS || j < 0 || j >= H) return;
      const idx = i + k * VS + j * stride;
      if (onlyIfEmpty && vol[idx] && vol[idx] !== B.GRASS_PLANT && vol[idx] !== B.DRY_PLANT) return;
      vol[idx] = id;
    };
    for (let k = 0; k < VS; k++) for (let i = 0; i < VS; i++) {
      const c = cols[i + k * VS];
      const x = wx0 + i, z = wz0 + k, g = c.ground, base = i + k * VS;
      const stoneTop = g - 3;
      for (let y = minY; y < g; y++) vol[base + (y - minY) * stride] = y <= stoneTop ? B.STONE : B.DIRT;
      vol[base + (g - minY) * stride] = c.surf;
      if (c.water >= 0) for (let y = g + 1; y <= c.water; y++) vol[base + (y - minY) * stride] = B.WATER;
      if (c.deck >= 0) { vol[base + (c.deck - minY) * stride] = B.PLANKS; }
      if (c.b) buildingStack(c.b, x, z, set);
      else if (!c.road && !c.site && c.water < 0) {
        const f = floraAt(x, z, c.surf, c.cls);
        if (f) vol[base + (g + 1 - minY) * stride] = f;
      }
    }
    // Trees from this cell and neighbours whose crowns can overlap.
    const tc0x = Math.floor((wx0 - 4) / 6), tc1x = Math.floor((wx0 + VS + 4) / 6);
    const tc0z = Math.floor((wz0 - 4) / 6), tc1z = Math.floor((wz0 + VS + 4) / 6);
    for (let tz = tc0z; tz <= tc1z; tz++) for (let tx = tc0x; tx <= tc1x; tx++) {
      const t = treeAt(tx, tz);
      if (t) stampTree(t, set);
    }
    // Hand-built sites overwrite everything.
    for (const s of sites) {
      if (s.stamp && s.x1 >= wx0 && s.x0 <= wx0 + VS && s.z1 >= wz0 && s.z0 <= wz0 + VS) s.stamp(set);
    }
    return { vol, minY, H, wx0, wz0 };
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

  G.world = { D, bounds, CS, VS, column, generateVolume, elevation, elevationFar, landuse, LU, roads, buildings, buildingAt, inB, addSite, sites, hash, hashI, dem, demFar, roadNameAt, enName, pointInPoly, lookup, segDist };
})();
