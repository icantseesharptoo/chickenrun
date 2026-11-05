// Hand-built places stamped into the real map: the homestead, the shop interior, the workplace interior.
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  const { B } = G.blocks;
  const W = G.world;
  const D = W.D;

  const doors = []; // { x, y, z, along:'x'|'z', swing:±1, id, locked }

  // ---------- Homestead ----------
  const H = D.home, S = H.size;
  const toWorld = {
    n: (u, v) => [H.x + u, H.z + v],
    s: (u, v) => [H.x + S - 1 - u, H.z + S - 1 - v],
    w: (u, v) => [H.x + v, H.z + S - 1 - u],
    e: (u, v) => [H.x + S - 1 - v, H.z + u],
  }[H.gate];
  const homeY = W.TOP;
  const TI = G.blocks.tileIndex;
  // A pitched roof mesh over local cells u0..u1, v0..v1, with its ridge along u.
  const homeRoof = (u0, u1, v0, v1, y, rise, roofT, wallT) => {
    const a = toWorld(u0, v0), b = toWorld(u1, v1);
    W.addRoof({
      x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]) + 1, z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) + 1,
      y: homeY + y, rise, roofT, wallT, ridge: H.gate === 'n' || H.gate === 's' ? 'x' : 'z',
    });
  };

  const cmds = [];
  const put = (u, y, v, id) => { const [x, z] = toWorld(u, v); cmds.push(x, homeY + y, z, id); };
  const box = (u0, u1, y0, y1, v0, v1, id) => { for (let y = y0; y <= y1; y++) for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) put(u, y, v, id); };

  // Fence with a gate gap on the road side.
  for (let i = 0; i < S; i++) {
    if (i < 15 || i > 18) put(i, 0, 0, B.FENCE);
    put(i, 0, S - 1, B.FENCE);
    put(0, 0, i, B.FENCE);
    put(S - 1, 0, i, B.FENCE);
  }
  // Yard paths, vegetable beds, flowers
  box(15, 18, -1, -1, 0, 16, B.DIRT_ROAD);
  box(9, 14, -1, -1, 14, 16, B.DIRT_ROAD);
  box(3, 11, -1, -1, 3, 11, B.SOIL);
  for (let v = 3; v <= 11; v += 2) for (let u = 3; u <= 11; u++) put(u, 0, v, B.CROP);
  for (const u of [5, 6, 7, 8, 12, 13, 14]) put(u, 0, 16, u % 2 ? B.FLOWER_BLUE : B.FLOWER_YELLOW);
  for (let i = 0; i < 70; i++) {
    const u = 1 + W.hashI(i, 5, S - 2), v = 1 + W.hashI(i, 9, S - 2);
    const free = !(u >= 3 && u <= 18 && v <= 16) && !(u >= 3 && u <= 18 && v >= 16) && !(u >= 21 && u <= 31 && v >= 5);
    if (free) put(u, 0, v, W.hash(i, 3) < 0.75 ? B.GRASS_PLANT : B.FLOWER_WHITE);
  }

  // ---------- House: u 4..16, v 17..27. Front door on v=17, facing the gate ----------
  const U0 = 4, U1 = 16, V0 = 17, V1 = 27;
  box(U0 + 1, U1 - 1, -1, -1, V0 + 1, V1 - 1, B.PLANKS);
  for (let y = 0; y <= 2; y++) for (let v = V0; v <= V1; v++) for (let u = U0; u <= U1; u++) {
    if (u === U0 || u === U1 || v === V0 || v === V1) put(u, y, v, B.WALL_BLUE);
    else put(u, y, v, 0);
  }
  // Windows with painted frames
  for (const u of [7, 13]) { put(u, 1, V0, B.WIN_BLUE); put(u, 1, V1, B.WIN_BLUE); }
  for (const v of [20, 24]) { put(U0, 1, v, B.WIN_BLUE); put(U1, 1, v, B.WIN_BLUE); }
  // Door opening (door mesh is added below)
  put(10, 0, V0, 0); put(10, 1, V0, 0);
  // Pitched roof with overhang, ridge along u
  for (let v = V0; v <= V1; v++) for (let u = U0; u <= U1; u++) if (u === U0 || u === U1 || v === V0 || v === V1) put(u, 3, v, B.WALL_BLUE);
  box(U0 + 1, U1 - 1, 3, 3, V0 + 1, V1 - 1, B.PLANKS); // ceiling
  homeRoof(U0 - 1, U1 + 1, V0 - 1, V1 + 1, 4, 3.6, TI.roof_green, TI.wall_white);
  // Chimney
  box(15, 15, 3, 8, 19, 19, B.BRICK_RED);
  // Porch
  box(9, 11, -1, -1, 15, 16, B.PLANKS);
  // Partition between kitchen and bedroom
  box(U0 + 1, U1 - 1, 0, 2, 22, 22, B.WALL_WHITE);
  put(10, 0, 22, 0); put(10, 1, 22, 0);
  // Kitchen
  box(5, 6, 0, 1, 18, 18, B.CUPBOARD);
  box(7, 8, 0, 0, 20, 20, B.TABLE);
  put(15, 0, 18, B.STOVE_FRONT); put(15, 1, 18, B.STOVE); put(15, 2, 18, B.STOVE);
  box(15, 15, 0, 1, 21, 21, B.FRIDGE);
  put(13, 0, 18, B.COUNTER); put(14, 0, 18, B.COUNTER);
  // Bedroom
  box(5, 6, 0, 0, 24, 25, B.BED);
  box(8, 13, -1, -1, 24, 25, B.RUG);
  box(10, 11, 1, 2, V1, V1, B.RUG);
  box(15, 15, 0, 1, 26, 26, B.CUPBOARD);

  // ---------- Shed: u 21..30, v 20..29 ----------
  for (let y = 0; y <= 2; y++) for (let v = 20; v <= 29; v++) for (let u = 21; u <= 30; u++) {
    if (u === 21 || u === 30 || v === 20 || v === 29) put(u, y, v, B.WALL_LOG);
    else put(u, y, v, 0);
  }
  box(22, 29, -1, -1, 21, 28, B.PLANKS);
  put(26, 0, 20, 0); put(26, 1, 20, 0);
  put(23, 1, 20, B.WIN_LOG); put(29, 1, 20, B.WIN_LOG);
  for (let v = 20; v <= 29; v++) for (let u = 21; u <= 30; u++) if (u === 21 || u === 30 || v === 20 || v === 29) put(u, 3, v, B.WALL_LOG);
  box(22, 29, 3, 3, 21, 28, B.PLANKS);
  homeRoof(20, 31, 19, 30, 4, 2.8, TI.roof_brown, TI.wall_log);
  put(22, 0, 21, B.SACK); put(23, 0, 21, B.SACK); put(22, 1, 21, B.SACK);
  box(27, 29, 0, 1, 26, 28, B.HAY); put(29, 2, 28, B.HAY);
  put(25, 0, 28, B.CHEST);
  put(22, 0, 28, B.CRATE); put(22, 1, 28, B.CRATE); put(23, 0, 28, B.CRATE);

  // ---------- Chicken coop: u 24..30, v 5..10 ----------
  for (let y = 0; y <= 1; y++) for (let v = 5; v <= 10; v++) for (let u = 24; u <= 30; u++) {
    if (u === 24 || u === 30 || v === 5 || v === 10) put(u, y, v, B.WALL_LOG);
    else put(u, y, v, 0);
  }
  box(25, 29, -1, -1, 6, 9, B.STRAW);
  put(24, 0, 8, 0); put(24, 1, 8, 0);
  homeRoof(23, 31, 4, 11, 2, 1.5, TI.roof_red, TI.wall_log);
  box(22, 23, 0, 0, 13, 13, B.TROUGH);
  put(29, 0, 14, B.HAY); put(30, 0, 14, B.HAY); put(29, 1, 14, B.HAY);

  // Yard trees
  const yardTree = (u, v, birch, h) => { const [x, z] = toWorld(u, v); W.addTree(x + 0.5, z + 0.5, birch, h); };
  yardTree(20, 3, true, 8);
  yardTree(2, 30, true, 7.5);
  yardTree(18, 30, false, 7);

  const worldCmds = Int32Array.from(cmds);
  const stamp = (set) => {
    for (let i = 0; i < worldCmds.length; i += 4) set(worldCmds[i], worldCmds[i + 1], worldCmds[i + 2], worldCmds[i + 3]);
  };
  W.addSite({ id: 'home', x0: H.x, z0: H.z, x1: H.x + S, z1: H.z + S, y: homeY, stamp, top: homeY + 10 });

  // Converts a local position (block centre coords) to world coordinates.
  const homePos = (u, y, v) => {
    const [x0, z0] = toWorld(Math.floor(u), Math.floor(v));
    const fu = u - Math.floor(u), fv = v - Math.floor(v);
    const r = { n: [fu, fv], s: [1 - fu, 1 - fv], w: [fv, 1 - fu], e: [1 - fv, fu] }[H.gate];
    return new THREE.Vector3(x0 + r[0], homeY + y, z0 + r[1]);
  };
  const dirV = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] }[H.gate]; // world direction of +v
  const alongU = H.gate === 'n' || H.gate === 's' ? 'x' : 'z';
  const homeDoor = (u, v, id, extra) => {
    const [x, z] = toWorld(u, v);
    const d = Object.assign({ x, y: homeY, z, along: alongU, id, swing: 1 }, extra);
    doors.push(d);
    return d;
  };
  homeDoor(10, V0, 'home');
  homeDoor(26, 20, 'shed');

  const home = {
    y: homeY, pos: homePos, dirV, x0: H.x, z0: H.z, x1: H.x + S, z1: H.z + S,
    spawn: homePos(8.5, 0, 25.5),
    spawnYaw: (() => { const a = homePos(8.5, 0, 25.5), b = homePos(10.5, 0, 22.5); return Math.atan2(-(b.x - a.x), -(b.z - a.z)); })(), // wakes up looking through the bedroom doorway
    car: homePos(17, 0, 9),
    carHeading: Math.atan2(dirV[0], dirV[1]), // nose towards the gate (forward = -sin h, -cos h)
    sack: homePos(22.5, 0.6, 21.5),
    chest: homePos(25.5, 0.6, 28.5),
    cupboard: homePos(5.5, 1, 18.5),
    keyHook: homePos(7.6, 1.02, 20.5),
    bed: homePos(5.5, 0.6, 24.5),
    fridge: homePos(15.5, 1, 21.5),
    trough: homePos(22.5, 0.7, 13.5),
    chickenArea: { u0: 19, u1: 31, v0: 2, v1: 17 },
    catArea: { u0: 2, u1: 20, v0: 1, v1: 16 },
    bowl: homePos(12.5, 0, 15.5),
    center: homePos(17, 0, 17),
  };

  // ---------- OSM buildings with real interiors ----------
  function analyse(b) {
    const cells = new Map();
    const inB = (x, z) => W.inB(b, x, z);
    const key = (x, z) => x * 100000 + z;
    let list = [];
    for (let z = Math.floor(b.z0) - 1; z <= Math.ceil(b.z1); z++) for (let x = Math.floor(b.x0) - 1; x <= Math.ceil(b.x1); x++) {
      if (inB(x, z)) { const c = { x, z, interior: inB(x + 1, z) && inB(x - 1, z) && inB(x, z + 1) && inB(x, z - 1) }; cells.set(key(x, z), c); list.push(c); }
    }
    const roadD = (x, z) => {
      let d = 200;
      for (let oz = -64; oz <= 64; oz += 32) for (let ox = -64; ox <= 64; ox += 32) {
        for (const s of W.lookup(x + ox, z + oz).roads) { if (s.r.type === 'footway' || s.r.type === 'path') continue; d = Math.min(d, W.segDist(x, z, s).d); }
      }
      return d;
    };
    let door = null, best = 1e9;
    for (const c of list) {
      if (c.interior) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const i1 = cells.get(key(c.x + dx, c.z + dz)), i2 = cells.get(key(c.x + dx * 4, c.z + dz * 4));
        if (!i1 || !i1.interior || !i2 || !i2.interior || cells.get(key(c.x - dx, c.z - dz))) continue;
        const lat1 = cells.get(key(c.x + dz, c.z + dx)), lat2 = cells.get(key(c.x - dz, c.z - dx));
        const penalty = lat1 && !lat1.interior && lat2 && !lat2.interior ? 0 : 6;
        const score = roadD(c.x, c.z) + penalty;
        if (score < best) { best = score; door = { x: c.x, z: c.z, dx, dz }; }
      }
    }
    return { cells, list, door, key };
  }

  function makeInterior(b, A, fixtures, floorId) {
    const base = b.base, top = base + b.h;
    const wall = B[b.wall], win = B[b.win];
    const d = A.door;
    b.interior = (x, z, set) => {
      const c = A.cells.get(A.key(x, z));
      if (!c) return false;
      set(x, base - 1, z, floorId);
      if (c.interior) {
        const f = fixtures.get(A.key(x, z));
        if (f) f.forEach((id, i) => { if (id) set(x, base + i, z, id); });
        set(x, top - 1, z, B.CONCRETE);
        set(x, top, z, B[b.roof]);
      } else {
        const isDoor = d.x === x && d.z === z;
        for (let y = base; y < top; y++) {
          const fy = y - base;
          if (isDoor && fy < 2) continue;
          set(x, y, z, win !== wall && fy === 2 && (x + z) % 3 === 0 ? win : wall);
        }
        set(x, top, z, wall);
      }
      if (A.wallOverride && A.wallOverride.has(A.key(x, z))) A.wallOverride.get(A.key(x, z)).forEach(([y, id]) => set(x, base + y, z, id));
      return true;
    };
    // Door mesh runs along the wall, perpendicular to the way in.
    doors.push({ x: d.x, y: base, z: d.z, along: d.dx ? 'z' : 'x', swing: 1, id: b.k });
    b.roofRise = 0; b.pitch = 0; b.top = top + 1;
  }

  const shopB = W.buildings.find((b) => b.k === 'shop');
  const workB = W.buildings.find((b) => b.k === 'work');

  // Shop: aisles of shelves + a counter by the door.
  const shop = (() => {
    const b = shopB;
    b.h = 5;
    const A = analyse(b), d = A.door, lat = [d.dz, d.dx];
    const fixtures = new Map();
    const at = (i, l) => [d.x + d.dx * i + lat[0] * l, d.z + d.dz * i + lat[1] * l];
    const isInt = (i, l) => { const q = at(i, l); const c = A.cells.get(A.key(q[0], q[1])); return c && c.interior; };
    let side = 2;
    if (!isInt(3, side) || !isInt(3, side + 1)) side = -2;
    const counterCells = [2, 3, 4].map((i) => at(i, side));
    counterCells.forEach((q) => fixtures.set(A.key(q[0], q[1]), [B.COUNTER]));
    for (const c of A.list) {
      if (!c.interior) continue;
      const rx = c.x - d.x, rz = c.z - d.z;
      const i = rx * d.dx + rz * d.dz, l = rx * lat[0] + rz * lat[1];
      if (i < 7) continue;
      const allInt = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, e]) => { const n = A.cells.get(A.key(c.x + a, c.z + e)); return n && n.interior; });
      if (!allInt) continue;
      if (((l % 4) + 4) % 4 === 2 && ((i % 12) + 12) % 12 !== 6) fixtures.set(A.key(c.x, c.z), [B.SHELF, B.SHELF]);
    }
    makeInterior(b, A, fixtures, B.FLOOR_TILE);
    const q = at(3, side);
    const sgn = Math.sign(side);
    const r = at(3, side + sgn);
    return {
      b, door: d, y: b.base,
      counter: new THREE.Vector3(q[0] + 0.5, b.base + 1, q[1] + 0.5),
      cashier: new THREE.Vector3(r[0] + 0.5, b.base, r[1] + 0.5),
      cashierYaw: Math.atan2(lat[0] * sgn, lat[1] * sgn), // faces the counter
      entrance: new THREE.Vector3(d.x + 0.5 - d.dx * 3, b.base, d.z + 0.5 - d.dz * 3),
    };
  })();

  // Workplace: a town-centre parcel depot with a crate pile, a pallet to stack on, a time clock.
  const work = (() => {
    const b = workB;
    b.h = 6;
    const A = analyse(b), d = A.door, lat = [d.dz, d.dx];
    const fixtures = new Map();
    const at = (i, l) => [d.x + d.dx * i + lat[0] * l, d.z + d.dz * i + lat[1] * l];
    const isInt = (i, l) => { const q = at(i, l); const c = A.cells.get(A.key(q[0], q[1])); return c && c.interior; };
    let depth = 2;
    while (depth < 18 && isInt(depth + 1, 0)) depth++;
    const dropI = Math.max(3, depth - 1);
    // Crate pile: the nearest spot to the door with open floor all around it, off the walking line.
    const openAround = (i, l) => { for (let a = -2; a <= 2; a++) for (let e = -2; e <= 2; e++) if (!isInt(i + a, l + e)) return false; return true; };
    let pileI = 2, pileL = 2, pileBest = 1e9;
    for (let i = 2; i <= 12; i++) for (const l of [-2, 2, -3, 3, -4, 4, -5, 5]) {
      if (openAround(i, l) && i + Math.abs(l) < pileBest) { pileBest = i + Math.abs(l); pileI = i; pileL = l; }
    }
    const pile = at(pileI, pileL);
    fixtures.set(A.key(pile[0], pile[1]), [B.CRATE, B.CRATE]);
    const keepClear = (c) => Math.abs(c.x - pile[0]) <= 2 && Math.abs(c.z - pile[1]) <= 2;
    const drop = at(dropI, 0);
    // Stacks of crates along the walls, away from the door and the walking line.
    for (const c of A.list) {
      if (!c.interior) continue;
      const nearWall = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, e]) => { const n = A.cells.get(A.key(c.x + a, c.z + e)); return n && !n.interior; });
      const rx = c.x - d.x, rz = c.z - d.z, i = rx * d.dx + rz * d.dz, l = rx * lat[0] + rz * lat[1];
      if (nearWall && i > 3 && Math.abs(l) > 2 && !keepClear(c) && W.hash(c.x, c.z) < 0.55) fixtures.set(A.key(c.x, c.z), W.hash(c.z, c.x) < 0.4 ? [B.CRATE, B.CRATE] : [B.CRATE]);
    }
    A.wallOverride = new Map();
    // Time clock on the door wall, next to the door.
    let clock = null;
    for (const l of [1, -1, 2, -2]) {
      const q = at(0, l), c = A.cells.get(A.key(q[0], q[1]));
      if (c && !c.interior && isInt(1, l)) { clock = q; A.wallOverride.set(A.key(q[0], q[1]), [[1, B.TIMECLOCK]]); break; }
    }
    if (!clock) clock = at(0, 1);
    makeInterior(b, A, fixtures, B.CONCRETE);
    return {
      b, door: d, y: b.base,
      pile: new THREE.Vector3(pile[0] + 0.5, b.base + 1, pile[1] + 0.5),
      drop: new THREE.Vector3(drop[0] + 0.5, b.base, drop[1] + 0.5),
      clock: new THREE.Vector3(clock[0] + 0.5 + d.dx * 0.5, b.base + 1.5, clock[1] + 0.5 + d.dz * 0.5),
      entrance: new THREE.Vector3(d.x + 0.5 - d.dx * 3, b.base, d.z + 0.5 - d.dz * 3),
    };
  })();

  // Quest keys, placed just outside real, named landmarks.
  function freeSpotNear(x, z) {
    for (let r = 2; r < 60; r++) for (let a = 0; a < 16; a++) {
      const px = Math.floor(x + Math.cos((a / 16) * 6.283) * r), pz = Math.floor(z + Math.sin((a / 16) * 6.283) * r);
      const c = W.column(px, pz);
      if (!c.b && !c.site && c.water < 0) return [px, pz];
    }
    return [Math.floor(x), Math.floor(z)];
  }
  const namedPlace = (n) => D.named.find((p) => p.n === n);
  const landmarks = [];
  const addLm = (id, label, where, p) => { if (p) { const [x, z] = freeSpotNear(p.x, p.z); landmarks.push({ id, label, where, x: x + 0.5, z: z + 0.5 }); } };
  addLm('key_admin', 'Administration key', 'by the Administration building', namedPlace('Администрация'));
  addLm('key_rdk', 'Culture House key', 'by the House of Culture', namedPlace('РДК'));
  const bridge = D.bridges.find((b) => b.n === 'Восточная улица') || D.bridges[0];
  if (bridge) { landmarks.push({ id: 'key_bridge', label: 'River key', where: 'on the Tanalyk river bridge', x: bridge.x, z: bridge.z }); }
  if (landmarks.length < 3) addLm('key_college', 'College key', 'by the Mining College', namedPlace('Акъярский горный колледж'));

  // ---------- Airports: one layout, used in Akyar and in every other country ----------
  const AIR_L = 380, AIR_W = 96;
  function makeFrame(side, x0, z0, x1, z1, y) {
    const toW = { n: (u, v) => [x0 + u, z0 + v], s: (u, v) => [x1 - 1 - u, z1 - 1 - v], w: (u, v) => [x0 + v, z1 - 1 - u], e: (u, v) => [x1 - 1 - v, z0 + u] }[side];
    const pos = (u, yy, v) => {
      const [wx, wz] = toW(Math.floor(u), Math.floor(v));
      const fu = u - Math.floor(u), fv = v - Math.floor(v);
      const r = { n: [fu, fv], s: [1 - fu, 1 - fv], w: [fv, 1 - fu], e: [1 - fv, fu] }[side];
      return new THREE.Vector3(wx + r[0], y + yy, wz + r[1]);
    };
    const dirU = { n: [1, 0], s: [-1, 0], w: [0, -1], e: [0, 1] }[side];
    const along = side === 'n' || side === 's' ? 'x' : 'z';
    return { toW, pos, dirU, along };
  }
  const stampOf = (cmds) => {
    const arr = Int32Array.from(cmds);
    return (set) => { for (let i = 0; i < arr.length; i += 4) set(arr[i], arr[i + 1], arr[i + 2], arr[i + 3]); };
  };
  function buildAirport(id, rect, side, title) {
    const F = makeFrame(side, rect.x0, rect.z0, rect.x1, rect.z1, W.TOP);
    const c = [];
    const put2 = (u, y, v, b) => { const [x, z] = F.toW(u, v); c.push(x, W.TOP + y, z, b); };
    const U0T = 176, U1T = 204, V0T = 6, V1T = 20, DOORU = 190;
    for (let v = V0T; v <= V1T; v++) for (let u = U0T; u <= U1T; u++) {
      const edge = u === U0T || u === U1T || v === V0T || v === V1T;
      put2(u, -1, v, B.TERMINAL_FLOOR);
      for (let y = 0; y <= 4; y++) {
        if (edge) put2(u, y, v, y === 2 && (u + v) % 2 === 0 ? B.WIN_PLASTER : B.PLASTER);
      }
      put2(u, 5, v, edge ? B.PLASTER : B.CONCRETE);
      put2(u, 6, v, edge ? B.PLASTER : B.FLAT_ROOF);
    }
    put2(DOORU, 0, V0T, 0); put2(DOORU, 1, V0T, 0);
    for (let u = DOORU - 4; u <= DOORU + 4; u++) put2(u, 0, 14, B.DESK);
    W.addSite({ id, x0: rect.x0, z0: rect.z0, x1: rect.x1, z1: rect.z1, y: W.TOP, stamp: stampOf(c), top: W.TOP + 8 });
    const [dx, dz] = F.toW(DOORU, V0T);
    doors.push({ x: dx, y: W.TOP, z: dz, along: F.along, swing: 1, id });
    const a = (u, v) => F.pos(u, 0, v);
    const flat = (ua, va, ub, vb, w, layer, tier) => { const p = a(ua, va), q = a(ub, vb); W.addFlat({ ax: p.x, az: p.z, bx: q.x, bz: q.z, w, layer, tier }); };
    flat(150, 3, 230, 3, 6, 'road_asphalt', 'asphalt');
    flat(60, 36, 320, 36, 28, 'pad_concrete', 'pad');
    flat(190, 50, 190, 62, 14, 'pad_concrete', 'pad');
    flat(6, 73, 374, 73, 24, 'road_asphalt', 'runway');
    for (let u = 30; u < 350; u += 22) flat(u, 73, u + 11, 73, 0.7, 'paint', 'paint');
    flat(6, 62, 374, 62, 0.45, 'paint', 'paint');
    flat(6, 84, 374, 84, 0.45, 'paint', 'paint');
    for (let k = 0; k < 6; k++) {
      flat(10, 64 + k * 3.6, 24, 64 + k * 3.6, 1.6, 'paint', 'paint');
      flat(356, 64 + k * 3.6, 370, 64 + k * 3.6, 1.6, 'paint', 'paint');
    }
    const t0 = F.toW(U0T, V0T), t1 = F.toW(U1T + 1, V1T + 1);
    W.addFarBox({ x0: Math.min(t0[0], t1[0]), x1: Math.max(t0[0], t1[0]), z0: Math.min(t0[1], t1[1]), z1: Math.max(t0[1], t1[1]), h: 7, color: 0xd5d1c5 });
    const out = F.pos(DOORU + 0.5, 0, V0T - 0.06);
    return {
      id, title, frame: F, rect,
      desk: F.pos(DOORU + 0.5, 1, 14.5),
      clerk: F.pos(DOORU + 0.5, 0, 16),
      clerkYaw: Math.atan2(-F.dirU[1], F.dirU[0]), // faces the door
      entrance: F.pos(DOORU + 0.5, 0, 3),
      signPos: out.setY(W.TOP + 3.6),
      parked: F.pos(190, 0, 36),
      runwayStart: F.pos(14, 0, 73),
      heading: Math.atan2(-F.dirU[0], -F.dirU[1]), // nose along the runway (forward = -sin h, -cos h)
    };
  }
  const airHome = buildAirport('terminal', D.airport, D.airport.side, 'AKYAR AIRPORT');
  const AB = W.ABROAD;
  const airAbroad = buildAirport('terminal_abroad', { x0: AB.x0, z0: AB.z0, x1: AB.x0 + AIR_L, z1: AB.z0 + AIR_W }, 'n', 'INTERNATIONAL AIRPORT');
  // Short link from the airport's forecourt to the street that leads to the hotel.
  W.addFlat({ ax: AB.x0 + 190, az: AB.z0 + 3, bx: AB.x0 + 190, bz: AB.z0 + AB.roadZ, w: 8, layer: 'road_asphalt', tier: 'asphalt' });

  // ---------- Hotel: the same in every country ----------
  const hotel = (() => {
    const X = AB.hotelX, Z0 = AB.z0 - 3, Z1 = AB.z0 + 13, X0 = X - 13, X1 = X + 13;
    const c = [];
    const p3 = (x, y, z, b) => c.push(x, W.TOP + y, z, b);
    for (let z = Z0; z <= Z1; z++) for (let x = X0; x <= X1; x++) {
      const edge = x === X0 || x === X1 || z === Z0 || z === Z1;
      p3(x, -1, z, B.TERMINAL_FLOOR);
      for (let y = 0; y <= 13; y++) {
        const window = (x + z) % 3 === 0 && (y === 2 || (y > 4 && (y - 5) % 3 === 1));
        if (edge) p3(x, y, z, window ? B.WIN_PLASTER : B.PLASTER);
        else if (y >= 5) p3(x, y, z, B.INVIS);
      }
      if (!edge) p3(x, 4, z, B.PLASTER);
      p3(x, 14, z, edge ? B.PLASTER : B.FLAT_ROOF);
    }
    p3(X, 0, Z0, 0); p3(X, 1, Z0, 0);
    // Reception, then a guest room behind a partition.
    for (let x = X - 5; x <= X + 2; x++) p3(x, 0, Z0 + 9, B.DESK);
    for (let z = Z0 + 1; z < Z1; z++) for (let y = 0; y <= 3; y++) if (!(z >= Z0 + 6 && z <= Z0 + 7 && y <= 1)) p3(X + 5, y, z, B.WALL_WHITE);
    for (const [bx, bz] of [[X + 9, Z0 + 5], [X + 10, Z0 + 5], [X + 9, Z0 + 6], [X + 10, Z0 + 6]]) p3(bx, 0, bz, B.HOTEL_BED);
    for (let x = X + 7; x <= X + 11; x++) for (let z = Z0 + 9; z <= Z0 + 12; z++) p3(x, -1, z, B.RUG);
    for (let x = X - 9; x <= X - 7; x++) for (let z = Z0 + 3; z <= Z0 + 5; z++) p3(x, -1, z, B.RUG);
    W.addSite({ id: 'hotel', x0: X0, z0: Z0, x1: X1 + 1, z1: Z1 + 1, y: W.TOP, stamp: stampOf(c), top: W.TOP + 16 });
    doors.push({ x: X, y: W.TOP, z: Z0, along: 'x', swing: 1, id: 'hotel' });
    W.addFlat({ ax: X + 0.5, az: AB.z0 + AB.roadZ + 4, bx: X + 0.5, bz: Z0, w: 4, layer: 'pad_concrete', tier: 'pad' });
    W.addFarBox({ x0: X0, x1: X1 + 1, z0: Z0, z1: Z1 + 1, h: 15, color: 0xd5d1c5 });
    return {
      x: X + 0.5,
      reception: new THREE.Vector3(X - 1.5, W.TOP + 1, Z0 + 9.5),
      clerk: new THREE.Vector3(X - 1.5, W.TOP, Z0 + 11),
      bed: new THREE.Vector3(X + 10, W.TOP + 0.6, Z0 + 6),
      entrance: new THREE.Vector3(X + 0.5, W.TOP, Z0 - 3),
      signPos: new THREE.Vector3(X + 0.5, W.TOP + 3.6, Z0 - 0.06),
    };
  })();

  G.sites = { home, shop, work, doors, landmarks, airHome, airAbroad, hotel };
})();
