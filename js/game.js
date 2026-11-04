// Main game: player, car, animals, quests, shop, work, HUD, save/load.
(function () {
  'use strict';
  const G = window.G;
  const { B, SOLID } = G.blocks;
  const V = G.voxels, W = G.world, M = G.models, SI = G.sites, A = G.audio;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const BND = W.bounds;

  // ---------- content tables: tweak prices, food values and pay here ----------
  const ITEMS = {
    grain: { name: 'Grain', ico: '🌾' },
    catfood: { name: 'Cat food', ico: '🐟' },
    egg: { name: 'Egg', ico: '🥚', food: 10 },
    bread: { name: 'Bread', ico: '🍞', food: 22 },
    kefir: { name: 'Kefir', ico: '🥛', food: 16 },
    chakchak: { name: 'Chak-chak', ico: '🍯', food: 34 },
    beshbarmak: { name: 'Beshbarmak', ico: '🍲', food: 65 },
  };
  const SHOP = [
    { id: 'bread', price: 40, desc: 'Fresh loaf. +22 food' },
    { id: 'kefir', price: 55, desc: 'Cold and sour. +16 food' },
    { id: 'chakchak', price: 110, desc: 'Honey sweet from Bashkortostan. +34 food' },
    { id: 'beshbarmak', price: 180, desc: 'Hot meat and noodles. +65 food' },
    { id: 'grain', qty: 6, price: 60, desc: 'Bag of 6 handfuls for the chickens' },
    { id: 'catfood', qty: 3, price: 50, desc: '3 portions for the cats' },
  ];
  const EGG_PRICE = 25, SHIFT_CRATES = 5, SHIFT_PAY = 300, DAY_SECONDS = 20 * 60, HUNGER_PER_SEC = 0.1;
  const SAVE_KEY = 'akyar-blocks-save-v2'; // bumped when the map layout changes, because old saves hold old positions

  const newState = () => ({
    money: 200, hunger: 75, hour: 7, day: 1, lastReset: 1, lastShiftDay: 0, fridgeDay: 0,
    items: { grain: 0, catfood: 0, egg: 0, bread: 0, kefir: 0, chakchak: 0, beshbarmak: 0 },
    keys: {}, carKey: false, flags: {},
    px: SI.home.spawn.x, py: SI.home.spawn.y, pz: SI.home.spawn.z, yaw: SI.home.spawnYaw, pitch: 0,
    cx: SI.home.car.x, cy: SI.home.car.y, cz: SI.home.car.z, ch: SI.home.carHeading, inCar: false,
    hens: [], cats: [], questIdx: 0,
  });
  let S = newState();

  // ---------- renderer ----------
  // Visitors arriving from a public link may have no WebGL2: tell them, instead of a blank page.
  if (!document.createElement('canvas').getContext('webgl2')) {
    $('load-status').textContent = 'This game needs WebGL2, which this browser or device does not provide. Try a recent Chrome, Edge or Firefox on a computer, with hardware acceleration turned on.';
    return;
  }
  if (matchMedia('(hover: none) and (pointer: coarse)').matches) {
    const note = document.createElement('p');
    note.className = 'sub';
    note.textContent = 'This game needs a keyboard and mouse, so it will not be playable on a phone or tablet yet.';
    $('load-status').before(note);
  }
  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: /[#&]shot=/.test(location.hash) });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 8500);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize);
  resize();

  V.init(scene);
  const U = G.mats.U;

  // ---------- map canvas: HUD map + ground texture of the far landscape ----------
  const MAP_K = 0.5;
  const mapCanvas = document.createElement('canvas');
  const mapX = (x) => (x - BND.x0) * MAP_K, mapZ = (z) => (z - BND.z0) * MAP_K;
  function drawMap() {
    mapCanvas.width = Math.ceil((BND.x1 - BND.x0) * MAP_K);
    mapCanvas.height = Math.ceil((BND.z1 - BND.z0) * MAP_K);
    const c = mapCanvas.getContext('2d');
    const lu = W.D.landuse;
    const small = document.createElement('canvas'); small.width = lu.w; small.height = lu.h;
    const sc = small.getContext('2d'), img = sc.createImageData(lu.w, lu.h);
    const cols = { 0: [116, 160, 74], 1: [62, 112, 52], 2: [150, 145, 130], 3: [106, 140, 90], 4: [154, 166, 84], 5: [86, 130, 90], 6: [110, 168, 80], 7: [110, 110, 112], 8: [150, 138, 110], 9: [190, 176, 130] };
    for (let j = 0, i = 0; j < lu.h; j++) for (let x = 0; x < lu.w; x++, i++) {
      const wx = lu.x0 + x * lu.step, wz = lu.z0 + j * lu.step;
      const hs = clamp(1 + (W.elevation(wx - 8, wz) - W.elevation(wx + 8, wz)) * 0.09 + (W.elevation(wx, wz - 8) - W.elevation(wx, wz + 8)) * 0.09, 0.7, 1.25);
      const col = cols[W.landuse(wx + 1, wz + 1)] || cols[0];
      img.data[i * 4] = col[0] * hs; img.data[i * 4 + 1] = col[1] * hs; img.data[i * 4 + 2] = col[2] * hs; img.data[i * 4 + 3] = 255;
    }
    sc.putImageData(img, 0, 0);
    c.imageSmoothingEnabled = true;
    c.drawImage(small, (lu.x0 - BND.x0) * MAP_K, (lu.z0 - BND.z0) * MAP_K, lu.w * lu.step * MAP_K, lu.h * lu.step * MAP_K);
    const line = (p, w, col) => {
      c.beginPath();
      for (let i = 0; i < p.length; i += 2) { const x = mapX(p[i]), y = mapZ(p[i + 1]); i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.lineWidth = w; c.strokeStyle = col; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
    };
    W.D.waters.forEach((w) => { line(w.p, 2, '#3f7da3'); c.fillStyle = '#3f7da3'; c.fill(); });
    W.D.rivers.forEach((r) => line(r.p, Math.max(2, r.w * MAP_K * 1.2), '#3f7da3'));
    for (const r of W.roads) {
      const col = r.surf === 'asphalt' ? '#5f5f62' : r.surf === 'gravel' ? '#a39c8d' : '#a28d6b';
      line(r.p, Math.max(1.2, r.w * MAP_K), col);
    }
    c.fillStyle = '#8a7f72';
    for (const b of W.buildings) {
      c.beginPath();
      for (let i = 0; i < b.p.length; i += 2) { const x = mapX(b.p[i]), y = mapZ(b.p[i + 1]); i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.closePath(); c.fill();
    }
    const h = SI.home;
    c.fillStyle = '#7ba84e';
    c.fillRect(mapX(h.x0), mapZ(h.z0), (h.x1 - h.x0) * MAP_K, (h.z1 - h.z0) * MAP_K);
  }

  // ---------- sky ----------
  const skyU = { uTop: { value: new THREE.Color() }, uHor: { value: U.uFogColor.value }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uNight: { value: 0 }, uSunset: { value: 0 } };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(7000, 24, 16), new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, side: THREE.BackSide, depthWrite: false, depthTest: false,
    uniforms: skyU,
    vertexShader: `out vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSunDir; uniform float uNight; uniform float uSunset;
      in vec3 vDir; out vec4 fragColor;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = mix(uHor, uTop, pow(clamp(d.y * 1.9, 0.0, 1.0), 0.65));
        vec3 r = normalize(cross(uSunDir, vec3(0.0, 0.0, 1.0)));
        vec3 u2 = cross(r, uSunDir);
        float a = dot(d, r), b = dot(d, u2);
        if (dot(d, uSunDir) > 0.0 && max(abs(a), abs(b)) < 0.05) c = mix(vec3(1.0, 0.97, 0.78), vec3(1.0, 0.7, 0.35), uSunset);
        if (dot(d, uSunDir) < 0.0 && max(abs(a), abs(b)) < 0.035) c = mix(c, vec3(0.92, 0.93, 0.98), uNight);
        if (uNight > 0.02 && d.y > 0.02 && hash(floor(d * 170.0)) > 0.9975) c = mix(c, vec3(1.0), uNight);
        fragColor = vec4(c, 1.0);
      }`,
  }));
  dome.frustumCulled = false;
  dome.renderOrder = -100;
  scene.add(dome);

  function updateSky(hour) {
    const a = ((hour - 6) / 12) * Math.PI;
    const el = Math.sin(a);
    const k = clamp((el + 0.12) / 0.4, 0, 1), day = k * k * (3 - 2 * k);
    const sunset = Math.exp(-Math.pow(el / 0.2, 2));
    const mix3 = (n, d) => [lerp(n[0], d[0], day), lerp(n[1], d[1], day), lerp(n[2], d[2], day)];
    const top = mix3([0.03, 0.05, 0.14], [0.32, 0.58, 0.9]);
    let hor = mix3([0.08, 0.11, 0.2], [0.74, 0.86, 0.96]);
    hor = [lerp(hor[0], 0.98, sunset * 0.6), lerp(hor[1], 0.62, sunset * 0.6), lerp(hor[2], 0.4, sunset * 0.6)];
    skyU.uTop.value.setRGB(top[0], top[1], top[2]);
    U.uFogColor.value.setRGB(hor[0], hor[1], hor[2]);
    const tint = mix3([0.36, 0.41, 0.58], [1, 1, 0.98]);
    U.uSun.value.setRGB(lerp(tint[0], tint[0] * 1.03, sunset), lerp(tint[1], tint[1] * 0.86, sunset), lerp(tint[2], tint[2] * 0.72, sunset));
    skyU.uSunDir.value.set(Math.cos(a), el, 0.3).normalize();
    skyU.uNight.value = 1 - day;
    skyU.uSunset.value = sunset;
  }

  // ---------- world objects ----------
  const clouds = M.clouds();
  clouds.position.y = 240;
  scene.add(clouds);

  const carObj = M.car();
  scene.add(carObj);
  const car = { speed: 0, steer: 0, y: S.cy, pitch: 0, roll: 0, spin: 0 };

  const arm = M.arm();
  arm.position.set(0.3, -0.26, -0.5);
  arm.rotation.set(0.25, -0.1, 0);
  camera.add(arm);
  const heldCrate = M.crate();
  heldCrate.position.set(0, -0.42, -0.75);
  heldCrate.visible = false;
  camera.add(heldCrate);
  const carViewOffset = new THREE.Vector3(-0.42, 1.36, 0.3);
  let thirdPerson = false, lookYaw = 0;

  // Doors
  const doors = SI.doors.map((d) => {
    const color = d.id === 'home' ? 0x8a5c33 : d.id === 'shed' ? 0x705231 : d.id === 'shop' ? 0x3f7fb5 : 0x7a8084;
    const g = M.door(color, d.along);
    if (d.along === 'x') g.position.set(d.x, d.y, d.z + 0.5); else g.position.set(d.x + 0.5, d.y, d.z);
    scene.add(g);
    const obj = { ...d, g, open: false, angle: 0, center: new THREE.Vector3(d.x + 0.5, d.y + 1.05, d.z + 0.5) };
    setDoorSolid(obj, true);
    return obj;
  });
  function setDoorSolid(o, closed) {
    for (const y of [o.y, o.y + 1]) {
      const k = V.doorKey(o.x, y, o.z);
      if (closed) V.closedDoors.set(k, o); else V.closedDoors.delete(k);
    }
  }
  const doorById = (id) => doors.find((d) => d.id === id);

  // Signs on the real buildings
  function placeSign(site, lines, bg, fg) {
    const d = site.door;
    const s = M.signPlane(lines, 7, 1.5, bg, fg);
    s.position.set(d.x + 0.5 - d.dx * 0.56, site.y + 3.2, d.z + 0.5 - d.dz * 0.56);
    s.rotation.y = Math.atan2(-d.dx, -d.dz);
    scene.add(s);
  }
  placeSign(SI.shop, ['SHOP', 'FOOD AND GROCERIES'], '#1f5d9e', '#ffffff');
  placeSign(SI.work, ['PARCEL DEPOT', 'STAFF ENTRANCE'], '#3a3f44', '#f0c94a');

  // Shop cashier, cat bowl, carried items and so on
  const cashier = M.person(0xb5342e, 0x3a2a1c);
  cashier.position.copy(SI.shop.cashier);
  cashier.rotation.y = SI.shop.cashierYaw;
  scene.add(cashier);
  const bowl = M.bowl(0xc8ccd0);
  bowl.position.copy(SI.home.bowl);
  scene.add(bowl);
  const pallet = M.pallet();
  pallet.position.copy(SI.work.drop);
  scene.add(pallet);
  const stackedCrates = [];

  const carKeyObj = M.carKey();
  carKeyObj.position.copy(SI.home.keyHook);
  scene.add(carKeyObj);

  // Quest keys
  const keysW = SI.landmarks.map((l) => {
    const g = new THREE.Group();
    const key = M.goldKey();
    key.scale.setScalar(1.6);
    key.position.y = 1.1;
    g.add(key);
    const beam = M.beacon(0xffe27a);
    g.add(beam);
    scene.add(g);
    const y = V.groundBelow(l.x, l.z, W.elevation(l.x, l.z) + 24);
    g.position.set(l.x, y, l.z);
    return { ...l, g, key, beam, y };
  });

  // Animals
  const homeLocal = (area) => SI.home.pos(lerp(area.u0, area.u1, Math.random()), 0, lerp(area.v0, area.v1, Math.random()));
  function makeAnimal(type, i, area) {
    const group = type === 'hen' ? M.chicken(i) : M.cat(i);
    scene.add(group);
    const mark = M.textSprite('!', '#ffd84a');
    mark.position.y = type === 'hen' ? 1.0 : 0.95;
    mark.scale.setScalar(0.42);
    group.add(mark);
    let p = homeLocal(area);
    for (let t = 0; t < 30 && V.solidAt(Math.floor(p.x), SI.home.y, Math.floor(p.z)); t++) p = homeLocal(area);
    return { type, i, area, group, mark, x: p.x, z: p.z, y: SI.home.y, yaw: Math.random() * 6.28, tx: p.x, tz: p.z, state: 'idle', timer: Math.random() * 2, fed: false, phase: Math.random() * 6, voice: 2 + Math.random() * 8, eggTimer: -1, laid: false };
  }
  const hens = [0, 1, 2, 3, 4].map((i) => makeAnimal('hen', i, SI.home.chickenArea));
  const cats = [0, 1, 2].map((i) => makeAnimal('cat', i, SI.home.catArea));
  const eggs = [];

  // ---------- floating hearts ----------
  const floaters = [];
  const heartSrc = ['♥', '#ff5c7a'];
  function floatIcon(pos, sym = heartSrc[0], col = heartSrc[1], n = 3) {
    for (let i = 0; i < n; i++) {
      const s = M.textSprite(sym, col);
      s.scale.setScalar(0.34);
      s.position.set(pos.x + (Math.random() - 0.5) * 0.5, pos.y + 0.4 + Math.random() * 0.3, pos.z + (Math.random() - 0.5) * 0.5);
      scene.add(s);
      floaters.push({ s, t: 1.1 + Math.random() * 0.4 });
    }
  }

  // ---------- player ----------
  const P = { x: S.px, y: S.py, z: S.pz, vx: 0, vy: 0, vz: 0, yaw: S.yaw, pitch: S.pitch, onGround: false, eye: S.py + 1.62, bob: 0, stepDist: 0, inWater: false };
  const keys = {};
  const HW = 0.3, HH = 1.78;
  const TERRAIN = new Set([B.GRASS, B.FOREST, B.STEPPE, B.DIRT, B.STONE, B.SAND, B.GRAVEL, B.ASPHALT, B.ROAD_LINE, B.DIRT_ROAD, B.SOIL, B.PLANKS, B.FLOOR_TILE, B.RUG, B.CONCRETE, B.STRAW]);
  function collides(x, y, z) {
    const x0 = Math.floor(x - HW), x1 = Math.floor(x + HW), y0 = Math.floor(y), y1 = Math.floor(y + HH), z0 = Math.floor(z - HW), z1 = Math.floor(z + HW);
    for (let iy = y0; iy <= y1; iy++) for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) if (V.solidAt(ix, iy, iz)) return true;
    return false;
  }
  function canStepAt(nx, y, nz) {
    if (collides(nx, y + 1, nz) || collides(P.x, y + 1, P.z)) return false;
    const x0 = Math.floor(nx - HW), x1 = Math.floor(nx + HW), z0 = Math.floor(nz - HW), z1 = Math.floor(nz + HW), iy = Math.floor(y);
    for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
      const id = V.blockAt(ix, iy, iz);
      if (SOLID[id] && !TERRAIN.has(id)) return false;
      if (V.closedDoors.has(V.doorKey(ix, iy, iz))) return false;
    }
    return true;
  }
  let boundsToastAt = 0;
  function clampBounds() {
    const m = 3;
    const x = clamp(P.x, BND.x0 + m, BND.x1 - m), z = clamp(P.z, BND.z0 + m, BND.z1 - m);
    if (x !== P.x || z !== P.z) {
      P.x = x; P.z = z;
      if (performance.now() - boundsToastAt > 6000) { boundsToastAt = performance.now(); toast('This is the edge of the mapped area around Akyar.'); }
    }
  }
  function updatePlayer(dt) {
    const fwd = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), strafe = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
    let wx = -sin * fwd + cos * strafe, wz = -cos * fwd - sin * strafe;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    const running = keys.ShiftLeft || keys.ShiftRight;
    let speed = running ? 7.5 : 4.6;
    if (S.hunger <= 0) speed *= 0.6;
    P.inWater = V.blockAt(Math.floor(P.x), Math.floor(P.y + 0.5), Math.floor(P.z)) === B.WATER;
    if (P.inWater) speed *= 0.55;
    if (carrying) speed *= 0.85;
    const acc = P.onGround || P.inWater ? 14 : 4;
    P.vx += (wx * speed - P.vx) * Math.min(1, acc * dt);
    P.vz += (wz * speed - P.vz) * Math.min(1, acc * dt);
    if (P.inWater) {
      P.vy = keys.Space ? 3 : Math.max(P.vy - 8 * dt, -1.6);
    } else {
      P.vy -= 24 * dt;
      if (P.vy < -40) P.vy = -40;
      if (keys.Space && P.onGround) { P.vy = 8.2; P.onGround = false; A.jump(); }
    }
    const moveH = (axis, delta) => {
      if (!delta) return;
      const steps = Math.ceil(Math.abs(delta) / 0.25), d = delta / steps;
      for (let i = 0; i < steps; i++) {
        const nx = axis === 'x' ? P.x + d : P.x, nz = axis === 'z' ? P.z + d : P.z;
        if (!collides(nx, P.y, nz)) { P.x = nx; P.z = nz; continue; }
        if ((P.onGround || P.inWater) && canStepAt(nx, P.y, nz)) { P.y = Math.floor(P.y) + 1; P.x = nx; P.z = nz; P.vy = 0; continue; }
        if (axis === 'x') P.vx = 0; else P.vz = 0;
        break;
      }
    };
    moveH('x', P.vx * dt);
    moveH('z', P.vz * dt);
    clampBounds();
    const dy = P.vy * dt;
    if (!collides(P.x, P.y + dy, P.z)) { P.y += dy; P.onGround = false; }
    else {
      if (dy < 0) { P.y = Math.floor(P.y + dy) + 1; P.onGround = true; if (collides(P.x, P.y, P.z)) P.y = Math.ceil(P.y); }
      P.vy = 0;
    }
    const target = P.y + 1.62;
    if (Math.abs(P.eye - target) > 2.2) P.eye = target;
    else P.eye += (target - P.eye) * Math.min(1, dt * 16);

    const hs = Math.hypot(P.vx, P.vz);
    if (P.onGround && hs > 0.4) {
      P.bob += hs * dt * 1.9;
      P.stepDist += hs * dt;
      if (P.stepDist > (running ? 2.8 : 2.1)) {
        P.stepDist = 0;
        const id = V.blockAt(Math.floor(P.x), Math.floor(P.y - 0.2), Math.floor(P.z));
        A.step(id === B.PLANKS || id === B.RUG ? 'wood' : id === B.ASPHALT || id === B.FLOOR_TILE || id === B.CONCRETE || id === B.ROAD_LINE ? 'hard' : 'soft');
      }
    }
    camera.position.set(P.x, P.eye + Math.sin(P.bob * 2) * 0.035, P.z);
    camera.rotation.set(P.pitch, P.yaw, 0);
    arm.position.y = -0.26 + Math.sin(P.bob * 2) * 0.012 - armSwing * 0.1;
    arm.rotation.x = 0.25 + armSwing * 0.8;
    armSwing = Math.max(0, armSwing - dt * 4);
  }
  let armSwing = 0;

  // ---------- car ----------
  const CAR_SAMPLES = [[0.85, -2.05], [-0.85, -2.05], [0, -2.1], [0.85, 0], [-0.85, 0], [0.85, 2.05], [-0.85, 2.05], [0, 2.1]];
  function carProbe(x, z, h, yRef) {
    const baseY = Math.floor(yRef + 0.2);
    let maxFront = -1e9, maxRear = -1e9;
    const c = Math.cos(h), s = Math.sin(h);
    for (const [lx, lz] of CAR_SAMPLES) {
      const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
      const ix = Math.floor(px), iz = Math.floor(pz);
      if (V.solidAt(ix, baseY + 1, iz) || V.solidAt(ix, baseY + 2, iz)) return { blocked: true };
      const here = V.blockAt(ix, baseY, iz);
      if (SOLID[here] && !TERRAIN.has(here)) return { blocked: true };
      const g = V.groundBelow(ix + 0.5, iz + 0.5, baseY + 0.5);
      if (V.blockAt(ix, g, iz) === B.WATER) return { blocked: true, water: true };
      if (lz < 0) maxFront = Math.max(maxFront, g); else maxRear = Math.max(maxRear, g);
    }
    return { blocked: false, front: maxFront, rear: maxRear };
  }
  let waterToastAt = 0;
  function updateCar(dt) {
    const throttle = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), steerIn = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0);
    const brake = keys.Space;
    const maxF = 27, maxR = 8;
    if (throttle > 0) car.speed += (car.speed < 0 ? 16 : 8.5 * (1 - (car.speed / maxF) * 0.75)) * dt;
    else if (throttle < 0) car.speed -= (car.speed > 0 ? 16 : 6) * dt;
    else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), (1 + Math.abs(car.speed) * 0.08) * dt);
    if (brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 22 * dt);
    car.speed = clamp(car.speed, -maxR, maxF);
    car.steer += (steerIn * (0.62 - Math.min(0.42, Math.abs(car.speed) * 0.016)) - car.steer) * Math.min(1, dt * 7);
    const dh = (car.speed / 2.6) * Math.tan(car.steer) * dt;
    const nh = S.ch + dh;
    const nx = S.cx - Math.sin(nh) * car.speed * dt, nz = S.cz - Math.cos(nh) * car.speed * dt;
    const pr = carProbe(nx, nz, nh, car.y);
    if (pr.blocked || nx < BND.x0 + 5 || nx > BND.x1 - 5 || nz < BND.z0 + 5 || nz > BND.z1 - 5) {
      if (pr.water && performance.now() - waterToastAt > 5000) { waterToastAt = performance.now(); toast('Too deep to drive here. Look for a bridge.'); }
      if (Math.abs(car.speed) > 5) A.crash();
      car.speed *= -0.25;
    } else {
      S.cx = nx; S.cz = nz; S.ch = nh;
      const tgt = Math.max(pr.front, pr.rear);
      car.y += (tgt - car.y) * Math.min(1, dt * (tgt > car.y ? 12 : 7));
      car.pitch += (Math.atan2(pr.front - pr.rear, 4) - car.pitch) * Math.min(1, dt * 6);
    }
    car.roll += (-car.steer * Math.min(1, Math.abs(car.speed) / 18) * 0.07 - car.roll) * Math.min(1, dt * 5);
    S.cy = car.y;
    A.setEngine(true, Math.min(1, Math.abs(car.speed) / maxF));
    syncCarObj();
    P.x = S.cx; P.z = S.cz; P.y = car.y;
  }
  function syncCarObj() {
    carObj.position.set(S.cx, car.y, S.cz);
    carObj.rotation.set(car.pitch, S.ch, car.roll, 'YXZ');
    car.spin += (car.speed / 0.36) * 0.016;
    const ud = carObj.userData;
    for (const w of ud.wheels) { w.spin.rotation.x = -car.spin; if (w.front) w.pivot.rotation.y = car.steer; }
    ud.wheel.rotation.z = car.steer * 2.4;
  }
  const camV = new THREE.Vector3(), camQ = new THREE.Quaternion(), eulerV = new THREE.Euler(0, 0, 0, 'YXZ');
  function updateCarCamera() {
    carObj.updateMatrixWorld(true);
    if (thirdPerson) {
      const yaw = S.ch + lookYaw;
      // Chase camera: pull in towards the car if a wall or roof is in the way.
      const camH = clamp(3.4 - P.pitch * 4, 1.6, 6);
      let dist = 7.5;
      for (let d = 1.5; d <= 7.5; d += 0.5) {
        const k = d / 7.5, hx = S.cx + Math.sin(yaw) * d, hz = S.cz + Math.cos(yaw) * d, hy = car.y + 1.2 + (camH - 1.2) * k;
        if (V.solidAt(Math.floor(hx), Math.floor(hy), Math.floor(hz)) || V.solidAt(Math.floor(hx), Math.floor(hy + 0.3), Math.floor(hz))) { dist = Math.max(1.5, d - 0.75); break; }
      }
      const kd = dist / 7.5;
      camera.position.set(S.cx + Math.sin(yaw) * dist, car.y + 1.2 + (camH - 1.2) * kd, S.cz + Math.cos(yaw) * dist);
      camera.rotation.set(-0.22 + P.pitch * 0.5, yaw, 0);
    } else {
      camV.copy(carViewOffset).applyMatrix4(carObj.matrixWorld);
      camera.position.copy(camV);
      eulerV.set(P.pitch + car.pitch, S.ch + lookYaw, car.roll * 0.5);
      camQ.setFromEuler(eulerV);
      camera.quaternion.copy(camQ);
    }
  }
  function enterCar() {
    if (!S.carKey) { toast('The car is locked. The key is on the kitchen table.'); A.denied(); return; }
    S.inCar = true; lookYaw = 0; P.pitch = -0.04;
    arm.visible = false;
    A.ignition();
    $('speedo').classList.remove('hidden');
    if (!S.flags.droveCar) { S.flags.droveCar = true; toast('W accelerate · S reverse · A/D steer · Space brake'); }
    car.y = S.cy;
  }
  function exitCar() {
    if (Math.abs(car.speed) > 4) { toast('Slow down before getting out.'); return; }
    const c = Math.cos(S.ch), s = Math.sin(S.ch);
    for (const [lx, lz] of [[-1.7, 0], [1.7, 0], [0, 3], [0, -3], [-2.6, 0], [2.6, 0]]) {
      const x = S.cx + lx * c + lz * s, z = S.cz - lx * s + lz * c;
      const y = V.groundBelow(x, z, car.y + 2);
      if (!collides(x, y, z) && V.blockAt(Math.floor(x), y, Math.floor(z)) !== B.WATER) {
        P.x = x; P.y = y; P.z = z; P.vx = P.vy = P.vz = 0; P.eye = y + 1.62; P.yaw = S.ch; P.pitch = 0;
        S.inCar = false; car.speed = 0; arm.visible = !carrying; thirdPerson = false;
        A.setEngine(false, 0);
        $('speedo').classList.add('hidden');
        return;
      }
    }
    toast('No room to get out here.');
  }

  // ---------- animals ----------
  function retarget(a) {
    const p = homeLocal(a.area);
    a.tx = p.x; a.tz = p.z;
  }
  function updateAnimal(a, dt) {
    const dPl = Math.hypot(a.x - P.x, a.z - P.z);
    const near = Math.hypot(a.x - camera.position.x, a.z - camera.position.z) < 220;
    a.group.visible = near;
    if (!near) return;
    a.timer -= dt; a.phase += dt;
    const isHen = a.type === 'hen';
    const ud = a.group.userData;
    a.mark.visible = !a.fed;
    const hungryCatChase = !isHen && !a.fed && dPl < 9 && !S.inCar;
    if (isHen && dPl < 3.2 && (keys.ShiftLeft || keys.ShiftRight) && !S.inCar && a.state !== 'flee') {
      a.state = 'flee'; a.timer = 1.1;
      const dx = a.x - P.x, dz = a.z - P.z, l = Math.hypot(dx, dz) || 1;
      a.tx = a.x + (dx / l) * 6; a.tz = a.z + (dz / l) * 6;
      A.cluck(0.14);
    }
    if (hungryCatChase) {
      if (dPl > 1.5) { a.state = 'walk'; a.tx = P.x; a.tz = P.z; a.timer = 0.5; } else if (a.state === 'walk') a.state = 'idle';
    }
    if (a.state === 'idle' && a.timer <= 0) {
      a.state = 'walk'; a.timer = 2 + Math.random() * 3; retarget(a);
    }
    if (a.state === 'walk' || a.state === 'flee') {
      const dx = a.tx - a.x, dz = a.tz - a.z, l = Math.hypot(dx, dz);
      const speed = a.state === 'flee' ? 4.4 : isHen ? 1.0 : hungryCatChase ? 2.6 : 1.3;
      if (l < 0.3 || a.timer <= 0) { a.state = 'idle'; a.timer = 1.5 + Math.random() * 3.5; }
      else {
        const nx = a.x + (dx / l) * speed * dt, nz = a.z + (dz / l) * speed * dt;
        const h = SI.home;
        const inYard = nx > h.x0 + 1.5 && nx < h.x1 - 1.5 && nz > h.z0 + 1.5 && nz < h.z1 - 1.5;
        if (!inYard || V.solidAt(Math.floor(nx), h.y, Math.floor(nz))) {
          if (a.state === 'flee' || hungryCatChase) a.state = 'idle'; else retarget(a);
        } else {
          a.x = nx; a.z = nz;
          const want = Math.atan2(-dx, -dz);
          let dyaw = want - a.yaw;
          while (dyaw > Math.PI) dyaw -= 6.2832;
          while (dyaw < -Math.PI) dyaw += 6.2832;
          a.yaw += dyaw * Math.min(1, dt * 7);
          a.phase += dt * speed * 6;
        }
      }
    }
    const moving = a.state !== 'idle';
    const sw = moving ? Math.sin(a.phase * 2) * 0.55 : 0;
    ud.legs.forEach((l, i) => { l.rotation.x = i % 2 ? -sw : sw; });
    if (isHen) ud.head.rotation.x = moving ? Math.sin(a.phase * 2) * 0.16 : Math.max(0, Math.sin(a.phase * 1.3)) > 0.82 ? 0.95 : 0;
    else { ud.tail.rotation.z = Math.sin(a.phase * 1.6) * 0.3; ud.head.rotation.y = moving ? 0 : Math.sin(a.phase * 0.5) * 0.35; }
    a.y = V.groundBelow(a.x, a.z, SI.home.y + 1.5);
    a.group.position.set(a.x, a.y + (a.state === 'flee' ? Math.abs(Math.sin(a.phase * 2)) * 0.25 : 0), a.z);
    a.group.rotation.y = a.yaw;
    a.voice -= dt;
    if (a.voice <= 0) {
      a.voice = 4 + Math.random() * 10;
      if (dPl < 30) { const v = (1 - dPl / 30) * 0.13; isHen ? A.cluck(v) : !a.fed && A.meow(v * 1.2); }
    }
    if (isHen && a.eggTimer > 0) {
      a.eggTimer -= dt;
      if (a.eggTimer <= 0 && !a.laid) { a.laid = true; layEgg(a.x, a.y, a.z); A.cluck(0.12); }
    }
  }
  function layEgg(x, y, z) {
    const e = { mesh: M.egg(), pos: new THREE.Vector3(x, y, z) };
    e.mesh.position.copy(e.pos);
    scene.add(e.mesh);
    eggs.push(e);
    e.act = {
      pos: () => e.pos, range: 2.8,
      label: () => 'Pick up egg',
      active: () => eggs.includes(e),
      act: () => { eggs.splice(eggs.indexOf(e), 1); scene.remove(e.mesh); S.items.egg++; A.pick(); renderInv(); interact.splice(interact.indexOf(e.act), 1); },
    };
    interact.push(e.act);
  }
  function feedHen(a) {
    if (S.items.grain <= 0) { toast(S.flags.gotGrain ? 'Out of grain. Buy more at the shop, or take the free sack refill tomorrow.' : 'You need grain. There is a sack in the shed.'); A.denied(); return; }
    S.items.grain--; a.fed = true; a.eggTimer = 25 + Math.random() * 35; a.laid = false;
    A.grain(); A.cluck(0.16);
    floatIcon(a.group.position);
    armSwing = 1;
    renderInv();
    if (hens.every((h) => h.fed) && !S.flags.hensDone) S.flags.hensDone = true;
  }
  function feedCat(a) {
    if (S.items.catfood <= 0) { toast(S.flags.gotCatFood ? 'Out of cat food. Buy more at the shop.' : 'You need cat food. Check the kitchen cupboard.'); A.denied(); return; }
    S.items.catfood--; a.fed = true;
    A.meow(0.18); A.purr();
    floatIcon(a.group.position);
    armSwing = 1;
    renderInv();
    if (cats.every((c) => c.fed) && !S.flags.catsDone) S.flags.catsDone = true;
  }

  // ---------- interaction ----------
  const interact = [];
  const addI = (o) => interact.push(o);
  doors.forEach((d) => addI({
    pos: () => d.center, range: 3,
    label: () => (d.open ? 'Close door' : 'Open door'),
    act: () => {
      if (d.open) {
        const inCell = Math.floor(P.x + HW) >= d.x && Math.floor(P.x - HW) <= d.x && Math.floor(P.z + HW) >= d.z && Math.floor(P.z - HW) <= d.z;
        if (inCell) return;
      }
      d.open = !d.open;
      setDoorSolid(d, !d.open);
      A.door();
    },
  }));
  addI({
    pos: () => SI.home.sack, range: 4,
    label: () => (S.flags.sackDay === S.day ? 'Sack is empty until tomorrow' : 'Take grain'),
    act: () => {
      if (S.flags.sackDay === S.day) { A.denied(); return; }
      S.flags.sackDay = S.day; S.flags.gotGrain = true; S.items.grain += 6; A.pick(); renderInv(); toast('+6 grain');
    },
  });
  addI({
    pos: () => SI.home.cupboard, range: 4,
    label: () => (S.flags.cupboardDay === S.day ? 'Cupboard: no more cat food today' : 'Take cat food'),
    act: () => {
      if (S.flags.cupboardDay === S.day) { A.denied(); return; }
      S.flags.cupboardDay = S.day; S.flags.gotCatFood = true; S.items.catfood += 3; A.pick(); renderInv(); toast('+3 cat food');
    },
  });
  addI({
    pos: () => SI.home.keyHook, range: 4,
    active: () => !S.carKey,
    label: () => 'Take the car key',
    act: () => { S.carKey = true; carKeyObj.visible = false; A.key(); renderInv(); toast('You have the car key. The car is in the yard.'); },
  });
  addI({
    pos: () => SI.home.fridge, range: 4,
    label: () => (S.fridgeDay === S.day ? 'Fridge: empty today' : 'Eat leftovers from the fridge'),
    act: () => {
      if (S.fridgeDay === S.day) { A.denied(); return; }
      S.fridgeDay = S.day; S.hunger = Math.min(100, S.hunger + 18); A.eat(); toast('Leftovers: +18 food');
    },
  });
  addI({
    pos: () => SI.home.bed, range: 4,
    label: () => 'Sleep until morning',
    act: sleep,
  });
  addI({
    pos: () => SI.home.chest, range: 4,
    label: () => {
      const n = Object.keys(S.keys).length, t = keysW.length;
      return S.flags.chestOpen ? 'Old chest (empty)' : n >= t ? 'Open the old chest' : `Old chest: locked (${n}/${t} keys)`;
    },
    act: () => {
      if (S.flags.chestOpen) return;
      if (Object.keys(S.keys).length < keysW.length) { A.denied(); toast('Three locks. Find the old keys around Akyar.'); return; }
      S.flags.chestOpen = true; S.money += 1000; A.success(); A.coin();
      toast('Inside: 1000 ₽ and a pilot\'s logbook with a route out of Bashkortostan...');
      toast('Flying to other countries will arrive in a future update.');
    },
  });
  addI({
    pos: () => camV.set(S.cx, car.y + 1, S.cz), range: 3.6,
    active: () => !S.inCar,
    label: () => (S.carKey ? 'Get in the car' : 'Car (locked)'),
    act: enterCar,
  });
  hens.forEach((a) => addI({
    pos: () => a.group.position, range: 2.8, loose: true,
    active: () => !a.fed && a.group.visible,
    label: () => (S.items.grain > 0 ? 'Feed chicken' : 'Chicken is hungry (needs grain)'),
    act: () => feedHen(a),
  }));
  cats.forEach((a) => addI({
    pos: () => a.group.position, range: 2.8, loose: true,
    active: () => !a.fed && a.group.visible,
    label: () => (S.items.catfood > 0 ? 'Feed cat' : 'Cat is hungry (needs cat food)'),
    act: () => feedCat(a),
  }));
  addI({
    pos: () => SI.shop.counter, range: 4,
    label: () => 'Buy food',
    act: () => openShop(),
  });
  // Work mini-game
  let carrying = false;
  const shift = { active: false, n: 0 };
  addI({
    pos: () => SI.work.clock, range: 4,
    active: () => W.inB(SI.work.b, Math.floor(P.x), Math.floor(P.z)), // the clock is built into the wall: inside use only
    label: () => (shift.active ? `Shift running: ${shift.n}/${SHIFT_CRATES} crates` : S.lastShiftDay === S.day ? 'You already worked today' : 'Clock in for a shift'),
    act: () => {
      if (shift.active) return;
      if (S.lastShiftDay === S.day) { A.denied(); toast('Shift done for today. Come back tomorrow.'); return; }
      shift.active = true; shift.n = 0; A.coin();
      toast(`Move ${SHIFT_CRATES} parcel crates from the pile to the pallet at the far end.`);
      renderWork();
    },
  });
  addI({
    pos: () => SI.work.pile, range: 4,
    active: () => shift.active && !carrying,
    label: () => 'Lift a crate',
    act: () => { carrying = true; heldCrate.visible = true; arm.visible = false; A.thud(); },
  });
  const dropPos = new THREE.Vector3();
  addI({
    pos: () => dropPos.copy(SI.work.drop).setY(SI.work.drop.y + 0.6), range: 4,
    active: () => shift.active && carrying,
    label: () => 'Put the crate on the pallet',
    act: () => {
      carrying = false; heldCrate.visible = false; arm.visible = true; A.thud();
      shift.n++;
      const c = M.crate();
      const k = stackedCrates.length;
      c.position.copy(SI.work.drop).add(new THREE.Vector3(k % 2 ? 0.2 : -0.2, 0.44 + ((k / 2) | 0) * 0.66, k % 2 ? 0.1 : -0.1));
      scene.add(c);
      stackedCrates.push(c);
      if (shift.n >= SHIFT_CRATES) finishShift();
      renderWork();
    },
  });
  function finishShift() {
    shift.active = false; S.lastShiftDay = S.day; S.flags.shiftDone = true;
    S.money += SHIFT_PAY; S.hunger = Math.max(0, S.hunger - 8);
    A.coin(); A.success();
    toast(`Shift done: +${SHIFT_PAY} ₽`);
    setTimeout(() => { stackedCrates.forEach((c) => scene.remove(c)); stackedCrates.length = 0; }, 8000);
  }
  function renderWork() {
    const el = $('work-panel');
    if (shift.active) { el.classList.remove('hidden'); el.textContent = `Shift: ${shift.n} / ${SHIFT_CRATES} crates · pay ${SHIFT_PAY} ₽`; } else el.classList.add('hidden');
  }
  keysW.forEach((k) => addI({
    pos: () => k.g.position, range: 3.6, loose: true,
    active: () => !S.keys[k.id],
    label: () => `Pick up the old key (${k.label})`,
    act: () => { S.keys[k.id] = true; A.key(); renderInv(); toast(`Found: ${k.label} (${Object.keys(S.keys).length}/${keysW.length})`); syncKeys(); },
  }));
  function syncKeys() {
    keysW.forEach((k) => { k.g.visible = !S.keys[k.id]; k.beam.visible = !!S.flags.keysQuest; });
    carKeyObj.visible = !S.carKey;
  }

  let currentI = null;
  const viewDir = new THREE.Vector3();
  function findInteract() {
    if (S.inCar) return null;
    camera.getWorldDirection(viewDir);
    const o = camera.position;
    let best = null, bestScore = -1e9;
    for (const it of interact) {
      if (it.active && !it.active()) continue;
      const p = it.pos();
      const dx = p.x - o.x, dy = p.y - o.y, dz = p.z - o.z, d = Math.hypot(dx, dy, dz);
      if (d > it.range + (it.loose ? 0.8 : 0)) continue;
      const dot = (dx * viewDir.x + dy * viewDir.y + dz * viewDir.z) / (d || 1);
      if (dot < (it.loose ? 0.82 : 0.87)) continue;
      // Line of sight, stopping just short of the target.
      let blocked = false;
      for (let t = 0.25; t < d - 1.3; t += 0.2) {
        if (V.solidAt(Math.floor(o.x + (dx / d) * t), Math.floor(o.y + (dy / d) * t), Math.floor(o.z + (dz / d) * t))) { blocked = true; break; }
      }
      if (blocked) continue;
      const score = dot * 3 - d * 0.1;
      if (score > bestScore) { bestScore = score; best = it; }
    }
    return best;
  }
  function doInteract() {
    if (S.inCar) { exitCar(); return; }
    if (currentI) { armSwing = 1; currentI.act(); }
  }

  // ---------- food + time ----------
  function eatNext() {
    const order = ['beshbarmak', 'chakchak', 'bread', 'kefir', 'egg'];
    const id = S.hunger > 60 ? [...order].reverse().find((k) => S.items[k] > 0) : order.find((k) => S.items[k] > 0);
    if (!id) { toast('You have no food. Buy some at the shop.'); A.denied(); return; }
    S.items[id]--;
    S.hunger = Math.min(100, S.hunger + ITEMS[id].food);
    S.flags.ate = true;
    A.eat();
    toast(`Ate ${ITEMS[id].name}: +${ITEMS[id].food} food`);
    renderInv();
  }
  function newDayReset() {
    hens.forEach((h) => { h.fed = false; h.laid = false; h.eggTimer = -1; });
    cats.forEach((c) => { c.fed = false; });
    S.lastReset = S.day;
    toast('Morning: the animals are hungry again.');
  }
  function sleep() {
    const fade = $('fade');
    fade.style.opacity = 1;
    setTimeout(() => {
      S.hour = 7; S.day++;
      S.hunger = Math.max(0, S.hunger - 15);
      newDayReset();
      updateSky(S.hour);
      fade.style.opacity = 0;
      toast(`Day ${S.day}. You slept well.`);
    }, 700);
  }
  function updateTime(dt) {
    const before = S.hour;
    S.hour += (dt * 24) / DAY_SECONDS;
    if (S.hour >= 24) { S.hour -= 24; S.day++; }
    if ((before < 6 && S.hour >= 6) && S.lastReset !== S.day) newDayReset();
    S.hunger = Math.max(0, S.hunger - HUNGER_PER_SEC * dt);
    if (S.hunger <= 0 && !S.flags.starveWarn) { S.flags.starveWarn = true; toast('You are starving and walking slowly. Eat something!'); }
    if (S.hunger > 10) S.flags.starveWarn = false;
  }

  // ---------- quests ----------
  const nearE = (v) => Math.hypot(P.x - v.x, P.z - v.z);
  const QUESTS = [
    { t: 'Morning chores', d: () => 'Take grain from the sack in the shed.', done: () => S.flags.gotGrain, tgt: () => SI.home.sack },
    { t: 'Morning chores', d: () => `Feed the chickens: ${hens.filter((h) => h.fed).length}/${hens.length}. Walk up, look at one, press E.`, done: () => S.flags.hensDone, tgt: () => SI.home.pos(25, 0, 15) },
    { t: 'Morning chores', d: () => 'Take cat food from the kitchen cupboard.', done: () => S.flags.gotCatFood, tgt: () => SI.home.cupboard },
    { t: 'Morning chores', d: () => `Feed the cats: ${cats.filter((c) => c.fed).length}/${cats.length}. They come to you when hungry.`, done: () => S.flags.catsDone, tgt: () => SI.home.pos(11, 0, 12) },
    { t: 'Off to work', d: () => 'Take the car key from the kitchen table.', done: () => S.carKey, tgt: () => SI.home.keyHook },
    { t: 'Off to work', d: () => 'Get in the car and drive to your job at the parcel depot in the town centre.', done: () => S.flags.atWork, tgt: () => SI.work.entrance },
    { t: 'Off to work', d: () => `Open the door, clock in and move ${SHIFT_CRATES} parcel crates.`, done: () => S.flags.shiftDone, tgt: () => (shift.active ? (carrying ? SI.work.drop : SI.work.pile) : SI.work.clock) },
    { t: 'Dinner', d: () => 'Drive to the shop and buy some food.', done: () => S.flags.boughtFood, tgt: () => (nearE(SI.shop.entrance) < 25 ? SI.shop.counter : SI.shop.entrance) },
    { t: 'Dinner', d: () => 'Eat your food: press Q.', done: () => S.flags.ate },
    { t: 'The old chest', d: () => `A chest in your shed has three locks. Find the old keys around Akyar: ${Object.keys(S.keys).length}/${keysW.length}.`, done: () => Object.keys(S.keys).length >= keysW.length, tgt: () => { const k = nearestKey(); return k ? k.g.position : null; }, onStart: () => { S.flags.keysQuest = true; syncKeys(); toast('Follow the golden light beams on the horizon.'); } },
    { t: 'The old chest', d: () => 'Bring the keys home and open the chest in the shed.', done: () => S.flags.chestOpen, tgt: () => SI.home.chest },
    { t: 'Free play', d: () => 'Keep the animals fed, work daily, explore Akyar. Flights to other countries are coming in a future update.', done: () => false },
  ];
  function nearestKey() {
    let best = null, bd = 1e9;
    for (const k of keysW) { if (S.keys[k.id]) continue; const d = nearE(k.g.position); if (d < bd) { bd = d; best = k; } }
    return best;
  }
  function updateQuests() {
    if (nearE(SI.work.entrance) < 30) S.flags.atWork = true;
    let moved = false;
    while (S.questIdx < QUESTS.length - 1 && QUESTS[S.questIdx].done()) { S.questIdx++; moved = true; if (QUESTS[S.questIdx].onStart) QUESTS[S.questIdx].onStart(); }
    if (moved) { A.success(); }
    const q = QUESTS[S.questIdx];
    $('quest-title').textContent = q.t;
    $('quest-text').textContent = q.d();
    const tgt = q.tgt ? q.tgt() : null;
    const el = $('quest-target');
    if (tgt) {
      el.style.display = '';
      const dx = tgt.x - P.x, dz = tgt.z - P.z, d = Math.hypot(dx, dz);
      const yaw = S.inCar ? S.ch + lookYaw : P.yaw;
      const rel = Math.atan2(dx, -dz) + yaw;
      $('target-arrow').style.transform = `rotate(${rel}rad)`;
      $('target-dist').textContent = d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';
    } else el.style.display = 'none';
    return tgt;
  }

  // ---------- HUD ----------
  function toast(msg) {
    const e = document.createElement('div');
    e.className = 'toast'; e.textContent = msg;
    $('toast').appendChild(e);
    setTimeout(() => e.remove(), 4000);
  }
  function renderInv() {
    const el = $('inventory');
    let h = '';
    for (const id in ITEMS) if (S.items[id] > 0) h += `<div class="slot"><span class="ico">${ITEMS[id].ico}</span>${ITEMS[id].name}<span class="n">${S.items[id]}</span></div>`;
    if (S.carKey) h += `<div class="slot"><span class="ico">🚗</span>Car key</div>`;
    const n = Object.keys(S.keys).length;
    if (n) h += `<div class="slot key"><span class="ico">🗝️</span>Old keys<span class="n">${n}</span></div>`;
    el.innerHTML = h;
  }
  const CARD = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  let hudT = 0, miniT = 0;
  const miniC = $('minimap').getContext('2d');
  function updateHud(dt, tgt) {
    hudT -= dt; miniT -= dt;
    if (hudT > 0) return;
    hudT = 0.12;
    const hh = Math.floor(S.hour), mm = Math.floor((S.hour - hh) * 60);
    $('clock').textContent = `Day ${S.day} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const f = $('hunger-fill'); f.style.width = S.hunger + '%'; f.classList.toggle('low', S.hunger < 25);
    $('money').textContent = S.money + ' ₽';
    const yaw = S.inCar ? S.ch + lookYaw : P.yaw;
    const brg = ((-yaw * 180) / Math.PI % 360 + 360) % 360;
    $('compass').textContent = CARD[Math.round(brg / 45) % 8];
    $('street').textContent = W.roadNameAt(P.x, P.z) || 'Akyar';
    if (S.inCar) $('speed').textContent = Math.round(Math.abs(car.speed) * 3.6);
    if (miniT <= 0) { miniT = 0.2; drawMini(yaw, tgt); }
  }
  function drawMarker(c, x, y, col, label) {
    c.fillStyle = col; c.strokeStyle = '#000'; c.lineWidth = 2;
    c.beginPath(); c.arc(x, y, 5, 0, 6.3); c.fill(); c.stroke();
    if (label) { c.font = 'bold 12px sans-serif'; c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 3; const lx = x + c.measureText(label).width + 10 > c.canvas.width ? x - c.measureText(label).width - 7 : x + 7; c.strokeText(label, lx, y + 4); c.fillText(label, lx, y + 4); }
  }
  function drawArrow(c, x, y, yaw, size = 7) {
    c.save(); c.translate(x, y); c.rotate(-yaw);
    c.beginPath(); c.moveTo(0, -size * 1.4); c.lineTo(size, size); c.lineTo(0, size * 0.5); c.lineTo(-size, size); c.closePath();
    c.fillStyle = '#ff4b3e'; c.strokeStyle = '#fff'; c.lineWidth = 2; c.fill(); c.stroke(); c.restore();
  }
  function drawMini(yaw, tgt) {
    const c = miniC, S0 = 190, span = 380, k = S0 / span;
    c.fillStyle = '#7fa04f'; c.fillRect(0, 0, S0, S0);
    c.imageSmoothingEnabled = false;
    const sx = mapX(P.x - span / 2), sy = mapZ(P.z - span / 2);
    c.drawImage(mapCanvas, sx, sy, span * MAP_K, span * MAP_K, 0, 0, S0, S0);
    const toS = (x, z) => [S0 / 2 + (x - P.x) * k, S0 / 2 + (z - P.z) * k];
    const pin = (v, col, label) => { let [x, y] = toS(v.x, v.z); x = clamp(x, 8, S0 - 8); y = clamp(y, 8, S0 - 8); drawMarker(c, x, y, col, label); };
    pin(SI.home.center, '#6fd36f', 'H');
    pin(SI.shop.entrance, '#59a6ff', 'S');
    pin(SI.work.entrance, '#ffb347', 'W');
    if (tgt) pin(tgt, '#ffe27a');
    if (S.inCar) { const [cx, cy] = toS(S.cx, S.cz); void cx; void cy; } else { const [x, y] = toS(S.cx, S.cz); if (x > 0 && x < S0 && y > 0 && y < S0) { c.fillStyle = '#fff'; c.fillRect(x - 3, y - 3, 6, 6); } }
    drawArrow(c, S0 / 2, S0 / 2, yaw);
  }

  // Big map
  const MAP_LABELS = { 'Администрация': 'Administration', 'РДК': 'House of Culture', 'Акъярский горный колледж': 'Mining College', 'Поликлиника': 'Clinic', 'ФОК': 'Sports Centre' };
  let mapOpen = false, mapZoom = 1;
  function drawBig() {
    const cv = $('bigmap');
    const H = Math.min(innerHeight * 0.92, 1100), aspect = mapCanvas.width / mapCanvas.height;
    cv.height = H; cv.width = H * aspect;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = mapZoom > 2 ? false : true;
    const sw = mapCanvas.width / mapZoom, sh = mapCanvas.height / mapZoom;
    const sx = clamp(mapX(P.x) - sw / 2, 0, mapCanvas.width - sw), sy = clamp(mapZ(P.z) - sh / 2, 0, mapCanvas.height - sh);
    c.drawImage(mapCanvas, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    const k = cv.width / sw;
    const toC = (x, z) => [(mapX(x) - sx) * k, (mapZ(z) - sy) * k];
    if (mapZoom >= 3) {
      c.font = '11px sans-serif'; c.textAlign = 'center';
      const seen = new Set();
      for (const r of W.roads) {
        if (!r.name || seen.has(r.name)) continue;
        const label = W.enName(r.name);
        const m = (r.p.length >> 2) * 2;
        const [x, y] = toC(r.p[m], r.p[m + 1]);
        if (x < 0 || y < 0 || x > cv.width || y > cv.height) continue;
        seen.add(r.name);
        c.strokeStyle = '#000'; c.lineWidth = 3; c.fillStyle = '#fff'; c.strokeText(label, x, y); c.fillText(label, x, y);
      }
      c.textAlign = 'start';
    }
    for (const p of W.D.named) {
      const en = MAP_LABELS[p.n];
      if (!en) continue;
      const [x, y] = toC(p.x, p.z);
      drawMarker(c, x, y, '#d9d9d9', en);
    }
    let [x, y] = toC(SI.home.center.x, SI.home.center.z); drawMarker(c, x, y, '#6fd36f', 'Home');
    [x, y] = toC(SI.shop.entrance.x, SI.shop.entrance.z); drawMarker(c, x, y, '#59a6ff', 'Shop');
    [x, y] = toC(SI.work.entrance.x, SI.work.entrance.z); drawMarker(c, x, y, '#ffb347', 'Work: Parcel Depot');
    if (S.flags.keysQuest) keysW.forEach((kw) => { if (!S.keys[kw.id]) { const q = toC(kw.x, kw.z); drawMarker(c, q[0], q[1], '#ffe27a', 'Key'); } });
    const pp = toC(P.x, P.z);
    drawArrow(c, pp[0], pp[1], S.inCar ? S.ch : P.yaw, 9);
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, 0, 100, 20); c.fillStyle = '#fff'; c.font = '12px sans-serif'; c.fillText('N ▲  zoom ' + mapZoom + 'x', 6, 14);
  }
  function toggleMap() {
    mapOpen = !mapOpen;
    $('bigmap-wrap').classList.toggle('hidden', !mapOpen);
    if (mapOpen) drawBig();
  }

  // Shop UI
  let uiOpen = false;
  function renderShop() {
    $('shop-money').textContent = `You have ${S.money} ₽`;
    const box = $('shop-items');
    box.innerHTML = '';
    for (const it of SHOP) {
      const d = ITEMS[it.id];
      const row = document.createElement('div');
      row.className = 'item';
      row.innerHTML = `<span class="ico">${d.ico}</span><div class="desc">${d.name}${it.qty ? ' ×' + it.qty : ''}<small>${it.desc}</small></div>`;
      const b = document.createElement('button');
      b.textContent = `Buy ${it.price} ₽`;
      b.disabled = S.money < it.price;
      b.onclick = () => buy(it);
      row.appendChild(b);
      box.appendChild(row);
    }
    if (S.items.egg > 0) {
      const row = document.createElement('div');
      row.className = 'item';
      row.innerHTML = `<span class="ico">🥚</span><div class="desc">Sell your eggs<small>You have ${S.items.egg}. ${EGG_PRICE} ₽ each</small></div>`;
      const b = document.createElement('button');
      b.textContent = `Sell all: ${S.items.egg * EGG_PRICE} ₽`;
      b.onclick = () => { S.money += S.items.egg * EGG_PRICE; S.items.egg = 0; A.coin(); renderInv(); renderShop(); };
      row.appendChild(b);
      box.appendChild(row);
    }
  }
  function buy(it) {
    if (S.money < it.price) return;
    S.money -= it.price;
    S.items[it.id] += it.qty || 1;
    if (ITEMS[it.id].food) S.flags.boughtFood = true;
    A.coin(); renderInv(); renderShop();
  }
  function openShop() {
    uiOpen = true;
    renderShop();
    $('shop-ui').classList.remove('hidden');
    for (const k in keys) keys[k] = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function closeShop() {
    uiOpen = false;
    $('shop-ui').classList.add('hidden');
    lock();
  }

  // ---------- input ----------
  let started = false, paused = true;
  function lock() {
    try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* retried on the next click */ }
  }
  addEventListener('keydown', (e) => {
    if (!started) return;
    if (e.code === 'Escape' && uiOpen) { uiOpen = false; $('shop-ui').classList.add('hidden'); showPause(); return; }
    if (uiOpen || paused) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys[e.code] = true;
    switch (e.code) {
      case 'KeyE': doInteract(); break;
      case 'KeyQ': if (!S.inCar) eatNext(); break;
      case 'KeyM': toggleMap(); break;
      case 'KeyN': A.setMuted(!A.isMuted()); toast(A.isMuted() ? 'Sound off' : 'Sound on'); break;
      case 'KeyV': if (S.inCar) { thirdPerson = !thirdPerson; carObj.visible = true; } break;
      case 'KeyH': if (S.inCar) A.horn(); break;
    }
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas || mapOpen) return;
    const dx = clamp(e.movementX, -120, 120), dy = clamp(e.movementY, -120, 120);
    if (S.inCar) { lookYaw = clamp(lookYaw - dx * 0.0023, -2.2, 2.2); P.pitch = clamp(P.pitch - dy * 0.0023, -1.0, 0.8); }
    else { P.yaw -= dx * 0.0023; P.pitch = clamp(P.pitch - dy * 0.0023, -1.54, 1.54); }
  });
  addEventListener('wheel', (e) => {
    if (!mapOpen) return;
    mapZoom = clamp(mapZoom + (e.deltaY < 0 ? 1 : -1), 1, 8);
    drawBig();
  }, { passive: true });
  function showPause() {
    paused = true;
    for (const k in keys) keys[k] = false;
    A.setEngine(false, 0);
    $('start').classList.remove('hidden');
    $('btn-play').textContent = 'Resume';
    save();
  }
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) { paused = false; $('start').classList.add('hidden'); }
    else if (started && !uiOpen && !DEV) showPause();
  });
  canvas.addEventListener('click', () => { if (started && !uiOpen && !document.pointerLockElement) lock(); });
  $('shop-close').onclick = closeShop;
  $('btn-play').onclick = () => {
    A.init();
    started = true;
    $('hud').classList.remove('hidden');
    lock();
    // Browsers can refuse the lock right after Esc; keep the overlay up until it is granted.
  };
  $('btn-new').onclick = () => { if (confirm('Start a new game? Your saved progress will be erased.')) { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* storage blocked */ } location.reload(); } };
  $('quality').onchange = (e) => { V.setRadius(+e.target.value); try { localStorage.setItem('akyar-radius', e.target.value); } catch (er) { /* storage blocked */ } };

  // ---------- save / load ----------
  function exportSave() {
    S.px = P.x; S.py = P.y; S.pz = P.z; S.yaw = P.yaw; S.pitch = P.pitch; S.cy = car.y;
    S.hens = hens.map((h) => h.fed); S.cats = cats.map((c) => c.fed);
    return JSON.stringify(S);
  }
  function importSave(raw) {
    try {
      const d = JSON.parse(raw);
      S = Object.assign(newState(), d);
      P.x = S.px; P.y = S.py; P.z = S.pz; P.yaw = S.yaw; P.pitch = S.pitch; P.eye = S.py + 1.62;
      car.y = S.cy;
      hens.forEach((h, i) => { h.fed = !!S.hens[i]; });
      cats.forEach((c, i) => { c.fed = !!S.cats[i]; });
      return true;
    } catch (e) { return false; }
  }
  function save() {
    if (DEV) return;
    try { localStorage.setItem(SAVE_KEY, exportSave()); } catch (e) { /* private mode */ }
  }
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { /* storage blocked */ }
    if (!raw || DEV) return false;
    return importSave(raw);
  }
  addEventListener('pagehide', save);

  // ---------- main loop ----------
  function tick(dt) {
    updateTime(dt);
    if (S.inCar) { updateCar(dt); updateCarCamera(); } else { updatePlayer(dt); syncCarObj(); }
    hens.forEach((a) => updateAnimal(a, dt));
    cats.forEach((a) => updateAnimal(a, dt));
    doors.forEach((d) => {
      const want = d.open ? 1 : 0;
      d.angle += clamp(want - d.angle, -dt * 4.5, dt * 4.5);
      d.g.rotation.y = (d.along === 'x' ? 1 : -1) * d.angle * Math.PI * 0.5 * d.swing;
    });
    keysW.forEach((k) => { k.key.rotation.y += dt * 2; k.key.position.y = 1.15 + Math.sin(performance.now() * 0.002) * 0.12; });
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.t -= dt; f.s.position.y += dt * 0.8;
      if (f.t <= 0) { scene.remove(f.s); f.s.material.map.dispose(); f.s.material.dispose(); floaters.splice(i, 1); }
    }
    currentI = findInteract();
    const pr = $('prompt');
    if (currentI) { pr.classList.remove('hidden'); pr.innerHTML = `<b>[E]</b> ${currentI.label()}`; } else pr.classList.add('hidden');
    const tgt = updateQuests();
    updateHud(dt, tgt);
    if (mapOpen) { mapT -= dt; if (mapT <= 0) { mapT = 0.4; drawBig(); } }
    saveT -= dt;
    if (saveT <= 0) { saveT = 12; save(); }
  }
  let mapT = 0, saveT = 12;

  function renderFrame() {
    const b = camera.position;
    V.update(b.x, b.z, 6);
    V.setCameraCenter(b.x, b.z);
    U.uTime.value = performance.now() / 1000;
    updateSky(S.hour);
    dome.position.copy(b);
    clouds.position.x = (performance.now() / 1000) * 1.4 % 800;
    renderer.render(scene, camera);
  }

  let last = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
    last = t;
    if (started && !paused && !uiOpen) tick(dt);
    else if (DEV && !DEV.frozen) tick(dt);
    renderFrame();
  }

  // ---------- boot ----------
  const DEV = /[#&]shot=|[#&]dev/.test(location.hash) ? { frozen: false } : null;
  function camFromState() {
    if (S.inCar) { $('speedo').classList.remove('hidden'); arm.visible = false; updateCarCamera(); } else { camera.position.set(P.x, P.eye, P.z); camera.rotation.set(P.pitch, P.yaw, 0); }
  }
  function boot() {
    const status = $('load-status');
    const r0 = (() => { try { return localStorage.getItem('akyar-radius'); } catch (e) { return null; } })();
    if (r0) { $('quality').value = r0; V.setRadius(+r0); } else V.setRadius(10);
    status.textContent = 'Drawing the map of Akyar…';
    setTimeout(() => {
      drawMap();
      V.buildFar(mapCanvas);
      status.textContent = 'Building the village…';
      setTimeout(() => {
        const hadSave = load();
        syncCarObj();
        syncKeys();
        renderInv();
        camFromState();
        const startX = S.inCar ? S.cx : P.x, startZ = S.inCar ? S.cz : P.z;
        const r = V.getRadius();
        V.setRadius(Math.min(r, 5));
        V.update(startX, startZ, Infinity);
        V.setRadius(r);
        status.classList.add('hidden');
        $('start-buttons').classList.remove('hidden');
        if (hadSave) { $('btn-play').textContent = 'Continue'; $('btn-new').classList.remove('hidden'); }
        requestAnimationFrame(frame);
        if (DEV) G.game.devStart();
      }, 30);
    }, 30);
  }

  // Programmatic access for automated tests and dev screenshots.
  G.game = {
    S: () => S, P, car, keys, hens, cats, eggs, doors, keysW, interact, shift, camera, QUESTS, tick, renderFrame, renderer,
    interactNow: () => doInteract(),
    current: () => currentI,
    buy, openShop, closeShop, eatNext, sleep, exportSave, importSave,
    isCarrying: () => carrying,
    setYawPitch(y, p) { P.yaw = y; P.pitch = p; },
    lookAt(v) {
      const dx = v.x - P.x, dz = v.z - P.z, dy = v.y - P.eye;
      P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    },
    teleport(x, y, z) { P.x = x; P.y = y; P.z = z; P.eye = y + 1.62; P.vx = P.vy = P.vz = 0; },
    placeCar(x, z, h) { S.cx = x; S.cz = z; S.ch = h; car.y = V.groundBelow(x, z, car.y + 30); S.cy = car.y; syncCarObj(); },
    setThird(v) { thirdPerson = v; },
    updateQuests,
    devStart() {
      started = true; paused = false;
      $('start').classList.add('hidden');
      $('hud').classList.remove('hidden');
      const m = /shot=([\w-]+)/.exec(location.hash);
      if (m && G.devShots && G.devShots[m[1]]) G.devShots[m[1]]();
      else DEV.frozen = true; // the scripted test drives tick() itself
      G.game.devReady = true;
    },
    freeze() { DEV.frozen = true; },
  };

  boot();
})();
