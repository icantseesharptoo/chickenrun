// Blocky models built from coloured boxes. All models face -Z at rotation 0.
// Later, these can be swapped for .glb models with the same pivots.
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  function boxesGeometry(list) {
    const n = list.length;
    const pos = new Float32Array(n * 36 * 3), col = new Float32Array(n * 36 * 3);
    let p = 0;
    const F = [
      [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1], 0.84],
      [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1], 0.7],
      [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1], 1],
      [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], 0.55],
      [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1], 0.76],
      [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1], 0.76],
    ];
    for (const [cx, cy, cz, w, h, d, c] of list) {
      const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
      for (const f of F) for (const k of [0, 1, 2, 0, 2, 3]) {
        const v = f[k], s = f[4];
        pos[p] = cx + (v[0] * w) / 2; pos[p + 1] = cy + (v[1] * h) / 2; pos[p + 2] = cz + (v[2] * d) / 2;
        col[p] = r * s; col[p + 1] = g * s; col[p + 2] = b * s;
        p += 3;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    return geo;
  }
  const mesh = (list) => new THREE.Mesh(boxesGeometry(list), G.mats.entityMat);

  function chicken(variant) {
    const c = [0xf2eee2, 0xc77f3e, 0x3a3532, 0xe3c58f][variant % 4];
    const wing = variant % 4 === 2 ? 0x57504b : c === 0xf2eee2 ? 0xdcd6c6 : 0xa86a33;
    const g = new THREE.Group();
    const body = mesh([[0, 0.34, 0.03, 0.32, 0.3, 0.44, c], [0, 0.52, 0.24, 0.16, 0.16, 0.1, c], [0.18, 0.36, 0.05, 0.05, 0.2, 0.3, wing], [-0.18, 0.36, 0.05, 0.05, 0.2, 0.3, wing]]);
    g.add(body);
    const head = new THREE.Group();
    head.position.set(0, 0.46, -0.19);
    head.add(mesh([[0, 0.12, -0.03, 0.17, 0.22, 0.17, c], [0, 0.17, -0.15, 0.07, 0.06, 0.09, 0xe6a12d], [0, 0.28, -0.03, 0.05, 0.1, 0.13, 0xc8322e], [0, 0.07, -0.13, 0.05, 0.08, 0.04, 0xc8322e], [0.09, 0.17, -0.08, 0.02, 0.05, 0.05, 0x111111], [-0.09, 0.17, -0.08, 0.02, 0.05, 0.05, 0x111111]]));
    g.add(head);
    const leg = () => { const l = new THREE.Group(); l.position.y = 0.2; l.add(mesh([[0, -0.1, 0, 0.05, 0.2, 0.05, 0xe6a12d], [0, -0.19, -0.04, 0.1, 0.03, 0.14, 0xe6a12d]])); return l; };
    const l1 = leg(), l2 = leg();
    l1.position.x = 0.08; l2.position.x = -0.08;
    g.add(l1, l2);
    g.userData = { head, legs: [l1, l2] };
    return g;
  }

  function cat(variant) {
    const palettes = [[0xd98a3a, 0xf1e2c8], [0x6d6d70, 0xc9c9cb], [0x2b2a2c, 0xeeeeee]];
    const [c, belly] = palettes[variant % 3];
    const g = new THREE.Group();
    g.add(mesh([[0, 0.32, 0.05, 0.25, 0.25, 0.62, c], [0, 0.22, 0.05, 0.2, 0.05, 0.5, belly]]));
    const head = new THREE.Group();
    head.position.set(0, 0.42, -0.26);
    head.add(mesh([
      [0, 0.07, -0.06, 0.28, 0.24, 0.24, c], [0.09, 0.25, -0.03, 0.08, 0.12, 0.07, c], [-0.09, 0.25, -0.03, 0.08, 0.12, 0.07, c],
      [0, 0.0, -0.18, 0.13, 0.08, 0.04, belly], [0, 0.03, -0.2, 0.04, 0.03, 0.02, 0xd97a8a],
      [0.07, 0.1, -0.185, 0.05, 0.05, 0.02, 0x8cc63f], [-0.07, 0.1, -0.185, 0.05, 0.05, 0.02, 0x8cc63f],
    ]));
    g.add(head);
    const tail = new THREE.Group();
    tail.position.set(0, 0.4, 0.36);
    tail.add(mesh([[0, 0.17, 0.02, 0.06, 0.36, 0.06, c]]));
    tail.rotation.x = 0.45;
    g.add(tail);
    const legs = [[0.08, -0.17], [-0.08, -0.17], [0.08, 0.27], [-0.08, 0.27]].map(([x, z]) => {
      const l = new THREE.Group(); l.position.set(x, 0.22, z);
      l.add(mesh([[0, -0.11, 0, 0.07, 0.22, 0.07, belly]]));
      g.add(l); return l;
    });
    g.userData = { head, tail, legs };
    return g;
  }

  function person(shirt, hair) {
    const g = new THREE.Group();
    const skin = 0xe4b98f;
    g.add(mesh([
      [0, 1.1, 0, 0.5, 0.65, 0.28, shirt], [0.33, 1.1, 0, 0.16, 0.62, 0.2, shirt], [-0.33, 1.1, 0, 0.16, 0.62, 0.2, shirt],
      [0.13, 0.4, 0, 0.21, 0.8, 0.24, 0x33415e], [-0.13, 0.4, 0, 0.21, 0.8, 0.24, 0x33415e],
      [0, 1.63, 0, 0.42, 0.42, 0.4, skin], [0, 1.84, 0, 0.44, 0.1, 0.42, hair], [0, 1.7, 0.16, 0.44, 0.24, 0.12, hair],
      [0.1, 1.65, -0.205, 0.07, 0.05, 0.02, 0x222222], [-0.1, 1.65, -0.205, 0.07, 0.05, 0.02, 0x222222],
      [0, 1.52, -0.205, 0.14, 0.03, 0.02, 0x8a4a3a],
    ]));
    return g;
  }

  // Original boxy rural sedan. Origin: centre of the car at ground level; driver sits on the left.
  function car() {
    const white = 0xd8d8cf, dark = 0x2a2c30, trim = 0x8e9094;
    const g = new THREE.Group();
    const parts = [
      // Floor and sills
      [0, 0.34, 0, 1.78, 0.14, 4.1, dark],
      [0.84, 0.66, 0.1, 0.12, 0.5, 2.0, white], [-0.84, 0.66, 0.1, 0.12, 0.5, 2.0, white],
      // Hood + nose + boot
      [0, 0.72, -1.55, 1.8, 0.56, 1.1, white], [0, 0.95, -1.4, 1.5, 0.04, 0.8, 0xc9c9c0],
      [0, 0.72, 1.62, 1.8, 0.56, 0.86, white],
      // Bumpers, grille, lights
      [0, 0.44, -2.1, 1.84, 0.16, 0.12, trim], [0, 0.44, 2.1, 1.84, 0.16, 0.12, trim],
      [0, 0.72, -2.11, 1.3, 0.28, 0.04, 0x34363a],
      [0.68, 0.75, -2.11, 0.34, 0.2, 0.05, 0xf4efc9], [-0.68, 0.75, -2.11, 0.34, 0.2, 0.05, 0xf4efc9],
      [0.68, 0.76, 2.06, 0.34, 0.18, 0.04, 0xb82c2c], [-0.68, 0.76, 2.06, 0.34, 0.18, 0.04, 0xb82c2c],
      [0, 0.44, 2.17, 0.5, 0.14, 0.02, 0xeeeeee],
      // Firewall, dashboard
      [0, 0.8, -0.98, 1.6, 0.34, 0.14, dark],
      [0, 1.02, -0.84, 1.6, 0.14, 0.34, 0x3a3330],
      // Seats
      [0.42, 0.55, 0.28, 0.56, 0.24, 0.56, 0x6a4b3a], [-0.42, 0.55, 0.28, 0.56, 0.24, 0.56, 0x6a4b3a],
      [0.42, 0.98, 0.54, 0.56, 0.7, 0.14, 0x6a4b3a], [-0.42, 0.98, 0.54, 0.56, 0.7, 0.14, 0x6a4b3a],
      [0, 0.6, 1.12, 1.56, 0.3, 0.3, 0x5c4133], [0, 0.95, 1.2, 1.56, 0.5, 0.14, 0x5c4133],
      // Roof and pillars
      [0, 1.78, 0.28, 1.56, 0.07, 1.66, white],
      [0.74, 1.38, -0.74, 0.07, 0.82, 0.07, white], [-0.74, 1.38, -0.74, 0.07, 0.82, 0.07, white],
      [0.74, 1.38, 0.2, 0.06, 0.82, 0.08, white], [-0.74, 1.38, 0.2, 0.06, 0.82, 0.08, white],
      [0.74, 1.38, 1.12, 0.08, 0.82, 0.12, white], [-0.74, 1.38, 1.12, 0.08, 0.82, 0.12, white],
    ];
    g.add(mesh(parts));
    // Tinted glass
    const glass = new THREE.Mesh(boxesGeometry([
      [0, 1.4, -0.8, 1.42, 0.76, 0.03, 0xa9cfe0], [0, 1.4, 1.17, 1.42, 0.76, 0.03, 0xa9cfe0],
      [0.74, 1.4, 0.2, 0.02, 0.76, 1.8, 0xa9cfe0], [-0.74, 1.4, 0.2, 0.02, 0.76, 1.8, 0xa9cfe0],
    ]), G.mats.glassMat.clone());
    glass.material.uniforms = Object.assign({}, G.mats.U, { uAlpha: { value: 0.12 } });
    glass.renderOrder = 3;
    g.add(glass);
    // Steering wheel
    const wheel = new THREE.Group();
    wheel.position.set(-0.42, 1.0, -0.5);
    wheel.rotation.x = 0.7;
    wheel.add(mesh([[0, 0.14, 0, 0.36, 0.05, 0.05, 0x1c1c1e], [0, -0.14, 0, 0.36, 0.05, 0.05, 0x1c1c1e], [0.16, 0, 0, 0.05, 0.3, 0.05, 0x1c1c1e], [-0.16, 0, 0, 0.05, 0.3, 0.05, 0x1c1c1e], [0, 0, 0, 0.32, 0.05, 0.05, 0x3c3c3e]]));
    g.add(wheel);
    // Wheels
    const makeWheel = (x, z, front) => {
      const pivot = new THREE.Group(); pivot.position.set(x, 0.36, z);
      const spin = new THREE.Group();
      spin.add(mesh([[0, 0, 0, 0.26, 0.72, 0.5, 0x202022], [0, 0, 0, 0.26, 0.5, 0.72, 0x202022], [0, 0, 0, 0.28, 0.32, 0.32, 0xb4b6ba]]));
      pivot.add(spin);
      g.add(pivot);
      return { pivot, spin, front };
    };
    const wheels = [makeWheel(0.88, -1.3, true), makeWheel(-0.88, -1.3, true), makeWheel(0.88, 1.3, false), makeWheel(-0.88, 1.3, false)];
    g.userData = { wheels, wheel };
    return g;
  }

  function goldKey() {
    return mesh([
      [0, 0.14, 0, 0.2, 0.2, 0.05, 0xe5c13e], [0, 0.14, 0, 0.09, 0.09, 0.06, 0x1a1a1a], [0, -0.05, 0, 0.06, 0.26, 0.05, 0xe5c13e],
      [0.06, -0.15, 0, 0.07, 0.05, 0.05, 0xe5c13e], [0.06, -0.06, 0, 0.07, 0.05, 0.05, 0xe5c13e],
    ]);
  }
  function carKey() {
    return mesh([[0, 0.03, 0, 0.12, 0.05, 0.08, 0x202226], [0.11, 0.03, 0, 0.12, 0.02, 0.03, 0xc8ccd0], [-0.09, 0.03, 0, 0.06, 0.02, 0.06, 0xd03a3a]]);
  }
  function beacon(color) {
    const geo = boxesGeometry([[0, 30, 0, 0.5, 60, 0.5, color]]);
    const m = new THREE.Mesh(geo, G.mats.glassMat);
    m.renderOrder = 4;
    return m;
  }
  function egg() { return mesh([[0, 0.08, 0, 0.13, 0.15, 0.13, 0xf3eadb], [0, 0.08, 0, 0.09, 0.19, 0.09, 0xf3eadb]]); }
  function crate() { return mesh([[0, 0, 0, 0.62, 0.62, 0.62, 0xb08a52], [0, 0, 0, 0.66, 0.1, 0.66, 0x7e5e33], [0, 0.24, 0, 0.66, 0.08, 0.66, 0x7e5e33], [0, -0.24, 0, 0.66, 0.08, 0.66, 0x7e5e33]]); }
  function pallet() { return mesh([[0, 0.06, 0, 1, 0.12, 1, 0x8d6c3e]]); }
  function bowl(color) { return mesh([[0, 0.05, 0, 0.3, 0.1, 0.3, color], [0, 0.09, 0, 0.2, 0.04, 0.2, 0x7a4a2c]]); }
  function arm() {
    return mesh([[0, 0, 0.1, 0.075, 0.075, 0.42, 0x3f6ea8], [0, 0, -0.17, 0.07, 0.07, 0.12, 0xe4b98f]]);
  }
  function door(color, along) {
    const g = new THREE.Group();
    const parts = along === 'x'
      ? [[0.5, 1, 0, 1, 2, 0.1, color], [0.5, 0.5, 0, 0.76, 0.6, 0.12, 0x6e4b2a], [0.5, 1.45, 0, 0.76, 0.6, 0.12, 0x6e4b2a], [0.86, 1, 0.07, 0.06, 0.06, 0.08, 0xe5d36b], [0.86, 1, -0.07, 0.06, 0.06, 0.08, 0xe5d36b]]
      : [[0, 1, 0.5, 0.1, 2, 1, color], [0, 0.5, 0.5, 0.12, 0.6, 0.76, 0x6e4b2a], [0, 1.45, 0.5, 0.12, 0.6, 0.76, 0x6e4b2a], [0.07, 1, 0.86, 0.08, 0.06, 0.06, 0xe5d36b], [-0.07, 1, 0.86, 0.08, 0.06, 0.06, 0xe5d36b]];
    g.add(mesh(parts));
    return g;
  }
  function textSprite(text, color, size = 56) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    x.font = `bold ${size}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = color; x.strokeStyle = '#000'; x.lineWidth = 4;
    x.strokeText(text, 32, 34); x.fillText(text, 32, 34);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
    return s;
  }
  function signPlane(lines, w, h, bg, fg) {
    const c = document.createElement('canvas'); c.width = 512; c.height = Math.round((512 * h) / w);
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = fg; x.lineWidth = 8; x.strokeRect(8, 8, c.width - 16, c.height - 16);
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    lines.forEach((l, i) => { x.font = `bold ${i === 0 ? 62 : 36}px "Courier New", monospace`; x.fillText(l, c.width / 2, ((i + 0.5) * c.height) / lines.length); });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
  }
  function clouds() {
    const list = [];
    const W = G.world, b = W.bounds;
    for (let i = 0; i < 170; i++) {
      const cx = b.x0 - 1500 + W.hash(i, 1) * (b.x1 - b.x0 + 3000), cz = b.z0 - 1500 + W.hash(i, 2) * (b.z1 - b.z0 + 3000);
      const w = 50 + W.hash(i, 3) * 130, d = 40 + W.hash(i, 4) * 90;
      list.push([cx, 0, cz, w, 8, d, 0xffffff]);
      list.push([cx + w * 0.2, 5, cz - d * 0.1, w * 0.5, 6, d * 0.5, 0xffffff]);
    }
    const m = mesh(list);
    // Clouds glow softly on all sides instead of having dark undersides.
    const col = m.geometry.attributes.aColor.array;
    for (let i = 0; i < col.length; i++) col[i] = 0.9 + col[i] * 0.1;
    m.frustumCulled = false;
    return m;
  }

  G.models = { mesh, boxesGeometry, chicken, cat, person, car, goldKey, carKey, beacon, egg, crate, pallet, bowl, arm, door, textSprite, signPlane, clouds };
})();
