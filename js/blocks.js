// Block registry + smooth textures painted in code (64x64, filtered, so no visible pixels).
// To use real photos or art later, replace a painter here with pixels from an image.
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  const SIZE = 64, K = SIZE / 16;
  const tiles = [];
  const tileIndex = {};

  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
  const shade = (c, f) => { const a = typeof c === 'number' ? hex(c) : c; return [clamp8(a[0] * f), clamp8(a[1] * f), clamp8(a[2] * f)]; };
  const mix = (a, b, t) => { const x = hex(a), y = hex(b); return [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]; };

  // Tileable value noise: soft mottling instead of square pixels.
  function makeNoise(period) {
    const t = new Float32Array(period * period);
    for (let i = 0; i < t.length; i++) t[i] = rnd();
    const s = (k) => k * k * (3 - 2 * k);
    return (x, y) => {
      const fx = (x / SIZE) * period, fy = (y / SIZE) * period;
      const ix = Math.floor(fx), iy = Math.floor(fy), tx = s(fx - ix), ty = s(fy - iy);
      const at = (a, b) => t[((a % period) + period) % period + (((b % period) + period) % period) * period];
      const p = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx;
      const q = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx;
      return p * (1 - ty) + q * ty;
    };
  }
  const fbm = () => { const a = makeNoise(4), b = makeNoise(8), c = makeNoise(16), d = makeNoise(32); return (x, y) => a(x, y) * 0.4 + b(x, y) * 0.3 + c(x, y) * 0.2 + d(x, y) * 0.1; };

  function tile(name, paint, bg) {
    const px = new Uint8Array(SIZE * SIZE * 4);
    if (bg !== undefined) {
      // Cut-outs keep a coloured transparent background, so filtered edges have no dark halo.
      const c = hex(bg);
      for (let i = 0; i < px.length; i += 4) { px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; }
    }
    const fine = (x, y, c, a = 255) => {
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
      const i = ((x | 0) + (SIZE - 1 - (y | 0)) * SIZE) * 4; // y = 0 is the top row of the art
      const v = typeof c === 'number' ? hex(c) : c;
      px[i] = v[0]; px[i + 1] = v[1]; px[i + 2] = v[2]; px[i + 3] = a;
    };
    // set() paints on a 16-unit layout grid, for panels and shapes with crisp edges.
    const set = (x, y, c, a = 255) => { for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) fine(x * K + i, y * K + j, c, a); };
    seed = 1000 + tiles.length * 77;
    paint(set, fine);
    tileIndex[name] = tiles.length;
    tiles.push(px);
  }
  const each = (fine, fn) => { for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) fine(x, y, fn(x, y)); };
  const rect = (set, x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, c); };

  const mottled = (c, amt) => (set, fine) => { const n = fbm(); each(fine, (x, y) => shade(c, 1 - amt + n(x, y) * amt * 2)); };
  const siding = (c) => (set, fine) => {
    const n = fbm();
    each(fine, (x, y) => { const r = y % 16; return shade(c, (r >= 14 ? 0.74 : r < 2 ? 1.06 : 1) * (0.96 + n(x, y) * 0.08)); });
  };
  const brick = (c, mortar) => (set, fine) => {
    const n = fbm(), v = makeNoise(8);
    each(fine, (x, y) => {
      const row = (y / 8) | 0, ox = row % 2 ? 8 : 0;
      if (y % 8 >= 7 || (x + ox) % 16 >= 15) return shade(mortar, 0.95 + n(x, y) * 0.1);
      const id = v(((x + ox) >> 4) * 16, row * 16);
      return shade(c, 0.84 + id * 0.26 + n(x, y) * 0.08);
    });
  };
  const roof = (c) => (set, fine) => {
    const n = fbm();
    each(fine, (x, y) => { const r = x % 16; return shade(c, (r < 2 ? 0.8 : r < 5 ? 1.08 : 0.98) * (0.94 + n(x, y) * 0.12) - (y % 32 >= 30 ? 0.1 : 0)); });
  };
  const planks = (c, dark) => (set, fine) => {
    const n = makeNoise(8), g = makeNoise(32);
    each(fine, (x, y) => {
      const row = (y / 16) | 0;
      if (y % 16 >= 15 || (x + row * 24) % 64 < 1) return dark;
      return shade(c, 0.9 + n(x / 4 + row * 13, y) * 0.14 + g(x / 6, y) * 0.08);
    });
  };
  // Painted window frames, the kind common on rural Bashkir houses.
  const windowTile = (paintWall, frame) => (set, fine) => {
    paintWall(set, fine);
    const glass = makeNoise(4);
    each2(fine, 8, 4, 48, 56, () => frame);
    each2(fine, 12, 10, 40, 46, (x, y) => mix(0x7fa3bb, 0x3f5f78, Math.min(1, (y - 10) / 46 * 0.8 + glass(x, y) * 0.3)));
    each2(fine, 30, 10, 4, 46, () => frame);
    each2(fine, 12, 30, 40, 3, () => frame);
  };
  const each2 = (fine, x0, y0, w, h, fn) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) fine(x, y, fn(x, y)); };

  // ---------- Ground, roads ----------
  // R channel: fine ground grain. G channel: broad patches, also used as cloud noise.
  tile('ground_detail', (set, fine) => {
    const a = fbm(), b = makeNoise(4), c = makeNoise(8);
    each(fine, (x, y) => [clamp8(a(x, y) * 255), clamp8((b(x, y) * 0.65 + c(x, y) * 0.35) * 255), 128]);
  });
  const roadPaint = (c, amt, speck, speckAmt) => (set, fine) => {
    const n = fbm();
    each(fine, (x, y) => {
      const g = rnd();
      return g < speckAmt ? shade(speck, 0.9 + g) : shade(c, 1 - amt + n(x, y) * amt * 2 + (g - 0.5) * 0.06);
    });
  };
  tile('road_asphalt', roadPaint(0x5a5a5e, 0.09, 0x6c6c6e, 0.03));
  tile('road_gravel', roadPaint(0x8f897c, 0.12, 0x6e6a60, 0.12));
  tile('road_dirt', roadPaint(0x907b5e, 0.14, 0x76634b, 0.08));
  tile('pad_concrete', (set, fine) => { const n = fbm(); each(fine, (x, y) => (x % 64 < 1 || y % 64 < 1 ? 0x77777a : shade(0x9d9d9c, 0.92 + n(x, y) * 0.16))); });
  tile('paint', (set, fine) => { const n = makeNoise(16); each(fine, (x, y) => shade(0xdcdad0, 0.92 + n(x, y) * 0.12)); });

  tile('dirt', mottled(0x7f6647, 0.14));
  tile('soil', (set, fine) => { const n = fbm(); each(fine, (x, y) => shade(0x5a4029, (y % 20 < 8 ? 0.8 : 1.05) * (0.86 + n(x, y) * 0.28))); });
  tile('path_dirt', roadPaint(0x96836a, 0.12, 0x7a6a55, 0.08));
  tile('stone', mottled(0x8d8d88, 0.12));
  tile('sand', mottled(0xc4b389, 0.08));
  tile('gravel', roadPaint(0x9a9385, 0.12, 0x76705f, 0.2));
  tile('planks', planks(0xa27a4a, 0x6c4e2e));
  tile('straw', (set, fine) => { const n = fbm(), m = makeNoise(32); each(fine, (x, y) => shade(m(x * 3, y / 3) < 0.45 ? 0xa18c3a : 0xc9b44f, 0.85 + n(x, y) * 0.3)); });
  tile('hay', (set, fine) => { const n = fbm(), m = makeNoise(32); each(fine, (x, y) => shade(m(x / 3, y * 3) < 0.4 ? 0xb49c3c : 0xd2bd5a, 0.88 + n(x, y) * 0.24)); });

  // Trees (mesh trunks and crowns)
  tile('bark', (set, fine) => { const n = makeNoise(16), m = makeNoise(32); each(fine, (x, y) => shade(0x5e4a33, 0.72 + n(x * 2, y / 2) * 0.42 + m(x, y) * 0.1)); });
  tile('birch_bark', (set, fine) => { const n = makeNoise(16), m = makeNoise(8); each(fine, (x, y) => (m(x / 2, y * 2) > 0.74 && n(x, y) > 0.45 ? 0x33322e : shade(0xe2e0d6, 0.92 + n(x, y) * 0.1))); });
  tile('foliage', (set, fine) => { const a = makeNoise(16), b = makeNoise(32), c = fbm(); each(fine, (x, y) => shade(mix(0x35602a, 0x5f8f3e, c(x, y)), 0.74 + a(x, y) * 0.3 + b(x, y) * 0.22)); });
  tile('birch_foliage', (set, fine) => { const a = makeNoise(16), b = makeNoise(32), c = fbm(); each(fine, (x, y) => shade(mix(0x5f8a35, 0x90b050, c(x, y)), 0.78 + a(x, y) * 0.26 + b(x, y) * 0.2)); });

  // Walls
  const WALLS = { blue: 0x6d92b2, green: 0x7b9d84, white: 0xd8d4c7, yellow: 0xcfb97a, teal: 0x5e9593, peach: 0xcda68d };
  for (const k in WALLS) {
    tile('wall_' + k, siding(WALLS[k]));
    tile('win_' + k, windowTile(siding(WALLS[k]), k === 'white' ? 0x3f78a8 : 0xefece2));
  }
  const logWall = (set, fine) => {
    const n = makeNoise(32), m = makeNoise(8);
    each(fine, (x, y) => { const r = y % 20; return shade(r >= 18 ? 0x4b361f : r < 3 ? 0x96724a : 0x7e6040, 0.9 + n(x / 3, y) * 0.14 + m(x, y) * 0.06); });
  };
  tile('wall_log', logWall);
  tile('win_log', windowTile(logWall, 0xe9e6d8));
  const modern = (wall) => (set, fine) => {
    wall(set, fine);
    each2(fine, 6, 8, 52, 46, () => 0xe6e6e4);
    each2(fine, 10, 12, 44, 38, (x, y) => mix(0x8db0c6, 0x46677f, (y - 12) / 38));
    each2(fine, 30, 12, 4, 38, () => 0xe6e6e4);
  };
  const brickRed = brick(0x9c5740, 0xb3a896), brickWhite = brick(0xcfc9b8, 0x9b968a), plasterP = mottled(0xd5d1c5, 0.04), concreteP = (set, fine) => { const n = fbm(); each(fine, (x, y) => (y >= 62 || x >= 62 ? 0x7d7c76 : shade(0xa2a19a, 0.94 + n(x, y) * 0.12))); };
  tile('brick_red', brickRed); tile('win_brick', modern(brickRed));
  tile('brick_white', brickWhite); tile('win_whitebrick', modern(brickWhite));
  tile('plaster', plasterP); tile('win_plaster', modern(plasterP));
  tile('concrete', concreteP); tile('win_concrete', modern(concreteP));
  tile('metal', (set, fine) => { const n = fbm(); each(fine, (x, y) => shade(0x8f979b, (x % 12 < 3 ? 0.82 : 1.02) * (0.96 + n(x, y) * 0.08))); });
  tile('door', (set) => {
    rect(set, 0, 0, 16, 16, 0x5f3f24); rect(set, 2, 1, 12, 14, 0x84582f); rect(set, 3, 2, 10, 5, 0x6f4b2a); rect(set, 3, 9, 10, 5, 0x6f4b2a); set(12, 8, 0xd8c76a);
  });
  tile('roof_red', roof(0x9c4d3a));
  tile('roof_green', roof(0x44755b));
  tile('roof_blue', roof(0x476b90));
  tile('roof_gray', roof(0x808285));
  tile('roof_brown', roof(0x6f4f3a));
  tile('flat_roof', mottled(0x605d59, 0.1));
  tile('dome_green', roof(0x31895f));
  tile('dome_gold', mottled(0xd0b04c, 0.09));

  // Interior
  tile('floor_tile', (set, fine) => { const n = makeNoise(16); each(fine, (x, y) => (x % 32 < 1 || y % 32 < 1 ? 0x8a8a84 : shade(((x >> 5) + (y >> 5)) % 2 ? 0xc6c3ba : 0xaab4ae, 0.97 + n(x, y) * 0.05))); });
  tile('terminal_floor', (set, fine) => { const n = fbm(); each(fine, (x, y) => (x % 64 < 1 || y % 64 < 1 ? 0xa3a39e : shade(0xcfcdc5, 0.96 + n(x, y) * 0.07))); });
  // Original geometric felt-rug pattern, inspired by the colours of Bashkir applique felt (no real pattern copied).
  tile('rug', (set, fine) => {
    each(fine, (x, y) => {
      const dx = Math.abs(x / K - 7.5), dy = Math.abs(y / K - 7.5), m = dx + dy;
      if (m < 3) return 0xdfbf5c; if (m < 5) return 0x1d5f5a; if (m < 7) return 0xe9e0ca; if (dx > 6.6 || dy > 6.6) return 0xdfbf5c;
      return 0x84262f;
    });
  });
  tile('bed_top', (set, fine) => { const n = fbm(); each(fine, (x, y) => (y % 20 < 3 ? 0xe2d4b2 : shade(0xa8443f, 0.94 + n(x, y) * 0.12))); });
  tile('bed_side', (set) => { rect(set, 0, 0, 16, 16, 0x74522f); rect(set, 0, 0, 16, 7, 0xa8443f); });
  tile('hotel_bed_top', (set, fine) => { const n = fbm(); each(fine, (x, y) => shade(0xe6e2d8, 0.96 + n(x, y) * 0.06)); });
  tile('hotel_bed_side', (set) => { rect(set, 0, 0, 16, 16, 0x5c4630); rect(set, 0, 0, 16, 8, 0xe6e2d8); });
  tile('table_top', (set, fine) => { const n = makeNoise(8), g = makeNoise(32); each(fine, (x, y) => shade(0xbf9159, 0.9 + n(x / 3, y) * 0.14 + g(x / 4, y) * 0.08)); });
  tile('table_side', (set) => { rect(set, 0, 0, 16, 3, 0x967040); rect(set, 1, 3, 2, 13, 0x7c582f); rect(set, 13, 3, 2, 13, 0x7c582f); }, 0x7c582f);
  tile('stove_side', brick(0xe2ddd0, 0xb2ada1));
  tile('stove_front', (set, fine) => { brick(0xe2ddd0, 0xb2ada1)(set, fine); rect(set, 3, 5, 10, 8, 0x2a2622); rect(set, 5, 9, 6, 4, 0xc66a2a); rect(set, 7, 10, 2, 3, 0xe8bc55); });
  tile('stove_top', (set, fine) => { mottled(0x4d4a46, 0.06)(set, fine); rect(set, 3, 3, 4, 4, 0x2c2a28); rect(set, 9, 9, 4, 4, 0x2c2a28); });
  tile('cupboard', (set) => { rect(set, 0, 0, 16, 16, 0x866038); rect(set, 1, 1, 6, 14, 0xa17748); rect(set, 9, 1, 6, 14, 0xa17748); set(6, 8, 0xd8c76a); set(9, 8, 0xd8c76a); });
  tile('fridge', (set) => { rect(set, 0, 0, 16, 16, 0xe4e8e8); rect(set, 0, 5, 16, 1, 0x9fa6a8); rect(set, 13, 2, 1, 2, 0x70777a); rect(set, 13, 7, 1, 5, 0x70777a); });
  tile('shelf', (set) => {
    rect(set, 0, 0, 16, 16, 0x6a5234);
    const colors = [0xb8473f, 0x4478a8, 0xd8ba50, 0x55985e, 0xdfdacb, 0xcc7a36];
    // Groceries: squat boxes, jars and tins with pale labels.
    for (const y0 of [1, 9]) {
      rect(set, 0, y0 + 5, 16, 1, 0x9a7a50);
      for (const [x, w] of [[1, 4], [6, 3], [10, 5]]) {
        const h = 3 + ((rnd() * 2) | 0), c = colors[(rnd() * colors.length) | 0];
        rect(set, x, y0 + 5 - h, w, h, c);
        rect(set, x, y0 + 6 - h, w, 1, 0xefebdd);
      }
    }
  });
  tile('counter', (set) => { rect(set, 0, 0, 16, 16, 0x7f4f3b); rect(set, 0, 0, 16, 3, 0xdcd6c8); rect(set, 1, 5, 14, 9, 0x6e4231); });
  tile('counter_top', mottled(0xdcd6c8, 0.03));
  tile('desk', (set) => { rect(set, 0, 0, 16, 16, 0x3f5468); rect(set, 0, 0, 16, 3, 0xd6d6d2); rect(set, 1, 5, 14, 9, 0x35485a); });
  tile('crate', (set, fine) => {
    const n = makeNoise(16);
    each(fine, (x, y) => shade(0xa98551, 0.92 + n(x / 2, y) * 0.16));
    rect(set, 0, 0, 16, 2, 0x7a5c34); rect(set, 0, 14, 16, 2, 0x7a5c34); rect(set, 0, 0, 2, 16, 0x7a5c34); rect(set, 14, 0, 2, 16, 0x7a5c34);
    for (let i = 8; i < 56; i++) for (let w = 0; w < 5; w++) fine(i + w, i, 0x7a5c34);
  });
  tile('sack', (set, fine) => { mottled(0xc8b78e, 0.07)(set, fine); rect(set, 3, 2, 10, 1, 0x8e7d58); rect(set, 5, 7, 6, 3, 0xb0943a); });
  tile('chest', (set) => { rect(set, 0, 0, 16, 16, 0x6a4726); rect(set, 0, 5, 16, 2, 0xc9a23c); rect(set, 6, 5, 4, 5, 0xdcbb4b); rect(set, 0, 0, 2, 16, 0x4a3119); rect(set, 14, 0, 2, 16, 0x4a3119); });
  tile('timeclock', (set, fine) => { brickRed(set, fine); rect(set, 4, 3, 8, 10, 0x34495e); rect(set, 5, 4, 6, 3, 0x7fe0a6); rect(set, 6, 9, 4, 2, 0xd8d3c4); });
  tile('trough', (set, fine) => { mottled(0x75583a, 0.06)(set, fine); rect(set, 0, 0, 16, 2, 0x5b4225); });
  tile('trough_top', (set, fine) => { rect(set, 0, 0, 16, 16, 0x5b4225); const n = fbm(); each2(fine, 8, 8, 48, 48, (x, y) => shade(0xcfb25a, 0.8 + n(x, y) * 0.4)); });
  tile('gravestone', mottled(0x8a8a88, 0.08));

  // Cut-outs: alpha 0 is discarded by the shader.
  const blade = (fine, x0, h, c, lean) => {
    for (let i = 0; i < h; i++) {
      const t = i / h, x = x0 + lean * t * t * 12, w = 3 * (1 - t) + 1;
      for (let k = 0; k < w; k++) fine(x + k, 63 - i, shade(c, 0.82 + t * 0.34));
    }
  };
  tile('empty', () => {}, 0x808080);
  tile('fence', (set, fine) => {
    const n = makeNoise(16);
    const wood = (x, y) => shade(0x8f7350, 0.84 + n(x, y) * 0.3);
    for (let x = 0; x < SIZE; x++) if (x % 16 < 12) for (let y = 3 + (x % 16 === 0 || x % 16 === 11 ? 2 : 0); y < SIZE; y++) fine(x, y, wood(x, y));
    for (let x = 0; x < SIZE; x++) { for (let y = 16; y < 22; y++) fine(x, y, shade(0x75593b, 0.92 + n(x, y) * 0.14)); for (let y = 44; y < 50; y++) fine(x, y, shade(0x75593b, 0.92 + n(x, y) * 0.14)); }
  }, 0x8f7350);
  tile('grass_plant', (set, fine) => { for (let b = 0; b < 26; b++) blade(fine, 4 + rnd() * 54, 26 + rnd() * 36, mix(0x4f7a35, 0x7f9f4a, rnd()), (rnd() - 0.5) * 2); }, 0x5e8238);
  tile('dry_plant', (set, fine) => { for (let b = 0; b < 22; b++) blade(fine, 4 + rnd() * 54, 26 + rnd() * 36, mix(0xa79a60, 0xc0b57a, rnd()), (rnd() - 0.5) * 2); }, 0xa79a60);
  const flower = (col) => (set, fine) => {
    for (let b = 0; b < 7; b++) blade(fine, 14 + rnd() * 34, 22 + rnd() * 16, 0x557f3a, (rnd() - 0.5) * 1.5);
    for (let f = 0; f < 3; f++) {
      const cx = 16 + f * 15 + rnd() * 5, cy = 14 + rnd() * 18;
      for (let i = 0; i < 34; i++) { const a = rnd() * 6.283, r = rnd() * 5.5; fine(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r < 1.8 ? 0xe2c64f : col); }
      for (let y = cy; y < 62; y++) fine(cx + Math.sin(y * 0.2) * 1.5, y, 0x4f7a35);
    }
  };
  tile('flower_blue', flower(0x6f80cc), 0x557f3a);
  tile('flower_white', flower(0xe9e6db), 0x557f3a);
  tile('flower_yellow', flower(0xdcbb45), 0x557f3a);
  tile('crop', (set, fine) => {
    for (let b = 0; b < 16; b++) {
      const x0 = 3 + b * 3.7 + rnd() * 2, h = 26 + rnd() * 26;
      blade(fine, x0, h, mix(0x427f33, 0x6aa648, rnd()), (rnd() - 0.5) * 1.6);
      for (let l = 0; l < 3; l++) { const y = 62 - h * (0.3 + l * 0.2); for (let i = 0; i < 9; i++) fine(x0 + (b % 2 ? i : -i), y - i * 0.4, 0x5c9b42); }
    }
  }, 0x4f8c3a);

  // Corrugated metal fence, as on private houses in Akyar: green profiled sheet on brown posts and rails.
  // One tile = one 3 m panel, 2 m high.
  tile('fence_metal', (set, fine) => {
    const n = makeNoise(16);
    each(fine, (x, y) => {
      if (x < 2) return shade(0x6b3a26, 0.9 + n(x, y) * 0.15);
      if ((y >= 10 && y < 13) || (y >= 54 && y < 57)) return shade(0x6b3a26, 0.95 + n(x, y) * 0.1);
      const r = x % 5;
      return shade(0x1f6b45, (r === 0 ? 0.72 : r === 1 ? 1.12 : r === 2 ? 1.02 : 0.92) * (0.95 + n(x, y) * 0.08) - (y < 1 ? 0.1 : 0));
    });
  });
  tile('sofa', (set, fine) => { const n = fbm(); each(fine, (x, y) => shade(0x7a5446, (y % 32 < 2 ? 0.8 : 1) * (0.9 + n(x, y) * 0.18))); });
  tile('sofa_side', (set, fine) => { const n = fbm(); each(fine, (x, y) => (y < 20 ? shade(0x8a6152, 0.92 + n(x, y) * 0.15) : y > 56 ? 0x3e2a20 : shade(0x7a5446, 0.86 + n(x, y) * 0.15))); });
  tile('tv', (set) => { rect(set, 0, 0, 16, 16, 0x5e4630); rect(set, 1, 2, 14, 9, 0x111316); rect(set, 2, 3, 12, 7, 0x1e2a36); rect(set, 3, 4, 5, 2, 0x34485c); rect(set, 2, 12, 12, 3, 0x4a3726); });
  tile('sink_top', (set, fine) => { mottled(0xdcd6c8, 0.03)(set, fine); rect(set, 3, 3, 10, 8, 0xa9b1b5); rect(set, 4, 4, 8, 6, 0xc7ced1); set(8, 2, 0x8a9296); });

  // Leaf clusters for tree crowns: drawn as crossed cards, so crowns look leafy rather than solid.
  const leafCard = (dark, light, leaves, size, droop) => (set, fine) => {
    for (let i = 0; i < leaves; i++) {
      const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 27;
      let cx = 32 + Math.cos(a) * r, cy = 32 + Math.sin(a) * r * (droop ? 1.15 : 0.9);
      const col = mix(dark, light, Math.min(1, rnd() * 0.7 + (1 - cy / 64) * 0.5));
      const len = size * (0.7 + rnd() * 0.6), ang = rnd() * 6.283;
      if (droop) {
        for (let k = 0; k < len * 3; k++) { fine(cx, cy, col); cx += (rnd() - 0.5) * 0.8; cy += 0.7; }
      } else {
        for (let t = -len; t <= len; t += 0.5) for (let w = -len * 0.45; w <= len * 0.45; w += 0.5) {
          const k = 1 - Math.abs(t) / len;
          if (Math.abs(w) <= len * 0.45 * k + 0.4) fine(cx + Math.cos(ang) * t - Math.sin(ang) * w, cy + Math.sin(ang) * t + Math.cos(ang) * w, col);
        }
      }
    }
  };
  tile('leaf_broad', leafCard(0x2e5223, 0x6b9940, 150, 2.8, false), 0x3e6a2c);
  tile('leaf_birch', leafCard(0x4c7a2c, 0x9cc252, 190, 2.2, false), 0x6a9a3a);
  tile('leaf_willow', leafCard(0x4f7a3a, 0x9cb65e, 120, 3.2, true), 0x6a9048);
  tile('leaf_pine', (set, fine) => {
    for (let b = 0; b < 9; b++) {
      const y0 = 8 + b * 6 + rnd() * 3, half = 6 + (b / 9) * 22;
      for (let x = 32 - half; x <= 32 + half; x += 0.5) for (let k = 0; k < 3; k++) {
        const y = y0 + Math.abs(x - 32) * 0.35 + rnd() * 2;
        fine(x, y, mix(0x1f3d26, 0x4f7a45, rnd()));
      }
    }
  }, 0x29492e);

  // ---------- Block definitions ----------
  const B = {};
  const defs = [null];
  function block(name, spec) {
    const t = (n) => tileIndex[n];
    const d = Object.assign({ solid: true, opaque: true, cross: false, cut: false, noface: false, plantH: 0.6 }, spec);
    d.tTop = t(spec.top || spec.all); d.tSide = t(spec.side || spec.all); d.tBottom = t(spec.bottom || spec.top || spec.all);
    d.name = name;
    B[name] = defs.length;
    defs.push(d);
  }
  // Collision-only blocks: the ground, generic buildings, tree trunks and riverbanks are drawn as smooth meshes.
  block('GROUND', { all: 'empty', noface: true });
  block('INVIS', { all: 'empty', noface: true });
  block('WATER_WALL', { all: 'empty', noface: true });
  ['DIRT:dirt', 'STONE:stone', 'SAND:sand', 'GRAVEL:gravel', 'DIRT_ROAD:path_dirt', 'SOIL:soil',
    'PLANKS:planks', 'PLASTER:plaster', 'WIN_PLASTER:win_plaster', 'BRICK_RED:brick_red', 'WIN_BRICK:win_brick',
    'BRICK_WHITE:brick_white', 'WIN_WHITEBRICK:win_whitebrick', 'CONCRETE:concrete', 'WIN_CONCRETE:win_concrete', 'METAL:metal',
    'ROOF_RED:roof_red', 'ROOF_GREEN:roof_green', 'ROOF_BLUE:roof_blue', 'ROOF_GRAY:roof_gray', 'ROOF_BROWN:roof_brown', 'FLAT_ROOF:flat_roof',
    'DOME_GREEN:dome_green', 'DOME_GOLD:dome_gold', 'FLOOR_TILE:floor_tile', 'TERMINAL_FLOOR:terminal_floor', 'RUG:rug', 'CUPBOARD:cupboard', 'HAY:hay', 'SACK:sack', 'CRATE:crate', 'STRAW:straw',
    'SHELF:shelf', 'TIMECLOCK:timeclock', 'GRAVESTONE:gravestone', 'WALL_LOG:wall_log', 'WIN_LOG:win_log'].forEach((s) => { const [n, t] = s.split(':'); block(n, { all: t }); });
  for (const k of Object.keys(WALLS)) { block('WALL_' + k.toUpperCase(), { all: 'wall_' + k }); block('WIN_' + k.toUpperCase(), { all: 'win_' + k }); }
  block('BED', { top: 'bed_top', side: 'bed_side', bottom: 'planks' });
  block('HOTEL_BED', { top: 'hotel_bed_top', side: 'hotel_bed_side', bottom: 'planks' });
  block('TABLE', { top: 'table_top', side: 'table_side', bottom: 'table_top', opaque: false, cut: true });
  block('STOVE', { top: 'stove_top', side: 'stove_side', bottom: 'stove_side' });
  block('STOVE_FRONT', { top: 'stove_top', side: 'stove_front', bottom: 'stove_side' });
  block('FRIDGE', { top: 'fridge', side: 'fridge', bottom: 'fridge' });
  block('COUNTER', { top: 'counter_top', side: 'counter', bottom: 'counter' });
  block('DESK', { top: 'counter_top', side: 'desk', bottom: 'desk' });
  block('CHEST', { top: 'chest', side: 'chest', bottom: 'chest' });
  block('TROUGH', { top: 'trough_top', side: 'trough', bottom: 'trough' });
  block('FENCE', { top: 'empty', bottom: 'empty', side: 'fence', opaque: false, cut: true });
  block('SOFA', { top: 'sofa', side: 'sofa_side', bottom: 'sofa' });
  block('TV', { top: 'counter_top', side: 'tv', bottom: 'tv' });
  block('SINK', { top: 'sink_top', side: 'counter', bottom: 'counter' });
  const plant = (n, t, h) => block(n, { all: t, solid: false, opaque: false, cross: true, plantH: h });
  plant('GRASS_PLANT', 'grass_plant', 0.45); plant('DRY_PLANT', 'dry_plant', 0.45);
  plant('FLOWER_BLUE', 'flower_blue', 0.5); plant('FLOWER_WHITE', 'flower_white', 0.5); plant('FLOWER_YELLOW', 'flower_yellow', 0.5); plant('CROP', 'crop', 0.95);

  B.AIR = 0;
  const count = defs.length;
  // Fast look-up tables for the mesher and physics.
  const SOLID = new Uint8Array(count), OPAQUE = new Uint8Array(count), CROSS = new Uint8Array(count), CUT = new Uint8Array(count), NOFACE = new Uint8Array(count);
  const T_TOP = new Uint16Array(count), T_SIDE = new Uint16Array(count), T_BOT = new Uint16Array(count), PLANT_H = new Float32Array(count);
  for (let i = 1; i < count; i++) {
    const d = defs[i];
    SOLID[i] = d.solid ? 1 : 0; OPAQUE[i] = d.opaque ? 1 : 0; CROSS[i] = d.cross ? 1 : 0; CUT[i] = d.cut ? 1 : 0; NOFACE[i] = d.noface ? 1 : 0;
    T_TOP[i] = d.tTop; T_SIDE[i] = d.tSide; T_BOT[i] = d.tBottom; PLANT_H[i] = d.plantH;
  }

  function makeTextureArray(anisotropy) {
    const data = new Uint8Array(SIZE * SIZE * 4 * tiles.length);
    tiles.forEach((t, i) => data.set(t, i * SIZE * SIZE * 4));
    const tex = new THREE.DataArrayTexture(data, SIZE, SIZE, tiles.length);
    tex.format = THREE.RGBAFormat;
    tex.type = THREE.UnsignedByteType;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.generateMipmaps = true;
    tex.anisotropy = anisotropy || 1;
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  G.blocks = { B, SOLID, OPAQUE, CROSS, CUT, NOFACE, T_TOP, T_SIDE, T_BOT, PLANT_H, makeTextureArray, tileIndex, count };
})();
