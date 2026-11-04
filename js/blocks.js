// Block registry + procedurally painted 16x16 pixel-art textures.
// To swap in hand-made art later, replace a painter here with pixels from your own image.
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  const SIZE = 16;
  const tiles = [];
  const tileIndex = {};

  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

  function tile(name, paint) {
    const px = new Uint8Array(SIZE * SIZE * 4);
    const set = (x, y, c, a = 255) => {
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
      const i = (x + (SIZE - 1 - y) * SIZE) * 4; // y = 0 is the top row of the art
      const [r, g, b] = typeof c === 'number' ? hex(c) : c;
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
    };
    seed = 1000 + tiles.length * 77;
    paint(set);
    tileIndex[name] = tiles.length;
    tiles.push(px);
  }

  const shade = (c, f) => { const a = hex(c); return [a[0] * f, a[1] * f, a[2] * f].map((v) => Math.max(0, Math.min(255, v | 0))); };
  const fill = (set, c) => { for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) set(x, y, c); };
  const noise = (c, amt) => (set) => {
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) set(x, y, shade(c, 1 - amt + rnd() * amt * 2));
  };
  const rect = (set, x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, c); };

  const grassSide = (top, dirt) => (set) => {
    noise(dirt, 0.1)(set);
    for (let x = 0; x < SIZE; x++) {
      const d = 3 + ((rnd() * 3) | 0);
      for (let y = 0; y < d; y++) set(x, y, shade(top, 0.9 + rnd() * 0.2));
    }
  };
  const siding = (c) => (set) => {
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) set(x, y, shade(c, (y % 4 === 3 ? 0.78 : y % 4 === 0 ? 1.06 : 1) * (0.97 + rnd() * 0.05)));
  };
  const brick = (c, mortar) => (set) => {
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const row = y >> 2, off = row % 2 ? 4 : 0;
      const m = y % 4 === 3 || (x + off) % 8 === 7;
      set(x, y, m ? mortar : shade(c, 0.9 + rnd() * 0.2));
    }
  };
  const roof = (c) => (set) => {
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) set(x, y, shade(c, (x % 4 === 0 ? 0.74 : x % 4 === 1 ? 1.12 : 0.97) - (y % 8 === 7 ? 0.12 : 0)));
  };
  // Windows with the carved, painted frames ("nalichniki") common on rural Bashkir houses.
  const windowTile = (wall, frame) => (set) => {
    siding(wall)(set);
    rect(set, 2, 1, 12, 14, frame);
    rect(set, 3, 3, 10, 11, 0x5d86a8);
    rect(set, 3, 3, 10, 2, 0xd9e7ee);
    rect(set, 7, 3, 2, 11, frame);
    rect(set, 3, 8, 10, 1, frame);
    for (let x = 2; x < 14; x += 2) set(x, 0, frame);
    set(5, 5, 0xb9d6e8); set(4, 6, 0xb9d6e8); set(10, 10, 0x86adc9);
  };
  const windowModern = (wall) => (set) => {
    noise(wall, 0.04)(set);
    rect(set, 2, 3, 12, 10, 0xe8e8e8);
    rect(set, 3, 4, 10, 8, 0x6b93b3);
    rect(set, 7, 4, 2, 8, 0xe8e8e8);
    set(4, 5, 0xc4dceb); set(5, 6, 0xc4dceb);
  };

  tile('grass', noise(0x6fa63f, 0.12));
  tile('grass_side', grassSide(0x6fa63f, 0x8a6a45));
  tile('forest_floor', noise(0x4f8733, 0.13));
  tile('forest_side', grassSide(0x4f8733, 0x7a5c3c));
  tile('steppe', (set) => { for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) set(x, y, rnd() < 0.2 ? shade(0xc2b35a, 0.95 + rnd() * 0.1) : shade(0x99a84c, 0.9 + rnd() * 0.18)); });
  tile('steppe_side', grassSide(0x99a84c, 0x8f7350));
  tile('dirt', noise(0x8a6a45, 0.14));
  tile('stone', noise(0x8b8b86, 0.12));
  tile('sand', noise(0xcfbd86, 0.08));
  tile('gravel', (set) => { for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) set(x, y, shade(rnd() < 0.3 ? 0x8d8678 : 0xa69f90, 0.85 + rnd() * 0.25)); });
  tile('asphalt', noise(0x5c5c5e, 0.08));
  tile('road_line', (set) => { noise(0x5c5c5e, 0.08)(set); for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (x > 5 && x < 10) set(x, y, shade(0xdedbd0, 0.95 + rnd() * 0.08)); });
  tile('dirt_road', (set) => { for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) set(x, y, shade(rnd() < 0.2 ? 0x8e7b5f : 0xa28d6b, 0.88 + rnd() * 0.22)); });
  tile('soil', (set) => { for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) set(x, y, shade(0x5d4128, (y % 5 < 2 ? 0.8 : 1.05) * (0.9 + rnd() * 0.2))); });
  tile('planks', (set) => { for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) set(x, y, y % 4 === 3 || (x + (y >> 2) * 6) % 16 === 0 ? 0x6e4f2d : shade(0xa97e4a, 0.93 + rnd() * 0.12)); });
  tile('log_side', (set) => { for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) set(x, y, shade(x % 5 === 0 ? 0x4e3a24 : 0x6d5233, 0.9 + rnd() * 0.2)); });
  tile('birch_side', (set) => { for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) set(x, y, rnd() < 0.09 || (y % 7 === 3 && x > 6 && x < 12) ? 0x2b2b28 : shade(0xe6e4dc, 0.93 + rnd() * 0.08)); });
  tile('log_top', (set) => { fill(set, 0x9c7a4d); for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { const d = Math.hypot(x - 7.5, y - 7.5) | 0; if (d % 3 === 0) set(x, y, 0x7d5f39); } });
  tile('leaves', (set) => { for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { const r = rnd(); set(x, y, r < 0.16 ? 0x2f5e20 : shade(0x4a8a30, 0.86 + rnd() * 0.3)); } });
  tile('birch_leaves', (set) => { for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { const r = rnd(); set(x, y, r < 0.14 ? 0x4c7f2a : shade(0x7cae3e, 0.88 + rnd() * 0.26)); } });

  // Wall palette
  const WALLS = { blue: 0x5f8fb8, green: 0x6f9f7b, white: 0xe0dccf, yellow: 0xd8bd6c, teal: 0x4f9c9a, peach: 0xd9a584 };
  for (const k in WALLS) {
    tile('wall_' + k, siding(WALLS[k]));
    tile('win_' + k, windowTile(WALLS[k], k === 'white' ? 0x3f7fb5 : 0xf3f1e7));
  }
  tile('wall_log', (set) => { for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) set(x, y, shade(y % 5 === 4 ? 0x4b361f : y % 5 === 0 ? 0x9a7346 : 0x80603a, 0.93 + rnd() * 0.12)); });
  tile('win_log', windowTile(0x80603a, 0xe9e6d8));
  tile('brick_red', brick(0xa5543a, 0xb9ad9b));
  tile('win_brick', windowModern(0xa5543a));
  tile('brick_white', brick(0xd6d0c0, 0x9d988b));
  tile('win_whitebrick', windowModern(0xd6d0c0));
  tile('plaster', noise(0xdcd8cc, 0.05));
  tile('win_plaster', windowModern(0xdcd8cc));
  tile('concrete', (set) => { noise(0xa4a39c, 0.06)(set); for (let x = 0; x < SIZE; x++) set(x, 15, 0x7d7c76); for (let y = 0; y < SIZE; y++) set(15, y, 0x7d7c76); });
  tile('win_concrete', windowModern(0xa4a39c));
  tile('metal', (set) => { for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) set(x, y, shade(0x90989c, x % 3 === 0 ? 0.8 : 1.02)); });
  tile('door', (set) => {
    fill(set, 0x6b4526); rect(set, 2, 1, 12, 14, 0x8a5c33); rect(set, 3, 2, 10, 5, 0x76502c); rect(set, 3, 9, 10, 5, 0x76502c); set(12, 8, 0xe5d36b); set(11, 8, 0xe5d36b);
  });
  tile('roof_red', roof(0xa84c38));
  tile('roof_green', roof(0x3f7d5c));
  tile('roof_blue', roof(0x416f9c));
  tile('roof_gray', roof(0x87888a));
  tile('roof_brown', roof(0x76503a));
  tile('flat_roof', noise(0x63605c, 0.1));
  tile('dome_green', (set) => { noise(0x2f9463, 0.06)(set); for (let x = 0; x < SIZE; x += 5) for (let y = 0; y < SIZE; y++) set(x, y, 0x25784f); });
  tile('dome_gold', noise(0xd8b64a, 0.09));

  // Interior
  tile('floor_tile', (set) => { for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) set(x, y, shade(((x >> 3) + (y >> 3)) % 2 ? 0xc9c6bd : 0xa9b4ae, 0.97 + rnd() * 0.05)); });
  // Original geometric felt-rug pattern, inspired by the colours of Bashkir applique felt (no real pattern copied).
  tile('rug', (set) => {
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const dx = Math.abs(x - 7.5), dy = Math.abs(y - 7.5), m = dx + dy;
      let c = 0x8c2331;
      if (m < 3) c = 0xe9c75c; else if (m < 5) c = 0x18605a; else if (m < 7) c = 0xf0e7d0; else if (dx > 6.5 || dy > 6.5) c = 0xe9c75c;
      set(x, y, c);
    }
  });
  tile('bed_top', (set) => { noise(0xb0413e, 0.05)(set); for (let y = 0; y < SIZE; y += 5) for (let x = 0; x < SIZE; x++) set(x, y, 0xe8d9b5); });
  tile('bed_side', (set) => { noise(0x7a5532, 0.06)(set); rect(set, 0, 0, 16, 7, 0xb0413e); });
  tile('table_top', (set) => { for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) set(x, y, shade(0xc69659, 0.95 + rnd() * 0.08)); rect(set, 0, 0, 16, 1, 0x825c31); rect(set, 0, 15, 16, 1, 0x825c31); });
  tile('table_side', (set) => { rect(set, 0, 0, 16, 3, 0x9c723f); rect(set, 1, 3, 2, 13, 0x825c31); rect(set, 13, 3, 2, 13, 0x825c31); });
  tile('stove_side', (set) => { brick(0xeae5d8, 0xb5b0a4)(set); });
  tile('stove_front', (set) => { brick(0xeae5d8, 0xb5b0a4)(set); rect(set, 3, 5, 10, 8, 0x2a2622); rect(set, 5, 9, 6, 4, 0xd46a24); rect(set, 7, 10, 2, 3, 0xf2c24f); });
  tile('stove_top', (set) => { noise(0x4d4a46, 0.06)(set); rect(set, 3, 3, 4, 4, 0x2c2a28); rect(set, 9, 9, 4, 4, 0x2c2a28); });
  tile('cupboard', (set) => { fill(set, 0x8d6236); rect(set, 1, 1, 6, 14, 0xa97a47); rect(set, 9, 1, 6, 14, 0xa97a47); set(6, 8, 0xe5d36b); set(9, 8, 0xe5d36b); });
  tile('fridge', (set) => { fill(set, 0xe9edee); rect(set, 0, 5, 16, 1, 0x9fa6a8); rect(set, 13, 2, 1, 2, 0x70777a); rect(set, 13, 7, 1, 5, 0x70777a); });
  tile('shelf', (set) => {
    fill(set, 0x6e5333);
    const colors = [0xc6403a, 0x3f7fb5, 0xe6c34b, 0x4fa35a, 0xe7e2d3, 0xd8772f];
    // Groceries: squat boxes, jars and tins with pale labels, not book spines.
    for (const y0 of [1, 9]) {
      rect(set, 0, y0 + 5, 16, 1, 0x9c7a4d);
      for (const [x, w] of [[1, 4], [6, 3], [10, 5]]) {
        const h = 3 + ((rnd() * 2) | 0), c = colors[(rnd() * colors.length) | 0];
        rect(set, x, y0 + 5 - h, w, h, c);
        rect(set, x, y0 + 6 - h, w, 1, 0xf2eee0);
        rect(set, x, y0 + 5 - h, w, 1, shade(c, 1.25));
      }
    }
  });
  tile('counter', (set) => { fill(set, 0x8f4c37); rect(set, 0, 0, 16, 3, 0xe3ddcf); rect(set, 1, 5, 14, 9, 0x7a3e2c); });
  tile('counter_top', noise(0xe3ddcf, 0.03));
  tile('crate', (set) => { fill(set, 0xb08a52); rect(set, 0, 0, 16, 2, 0x7e5e33); rect(set, 0, 14, 16, 2, 0x7e5e33); rect(set, 0, 0, 2, 16, 0x7e5e33); rect(set, 14, 0, 2, 16, 0x7e5e33); for (let i = 2; i < 14; i++) { set(i, i, 0x7e5e33); set(i + 1, i, 0x7e5e33); } });
  tile('hay', (set) => { for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) set(x, y, shade(rnd() < 0.3 ? 0xb49c3c : 0xd8c25c, 0.9 + rnd() * 0.2)); });
  tile('sack', (set) => { noise(0xcdbb90, 0.07)(set); rect(set, 3, 2, 10, 1, 0x8e7d58); rect(set, 5, 7, 6, 3, 0xbb9a36); });
  tile('chest', (set) => { fill(set, 0x6f4a26); rect(set, 0, 5, 16, 2, 0xd2a93c); rect(set, 6, 5, 4, 5, 0xe6c34b); rect(set, 0, 0, 2, 16, 0x4c3219); rect(set, 14, 0, 2, 16, 0x4c3219); });
  tile('timeclock', (set) => { noise(0xa4a39c, 0.04)(set); rect(set, 4, 3, 8, 10, 0x34495e); rect(set, 5, 4, 6, 3, 0x7fe0a6); rect(set, 6, 9, 4, 2, 0xd8d3c4); });
  tile('trough', (set) => { noise(0x7a5a35, 0.06)(set); rect(set, 0, 0, 16, 2, 0x5b4225); });
  tile('trough_top', (set) => { fill(set, 0x5b4225); rect(set, 2, 2, 12, 12, 0xd6b858); for (let i = 0; i < 18; i++) set(2 + ((rnd() * 12) | 0), 2 + ((rnd() * 12) | 0), 0xa98c34); });
  tile('straw', (set) => { for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) set(x, y, shade(rnd() < 0.35 ? 0xa18c3a : 0xc9b44f, 0.85 + rnd() * 0.25)); });
  tile('gravestone', noise(0x8a8a88, 0.08));

  // Cut-out tiles: alpha 0 is discarded by the shader.
  const cutout = (paint) => (set) => paint((x, y, c) => set(x, y, c));
  const clearAll = (px, idx) => idx;
  tile('fence', cutout((set) => {
    for (let x = 0; x < SIZE; x++) { const post = x % 8 < 4; if (post) for (let y = 1; y < SIZE; y++) set(x, y, shade(0x9c7c52, 0.93 + rnd() * 0.12)); }
    for (let x = 0; x < SIZE; x++) { for (let y = 4; y < 6; y++) set(x, y, 0x7f6240); for (let y = 11; y < 13; y++) set(x, y, 0x7f6240); }
  }));
  tile('grass_plant', cutout((set) => {
    for (let b = 0; b < 9; b++) { const x0 = 1 + ((rnd() * 14) | 0), h = 5 + ((rnd() * 9) | 0); const c = shade(0x6fa63f, 0.8 + rnd() * 0.4); for (let i = 0; i < h; i++) set(x0 + ((i / 5) | 0) * (b % 2 ? 1 : -1), 15 - i, c); }
  }));
  tile('dry_plant', cutout((set) => {
    for (let b = 0; b < 8; b++) { const x0 = 1 + ((rnd() * 14) | 0), h = 5 + ((rnd() * 10) | 0); const c = shade(0xc0b265, 0.8 + rnd() * 0.35); for (let i = 0; i < h; i++) set(x0 + ((i / 6) | 0) * (b % 2 ? 1 : -1), 15 - i, c); }
  }));
  const flower = (col) => cutout((set) => {
    for (let y = 7; y < 16; y++) set(8, y, 0x4f8733); set(7, 11, 0x4f8733); set(9, 13, 0x4f8733);
    rect(set, 7, 4, 3, 3, col); set(8, 3, col); set(6, 5, col); set(10, 5, col); set(8, 5, 0xf3d24f);
  });
  tile('flower_blue', flower(0x6b7fe0));
  tile('flower_white', flower(0xf1efe6));
  tile('flower_yellow', flower(0xebc23c));
  tile('crop', cutout((set) => {
    for (let b = 0; b < 7; b++) { const x0 = 2 + b * 2, h = 6 + ((rnd() * 5) | 0); for (let i = 0; i < h; i++) { set(x0, 15 - i, 0x4f9a3a); if (i % 2) set(x0 + 1, 15 - i, 0x6dbb4d); } }
  }));
  void clearAll;

  // ---------- Block definitions ----------
  const B = {};
  const defs = [null];
  function block(name, spec) {
    const t = (n) => tileIndex[n];
    const d = Object.assign({ solid: true, opaque: true, cross: false, cut: false }, spec);
    d.tTop = t(spec.top || spec.all); d.tSide = t(spec.side || spec.all); d.tBottom = t(spec.bottom || spec.top || spec.all);
    d.name = name;
    B[name] = defs.length;
    defs.push(d);
  }
  block('GRASS', { top: 'grass', side: 'grass_side', bottom: 'dirt' });
  block('FOREST', { top: 'forest_floor', side: 'forest_side', bottom: 'dirt' });
  block('STEPPE', { top: 'steppe', side: 'steppe_side', bottom: 'dirt' });
  ['DIRT:dirt', 'STONE:stone', 'SAND:sand', 'GRAVEL:gravel', 'ASPHALT:asphalt', 'ROAD_LINE:road_line', 'DIRT_ROAD:dirt_road', 'SOIL:soil',
    'PLANKS:planks', 'LEAVES:leaves', 'BIRCH_LEAVES:birch_leaves', 'PLASTER:plaster', 'WIN_PLASTER:win_plaster', 'BRICK_RED:brick_red', 'WIN_BRICK:win_brick',
    'BRICK_WHITE:brick_white', 'WIN_WHITEBRICK:win_whitebrick', 'CONCRETE:concrete', 'WIN_CONCRETE:win_concrete', 'METAL:metal', 'DOOR_DECOR:door',
    'ROOF_RED:roof_red', 'ROOF_GREEN:roof_green', 'ROOF_BLUE:roof_blue', 'ROOF_GRAY:roof_gray', 'ROOF_BROWN:roof_brown', 'FLAT_ROOF:flat_roof',
    'DOME_GREEN:dome_green', 'DOME_GOLD:dome_gold', 'FLOOR_TILE:floor_tile', 'RUG:rug', 'CUPBOARD:cupboard', 'HAY:hay', 'SACK:sack', 'CRATE:crate', 'STRAW:straw',
    'SHELF:shelf', 'TIMECLOCK:timeclock', 'GRAVESTONE:gravestone', 'WALL_LOG:wall_log', 'WIN_LOG:win_log'].forEach((s) => { const [n, t] = s.split(':'); block(n, { all: t }); });
  for (const k of Object.keys(WALLS)) { block('WALL_' + k.toUpperCase(), { all: 'wall_' + k }); block('WIN_' + k.toUpperCase(), { all: 'win_' + k }); }
  block('LOG', { top: 'log_top', side: 'log_side' });
  block('BIRCH', { top: 'log_top', side: 'birch_side' });
  block('BED', { top: 'bed_top', side: 'bed_side', bottom: 'planks' });
  block('TABLE', { top: 'table_top', side: 'table_side', bottom: 'table_top', opaque: false, cut: true });
  block('STOVE', { top: 'stove_top', side: 'stove_side', bottom: 'stove_side' });
  block('STOVE_FRONT', { top: 'stove_top', side: 'stove_front', bottom: 'stove_side' });
  block('FRIDGE', { top: 'fridge', side: 'fridge', bottom: 'fridge' });
  block('COUNTER', { top: 'counter_top', side: 'counter', bottom: 'counter' });
  block('CHEST', { top: 'chest', side: 'chest', bottom: 'chest' });
  block('TROUGH', { top: 'trough_top', side: 'trough', bottom: 'trough' });
  block('FENCE', { all: 'fence', opaque: false, cut: true });
  const plant = (n, t) => block(n, { all: t, solid: false, opaque: false, cross: true });
  plant('GRASS_PLANT', 'grass_plant'); plant('DRY_PLANT', 'dry_plant');
  plant('FLOWER_BLUE', 'flower_blue'); plant('FLOWER_WHITE', 'flower_white'); plant('FLOWER_YELLOW', 'flower_yellow'); plant('CROP', 'crop');
  block('WATER', { all: 'sand', solid: false, opaque: false, water: true });

  B.AIR = 0;
  const count = defs.length;
  // Fast look-up tables for the mesher and physics.
  const SOLID = new Uint8Array(count), OPAQUE = new Uint8Array(count), CROSS = new Uint8Array(count), CUT = new Uint8Array(count);
  const T_TOP = new Uint16Array(count), T_SIDE = new Uint16Array(count), T_BOT = new Uint16Array(count);
  for (let i = 1; i < count; i++) {
    const d = defs[i];
    SOLID[i] = d.solid ? 1 : 0; OPAQUE[i] = d.opaque ? 1 : 0; CROSS[i] = d.cross ? 1 : 0; CUT[i] = d.cut ? 1 : 0;
    T_TOP[i] = d.tTop; T_SIDE[i] = d.tSide; T_BOT[i] = d.tBottom;
  }

  function makeTextureArray() {
    const data = new Uint8Array(SIZE * SIZE * 4 * tiles.length);
    tiles.forEach((t, i) => data.set(t, i * SIZE * SIZE * 4));
    const tex = new THREE.DataArrayTexture(data, SIZE, SIZE, tiles.length);
    tex.format = THREE.RGBAFormat;
    tex.type = THREE.UnsignedByteType;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestMipmapLinearFilter;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.generateMipmaps = true;
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  G.blocks = { B, SOLID, OPAQUE, CROSS, CUT, T_TOP, T_SIDE, T_BOT, makeTextureArray, tileIndex, count };
})();
