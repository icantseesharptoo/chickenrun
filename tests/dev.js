// Dev-only harness, loaded only with index.html#dev or index.html#shot=<name>.
//   index.html#dev        full scripted playthrough; the JSON result goes to <pre id="result">
//   index.html#shot=yard  jumps to a camera preset for screenshots
(function () {
  'use strict';
  const G = window.G;
  const errors = [];
  addEventListener('error', (e) => errors.push(String(e.message) + ' @' + e.filename + ':' + e.lineno));
  addEventListener('unhandledrejection', (e) => errors.push('rejection: ' + e.reason));

  const settle = (h) => {
    const g = G.game, V = G.voxels;
    g.S().hour = h === undefined ? 10.5 : h;
    for (let i = 0; i < 6; i++) g.tick(0.03);
    V.update(g.camera.position.x, g.camera.position.z, Infinity);
    g.freeze();
    document.title = 'READY';
  };
  const stand = (v, look) => {
    const g = G.game;
    g.teleport(v.x, v.y, v.z);
    g.P.onGround = true;
    if (look) g.lookAt(look);
  };
  const SI = () => G.sites;
  const openDoor = (id) => { const d = G.game.doors.find((o) => o.id === id); d.open = true; d.angle = 1; G.voxels.closedDoors.delete(G.voxels.doorKey(d.x, d.y, d.z)); G.voxels.closedDoors.delete(G.voxels.doorKey(d.x, d.y + 1, d.z)); };
  const tp = (x, z, yoff = 0) => new THREE.Vector3(x, G.voxels.groundBelow(x, z, G.world.elevation(x, z) + 22) + yoff, z);

  G.devShots = {
    bedroom() { stand(SI().home.spawn); settle(); },
    kitchen() { const h = SI().home; openDoor('home'); stand(h.pos(11.5, 0, 20.5), h.pos(7.5, 1.3, 19)); settle(); },
    yard() { const h = SI().home; stand(h.pos(17, 0, 13), h.pos(24, 0.5, 11)); settle(); },
    yard2() { const h = SI().home; openDoor('home'); stand(h.pos(21, 0, 3), h.pos(10, 2, 19)); settle(); },
    chickens() { const g = G.game; const a = g.hens[0]; const p = new THREE.Vector3(a.x + 2.2, G.sites.home.y, a.z + 1.2); stand(p, new THREE.Vector3(a.x, G.sites.home.y + 0.5, a.z)); settle(); },
    shed() { const h = SI().home; openDoor('shed'); stand(h.pos(26.5, 0, 24.5), h.pos(25.5, 0.8, 28.5)); settle(); },
    street() { const h = SI().shop; const e = h.entrance; stand(tp(e.x, e.z), new THREE.Vector3(h.door.x, h.y + 2, h.door.z)); settle(); },
    shopin() { const s = SI().shop; openDoor('shop'); stand(new THREE.Vector3(s.door.x + 0.5 + s.door.dx * 1.5, s.y, s.door.z + 0.5 + s.door.dz * 1.5), s.counter); settle(); },
    work() { const s = SI().work; stand(tp(s.entrance.x, s.entrance.z), new THREE.Vector3(s.door.x, s.y + 2, s.door.z)); settle(); },
    workin() { const s = SI().work; openDoor('work'); stand(new THREE.Vector3(s.door.x + 0.5 + s.door.dx, s.y, s.door.z + 0.5 + s.door.dz), s.drop.clone().setY(s.y + 1)); settle(); },
    bridge() { const b = G.world.D.bridges.find((q) => q.n === 'Восточная улица'); const f = tp(b.x + 18, b.z + 16); stand(f, tp(b.x, b.z, 0.5)); settle(); },
    center() { const p = G.world.D.named.find((q) => q.n === 'Администрация'); stand(tp(p.x - 30, p.z + 34), new THREE.Vector3(p.x, 42, p.z)); settle(); },
    car() { const g = G.game; const h = SI().home; g.S().carKey = true; g.S().inCar = true; g.car.y = g.S().cy; settle(); void h; },
    carthird() { const g = G.game; g.S().carKey = true; g.S().inCar = true; g.setThird(true); g.car.y = g.S().cy; settle(); },
    sky() { const g = G.game; const p = G.world.D.named.find((q) => q.n === 'Администрация'); g.teleport(p.x, 420, p.z + 700); g.setYawPitch(0, -0.55); g.P.vy = 0; const c = g.camera; c.position.set(p.x, 420, p.z + 700); G.voxels.setRadius(5); settle(); },
    night() { const h = SI().home; stand(h.pos(21, 0, 3), h.pos(10, 2, 19)); settle(22); },
    sunset() { const h = SI().home; stand(h.pos(21, 0, 3), h.pos(10, 2, 19)); settle(18); },
  };

  // ---------- scripted playthrough ----------
  const results = [];
  const check = (name, ok, info) => results.push({ name, ok: !!ok, info: info === undefined ? undefined : String(info) });

  function runSmoke() {
    const g = G.game, V = G.voxels, W = G.world, P = g.P, H = SI().home;
    let S = g.S(); // importSave swaps the state object, so this is refreshed after the save test
    const dt = 1 / 30;
    const sim = (sec) => { for (let i = 0; i < sec / dt; i++) { g.tick(dt); V.update(g.camera.position.x, g.camera.position.z, 2); } };
    const look = (v) => { g.lookAt(v); g.tick(dt); };
    const at = (v, tgt) => { g.teleport(v.x, v.y, v.z); P.vx = P.vy = P.vz = 0; look(tgt); };
    const curLabel = () => (g.current() ? g.current().label() : null);
    const clearKeys = () => { for (const k in g.keys) g.keys[k] = false; };

    // Spawn
    sim(1);
    check('spawn: stands on the bedroom floor', P.onGround && Math.abs(P.y - H.y) < 0.01, `y=${P.y} floor=${H.y}`);
    // Quest 1 needs the shed.
    check('quest 1 is grain', S.questIdx === 0);

    // Walk: front door blocks, then opens.
    const inside = H.pos(10.5, 0, 19.5), doorOut = H.pos(10.5, 0, 15.5);
    at(inside, H.pos(10.5, 1.6, 17.5));
    check('door prompt shows', /Open door/.test(curLabel() || ''), curLabel());
    g.keys.KeyW = true; sim(1.5); clearKeys();
    check('closed door blocks walking', Math.hypot(P.x - doorOut.x, P.z - doorOut.z) > 1.5, `dist=${Math.hypot(P.x - doorOut.x, P.z - doorOut.z).toFixed(2)}`);
    at(inside, H.pos(10.5, 1.6, 17.5));
    g.interactNow(); sim(0.3);
    g.lookAt(doorOut.clone().setY(P.eye));
    g.keys.KeyW = true; sim(1.2); clearKeys();
    check('open door lets you walk outside', Math.hypot(P.x - doorOut.x, P.z - doorOut.z) < 2.4, `dist=${Math.hypot(P.x - doorOut.x, P.z - doorOut.z).toFixed(2)}`);

    // Shed + grain
    at(H.pos(26.5, 0, 18.5), H.pos(26.5, 1.6, 20.5));
    check('shed door prompt', /Open door/.test(curLabel() || ''), curLabel());
    g.interactNow(); sim(0.3);
    at(H.pos(24.5, 0, 23.5), H.sack);
    check('sack prompt', /grain/.test(curLabel() || ''), curLabel());
    g.interactNow(); sim(0.1);
    check('got 6 grain', S.items.grain === 6, S.items.grain);

    // Chickens
    // Hens wander and cluster, so the prompt may pick a neighbour: keep going until all are fed.
    let fedOK = 0;
    for (let tries = 0; tries < 40 && !g.hens.every((h) => h.fed); tries++) {
      const h = g.hens.find((a) => !a.fed);
      const sx = h.x + 1, sz = h.z + 0.5;
      g.teleport(V.solidAt(Math.floor(sx), H.y, Math.floor(sz)) ? h.x - 1 : sx, H.y, sz);
      g.lookAt(h.group.position.clone().setY(H.y + 0.4)); g.tick(dt);
      g.lookAt(h.group.position.clone().setY(H.y + 0.4)); g.tick(dt);
      if (g.current() && /chicken/i.test(g.current().label())) { g.interactNow(); fedOK++; }
    }
    check('all 5 chickens fed', g.hens.every((h) => h.fed) && S.flags.hensDone, `fed via prompt ${fedOK}`);
    check('grain spent', S.items.grain === 1, S.items.grain);

    // Cats
    at(H.pos(8.5, 0, 20.5), H.cupboard);
    check('cupboard prompt', /cat food/.test(curLabel() || ''), curLabel());
    g.interactNow(); sim(0.1);
    check('3 cat food', S.items.catfood === 3, S.items.catfood);
    let catsOK = 0;
    for (let tries = 0; tries < 40 && !g.cats.every((a) => a.fed); tries++) {
      const c = g.cats.find((a) => !a.fed);
      const sx = c.x + 1, sz = c.z + 0.6;
      g.teleport(V.solidAt(Math.floor(sx), H.y, Math.floor(sz)) ? c.x - 1 : sx, H.y, sz);
      g.lookAt(c.group.position.clone().setY(H.y + 0.4)); g.tick(dt);
      g.lookAt(c.group.position.clone().setY(H.y + 0.4)); g.tick(dt);
      if (g.current() && /cat/i.test(g.current().label())) { g.interactNow(); catsOK++; }
    }
    check('all 3 cats fed', g.cats.every((c) => c.fed) && S.flags.catsDone, `via prompt ${catsOK}`);

    // Car key
    at(H.pos(10.5, 0, 20.5), H.keyHook);
    check('car key prompt', /car key/.test(curLabel() || ''), curLabel());
    g.interactNow(); sim(0.1);
    check('has car key', S.carKey);

    // Car: drive through the gate
    at(H.pos(19.5, 0, 9), H.car.clone().setY(H.y + 1));
    check('car prompt', /Get in/.test(curLabel() || ''), curLabel());
    g.interactNow();
    check('in car', S.inCar);
    const c0 = [S.cx, S.cz];
    g.keys.KeyW = true; sim(3); clearKeys();
    const moved = Math.hypot(S.cx - c0[0], S.cz - c0[1]);
    check('car drives out of the yard through the gate', moved > 15, `moved ${moved.toFixed(1)} m, speed ${(g.car.speed * 3.6).toFixed(0)} km/h`);
    const out = !(S.cx > H.x0 && S.cx < H.x1 && S.cz > H.z0 && S.cz < H.z1);
    check('car is outside the fence', out, `${S.cx.toFixed(1)},${S.cz.toFixed(1)}`);
    g.keys.Space = true; sim(2); clearKeys();
    check('brake stops car', Math.abs(g.car.speed) < 0.3, g.car.speed.toFixed(2));
    g.interactNow();
    check('exits car', !S.inCar);
    check('standing after exit (not stuck)', !V.solidAt(Math.floor(P.x), Math.floor(P.y + 0.5), Math.floor(P.z)));

    // Drive into a wall: must stop
    const shop = SI().shop, work = SI().work;
    g.placeCar(work.entrance.x - work.door.dx * 2, work.entrance.z - work.door.dz * 2, Math.atan2(-work.door.dx, -work.door.dz));
    g.teleport(S.cx + 1.8, S.cy, S.cz); g.lookAt(new THREE.Vector3(S.cx, S.cy + 1, S.cz)); g.tick(dt);
    g.interactNow();
    check('re-enter car at work', S.inCar);
    g.keys.KeyW = true; sim(4); clearKeys();
    const dW = Math.abs((S.cx - work.door.x) * work.door.dx) + Math.abs((S.cz - work.door.z) * work.door.dz);
    check('car is stopped by the warehouse wall', dW > 1.5, `dist to wall ${dW.toFixed(1)}`);
    g.keys.Space = true; sim(1.5); clearKeys();
    g.interactNow();
    sim(0.2);
    check('flag: arrived at work', S.flags.atWork);

    // Work shift
    const doorW = g.doors.find((d) => d.id === 'work');
    at(work.entrance, doorW.center);
    let walked = 0;
    g.teleport(doorW.x + 0.5 - work.door.dx * 1.6, work.y, doorW.z + 0.5 - work.door.dz * 1.6);
    g.lookAt(doorW.center); g.tick(dt);
    check('work door prompt', /Open door/.test(curLabel() || ''), curLabel());
    g.interactNow(); sim(0.4);
    g.lookAt(doorW.center.clone().add(new THREE.Vector3(work.door.dx * 3, 0.5, work.door.dz * 3)));
    g.keys.KeyW = true; sim(0.9); clearKeys();
    walked = (P.x - doorW.x) * work.door.dx + (P.z - doorW.z) * work.door.dz;
    check('walked into the warehouse', walked > 0.9, walked.toFixed(2));
    at(new THREE.Vector3(doorW.x + 0.5 + work.door.dx * 1, work.y, doorW.z + 0.5 + work.door.dz * 1), work.clock);
    check('time clock prompt', /Clock in/.test(curLabel() || ''), curLabel());
    const money0 = S.money;
    g.interactNow();
    check('shift active', g.shift.active);
    const inFrontPile = work.pile.clone().setY(work.y).add(new THREE.Vector3(-work.door.dz * 0, 0, 0));
    for (let i = 0; i < 5; i++) {
      // Stand beside the pile on a free cell.
      let okSpot = false;
      for (const [ox, oz] of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5], [1.5, 1.5], [-1.5, -1.5], [2, -1], [-2, 1]]) {
        const sx = inFrontPile.x + ox, sz = inFrontPile.z + oz;
        if (W.inB(work.b, Math.floor(sx), Math.floor(sz)) && !V.solidAt(Math.floor(sx), work.y, Math.floor(sz)) && !V.solidAt(Math.floor(sx), work.y + 1, Math.floor(sz))) { g.teleport(sx, work.y, sz); okSpot = true; break; }
      }
      check(`spot by the pile, crate ${i + 1}`, okSpot);
      look(work.pile);
      if (!/Lift/.test(curLabel() || '')) {
        const c = g.camera.position, pl = work.pile;
        check(`lift prompt ${i + 1}`, false, `cam ${c.x.toFixed(1)},${c.y.toFixed(1)},${c.z.toFixed(1)} pile ${pl.x},${pl.y},${pl.z} door ${JSON.stringify(work.door)} cur ${curLabel()} pileBlock ${V.blockAt(Math.floor(pl.x), Math.floor(pl.y), Math.floor(pl.z))} active ${g.shift.active} carrying ${g.isCarrying()}`);
      }
      g.interactNow(); g.tick(dt);
      check(`carrying crate ${i + 1}`, g.isCarrying());
      const dp = work.drop;
      let spot = null;
      for (const [ox, oz] of [[1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]]) {
        if (W.inB(work.b, Math.floor(dp.x + ox), Math.floor(dp.z + oz)) && !V.solidAt(Math.floor(dp.x + ox), work.y, Math.floor(dp.z + oz))) { spot = [dp.x + ox, dp.z + oz]; break; }
      }
      g.teleport(spot[0], work.y, spot[1]);
      look(dp.clone().setY(work.y + 0.6));
      if (!/pallet/.test(curLabel() || '')) check(`drop prompt ${i + 1}`, false, curLabel());
      g.interactNow(); g.tick(dt);
    }
    check('shift complete and paid', S.money === money0 + 300 && S.flags.shiftDone, `money ${S.money}`);

    // Shop
    const doorS = g.doors.find((d) => d.id === 'shop');
    g.teleport(doorS.x + 0.5 - shop.door.dx * 1.6, shop.y, doorS.z + 0.5 - shop.door.dz * 1.6);
    g.lookAt(doorS.center); g.tick(dt);
    check('shop door prompt', /Open door/.test(curLabel() || ''), curLabel());
    g.interactNow(); sim(0.4);
    g.teleport(doorS.x + 0.5 + shop.door.dx * 1.6, shop.y, doorS.z + 0.5 + shop.door.dz * 1.6);
    look(shop.counter);
    check('shop counter prompt', /Buy food/.test(curLabel() || ''), curLabel());
    g.interactNow();
    const items = document.querySelectorAll('#shop-items .item button');
    check('shop UI opened with goods', items.length >= 6, items.length);
    items[0].click();
    check('bought bread', S.items.bread === 1 && S.flags.boughtFood);
    g.closeShop();
    const hunger0 = S.hunger = 40;
    g.eatNext();
    check('eating restores hunger', S.hunger > hunger0 && S.flags.ate, S.hunger);

    // Keys, chest
    sim(0.2);
    check('keys quest active', S.flags.keysQuest, 'questIdx ' + S.questIdx);
    check('three keys exist', g.keysW.length === 3, g.keysW.map((k) => k.id));
    for (const k of g.keysW) {
      g.teleport(k.x + 1.5, k.y, k.z + 0.5);
      let free = !V.solidAt(Math.floor(k.x + 1.5), Math.floor(k.y), Math.floor(k.z + 0.5));
      look(k.g.position.clone().setY(k.y + 1.1));
      check(`key "${k.id}" reachable with prompt`, free && /old key/.test(curLabel() || ''), `${curLabel()} y=${k.y}`);
      if (/old key/.test(curLabel() || '')) g.interactNow();
    }
    check('all keys collected', Object.keys(S.keys).length === 3);
    at(H.pos(25.5, 0, 25.5), H.chest);
    check('chest prompt', /Open the old chest/.test(curLabel() || ''), curLabel());
    g.interactNow(); sim(0.2);
    check('chest opened', S.flags.chestOpen);
    check('final quest reached', S.questIdx === g.QUESTS.length - 1, S.questIdx);

    // Save and load round trip
    const snap = g.exportSave();
    const money1 = S.money, keys1 = Object.keys(S.keys).length, px1 = P.x, qi1 = S.questIdx, fed1 = g.hens[0].fed;
    S.money = 1; S.keys = {}; S.questIdx = 0; P.x += 50; g.hens[0].fed = !fed1;
    check('save imports', g.importSave(snap));
    const S2 = g.S();
    S = S2;
    check('save restores money, keys, quest, position, animals', S2.money === money1 && Object.keys(S2.keys).length === keys1 && S2.questIdx === qi1 && Math.abs(P.x - px1) < 1e-6 && g.hens[0].fed === fed1, `money ${S2.money} keys ${Object.keys(S2.keys).length} quest ${S2.questIdx}`);
    check('corrupt save is rejected without crashing', g.importSave('{not json') === false);

    // Third-person camera must not end up inside a wall.
    S2.inCar = true; g.placeCar(H.car.x, H.car.z, H.carHeading); g.setThird(true); g.tick(dt);
    const cp = g.camera.position;
    check('chase camera stays out of blocks beside the house', !V.solidAt(Math.floor(cp.x), Math.floor(cp.y), Math.floor(cp.z)), `${cp.x.toFixed(1)},${cp.y.toFixed(1)},${cp.z.toFixed(1)}`);
    g.setThird(false); S2.inCar = false; g.car.speed = 0;
    g.teleport(H.spawn.x, H.spawn.y, H.spawn.z);

    // Day cycle and animal hunger
    S2.hour = 5.99; S2.day = 3;
    for (let i = 0; i < 60; i++) g.tick(dt);
    check('animals hungry again in the morning', !g.hens[0].fed && !g.cats[0].fed);

    // Map checks
    const roadCount = W.roads.length, buildings = W.buildings.length;
    check('real map loaded', roadCount > 200 && buildings > 2000, `${roadCount} roads, ${buildings} buildings`);
    check('home gate fronts Akmulla Street', W.D.home.street === 'улица Акмуллы', JSON.stringify(W.D.home));
    const gatePt = H.pos(17, 0, -2);
    check('street name at the gate reads in English', W.roadNameAt(gatePt.x, gatePt.z) === 'Akmulla St', W.roadNameAt(gatePt.x, gatePt.z));
    const centre = W.D.named.find((q) => q.n === 'Администрация');
    const workCentre = Math.hypot(work.entrance.x - centre.x, work.entrance.z - centre.z);
    check('job is in the town centre (under 500 m from Administration)', workCentre < 500, Math.round(workCentre) + ' m');
    const homeCentre = Math.hypot(H.center.x - centre.x, H.center.z - centre.z);
    check('home is a real drive from the centre (over 700 m)', homeCentre > 700, Math.round(homeCentre) + ' m');

    // English is primary: no Cyrillic anywhere on screen, in street names, or on the page.
    const CYR = /[А-Яа-яЁё]/;
    const badNames = W.roads.filter((r) => r.name && CYR.test(W.enName(r.name))).map((r) => r.name);
    check('all street names romanized', badNames.length === 0, badNames.slice(0, 5).join(', '));
    g.tick(dt);
    check('no Cyrillic in the page text', !CYR.test(document.body.innerText || document.body.textContent), (document.body.innerText || '').match(/.{0,20}[А-Яа-яЁё].{0,20}/));

    // Can a car reach the shop and work from the gate? BFS on a 3 m grid over drivable columns.
    function reach(fromV, targets, roadOnly) {
      const st = 3, seen = new Set(), q = [[Math.round(fromV.x / st), Math.round(fromV.z / st)]];
      seen.add(q[0][0] * 100000 + q[0][1]);
      const found = {};
      let head = 0;
      while (head < q.length && head < 800000) {
        const [i, j] = q[head++];
        const x = i * st, z = j * st;
        for (const t in targets) if (!found[t] && Math.hypot(targets[t].x - x, targets[t].z - z) < 12) found[t] = head;
        if (Object.keys(found).length === Object.keys(targets).length) break;
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = i + a, nj = j + b, k = ni * 100000 + nj;
          if (seen.has(k)) continue;
          const wx = ni * st, wz = nj * st;
          if (wx < W.bounds.x0 + 5 || wx > W.bounds.x1 - 5 || wz < W.bounds.z0 + 5 || wz > W.bounds.z1 - 5) continue;
          const c = W.column(wx, wz);
          if (c.b || (c.water >= 0 && c.deck < 0) || (c.site && !(Math.hypot(wx - fromV.x, wz - fromV.z) < 24))) continue;
          if (roadOnly && !c.road && Math.hypot(wx - fromV.x, wz - fromV.z) > 30 && !Object.values(targets).some((t) => Math.hypot(t.x - wx, t.z - wz) < 50)) continue;
          seen.add(k); q.push([ni, nj]);
        }
      }
      return found;
    }
    const gate = H.pos(17, 0, -2);
    const anyGround = reach(gate, { shop: shop.entrance, work: work.entrance }, false);
    check('car can reach shop and work (overland)', anyGround.shop && anyGround.work, JSON.stringify(anyGround));

    // Route along real road cells only, 1 m grid, 8-connected. Returns waypoints or null.
    function roadRoute(from, to) {
      const key = (x, z) => x * 100000 + z;
      const sx = Math.floor(from.x), sz = Math.floor(from.z);
      const prev = new Map([[key(sx, sz), null]]);
      const q = [[sx, sz]];
      const isRoad = (x, z) => { const c = W.column(x, z); return c.road && !c.b; };
      let head = 0, end = null;
      while (head < q.length && head < 2000000) {
        const [x, z] = q[head++];
        if (Math.hypot(x - to.x, z - to.z) < 28) { end = [x, z]; break; }
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const nx = x + a, nz = z + b, k = key(nx, nz);
          if (prev.has(k)) continue;
          if (!isRoad(nx, nz) && Math.hypot(nx - sx, nz - sz) > 6) continue;
          prev.set(k, [x, z]); q.push([nx, nz]);
        }
      }
      if (!end) return { path: null, visited: q.length };
      const path = [];
      for (let c = end; c; c = prev.get(key(c[0], c[1]))) path.push(c);
      path.reverse();
      return { path, visited: q.length };
    }
    // Drives the real car with key presses along the route.
    function autopilot(path, maxSec) {
      V.setRadius(3);
      let i = 0, t = 0, stuck = 0, lastX = S.cx, lastZ = S.cz, crashes = 0, top = 0;
      const look = 8;
      while (t < maxSec) {
        while (i < path.length - 1 && Math.hypot(path[i][0] + 0.5 - S.cx, path[i][1] + 0.5 - S.cz) < look) i++;
        const wp = path[i];
        const want = Math.atan2(-(wp[0] + 0.5 - S.cx), -(wp[1] + 0.5 - S.cz));
        let err = want - S.ch;
        while (err > Math.PI) err -= 6.2832;
        while (err < -Math.PI) err += 6.2832;
        const sharp = Math.abs(err) > 0.3;
        clearKeys();
        g.keys.KeyA = err > 0.04;
        g.keys.KeyD = err < -0.04;
        g.keys.KeyW = g.car.speed < (sharp ? 5 : 13);
        g.keys.Space = g.car.speed > (sharp ? 8 : 16);
        const before = g.car.speed;
        g.tick(dt); t += dt;
        if (before > 2 && g.car.speed <= 0) crashes++;
        top = Math.max(top, g.car.speed);
        if (Math.round(t / dt) % 30 === 0) {
          V.update(S.cx, S.cz, 2);
          if (Math.hypot(S.cx - lastX, S.cz - lastZ) < 0.5) stuck++; else stuck = 0;
          lastX = S.cx; lastZ = S.cz;
          if (stuck > 6) break;
        }
        if (i >= path.length - 1 && Math.hypot(path[i][0] - S.cx, path[i][1] - S.cz) < 6) break;
      }
      clearKeys();
      V.setRadius(10);
      const e = path[path.length - 1];
      // When stuck, report what is in front of the bumper.
      const names = {};
      for (const k in G.blocks.B) names[G.blocks.B[k]] = k;
      const fx = -Math.sin(S.ch), fz = -Math.cos(S.ch), yb = Math.floor(g.car.y + 0.2), ahead = [];
      for (const d of [2.3, 3.3]) for (const dy of [-1, 0, 1, 2]) ahead.push(`d${d}y${dy}:${names[V.blockAt(Math.floor(S.cx + fx * d), yb + dy, Math.floor(S.cz + fz * d))] || 'air'}`);
      return { arrived: Math.hypot(e[0] - S.cx, e[1] - S.cz) < 10, sec: Math.round(t), stuck, crashes, topKmh: Math.round(top * 3.6), at: [Math.round(S.cx), Math.round(S.cz)], wp: i + '/' + path.length, ahead: stuck ? ahead.join(' ') : undefined };
    }
    const toWork = roadRoute(gate, work.entrance);
    check('roads connect home to the warehouse', toWork.path, `visited ${toWork.visited}, route ${toWork.path ? toWork.path.length : 0} m`);
    if (toWork.path) {
      g.placeCar(gate.x, gate.z, H.carHeading);
      if (S.inCar === false) { S.inCar = true; }
      const r = autopilot(toWork.path, 400);
      check('autopilot really drives home -> warehouse', r.arrived, JSON.stringify(r));
    }
    const toShop = roadRoute(gate, shop.entrance);
    check('roads connect home to the shop', toShop.path, `visited ${toShop.visited}, route ${toShop.path ? toShop.path.length : 0} m`);
    if (toShop.path) {
      g.placeCar(gate.x, gate.z, H.carHeading);
      S.inCar = true;
      const r = autopilot(toShop.path, 400);
      check('autopilot really drives home -> shop', r.arrived, JSON.stringify(r));
    }
    check('no runtime errors', errors.length === 0, errors.join(' | '));
  }

  // Real-clock benchmark: runs synchronously before the load event, where headless
  // Chrome's virtual time is not in use. Use: index.html#perf with --dump-dom.
  G.devAfterGame = function () {
    if (!/#perf/.test(location.hash)) return;
    const V = G.voxels, H = G.sites.home;
    const t0 = Date.now();
    V.setRadius(10);
    V.update(H.center.x, H.center.z, Infinity);
    const n1 = V.chunks.size, t1 = Date.now();
    const p = G.world.D.named.find((q) => q.n === 'Администрация');
    V.update(p.x, p.z, Infinity);
    const t2 = Date.now();
    let tris = 0;
    for (const [, c] of V.chunks) { if (c.mesh) tris += c.mesh.geometry.attributes.position.count / 3; }
    // ASCII floor plans at knee height: # wall, D door, . floor, C crate, S shelf, K counter, space outside.
    const plan = (s) => {
      const b = s.b, rows = [];
      for (let z = Math.floor(b.z0) - 1; z <= Math.ceil(b.z1); z++) {
        let r = '';
        for (let x = Math.floor(b.x0) - 1; x <= Math.ceil(b.x1); x++) {
          if (x === s.door.x && z === s.door.z) { r += 'D'; continue; }
          if (!G.world.inB(b, x, z)) { r += ' '; continue; }
          const id = V.blockAt(x, s.y, z), B = G.blocks.B;
          r += id === 0 ? '.' : id === B.CRATE ? 'C' : id === B.SHELF ? 'S' : id === B.COUNTER ? 'K' : '#';
        }
        rows.push(r);
      }
      return rows;
    };
    window.__plans = { work: plan(G.sites.work), shop: plan(G.sites.shop), workDoor: G.sites.work.door, shopDoor: G.sites.shop.door };
    const planPre = document.createElement('pre');
    planPre.textContent = '@@PLAN@@' + JSON.stringify(window.__plans) + '@@END@@';
    document.documentElement.appendChild(planPre);
    const pre = document.createElement('pre');
    pre.textContent = '@@PERF@@' + JSON.stringify({ edgeChunks: n1, edgeMs: t1 - t0, msPerChunkEdge: +((t1 - t0) / n1).toFixed(2), townMs: t2 - t1, chunksLoaded: V.chunks.size, trianglesInTownView: tris }) + '@@END@@';
    document.documentElement.appendChild(pre);
  };

  G.devRun = function () {
    let crash = null;
    try { runSmoke(); } catch (e) { crash = e.stack || String(e); }
    const fail = results.filter((r) => !r.ok);
    const out = { total: results.length, failed: fail.length, crash, errors, fail, passed: results.filter((r) => r.ok).map((r) => r.name + (r.info ? ' [' + r.info + ']' : '')) };
    const pre = document.createElement('pre');
    pre.id = 'result';
    pre.textContent = '@@RESULT@@' + JSON.stringify(out) + '@@END@@';
    document.body.appendChild(pre);
    document.title = 'DONE';
  };

  addEventListener('load', () => {
    if (!/#dev/.test(location.hash)) return;
    const wait = () => {
      if (G.game && G.game.devReady) { setTimeout(G.devRun, 50); return; }
      setTimeout(wait, 50);
    };
    wait();
  });
})();
