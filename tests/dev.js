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
  const W_TOP = () => G.world.TOP;
  const openDoor = (id) => { const d = G.game.doors.find((o) => o.id === id); d.open = true; d.angle = 1; G.voxels.closedDoors.delete(G.voxels.doorKey(d.x, d.y, d.z)); G.voxels.closedDoors.delete(G.voxels.doorKey(d.x, d.y + 1, d.z)); };
  const tp = (x, z, yoff = 0) => new THREE.Vector3(x, G.voxels.groundBelow(x, z, G.world.elevation(x, z) + 22) + yoff, z);

  G.devShots = {
    bedroom() { stand(SI().home.spawn); settle(); },
    kitchen() { const h = SI().home; G.game.setView('first'); stand(h.pos(h.plan.HC(4) + 0.5, 0, h.plan.HR(8) + 0.5), h.cupboard); settle(); },
    backdoor() { const h = SI().home; stand(h.pos(12, 0, 28), h.frontDoorMid); settle(); },
    mosque() { const m = SI().mosque; stand(m.entrance.clone().add(new THREE.Vector3((m.entrance.x - m.inside.x) * 3, 0, (m.entrance.z - m.inside.z) * 3)), m.inside.clone().setY(m.y + 6)); settle(); },
    mosquein() { const g = G.game, m = SI().mosque; g.S().day = 3; g.S().hour = 12.2; openDoor('mosque'); g.setView('first'); stand(m.spot.clone().setY(m.y), m.imam.clone().setY(m.y + 1.1)); settle(12.2); },
    living() { const h = SI().home; G.game.setView('first'); stand(h.pos(h.plan.HC(5) - 0.6, 0, h.plan.HR(3) + 0.4), h.pos(h.plan.HC(1) + 0.5, 0.6, h.plan.HR(1) + 0.5)); settle(); },
    poses() {
      const g = G.game, M = G.models, base = SI().airHome.frame.pos(120, 0, 36);
      g.teleport(base.x, W_TOP(), base.z + 30); settle();
      g.avatar.visible = false;
      const row = [
        ['walk', () => M.blockyPerson(), 1.2], ['walk', () => M.blockyPerson(), 4.3], ['carry', () => M.blockyPerson()], ['sit', () => M.blockyPerson()],
        ['walk', () => M.person({ shirt: 0xb83a4b }), 1.2], ['walk', () => M.person({ shirt: 0x4b6b3a }), 4.3], ['sit', () => M.person({ shirt: 0x6a4f7a })],
      ];
      row.forEach(([mode, fn, ph], i) => {
        const p = fn(); p.position.set(base.x - 9 + i * 2.6, W_TOP() + (mode === 'sit' ? 0.62 : 0), base.z); p.rotation.y = -Math.PI / 2; // all face +X (to the right)
        if (mode === 'carry') { M.animatePerson(p, 0, 0, 'walk'); M.poseCarry(p); } else M.animatePerson(p, ph || 0, 1, mode);
        G.game.camera.parent.add(p);
      });
      const cam = G.game.camera; cam.position.set(base.x - 1.2, W_TOP() + 1.1, base.z + 7.5); cam.rotation.set(-0.02, 0, 0);
    },
    face() {
      const g = G.game, h = SI().home, b = h.gate.clone().add(new THREE.Vector3(-12, 0, 0));
      g.teleport(b.x, W_TOP(), b.z); g.setYawPitch(0, 0); settle();
      g.avatar.position.set(b.x, W_TOP(), b.z); g.avatar.rotation.y = 0; g.avatar.visible = true;
      G.models.animatePerson(g.avatar, 0, 0, 'walk');
      const cam = g.camera; cam.position.set(b.x + 1.2, W_TOP() + 1.6, b.z - 3); cam.lookAt(b.x, W_TOP() + 1.2, b.z);
    },    hills() { const h = SI().home; G.game.setCamDist(5); stand(h.pos(19.5, 0, -6), h.pos(19.5, 60, -1200)); settle(); },
    hillsN() { const g = G.game; g.teleport(0, W_TOP(), -2900); g.setYawPitch(0, 0.04); settle(); },
    corridor() { const h = SI().home; stand(h.pos(7.5, 0, 6), h.pos(7.5, 1.5, 20)); settle(); },
    yard() { const h = SI().home; stand(h.pos(19.5, 0, 21), h.pos(19.5, 1, 32)); settle(); },
    coop() { const h = SI().home; stand(h.pos(13, 0, 38), h.pos(20, 0.6, 42)); settle(); },
    yard2() { const h = SI().home; stand(h.pos(19.5, 0, -7), h.pos(8, 2.5, 12)); settle(); },
    street() { const h = SI().home; G.game.setCamDist(7); stand(h.pos(30, 0, -6), h.pos(0, 1.5, -5)); settle(); },
    chickens() { const g = G.game; const a = g.hens[0]; const p = new THREE.Vector3(a.x + 2.2, G.sites.home.y, a.z + 1.2); stand(p, new THREE.Vector3(a.x, G.sites.home.y + 0.5, a.z)); settle(); },
    shed() { const h = SI().home; G.game.setView('first'); openDoor('shed'); stand(h.pos(19.5, 0, 29), h.chest); settle(); },
    npc() { const g = G.game; for (let i = 0; i < 60; i++) g.tick(1 / 30); const n = g.npcs.find((q) => q.active); if (n) stand(new THREE.Vector3(n.x + 3, W_TOP(), n.z + 3), new THREE.Vector3(n.x, W_TOP() + 1.4, n.z)); settle(); },
    mountains() { const h = SI().home; G.game.setCamDist(5); stand(h.pos(19.5, 0, -6), h.pos(19.5, 30, -900)); settle(); },
    street() { const h = SI().shop; const e = h.entrance; stand(tp(e.x, e.z), new THREE.Vector3(h.door.x, h.y + 2, h.door.z)); settle(); },
    shopin() { const s = SI().shop; openDoor('shop'); stand(new THREE.Vector3(s.door.x + 0.5 + s.door.dx * 1.5, s.y, s.door.z + 0.5 + s.door.dz * 1.5), s.counter); settle(); },
    work() { const s = SI().work; stand(tp(s.entrance.x, s.entrance.z), new THREE.Vector3(s.door.x, s.y + 2, s.door.z)); settle(); },
    workin() { const s = SI().work; openDoor('work'); stand(new THREE.Vector3(s.door.x + 0.5 + s.door.dx, s.y, s.door.z + 0.5 + s.door.dz), s.drop.clone().setY(s.y + 1)); settle(); },
    bridge() { const b = G.world.D.bridges.find((q) => q.n === 'Восточная улица'); const f = tp(b.x + 18, b.z + 16); stand(f, tp(b.x, b.z, 0.5)); settle(); },
    center() { const p = G.world.D.named.find((q) => q.n === 'Администрация'); stand(tp(p.x - 30, p.z + 34), new THREE.Vector3(p.x, 42, p.z)); settle(); },
    car() { const g = G.game; const h = SI().home; g.S().carKey = true; g.S().inCar = true; g.car.y = g.S().cy; settle(); void h; },
    carthird() { const g = G.game; g.S().carKey = true; g.S().inCar = true; g.setThird(true); g.car.y = g.S().cy; settle(); },
    sky() { const g = G.game; const p = G.world.D.named.find((q) => q.n === 'Администрация'); g.teleport(p.x, 420, p.z + 700); g.setYawPitch(0, -0.55); g.P.vy = 0; const c = g.camera; c.position.set(p.x, 420, p.z + 700); G.voxels.setRadius(5); settle(); },
    airport() { const a = SI().airHome; stand(a.frame.pos(150, 0, 30), a.parked.clone().setY(W_TOP() + 4)); settle(); },
    terminal() { const a = SI().airHome; stand(a.frame.pos(190.5, 0, -14), a.frame.pos(190.5, 3, 6)); settle(); },
    desk() { const a = SI().airHome; openDoor('terminal'); stand(a.frame.pos(190.5, 0, 8), a.desk); settle(); },
    takeoff() { const g = G.game; g.startFlight(g.COUNTRIES[3]); for (let i = 0; i < 480; i++) g.tick(1 / 30); settle(); },
    climb() { const g = G.game; g.startFlight(g.COUNTRIES[3]); for (let i = 0; i < 660; i++) g.tick(1 / 30); settle(); },
    abroad() { const g = G.game; g.S().abroad = { id: 'japan', taxiAt: 'airport' }; g.applyPlace(); const a = SI().airAbroad; stand(a.entrance, new THREE.Vector3(G.world.ABROAD.taxiStartX + 40, W_TOP() + 2, G.world.ABROAD.taxiZ)); settle(); },
    taxi() { const g = G.game; g.S().abroad = { id: 'france', taxiAt: 'airport' }; g.applyPlace(); const t = g.taxiPose(); stand(new THREE.Vector3(t.x - 6, W_TOP(), t.z + 5), new THREE.Vector3(t.x, W_TOP() + 1, t.z)); settle(); },
    hotel() { const g = G.game; g.S().abroad = { id: 'italy', taxiAt: 'hotel' }; g.applyPlace(); const h = SI().hotel; stand(new THREE.Vector3(h.x - 8, W_TOP(), G.world.ABROAD.z0 - 17), new THREE.Vector3(h.x, W_TOP() + 4, h.signPos.z)); settle(); },
    hotelin() { const g = G.game; g.S().abroad = { id: 'italy', taxiAt: 'hotel', checkedIn: true }; g.applyPlace(); openDoor('hotel'); const h = SI().hotel; stand(new THREE.Vector3(h.x, W_TOP(), h.signPos.z + 2), h.reception); settle(); },
    night() { const h = SI().home; stand(h.pos(19.5, 0, -7), h.pos(8, 2.5, 12)); settle(22); },
    sunset() { const h = SI().home; stand(h.pos(19.5, 0, -7), h.pos(8, 2.5, 12)); settle(18); },
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
    const inside = H.frontDoorInside, doorOut = H.frontDoorOutside, doorMid = H.frontDoorMid;
    check('the front door faces the back yard, away from the street', doorOut.distanceTo(H.gate) > inside.distanceTo(H.gate), `door ${doorOut.distanceTo(H.gate).toFixed(1)} m from the gate`);
    at(inside, doorMid);
    check('door prompt shows', /Open door/.test(curLabel() || ''), curLabel());
    g.keys.KeyW = true; sim(1.5); clearKeys();
    check('closed door blocks walking', Math.hypot(P.x - doorOut.x, P.z - doorOut.z) > 1.5, `dist=${Math.hypot(P.x - doorOut.x, P.z - doorOut.z).toFixed(2)}`);
    at(inside, doorMid);
    g.interactNow(); sim(0.3);
    g.lookAt(doorOut.clone().setY(P.eye));
    g.keys.KeyW = true; sim(0.8); clearKeys();
    check('open door lets you walk outside', Math.hypot(P.x - doorOut.x, P.z - doorOut.z) < 2.4, `dist=${Math.hypot(P.x - doorOut.x, P.z - doorOut.z).toFixed(2)}`);

    // Shed + grain
    at(H.pos(19.5, 0, 24.5), H.pos(19.5, 1.6, 26.5));
    check('shed door prompt', /Open door/.test(curLabel() || ''), curLabel());
    g.interactNow(); sim(0.3);
    at(H.pos(18.5, 0, 29.5), H.sack);
    check('sack prompt', /grain/.test(curLabel() || ''), curLabel());
    g.interactNow(); sim(0.1);
    check('got 6 grain', S.items.grain === 6, S.items.grain);

    // Chickens
    // Hens wander and cluster, so the prompt may pick a neighbour: keep going until all are fed.
    let fedOK = 0;
    // Stand on a free cell beside the animal; if it is out of reach (say, inside the coop), wait for it to wander out.
    const besideFree = (a) => {
      for (const [ox, oz] of [[1.1, 0.4], [-1.1, 0.4], [0.4, 1.1], [0.4, -1.1], [1.1, 1.1], [-1.1, -1.1]]) {
        const x = a.x + ox, z = a.z + oz;
        if (!V.solidAt(Math.floor(x), H.y, Math.floor(z)) && !V.solidAt(Math.floor(x), H.y + 1, Math.floor(z))) return [x, z];
      }
      return null;
    };
    for (let tries = 0; tries < 60 && !g.hens.every((h) => h.fed); tries++) {
      const h = g.hens.find((a) => !a.fed);
      const spot = besideFree(h);
      if (spot) {
        g.teleport(spot[0], H.y, spot[1]);
        g.lookAt(h.group.position.clone().setY(H.y + 0.4)); g.tick(dt);
        g.lookAt(h.group.position.clone().setY(H.y + 0.4)); g.tick(dt);
        if (g.current() && /chicken/i.test(g.current().label())) { g.interactNow(); fedOK++; continue; }
      }
      sim(0.8);
    }
    check('all 5 chickens fed', g.hens.every((h) => h.fed) && S.flags.hensDone, `fed via prompt ${fedOK}`);
    check('grain spent', S.items.grain === 1, S.items.grain);

    // Cats
    at(H.pos(H.plan.HC(4) + 0.5, 0, H.plan.HR(7) + 0.5), H.cupboard);
    check('cupboard prompt', /cat food/.test(curLabel() || ''), curLabel());
    g.interactNow(); sim(0.1);
    check('3 cat food', S.items.catfood === 3, S.items.catfood);
    let catsOK = 0;
    for (let tries = 0; tries < 60 && !g.cats.every((a) => a.fed); tries++) {
      const c = g.cats.find((a) => !a.fed);
      const spot = besideFree(c);
      if (spot) {
        g.teleport(spot[0], H.y, spot[1]);
        g.lookAt(c.group.position.clone().setY(H.y + 0.4)); g.tick(dt);
        g.lookAt(c.group.position.clone().setY(H.y + 0.4)); g.tick(dt);
        if (g.current() && /cat/i.test(g.current().label())) { g.interactNow(); catsOK++; continue; }
      }
      sim(0.8);
    }
    check('all 3 cats fed', g.cats.every((c) => c.fed) && S.flags.catsDone, `via prompt ${catsOK}`);

    // Car key
    at(H.pos(H.plan.HC(4) + 0.5, 0, H.plan.HR(7) + 0.5), H.keyHook);
    check('car key prompt', /car key/.test(curLabel() || ''), curLabel());
    g.interactNow(); sim(0.1);
    check('has car key', S.carKey);

    // Car: drive through the gate
    at(H.pos(16.5, 0, 9), H.car.clone().setY(H.y + 1));
    check('car prompt', /Get in/.test(curLabel() || ''), curLabel());
    g.interactNow();
    check('in car', S.inCar);
    const c0 = [S.cx, S.cz];
    g.keys.KeyW = true; sim(3); clearKeys();
    const moved = Math.hypot(S.cx - c0[0], S.cz - c0[1]);
    check('car drives out of the yard through the gate', moved > 10, `moved ${moved.toFixed(1)} m, speed ${(g.car.speed * 3.6).toFixed(0)} km/h`);
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
    check('car is stopped by the depot wall', dW > 1.5, `dist to wall ${dW.toFixed(1)}`);
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
    check('walked into the depot', walked > 0.9, walked.toFixed(2));
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
    at(H.pos(19.5, 0, 30.5), H.chest);
    check('chest prompt', /Open the old chest/.test(curLabel() || ''), curLabel());
    g.interactNow(); sim(0.2);
    check('chest opened', S.flags.chestOpen);

    // ---------- Body poses: limbs must bend the natural way relative to where the figure faces ----------
    {
      const M = G.models, sc = new THREE.Scene();
      const mk = (fn) => { const p = fn(); p.position.set(0, 0, 0); p.rotation.y = -Math.PI / 2; sc.add(p); return p; }; // faces +X
      const fwd = (p, v) => { p.updateMatrixWorld(true); return v.x; }; // forward is +X here
      const at = (obj, y) => { obj.updateMatrixWorld(true); return obj.localToWorld(new THREE.Vector3(0, y, 0)); };
      const blocky = mk(() => M.blockyPerson()), human = mk(() => M.person({}));
      for (const [name, p, legLen, upper, lower] of [['blocky', blocky, 0.72, 0, 0], ['villager', human, 0, 0.44, 0.43]]) {
        M.animatePerson(p, Math.PI / 2, 1, 'walk'); // left leg at the front of its stride
        p.updateMatrixWorld(true);
        const hip = at(p.userData.legs[0].top, 0);
        const foot = legLen ? at(p.userData.legs[0].top, -legLen) : at(p.userData.legs[0].joint, -lower);
        check(`${name}: the stepping leg swings forward`, foot.x > hip.x + 0.1, `foot ${(foot.x - hip.x).toFixed(2)} m ahead of hip`);
        const shoulder = at(p.userData.arms[0].top, 0), hand = at(p.userData.arms[0].top, -0.6);
        check(`${name}: the opposite arm swings back`, hand.x < shoulder.x - 0.05, (hand.x - shoulder.x).toFixed(2));
        if (!legLen) {
          for (let ph = 0; ph < 6.3; ph += 0.3) {
            M.animatePerson(p, ph, 1, 'walk'); p.updateMatrixWorld(true);
            for (const l of p.userData.legs) {
              const knee = at(l.joint, 0), hipP = at(l.top, 0), ft = at(l.joint, -lower);
              // Foot must never sit in front of the line from hip through knee (that would be a backwards knee).
              const lineX = hipP.x + (knee.x - hipP.x) * ((hipP.y - ft.y) / Math.max(0.01, hipP.y - knee.y));
              if (ft.x > lineX + 0.02) { check('villager: knees never bend backwards', false, `phase ${ph.toFixed(1)}`); ph = 99; break; }
            }
          }
          check('villager: knees bend the natural way through the whole stride', true);
          M.animatePerson(p, 0, 1, 'walk'); p.updateMatrixWorld(true);
          const el = at(p.userData.arms[0].joint, 0), hd = at(p.userData.arms[0].joint, -0.27);
          check('villager: elbows bend forwards', hd.x > el.x, (hd.x - el.x).toFixed(3));
        }
        M.animatePerson(p, 0, 0, 'sit'); p.updateMatrixWorld(true);
        const knee = legLen ? at(p.userData.legs[0].top, -legLen) : at(p.userData.legs[0].joint, 0);
        check(`${name}: sitting puts the thighs forward`, knee.x > at(p.userData.legs[0].top, 0).x + 0.3, (knee.x - at(p.userData.legs[0].top, 0).x).toFixed(2));
        M.animatePerson(p, 0, 0, 'walk'); M.poseCarry(p); p.updateMatrixWorld(true);
        const hand2 = at(p.userData.arms[0].top, -0.55);
        check(`${name}: carrying holds the arms out in front`, hand2.x > at(p.userData.arms[0].top, 0).x + 0.35, (hand2.x - at(p.userData.arms[0].top, 0).x).toFixed(2));
      }
      check('the player is the blocky Roblox-style figure', g.avatar.userData.blocky === true);
      void fwd;
    }
    // ---------- Car and fences: it must stop at a fence and always be able to back away ----------
    {
      const o = H.pos(0, 0, 0), vOf = () => (S.cx - o.x) * H.dirV[0] + (S.cz - o.z) * H.dirV[1];
      for (const angle of [0.35, 1.0, 1.35]) {
        const start = H.pos(3.5, 0, -5.5);
        g.placeCar(start.x, start.z, H.carHeading + Math.PI + angle);
        S.inCar = true; g.car.speed = 0;
        clearKeys(); g.keys.KeyW = true; sim(3); clearKeys();
        const deepest = vOf();
        g.keys.Space = true; sim(1); clearKeys();
        const before = [S.cx, S.cz];
        g.keys.KeyS = true; sim(2); clearKeys();
        const backed = Math.hypot(S.cx - before[0], S.cz - before[1]);
        check(`car stops at the fence at a ${Math.round(angle * 57)} deg angle`, deepest < 0.6, `body centre ${deepest.toFixed(2)} m past the fence line (half-length 2.1)`);
        check(`car backs away from the fence at ${Math.round(angle * 57)} deg`, backed > 2, backed.toFixed(1) + ' m');
        g.keys.Space = true; sim(1); clearKeys();
      }
      S.inCar = false; g.car.speed = 0;
      g.placeCar(H.car.x, H.car.z, H.carHeading);
    }

    // ---------- Mosque and the Friday prayer ----------
    {
      const MQ = SI().mosque;
      check('a mosque you can enter exists', !!MQ && !!g.doors.find((d) => d.id === 'mosque'));
      S.day = 2; S.hour = 10; sim(0.3);
      check('day 2 is a Thursday', !g.isFriday() && g.WEEK[g.weekday(S.day)] === 'Thursday');
      check('the clock shows the weekday', /^Thu/.test(document.querySelector('#clock').textContent), document.querySelector('#clock').textContent);
      const dM = g.doors.find((d) => d.id === 'mosque');
      g.teleport(MQ.entrance.x, W.TOP, MQ.entrance.z); g.lookAt(dM.center); g.tick(dt);
      g.teleport(dM.x + 0.5 - MQ.door.dx * 1.6, W.TOP, dM.z + 0.5 - MQ.door.dz * 1.6); g.lookAt(dM.center); g.tick(dt);
      check('mosque door prompt', /Open door/.test(curLabel() || ''), curLabel());
      g.interactNow(); sim(0.4);
      g.lookAt(MQ.inside.clone().setY(P.eye)); g.keys.KeyW = true; sim(0.9); clearKeys();
      check('walks into the mosque', W.inB(MQ.b, Math.floor(P.x), Math.floor(P.z)), `${P.x.toFixed(1)},${P.z.toFixed(1)}`);
      sim(0.2);
      check('shoes come off at the entrance', [...document.querySelectorAll('.toast')].some((t) => /shoes/.test(t.textContent)));
      g.teleport(MQ.spot.x - MQ.door.dx * 2, W.TOP, MQ.spot.z - MQ.door.dz * 2); g.lookAt(MQ.spot); g.tick(dt);
      check('on other days the mosque says when to come', /in 1 day/.test(curLabel() || ''), curLabel());
      S.day = 3; S.hour = 9; g.tick(dt);
      check('day 3 is Friday', g.isFriday());
      check('on Friday morning the Friday prayer is the current quest', /Friday/.test(document.querySelector('#quest-title').textContent), document.querySelector('#quest-title').textContent);
      S.hour = 12; g.tick(dt);
      {
        const toward = (obj, target) => { const f = new THREE.Vector3(0, 0, -1).applyQuaternion(obj.getWorldQuaternion(new THREE.Quaternion())); const t = target.clone().sub(obj.getWorldPosition(new THREE.Vector3())).setY(0).normalize(); return f.dot(t); };
        const dots = g.congregation.map((c) => { const p = c.getWorldPosition(new THREE.Vector3()); return toward(c, p.clone().add(new THREE.Vector3(MQ.door.dx, 0, MQ.door.dz))); });
        check('worshippers face the mihrab wall', dots.every((v) => v > 0.99), dots.map((v) => v.toFixed(2)).join(' ') + ` door ${JSON.stringify(MQ.door)} faceIn ${MQ.faceIn.toFixed(2)}`);
      }      check('worshippers gather before the prayer', g.congregation.length >= 4 && g.congregation.every((c) => c.visible), g.congregation.length + ' people');
      g.lookAt(MQ.spot); g.tick(dt);
      check('prayer spot offers to wait for the prayer', /Wait for the Friday prayer/.test(curLabel() || ''), curLabel());
      const hunger0 = S.hunger = 40;
      g.interactNow(); g.tick(dt);
      check('joining the prayer moves time on and records it', S.prayedDay === 3 && S.hour >= 13.5 && S.hour < 14 && S.flags.prayedOnce, S.hour.toFixed(2));
      check('neighbours share food afterwards', S.hunger > hunger0 + 25, S.hunger);
      check('the main quest returns after the prayer', !/Friday/.test(document.querySelector('#quest-title').textContent), document.querySelector('#quest-title').textContent);
      check('worshippers leave after the prayer', g.congregation.every((c) => !c.visible));
      g.lookAt(MQ.spot); g.tick(dt);
      check('cannot pray twice on one Friday', /prayed here today/.test(curLabel() || ''), curLabel());
      S.day = 10; S.hour = 16; g.tick(dt);
      check('after 15:00 the prayer is over', g.isFriday() && /over/.test(curLabel() || ''), curLabel());
    }

    // ---------- Akmulla 76, fences, villagers, camera, landscape ----------
    check('home is the real house at Akmulla St 76', W.D.home.way === '777451118' && W.D.home.number === '76', JSON.stringify(W.D.home));
    check('home address shows on screen at home', (() => { g.teleport(H.spawn.x, H.spawn.y, H.spawn.z); g.tick(dt); g.tick(0.2); return /Akmulla St 76/.test(document.querySelector('#street').textContent); })(), document.querySelector('#street').textContent);
    check('private houses have fences', W.fences.length > 1500, W.fences.length + ' fence lines');
    const fenceProbe = (() => {
      for (const f of W.fences) {
        if (f.force) continue;
        for (let t = 1; t < f.len - 1; t += 1) {
          if (!W.fenceAllowedAt(f, t)) continue;
          const x = Math.floor(f.ax + f.dx * t), z = Math.floor(f.az + f.dz * t);
          if (W.column(x, z).fence) return { x, z, solid: V.solidAt(x, W.TOP, z) && V.solidAt(x, W.TOP + 1, z) };
        }
      }
      return null;
    })();
    check('fences block walking (2 m high)', fenceProbe && fenceProbe.solid, JSON.stringify(fenceProbe));
    check('home lot is fenced with a gap at the gate', V.solidAt(Math.floor(H.pos(3.5, 0, 0.5).x), W.TOP, Math.floor(H.pos(3.5, 0, 0.5).z)) && !V.solidAt(Math.floor(H.gate.x + (H.pos(19.5, 0, 0.5).x - H.gate.x)), W.TOP, Math.floor(H.pos(19.5, 0, 0.5).z)));
    g.teleport(H.gate.x - 4, W.TOP, H.gate.z);
    for (let i = 0; i < 20; i++) g.tick(dt);
    check('villagers walk about', g.npcs.filter((n) => n.active).length >= 3, g.npcs.filter((n) => n.active).length + ' active; ' + g.npcs.map((n) => n.active ? Math.round(Math.hypot(n.x - P.x, n.z - P.z)) + 'm/w' + n.wait.toFixed(1) : 'off').join(' ') + ' P ' + P.x.toFixed(0) + ',' + P.z.toFixed(0) + ' inCar ' + S.inCar + ' cut ' + g.isCut());
    const n0 = g.npcs.filter((n) => n.active && Math.hypot(n.x - P.x, n.z - P.z) > 4).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
    if (n0) n0.wait = 0;
    if (n0) {
      const before = [n0.x, n0.z];
      for (let i = 0; i < 30; i++) g.tick(dt);
      check('a villager moves', Math.hypot(n0.x - before[0], n0.z - before[1]) > 0.3 || n0.wait > 0, Math.hypot(n0.x - before[0], n0.z - before[1]).toFixed(2));
      g.teleport(n0.x + 1.6, W.TOP, n0.z + 0.6); g.lookAt(new THREE.Vector3(n0.x, W.TOP + 1.5, n0.z)); g.tick(dt); g.lookAt(new THREE.Vector3(n0.x, W.TOP + 1.5, n0.z)); g.tick(dt);
      check('you can talk to a villager', /Talk to/.test(curLabel() || ''), curLabel());
    }
    g.setView('third');
    g.teleport(H.pos(19.5, 0, -5).x, W.TOP, H.pos(19.5, 0, -5).z); g.setYawPitch(0, -0.2); g.tick(dt);
    const camP = g.camera.position, head = new THREE.Vector3(P.x, P.y + 1.55, P.z);
    check('third-person camera sits behind the character', camP.distanceTo(head) > 3 && g.avatar.visible, camP.distanceTo(head).toFixed(2) + ' m');
    g.teleport(H.spawn.x, H.spawn.y, H.spawn.z); g.setYawPitch(H.spawnYaw, 0); g.tick(dt);
    const cp2 = g.camera.position;
    check('third-person camera never ends up inside a wall indoors', !V.solidAt(Math.floor(cp2.x), Math.floor(cp2.y), Math.floor(cp2.z)), `${cp2.x.toFixed(1)},${cp2.y.toFixed(1)},${cp2.z.toFixed(1)}`);
    check('landscape with hills is built', !!V.getBgScene() && window.AKYAR_TERRAIN && window.AKYAR_TERRAIN.w > 50);
    const types = new Set();
    for (let cz = -500; cz < 500; cz += 1) for (let cx = -400; cx < 400; cx += 3) { const t = W.treeAt(cx, cz); if (t) types.add(t.type); }
    check('several realistic tree species', types.size >= 4, [...types].join(', '));

    // ---------- The world: flat, few trees ----------
    let flatBad = 0;
    for (let i = 0; i < 400; i++) { const c = W.column(Math.floor((W.hash(i, 1) - 0.5) * 5000), Math.floor((W.hash(i, 2) - 0.5) * 6000)); if (c.ground !== W.GROUND_Y) flatBad++; }
    check('the map is flat everywhere', flatBad === 0, flatBad + ' columns off level');
    let treesN = 0, cells = 0;
    for (let cz = -500; cz < 500; cz += 2) for (let cx = -400; cx < 400; cx += 2) { cells++; if (W.treeAt(cx, cz)) treesN++; }
    const perKm2 = (treesN * 2 * 2) / ((800 * 6 * 1000 * 6) / 1e6);
    check('trees are sparse (under 60 per square km on average)', perKm2 < 60, perKm2.toFixed(1) + ' per km2');

    // ---------- Airport near home ----------
    const AH = SI().airHome, AA = W.D.airport;
    const gap = Math.hypot(Math.max(AA.x0 - H.x1, H.x0 - AA.x1, 0), Math.max(AA.z0 - H.z1, H.z0 - AA.z1, 0));
    check('airport is a few hundred metres from the house', gap >= 100 && gap <= 600, Math.round(gap) + ' m');

    // ---------- Only non-tropical destinations ----------
    const TROPICAL = /cambodia|thailand|vietnam|laos|myanmar|indonesia|philippines|malaysia|brazil|india|nigeria|kenya|mexico/i;
    check('no country in the list is tropical', g.COUNTRIES.every((c) => Math.abs(c.lat) > 23.44 && !TROPICAL.test(c.name)), g.COUNTRIES.map((c) => c.name).join(', '));
    const picks = new Set();
    for (let i = 0; i < 400; i++) { const c = g.pickCountry(); picks.add(c.id); if (c.id === S.lastCountry) picks.add('REPEAT'); }
    check('destinations are random across the list', picks.size === g.COUNTRIES.length || (S.lastCountry && picks.size === g.COUNTRIES.length - 1), picks.size + ' seen');

    // ---------- Terminal and ticket ----------
    const doorT = g.doors.find((d) => d.id === 'terminal');
    at(AH.frame.pos(190.5, 0, 4.4), doorT.center);
    check('terminal door prompt', /Open door/.test(curLabel() || ''), curLabel());
    g.interactNow(); sim(0.4);
    const deskSpot = AH.frame.pos(190.5, 0, 10.5);
    S.money = 100;
    at(deskSpot, AH.desk);
    check('ticket desk prompt', /Ticket/.test(curLabel() || ''), curLabel());
    g.interactNow();
    check('no ticket without the money', !g.isCut() && S.money === 100);
    S.money = 900;
    g.tick(dt);
    check('ticket offer shows the price', /Buy a ticket/.test(curLabel() || ''), curLabel());
    g.interactNow();
    check('buying starts the flight', g.isCut() && S.money === 400 && S.flags.tripStarted, S.money);
    g.tick(dt);
    check('prompt offers to skip the flight', /Skip/.test(document.querySelector('#prompt').textContent), document.querySelector('#prompt').textContent);
    const runFor = (maxSec, until) => { let t = 0; while (t < maxSec && !until()) { g.tick(dt); V.update(g.camera.position.x, g.camera.position.z, 1); t += dt; } return t; };
    // Watch the whole flight rather than skipping it.
    let peak = 0;
    const flightSec = runFor(90, () => { peak = Math.max(peak, g.camera.position.y); return !g.isCut(); });
    check('the flight plays through and lands', !g.isCut(), flightSec.toFixed(0) + ' s');
    check('the plane really climbed', peak > W.TOP + 100, 'peak ' + Math.round(peak - W.TOP) + ' m');
    const aw = W.ABROAD.bounds;
    check('arrives abroad, inside the new area', S.abroad && P.x > aw.x0 && P.x < aw.x1 && P.z > aw.z0 && P.z < aw.z1, JSON.stringify(S.abroad));
    const co = g.countryById(S.abroad.id);
    check('the country is outside the tropics', Math.abs(co.lat) > 23.44, co.name);
    check('stands on the ground, not stuck', !V.solidAt(Math.floor(P.x), Math.floor(P.y + 0.5), Math.floor(P.z)) && Math.abs(P.y - W.TOP) < 0.01);
    check('the quest panel follows the trip', /taxi/i.test(document.querySelector('#quest-text').textContent || g.TRIP_QUESTS[0].d()));

    // Save and load while abroad
    const tripSave = g.exportSave();
    const again = g.importSave(tripSave);
    S = g.S();
    check('saving abroad restores the trip', again && S.abroad && S.abroad.id === co.id);

    // Taxi to the hotel
    const tp0 = g.taxiPose();
    at(new THREE.Vector3(tp0.x, W.TOP, tp0.z + 3), new THREE.Vector3(tp0.x, W.TOP + 1, tp0.z));
    check('taxi prompt', /taxi to the hotel/.test(curLabel() || ''), curLabel());
    g.interactNow();
    check('the taxi ride starts', g.isCut() && g.cutInfo().type === 'taxi');
    const x0T = g.taxiPose().x;
    runFor(3, () => false);
    check('the taxi really drives', g.taxiPose().x > x0T + 8, (g.taxiPose().x - x0T).toFixed(1) + ' m');
    const rideSec = runFor(90, () => !g.isCut());
    check('the taxi arrives at the hotel', !g.isCut() && S.abroad.reachedHotel && Math.abs(P.x - SI().hotel.x) < 2, rideSec.toFixed(0) + ' s more');

    // Hotel
    const doorH = g.doors.find((d) => d.id === 'hotel');
    g.lookAt(doorH.center); g.tick(dt);
    check('hotel door prompt from the drop-off', /Open door/.test(curLabel() || ''), curLabel());
    g.interactNow(); sim(0.4);
    g.keys.KeyW = true; sim(1.6); clearKeys();
    check('walks into the hotel', P.z > doorH.z + 0.8, 'z ' + P.z.toFixed(1));
    at(new THREE.Vector3(SI().hotel.reception.x, W.TOP, SI().hotel.reception.z - 3), SI().hotel.reception);
    check('reception prompt', /Check in/.test(curLabel() || ''), curLabel());
    g.interactNow();
    check('checked in', S.abroad.checkedIn);
    at(new THREE.Vector3(SI().hotel.bed.x - 2.5, W.TOP, SI().hotel.bed.z + 2), SI().hotel.bed);
    check('hotel bed prompt', /Sleep/.test(curLabel() || ''), curLabel());
    g.interactNow();
    check('slept at the hotel', S.abroad.slept);

    // Back to the airport and home
    const tp1 = g.taxiPose();
    at(new THREE.Vector3(tp1.x, W.TOP, tp1.z + 3), new THREE.Vector3(tp1.x, W.TOP + 1, tp1.z));
    check('return taxi prompt', /taxi to the airport/.test(curLabel() || ''), curLabel());
    g.interactNow();
    check('skip works on the taxi', g.isCut());
    g.skipCut();
    check('back at the airport', !g.isCut() && S.abroad.taxiAt === 'airport' && Math.abs(P.x - W.ABROAD.taxiStartX) < 3);
    const AB2 = SI().airAbroad;
    const doorA = g.doors.find((d) => d.id === 'terminal_abroad');
    at(AB2.frame.pos(190.5, 0, 4.4), doorA.center); g.interactNow(); sim(0.3);
    at(AB2.frame.pos(190.5, 0, 10.5), AB2.desk);
    check('fly-home prompt abroad', /Fly home/.test(curLabel() || ''), curLabel());
    g.interactNow();
    check('return flight starts', g.isCut());
    runFor(5, () => false);
    g.skipCut();
    check('home again', !g.isCut() && S.abroad === null && S.flags.returnedHome && Math.hypot(P.x - AH.entrance.x, P.z - AH.entrance.z) < 3);
    check('walks freely after returning', (() => { const x = P.x, z = P.z; g.setYawPitch(P.yaw + Math.PI, 0); g.keys.KeyW = true; sim(0.8); clearKeys(); return Math.hypot(P.x - x, P.z - z) > 1; })());
    sim(0.1);
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
    const gatePt = H.gate;
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

    const gate = H.gate;

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
    check('roads connect home to the depot', toWork.path, `visited ${toWork.visited}, route ${toWork.path ? toWork.path.length : 0} m`);
    if (toWork.path) {
      g.placeCar(gate.x, gate.z, H.carHeading);
      if (S.inCar === false) { S.inCar = true; }
      const r = autopilot(toWork.path, 400);
      check('autopilot really drives home -> depot', r.arrived, JSON.stringify(r));
    }
    const toAir = roadRoute(gate, SI().airHome.entrance);
    check('roads connect home to the airport', toAir.path, `route ${toAir.path ? toAir.path.length : 0} m`);
    if (toAir.path) {
      g.placeCar(gate.x, gate.z, H.carHeading);
      S.inCar = true;
      const r = autopilot(toAir.path, 200);
      check('autopilot really drives home -> airport', r.arrived, JSON.stringify(r));
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
