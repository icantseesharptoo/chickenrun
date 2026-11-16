// Low-poly models built from code: boxes, rounded shapes and sloped hulls. All models face -Z at rotation 0.
// Later, these can be swapped for .glb models with the same pivots.
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  const LIGHT = [0.42, 0.82, 0.38];

  class Builder {
    constructor() { this.pos = []; this.col = []; }
    tri(a, b, c, na, nb, nc, color) {
      const r = ((color >> 16) & 255) / 255, g = ((color >> 8) & 255) / 255, bl = (color & 255) / 255;
      for (const [p, n] of [[a, na], [b, nb], [c, nc]]) {
        const s = 0.58 + 0.42 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
        this.pos.push(p[0], p[1], p[2]);
        this.col.push(r * s, g * s, bl * s);
      }
    }
    face(a, b, c, d, color) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      n = [n[0] / l, n[1] / l, n[2] / l];
      this.tri(a, b, c, n, n, n, color);
      this.tri(a, c, d, n, n, n, color);
    }
    // Eight free corners: bottom ring then top ring, seen from above: (-x,-z) (+x,-z) (+x,+z) (-x,+z).
    hull(p, color) {
      const [a, b, c, d, e, f, g, h] = p;
      this.face(a, b, f, e, color); this.face(b, c, g, f, color); this.face(c, d, h, g, color); this.face(d, a, e, h, color);
      this.face(e, f, g, h, color); this.face(d, c, b, a, color);
    }
    box(cx, cy, cz, w, h, d, color) {
      const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
      this.hull([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], color);
    }
    // Ellipsoid with smooth shading.
    ball(cx, cy, cz, w, h, d, color, segs = 8, rings = 5) {
      const pt = (i, j) => {
        const th = (j / rings) * Math.PI, ph = (i / segs) * 6.2832;
        const n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
        return { n, p: [cx + (n[0] * w) / 2, cy + (n[1] * h) / 2, cz + (n[2] * d) / 2] };
      };
      for (let j = 0; j < rings; j++) for (let i = 0; i < segs; i++) {
        const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), e = pt(i, j + 1);
        if (j > 0) this.tri(a.p, b.p, c.p, a.n, b.n, c.n, color);
        if (j < rings - 1) this.tri(a.p, c.p, e.p, a.n, c.n, e.n, color);
      }
    }
    // Cylinder or cone. axis: 'x', 'y' or 'z'. r0 at the - end, r1 at the + end.
    tube(cx, cy, cz, r0, r1, len, axis, color, segs = 8, caps = true) {
      const at = (r, a, s) => {
        const u = Math.cos(a) * r, v = Math.sin(a) * r, t = (s * len) / 2;
        return axis === 'y' ? [cx + u, cy + t, cz + v] : axis === 'x' ? [cx + t, cy + u, cz + v] : [cx + u, cy + v, cz + t];
      };
      const nrm = (a) => { const u = Math.cos(a), v = Math.sin(a); return axis === 'y' ? [u, 0, v] : axis === 'x' ? [0, u, v] : [u, v, 0]; };
      const capN = (s) => (axis === 'y' ? [0, s, 0] : axis === 'x' ? [s, 0, 0] : [0, 0, s]);
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * 6.2832, b = ((i + 1) / segs) * 6.2832;
        const p0 = at(r0, a, -1), p1 = at(r0, b, -1), p2 = at(r1, b, 1), p3 = at(r1, a, 1), na = nrm(a), nb = nrm(b);
        this.tri(p0, p1, p2, na, nb, nb, color);
        this.tri(p0, p2, p3, na, nb, na, color);
        if (caps) {
          const c0 = at(0, 0, -1), c1 = at(0, 0, 1), n0 = capN(-1), n1 = capN(1);
          if (r0 > 0.001) this.tri(c0, p1, p0, n0, n0, n0, color);
          if (r1 > 0.001) this.tri(c1, p3, p2, n1, n1, n1, color);
        }
      }
    }
    geometry() {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
      geo.setAttribute('aColor', new THREE.Float32BufferAttribute(this.col, 3));
      return geo;
    }
    mesh() { return new THREE.Mesh(this.geometry(), G.mats.entityMat); }
  }
  const make = (fn) => { const b = new Builder(); fn(b); return b.mesh(); };

  function chicken(variant) {
    const c = [0xece7da, 0xb5703a, 0x3f3a37, 0xd9bb88][variant % 4];
    const wing = variant % 4 === 2 ? 0x55504b : c === 0xece7da ? 0xdcd6c6 : 0x8e5a2e;
    const tailC = variant % 4 === 1 ? 0x2c3a2a : variant % 4 === 2 ? 0x1f2422 : wing;
    const g = new THREE.Group();
    g.add(make((m) => {
      m.ball(0, 0.37, 0.05, 0.32, 0.3, 0.44, c, 10, 6);           // body
      m.ball(0, 0.36, -0.12, 0.27, 0.27, 0.24, c, 9, 5);           // breast
      m.ball(0, 0.44, 0.2, 0.2, 0.2, 0.18, c, 8, 5);               // back
      for (let i = 0; i < 5; i++) {                                // tail feathers, fanned up and back
        const a = -0.5 + i * 0.25, x = Math.sin(a) * 0.05;
        m.hull([[x - 0.015, 0.42, 0.22], [x + 0.015, 0.42, 0.22], [x + 0.015, 0.42, 0.3], [x - 0.015, 0.42, 0.3], [x * 3 - 0.012, 0.66 - Math.abs(a) * 0.08, 0.34], [x * 3 + 0.012, 0.66 - Math.abs(a) * 0.08, 0.34], [x * 3 + 0.012, 0.64 - Math.abs(a) * 0.08, 0.42], [x * 3 - 0.012, 0.64 - Math.abs(a) * 0.08, 0.42]], tailC);
      }
      for (const s of [1, -1]) {                                   // wings in two layers
        m.ball(s * 0.15, 0.38, 0.07, 0.07, 0.19, 0.34, wing, 7, 4);
        m.ball(s * 0.155, 0.33, 0.14, 0.05, 0.12, 0.2, tailC, 6, 3);
      }
      m.tube(0, 0.5, -0.12, 0.07, 0.055, 0.14, 'y', c, 8, false);  // neck
    }));
    const head = new THREE.Group();
    head.position.set(0, 0.52, -0.15);
    head.add(make((m) => {
      m.ball(0, 0.1, -0.03, 0.14, 0.15, 0.15, c, 8, 5);
      m.tube(0, 0.09, -0.13, 0.002, 0.03, 0.08, 'z', 0xd9a33a, 6, false); // beak
      for (let i = 0; i < 4; i++) m.ball(0, 0.18 + Math.sin(i * 1.1) * 0.012, -0.08 + i * 0.03, 0.03, 0.06, 0.04, 0xc0332b, 5, 3); // comb
      m.ball(0.012, 0.03, -0.1, 0.025, 0.05, 0.025, 0xc0332b, 5, 3); m.ball(-0.012, 0.03, -0.1, 0.025, 0.05, 0.025, 0xc0332b, 5, 3); // wattles
      m.ball(0.06, 0.12, -0.08, 0.02, 0.025, 0.02, 0x141414, 5, 3); m.ball(-0.06, 0.12, -0.08, 0.02, 0.025, 0.02, 0x141414, 5, 3);
      m.ball(0.066, 0.1, -0.04, 0.012, 0.03, 0.03, 0xc0332b, 4, 2); m.ball(-0.066, 0.1, -0.04, 0.012, 0.03, 0.03, 0xc0332b, 4, 2); // earlobes
    }));
    g.add(head);
    const leg = () => {
      const l = new THREE.Group(); l.position.y = 0.24;
      l.add(make((m) => {
        m.ball(0, 0.0, 0.0, 0.07, 0.08, 0.08, wing, 6, 3);
        m.tube(0, -0.12, 0.01, 0.014, 0.018, 0.22, 'y', 0xd9a33a, 6, false);
        for (const a of [-0.45, 0, 0.45]) m.hull([[-0.006, -0.235, 0.01], [0.006, -0.235, 0.01], [0.006, -0.235, 0.02], [-0.006, -0.235, 0.02], [Math.sin(a) * 0.08 - 0.005, -0.24, -Math.cos(a) * 0.08], [Math.sin(a) * 0.08 + 0.005, -0.24, -Math.cos(a) * 0.08], [Math.sin(a) * 0.08 + 0.005, -0.23, -Math.cos(a) * 0.08 + 0.01], [Math.sin(a) * 0.08 - 0.005, -0.23, -Math.cos(a) * 0.08 + 0.01]], 0xd9a33a);
        m.hull([[-0.005, -0.235, 0.0], [0.005, -0.235, 0.0], [0.005, -0.235, 0.01], [-0.005, -0.235, 0.01], [-0.004, -0.24, 0.05], [0.004, -0.24, 0.05], [0.004, -0.232, 0.05], [-0.004, -0.232, 0.05]], 0xd9a33a);
      }));
      return l;
    };
    const l1 = leg(), l2 = leg();
    l1.position.x = 0.07; l2.position.x = -0.07;
    g.add(l1, l2);
    g.userData = { head, legs: [l1, l2] };
    return g;
  }

  function cat(variant) {
    const palettes = [[0xc98a48, 0xefe2cc, 0x9c6430], [0x7a7a7d, 0xd4d4d6, 0x55555a], [0x2e2d2f, 0xeeeeee, 0x1c1b1d]];
    const [c, belly, stripe] = palettes[variant % 3];
    const g = new THREE.Group();
    g.add(make((m) => {
      m.ball(0, 0.31, 0.06, 0.24, 0.23, 0.58, c, 10, 6);          // body
      m.ball(0, 0.32, -0.18, 0.23, 0.25, 0.22, c, 9, 5);           // shoulders / chest
      m.ball(0, 0.27, -0.2, 0.15, 0.16, 0.12, belly, 7, 4);        // white bib
      m.ball(0.075, 0.3, 0.26, 0.13, 0.2, 0.2, c, 8, 4);           // haunches
      m.ball(-0.075, 0.3, 0.26, 0.13, 0.2, 0.2, c, 8, 4);
      m.ball(0, 0.22, 0.05, 0.17, 0.08, 0.44, belly, 7, 4);        // belly
      if (variant % 3 === 0) for (let i = 0; i < 4; i++) m.ball(0, 0.425, -0.08 + i * 0.11, 0.2, 0.025, 0.04, stripe, 6, 2); // tabby stripes
    }));
    const head = new THREE.Group();
    head.position.set(0, 0.43, -0.27);
    head.add(make((m) => {
      m.ball(0, 0.06, -0.04, 0.22, 0.19, 0.19, c, 10, 6);
      m.ball(0.05, 0.02, -0.11, 0.09, 0.07, 0.07, belly, 6, 4); m.ball(-0.05, 0.02, -0.11, 0.09, 0.07, 0.07, belly, 6, 4); // muzzle
      m.ball(0, 0.045, -0.145, 0.03, 0.022, 0.02, 0xcf7a88, 5, 3);   // nose
      for (const s of [1, -1]) {
        m.tube(s * 0.075, 0.175, -0.02, 0.05, 0.003, 0.11, 'y', c, 4, false);          // ear
        m.tube(s * 0.075, 0.17, -0.032, 0.03, 0.002, 0.08, 'y', 0xd99aa5, 4, false);   // inner ear
        m.ball(s * 0.055, 0.085, -0.12, 0.05, 0.045, 0.02, 0x9fc24a, 6, 3);            // eye
        m.ball(s * 0.055, 0.085, -0.131, 0.012, 0.038, 0.01, 0x111111, 4, 2);          // slit pupil
        for (const dy of [-0.012, 0.004]) m.box(s * 0.11, 0.025 + dy, -0.12, 0.12, 0.004, 0.004, 0xf2f2f2); // whiskers
      }
    }));
    g.add(head);
    // Tail: a chain of segments, each bending a little, so it curls and sways.
    const tailRoot = new THREE.Group();
    tailRoot.position.set(0, 0.38, 0.34);
    tailRoot.rotation.x = 0.6;
    let parent = tailRoot;
    const tailSegs = [];
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Group();
      seg.add(make((m) => m.tube(0, 0.04, 0, 0.034 - i * 0.003, 0.03 - i * 0.003, 0.09, 'y', i === 5 && variant % 3 === 0 ? stripe : c, 6, false)));
      if (i > 0) seg.position.y = 0.08;
      parent.add(seg);
      tailSegs.push(seg);
      parent = seg;
    }
    g.add(tailRoot);
    const legs = [[0.08, -0.17, 0.25], [-0.08, -0.17, 0.25], [0.08, 0.27, 0.22], [-0.08, 0.27, 0.22]].map(([x, z, h]) => {
      const l = new THREE.Group(); l.position.set(x, h, z);
      l.add(make((m) => { m.tube(0, -h / 2, 0, 0.032, 0.042, h, 'y', z > 0 ? c : belly, 6, false); m.ball(0, -h + 0.015, -0.015, 0.065, 0.035, 0.085, belly, 6, 3); }));
      g.add(l);
      return l;
    });
    g.userData = { head, tail: tailRoot, tailSegs, legs };
    return g;
  }

  // People: jointed at hips, knees, shoulders and elbows, so they can walk and sit.
  function person(opts) {
    if (typeof opts === 'number') opts = { shirt: opts, hair: arguments[1] };
    const o = Object.assign({ shirt: 0x3f6ea8, pants: 0x33415e, hair: 0x3a2a1c, skin: 0xdcb48f, shoes: 0x2a2522, style: 'short', dress: false, scale: 1 }, opts);
    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);
    body.add(make((m) => {
      m.ball(0, 0.96, 0, 0.32, 0.18, 0.22, o.dress ? o.shirt : o.pants, 9, 5);   // hips
      m.tube(0, 1.18, 0, 0.165, 0.19, 0.42, 'y', o.shirt, 10, false);            // waist to chest
      m.ball(0, 1.36, 0, 0.42, 0.22, 0.25, o.shirt, 10, 5);                     // chest and shoulders
      if (o.dress) m.tube(0, 0.72, 0, 0.3, 0.17, 0.5, 'y', o.shirt, 10, false);  // skirt
      m.tube(0, 1.5, 0, 0.055, 0.06, 0.1, 'y', o.skin, 7, false);               // neck
    }));
    const head = new THREE.Group();
    head.position.y = 1.55;
    head.add(make((m) => {
      m.ball(0, 0.11, 0, 0.2, 0.25, 0.22, o.skin, 10, 7);
      m.ball(0, 0.1, -0.11, 0.035, 0.05, 0.04, o.skin, 5, 3);                 // nose
      m.ball(0.103, 0.11, 0, 0.03, 0.055, 0.04, o.skin, 5, 3); m.ball(-0.103, 0.11, 0, 0.03, 0.055, 0.04, o.skin, 5, 3); // ears
      for (const s of [1, -1]) {
        m.ball(s * 0.048, 0.135, -0.095, 0.036, 0.022, 0.02, 0xf4f1ea, 6, 3);
        m.ball(s * 0.048, 0.135, -0.103, 0.017, 0.017, 0.01, 0x2a2018, 5, 3);
        m.box(s * 0.05, 0.17, -0.1, 0.055, 0.01, 0.01, o.hair === 0xd8d4cc ? 0x8a847a : o.hair); // brows
      }
      m.box(0, 0.045, -0.104, 0.06, 0.008, 0.01, 0x9a5a4a);                    // mouth
      if (o.style === 'scarf') {
        m.ball(0, 0.14, 0.01, 0.23, 0.27, 0.24, o.hair, 10, 6);
        m.tube(0, -0.02, 0.02, 0.13, 0.09, 0.14, 'y', o.hair, 8, false);
      } else if (o.style === 'skullcap') {
        m.ball(0, 0.2, 0.01, 0.22, 0.11, 0.235, o.hair, 10, 4);
        m.ball(0, 0.08, 0.06, 0.2, 0.16, 0.15, 0x9a948a, 9, 4); // grey hair at the back
      } else if (o.style === 'cap') {
        m.ball(0, 0.2, 0.0, 0.215, 0.13, 0.235, o.hair, 9, 4);
        m.ball(0, 0.09, 0.06, 0.2, 0.18, 0.15, o.hair === 0xd8d4cc ? 0xbdb7ad : 0x2a1d14, 9, 4);
        m.box(0, 0.19, -0.14, 0.18, 0.015, 0.1, o.hair);
      } else if (o.style === 'long') {
        m.ball(0, 0.16, 0.02, 0.22, 0.22, 0.24, o.hair, 9, 5);
        m.ball(0, 0.0, 0.07, 0.21, 0.32, 0.12, o.hair, 8, 5);
      } else if (o.style !== 'bald') {
        m.ball(0, 0.17, 0.015, 0.215, 0.18, 0.235, o.hair, 9, 5);
        m.ball(0, 0.1, 0.055, 0.205, 0.22, 0.16, o.hair, 9, 5); // back of the head
      }
    }));
    body.add(head);
    const limb = (x, y, upperLen, lowerLen, r, upperC, lowerC, endFn) => {
      const top = new THREE.Group(); top.position.set(x, y, 0);
      top.add(make((m) => m.tube(0, -upperLen / 2, 0, r * 0.85, r, upperLen, 'y', upperC, 8, false)));
      const joint = new THREE.Group(); joint.position.y = -upperLen;
      joint.add(make((m) => { m.ball(0, 0, 0, r * 1.9, r * 1.9, r * 1.9, upperC, 6, 3); m.tube(0, -lowerLen / 2, 0, r * 0.75, r * 0.85, lowerLen, 'y', lowerC, 8, false); endFn(m, -lowerLen); }));
      top.add(joint);
      body.add(top);
      return { top, joint };
    };
    const legs = [0.1, -0.1].map((x) => limb(x, 0.93, 0.44, 0.43, 0.075, o.dress ? o.skin : o.pants, o.dress ? o.skin : o.pants, (m, y) => m.hull([[-0.055, y - 0.07, -0.13], [0.055, y - 0.07, -0.13], [0.055, y - 0.07, 0.07], [-0.055, y - 0.07, 0.07], [-0.05, y + 0.01, -0.09], [0.05, y + 0.01, -0.09], [0.05, y + 0.01, 0.06], [-0.05, y + 0.01, 0.06]], o.shoes)));
    const arms = [0.235, -0.235].map((x) => limb(x, 1.42, 0.3, 0.27, 0.052, o.shirt, o.skin, (m, y) => m.ball(0, y - 0.05, 0, 0.075, 0.1, 0.05, o.skin, 6, 3)));
    arms.forEach((a, i) => { a.top.rotation.z = i ? -0.08 : 0.08; });
    g.scale.setScalar(o.scale);
    g.userData = { body, head, legs, arms };
    return g;
  }
  // Roblox-style blocky character: box torso and limbs, rounded head with a painted smile, no knees or elbows.
  // Proportions follow the classic 5-unit figure (legs 2, torso 2, head 1), scaled to 1.8 m.
  function blockyPerson(opts) {
    const o = Object.assign({ skin: 0xf2c94c, shirt: 0x1f6fc4, pants: 0x3f8f3a, shoes: 0x2b2b2b, hat: null }, opts);
    const S = 0.36, g = new THREE.Group(), body = new THREE.Group();
    g.add(body);
    // Slightly bevelled boxes read as plastic blocks rather than raw cubes.
    const bevel = (m, cx, cy, cz, w, h, d, c) => {
      const b = 0.025;
      m.box(cx, cy, cz, w - b * 2, h, d - b * 2, c);
      m.box(cx, cy, cz, w, h - b * 2, d - b * 2, c);
      m.box(cx, cy, cz, w - b * 2, h - b * 2, d, c);
    };
    body.add(make((m) => bevel(m, 0, 2 * S + S, 0, 2 * S, 2 * S, S, o.shirt)));
    const head = new THREE.Group();
    head.position.y = 4 * S + 0.02;
    head.add(make((m) => {
      m.tube(0, S * 0.55, 0, S * 0.62, S * 0.62, S * 0.8, 'y', o.skin, 16, false);
      m.ball(0, S * 0.95, 0, S * 1.24, S * 0.42, S * 1.24, o.skin, 16, 4);
      m.ball(0, S * 0.15, 0, S * 1.24, S * 0.42, S * 1.24, o.skin, 16, 4);
      m.tube(0, -0.02, 0, S * 0.3, S * 0.3, 0.06, 'y', o.skin, 10, false); // neck
      // Face on the -Z side: two oval eyes and a smile.
      const fz = -S * 0.62 - 0.004;
      m.ball(-0.07, S * 0.68, fz, 0.045, 0.075, 0.012, 0x111111, 8, 4);
      m.ball(0.07, S * 0.68, fz, 0.045, 0.075, 0.012, 0x111111, 8, 4);
      for (let i = 0; i <= 8; i++) {
        const a = Math.PI * (0.18 + (0.64 * i) / 8), x = Math.cos(a) * 0.1, y = S * 0.48 - Math.sin(a) * 0.06;
        const zz = -Math.sqrt(Math.max(0, (S * 0.62) ** 2 - x * x)) - 0.004;
        m.ball(x, y, zz, 0.022, 0.022, 0.012, 0x111111, 6, 3);
      }
      if (o.hat) { m.tube(0, S * 1.12, 0, S * 0.66, S * 0.66, S * 0.36, 'y', o.hat, 16); m.box(0, S * 0.98, -S * 0.62, S * 1.1, 0.03, S * 0.7, o.hat); }
    }));
    body.add(head);
    // Limbs hang from a pivot at the shoulder or hip; `joint` exists so the shared poses work, but nothing bends there.
    const limb = (x, y, colors) => {
      const top = new THREE.Group(); top.position.set(x, y, 0);
      top.add(make((m) => colors.forEach(([y0, h, c]) => bevel(m, 0, -y0 - h / 2, 0, S * 0.97, h, S * 0.97, c))));
      const joint = new THREE.Group(); joint.position.y = -S;
      top.add(joint);
      body.add(top);
      return { top, joint };
    };
    const legs = [S / 2, -S / 2].map((x) => limb(x, 2 * S, [[0, 2 * S - 0.12, o.pants], [2 * S - 0.12, 0.12, o.shoes]]));
    const arms = [1.5 * S, -1.5 * S].map((x) => limb(x, 4 * S - 0.06, [[-0.06, 0.75 * S, o.shirt], [0.75 * S - 0.06, 1.25 * S, o.skin]]));
    g.userData = { body, head, legs, arms, blocky: true };
    return g;
  }

  // Pose a person. phase advances while walking; amount 0..1 is stride strength; mode: 'walk' or 'sit'.
  // Convention: a positive rotation.x swings a hanging limb FORWARD (towards -Z, the way the person faces).
  // Knees therefore bend with a negative angle (shin goes back), elbows with a positive one (forearm comes forward).
  function animatePerson(p, phase, amount, mode) {
    const u = p.userData;
    if (mode === 'kneel') {
      // Kneeling on the carpet, sitting back on the heels, hands on the knees.
      u.legs.forEach((l) => { l.top.rotation.x = 1.25; l.joint.rotation.x = u.blocky ? 0 : -2.75; });
      u.arms.forEach((a) => { a.top.rotation.x = 0.35; a.joint.rotation.x = u.blocky ? 0 : 0.55; });
      u.body.position.y = u.blocky ? -0.8 : -0.6;
      return;
    }
    if (mode === 'sit') {
      u.legs.forEach((l) => { l.top.rotation.x = 1.45; l.joint.rotation.x = u.blocky ? 0 : -1.45; });
      u.arms.forEach((a) => { a.top.rotation.x = 0.6; a.joint.rotation.x = u.blocky ? 0 : 0.5; });
      u.body.position.y = u.blocky ? -0.62 : -0.42;
      return;
    }
    u.body.position.y = Math.abs(Math.sin(phase)) * 0.035 * amount;
    const s = Math.sin(phase) * (u.blocky ? 0.8 : 0.55) * amount;
    u.legs[0].top.rotation.x = s; u.legs[1].top.rotation.x = -s;
    u.legs[0].joint.rotation.x = u.blocky ? 0 : -Math.max(0, -Math.sin(phase + 0.6)) * 0.9 * amount;
    u.legs[1].joint.rotation.x = u.blocky ? 0 : -Math.max(0, Math.sin(phase + 0.6)) * 0.9 * amount;
    u.arms[0].top.rotation.x = -s * 0.8; u.arms[1].top.rotation.x = s * 0.8;
    u.arms[0].joint.rotation.x = u.blocky ? 0 : 0.25 + amount * 0.2; u.arms[1].joint.rotation.x = u.blocky ? 0 : 0.25 + amount * 0.2;
  }
  // Arms held out in front, as when carrying a crate (positive = forward, see above).
  function poseCarry(p) { p.userData.arms.forEach((a) => { a.top.rotation.x = 1.3; a.joint.rotation.x = p.userData.blocky ? 0 : 0.4; }); }
  function poseReach(p, t) { p.userData.arms[0].top.rotation.x = 1.3 * t; }

  // Compact saloon in the style of a Lada Granta: sloped bonnet, raked windscreen, high boot.
  // Origin: centre at ground level; driver sits on the left. No maker's badges.
  function car(options) {
    const o = Object.assign({ body: 0xa8141e, lower: 0x9fa19c, taxi: false }, options);
    const paint = o.body, dark = 0x26282c, trim = 0x8c8e92;
    const g = new THREE.Group();
    const W0 = 0.9, W1 = 0.72, BELT = 1.0, ROOF = 1.72;
    const P = (x, y, z) => [x, y, z];
    g.add(make((m) => {
      m.box(0, 0.36, 0, 1.76, 0.16, 4.2, dark); // floor
      // Nose
      m.hull([P(-W0, 0.42, -2.12), P(W0, 0.42, -2.12), P(W0, 0.42, -0.98), P(-W0, 0.42, -0.98), P(-0.84, 0.78, -2.12), P(0.84, 0.78, -2.12), P(W0, BELT, -0.98), P(-W0, BELT, -0.98)], paint);
      // Boot
      m.hull([P(-W0, 0.42, 1.2), P(W0, 0.42, 1.2), P(W0, 0.42, 2.14), P(-W0, 0.42, 2.14), P(-W0, BELT, 1.2), P(W0, BELT, 1.2), P(0.86, 0.94, 2.14), P(-0.86, 0.94, 2.14)], paint);
      // Doors: hollow cabin, so the driver can see out
      m.box(0.86, 0.71, 0.11, 0.08, 0.58, 2.18, paint);
      m.box(-0.86, 0.71, 0.11, 0.08, 0.58, 2.18, paint);
      m.box(0.905, 0.72, -0.4, 0.015, 0.5, 0.02, 0x62646a); m.box(-0.905, 0.72, -0.4, 0.015, 0.5, 0.02, 0x62646a);
      m.box(0.905, 0.72, 0.56, 0.015, 0.5, 0.02, 0x62646a); m.box(-0.905, 0.72, 0.56, 0.015, 0.5, 0.02, 0x62646a);
      m.box(0.92, 0.78, -0.18, 0.03, 0.03, 0.14, trim); m.box(-0.92, 0.78, -0.18, 0.03, 0.03, 0.14, trim);
      // Lights, grille, bumpers, plate
      m.box(0, 0.48, -2.16, 1.82, 0.15, 0.12, trim); m.box(0, 0.48, 2.17, 1.82, 0.15, 0.12, trim);
      m.box(0, 0.68, -2.13, 1.04, 0.2, 0.03, 0x2c2e32);
      m.box(0, 0.77, -2.14, 1.08, 0.025, 0.03, 0xc9ccd0); m.box(0, 0.59, -2.14, 1.08, 0.025, 0.03, 0xc9ccd0);
      for (const sx of [1, -1]) { m.hull([[sx * 0.9, 1.0, -0.86], [sx * 1.08, 1.0, -0.86], [sx * 1.08, 1.0, -0.76], [sx * 0.9, 1.0, -0.76], [sx * 0.9, 1.12, -0.86], [sx * 1.08, 1.12, -0.84], [sx * 1.08, 1.12, -0.76], [sx * 0.9, 1.12, -0.76]], o.body); m.box(sx * 1.0, 1.06, -0.861, 0.15, 0.09, 0.005, 0x8fa4b4); }
      for (const [x, z] of [[0.86, -1.3], [-0.86, -1.3], [0.86, 1.3], [-0.86, 1.3]]) m.tube(x * 1.02, 0.36, z, 0.44, 0.44, 0.06, 'x', 0x1a1a1c, 12, false); // wheel arches
      m.ball(0.64, 0.68, -2.12, 0.3, 0.17, 0.05, 0xf1ecca, 7, 4); m.ball(-0.64, 0.68, -2.12, 0.3, 0.17, 0.05, 0xf1ecca, 7, 4);
      m.box(0.62, 0.8, 2.145, 0.36, 0.14, 0.03, 0xb23030); m.box(-0.62, 0.8, 2.145, 0.36, 0.14, 0.03, 0xb23030);
      m.box(0, 0.5, 2.24, 0.5, 0.11, 0.015, 0xeeeeee);
      // Dashboard
      m.box(0, 0.8, -0.98, 1.6, 0.34, 0.1, dark);
      m.hull([P(-0.8, 0.96, -1.0), P(0.8, 0.96, -1.0), P(0.8, 0.96, -0.72), P(-0.8, 0.96, -0.72), P(-0.8, 1.06, -1.0), P(0.8, 1.06, -1.0), P(0.8, 1.0, -0.72), P(-0.8, 1.0, -0.72)], 0x36302c);
      // Seats
      for (const x of [0.42, -0.42]) {
        m.box(x, 0.56, 0.28, 0.54, 0.22, 0.56, 0x5e4436);
        m.hull([P(x - 0.27, 0.66, 0.5), P(x + 0.27, 0.66, 0.5), P(x + 0.27, 0.66, 0.64), P(x - 0.27, 0.66, 0.64), P(x - 0.23, 1.34, 0.58), P(x + 0.23, 1.34, 0.58), P(x + 0.23, 1.34, 0.7), P(x - 0.23, 1.34, 0.7)], 0x5e4436);
      }
      m.box(0, 0.6, 1.1, 1.56, 0.3, 0.3, 0x523c30); m.box(0, 0.98, 1.2, 1.56, 0.6, 0.12, 0x523c30);
      // Roof
      m.hull([P(-0.7, ROOF, -0.3), P(0.7, ROOF, -0.3), P(0.72, ROOF, 0.92), P(-0.72, ROOF, 0.92), P(-0.66, ROOF + 0.05, -0.28), P(0.66, ROOF + 0.05, -0.28), P(0.68, ROOF + 0.05, 0.9), P(-0.68, ROOF + 0.05, 0.9)], paint);
      // Pillars follow the roofline
      const pillar = (sx, x0, z0, x1, z1, t) => {
        const a = sx * x0, b = sx * x1;
        m.hull([P(a - 0.03, BELT, z0 - t), P(a + 0.03, BELT, z0 - t), P(a + 0.03, BELT, z0 + t), P(a - 0.03, BELT, z0 + t), P(b - 0.03, ROOF, z1 - t), P(b + 0.03, ROOF, z1 - t), P(b + 0.03, ROOF, z1 + t), P(b - 0.03, ROOF, z1 + t)], paint);
      };
      for (const s of [1, -1]) {
        pillar(s, 0.86, -0.92, W1, -0.28, 0.035);
        pillar(s, 0.86, 0.3, W1, 0.3, 0.04);
        pillar(s, 0.86, 1.24, W1, 0.9, 0.06);
      }
      if (o.taxi) {
        // Checker strip and roof sign, so a taxi reads at once.
        for (let i = 0; i < 12; i++) {
          const z = -0.9 + i * 0.18, col = i % 2 ? 0x1c1c1e : 0xf2eedc;
          m.box(0.915, 0.86, z, 0.012, 0.09, 0.17, col); m.box(-0.915, 0.86, z, 0.012, 0.09, 0.17, col);
        }
        m.box(0, ROOF + 0.15, 0.3, 0.62, 0.17, 0.26, 0xf4e24f);
        m.box(0, ROOF + 0.15, 0.17, 0.5, 0.09, 0.012, 0x1c1c1e);
        m.box(0, ROOF + 0.15, 0.43, 0.5, 0.09, 0.012, 0x1c1c1e);
      }
    }));
    // Tinted glass
    const gb = new Builder();
    const c = 0xa9cfe0;
    gb.hull([P(-0.82, BELT, -0.93), P(0.82, BELT, -0.93), P(0.82, BELT, -0.92), P(-0.82, BELT, -0.92), P(-0.7, ROOF, -0.3), P(0.7, ROOF, -0.3), P(0.7, ROOF, -0.29), P(-0.7, ROOF, -0.29)], c);
    gb.hull([P(-0.82, BELT, 1.22), P(0.82, BELT, 1.22), P(0.82, BELT, 1.23), P(-0.82, BELT, 1.23), P(-0.7, ROOF, 0.9), P(0.7, ROOF, 0.9), P(0.7, ROOF, 0.91), P(-0.7, ROOF, 0.91)], c);
    for (const s of [1, -1]) gb.hull([P(s * 0.86, BELT, -0.92), P(s * 0.87, BELT, -0.92), P(s * 0.87, BELT, 1.24), P(s * 0.86, BELT, 1.24), P(s * 0.72, ROOF, -0.28), P(s * 0.73, ROOF, -0.28), P(s * 0.73, ROOF, 0.9), P(s * 0.72, ROOF, 0.9)], c);
    const glass = new THREE.Mesh(gb.geometry(), G.mats.glassMat.clone());
    glass.material.uniforms = Object.assign({}, G.mats.U, { uAlpha: { value: 0.14 } });
    glass.renderOrder = 3;
    g.add(glass);
    // Steering wheel
    const wheel = new THREE.Group();
    wheel.position.set(-0.42, 0.98, -0.52);
    wheel.rotation.x = 0.7;
    wheel.add(make((m) => {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * 6.2832, x = Math.cos(a) * 0.17, y = Math.sin(a) * 0.17;
        m.ball(x, y, 0, 0.055, 0.055, 0.04, 0x1c1c1e, 4, 2);
      }
      m.box(0, 0, 0, 0.3, 0.035, 0.03, 0x3c3c3e); m.box(0, -0.08, 0, 0.035, 0.16, 0.03, 0x3c3c3e);
    }));
    g.add(wheel);
    const makeWheel = (x, z, front) => {
      const pivot = new THREE.Group(); pivot.position.set(x, 0.34, z);
      const spin = new THREE.Group();
      spin.add(make((m) => {
        m.tube(0, 0, 0, 0.34, 0.34, 0.22, 'x', 0x1d1d1f, 12);
        const s = Math.sign(x);
        m.tube(s * 0.1, 0, 0, 0.19, 0.19, 0.04, 'x', 0xb0b2b6, 10);
        m.box(s * 0.125, 0, 0, 0.01, 0.34, 0.05, 0x707276); // spoke, so wheels visibly turn
      }));
      pivot.add(spin);
      g.add(pivot);
      return { pivot, spin, front };
    };
    const wheels = [makeWheel(0.84, -1.3, true), makeWheel(-0.84, -1.3, true), makeWheel(0.84, 1.3, false), makeWheel(-0.84, 1.3, false)];
    g.userData = { wheels, wheel };
    return g;
  }

  // Twin-engine regional airliner. Origin on the ground under the wing; nose towards -Z. About 27 m long.
  function plane() {
    const white = 0xe6e8ea, blue = 0x2f5f9b, grey = 0xa4a8ae;
    return make((m) => {
      const Y = 3.2;
      m.tube(0, Y, 0, 1.6, 1.6, 19, 'z', white, 12, false);
      m.tube(0, Y + 0.05, -11.5, 0.3, 1.6, 4, 'z', white, 12, false);
      m.tube(0, Y + 0.5, 11.5, 1.6, 0.35, 8, 'z', white, 12, false);
      m.tube(0, Y - 0.72, 0, 1.45, 1.45, 19, 'z', blue, 12, false);
      // Windows
      for (let i = 0; i < 16; i++) { const z = -7.5 + i; m.box(1.57, Y + 0.45, z, 0.03, 0.32, 0.22, 0x37434f); m.box(-1.57, Y + 0.45, z, 0.03, 0.32, 0.22, 0x37434f); }
      m.hull([[-0.9, Y + 0.7, -11.1], [0.9, Y + 0.7, -11.1], [1.05, Y + 0.7, -10], [-1.05, Y + 0.7, -10], [-0.55, Y + 1.25, -10.4], [0.55, Y + 1.25, -10.4], [0.6, Y + 1.5, -9.6], [-0.6, Y + 1.5, -9.6]], 0x28333d);
      // Wings
      for (const s of [1, -1]) {
        m.hull([[s * 1.2, Y - 0.6, -1.5], [s * 1.2, Y - 0.7, 2], [s * 13, Y + 0.2, 1.8], [s * 13, Y + 0.25, 0.8], [s * 1.2, Y - 0.35, -1.5], [s * 1.2, Y - 0.35, 2], [s * 13, Y + 0.3, 1.8], [s * 13, Y + 0.32, 0.8]], grey);
        m.hull([[s * 0.5, Y + 0.3, 12], [s * 0.5, Y + 0.3, 14.5], [s * 5, Y + 0.9, 14.8], [s * 5, Y + 0.9, 13.8], [s * 0.5, Y + 0.45, 12], [s * 0.5, Y + 0.45, 14.5], [s * 5, Y + 1, 14.8], [s * 5, Y + 1, 13.8]], white);
        m.tube(s * 5, Y - 1.05, -1, 0.72, 0.62, 2.8, 'z', 0xc8cbd0, 10);
        m.box(s * 5, Y - 0.52, -0.6, 0.15, 0.4, 1.3, grey);
        // Landing gear
        m.tube(s * 2.2, 1.1, 0.6, 0.11, 0.11, 2.1, 'y', 0x6d7075, 6);
        m.tube(s * 2.2, 0.48, 0.6, 0.48, 0.48, 0.4, 'x', 0x1d1d1f, 10);
      }
      m.tube(0, 0.95, -8.4, 0.09, 0.09, 1.7, 'y', 0x6d7075, 6);
      m.tube(0, 0.36, -8.4, 0.36, 0.36, 0.3, 'x', 0x1d1d1f, 10);
      // Tail fin
      m.hull([[0, Y + 1.2, 10], [0.14, Y + 1.2, 10], [0.14, Y + 1.0, 15], [0, Y + 1.0, 15], [0, Y + 5.6, 13.6], [0.1, Y + 5.6, 13.6], [0.1, Y + 5.6, 15.8], [0, Y + 5.6, 15.8]], blue);
    });
  }
  // What the player sees from the cockpit during flights: a coaming and two pillars, attached to the camera.
  function cockpit() {
    return make((m) => {
      const dark = 0x23272c;
      m.hull([[-1.4, -1.2, -1.2], [1.4, -1.2, -1.2], [1.4, -1.2, -0.3], [-1.4, -1.2, -0.3], [-1.4, -0.55, -1.25], [1.4, -0.55, -1.25], [1.4, -0.42, -0.45], [-1.4, -0.42, -0.45]], dark);
      m.box(-0.42, -0.45, -0.8, 0.4, 0.02, 0.24, 0x46e0a0); m.box(0.42, -0.45, -0.8, 0.4, 0.02, 0.24, 0x3f8fe0);
      m.hull([[-0.82, -0.6, -1.3], [-0.72, -0.6, -1.3], [-0.72, -0.6, -1.25], [-0.82, -0.6, -1.25], [-0.72, 0.8, -0.8], [-0.62, 0.8, -0.8], [-0.62, 0.8, -0.74], [-0.72, 0.8, -0.74]], dark);
      m.hull([[0.72, -0.6, -1.3], [0.82, -0.6, -1.3], [0.82, -0.6, -1.25], [0.72, -0.6, -1.25], [0.62, 0.8, -0.8], [0.72, 0.8, -0.8], [0.72, 0.8, -0.74], [0.62, 0.8, -0.74]], dark);
      m.hull([[-1.6, 0.62, -1.1], [1.6, 0.62, -1.1], [1.6, 0.62, -0.2], [-1.6, 0.62, -0.2], [-1.6, 0.8, -1.1], [1.6, 0.8, -1.1], [1.6, 0.8, -0.2], [-1.6, 0.8, -0.2]], dark);
    });
  }

  function goldKey() {
    return make((m) => {
      for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.2832; m.ball(Math.cos(a) * 0.08, 0.14 + Math.sin(a) * 0.08, 0, 0.05, 0.05, 0.04, 0xdcb93e, 4, 2); }
      m.tube(0, -0.05, 0, 0.022, 0.022, 0.28, 'y', 0xdcb93e, 6);
      m.box(0.05, -0.16, 0, 0.07, 0.035, 0.03, 0xdcb93e); m.box(0.05, -0.08, 0, 0.07, 0.035, 0.03, 0xdcb93e);
    });
  }
  function carKey() {
    return make((m) => { m.ball(0, 0.03, 0, 0.13, 0.05, 0.08, 0x202226, 6, 3); m.box(0.11, 0.03, 0, 0.12, 0.015, 0.025, 0xc8ccd0); m.ball(-0.04, 0.056, 0, 0.03, 0.01, 0.03, 0xc83a3a, 5, 2); });
  }
  function beacon(color) {
    const b = new Builder();
    b.box(0, 30, 0, 0.5, 60, 0.5, color);
    const m = new THREE.Mesh(b.geometry(), G.mats.glassMat);
    m.renderOrder = 4;
    return m;
  }
  function egg() { return make((m) => m.ball(0, 0.075, 0, 0.12, 0.15, 0.12, 0xf0e7d6, 7, 5)); }
  function crate() { return make((m) => { m.box(0, 0, 0, 0.62, 0.62, 0.62, 0xa98551); m.box(0, 0.24, 0, 0.65, 0.07, 0.65, 0x7a5c34); m.box(0, -0.24, 0, 0.65, 0.07, 0.65, 0x7a5c34); }); }
  function pallet() { return make((m) => { for (let i = 0; i < 4; i++) m.box(0, 0.11, -0.36 + i * 0.24, 1.1, 0.03, 0.18, 0x8d6c3e); m.box(-0.45, 0.05, 0, 0.1, 0.1, 1, 0x7c5c34); m.box(0.45, 0.05, 0, 0.1, 0.1, 1, 0x7c5c34); }); }
  function bowl(color) { return make((m) => { m.tube(0, 0.05, 0, 0.12, 0.17, 0.09, 'y', color, 10); m.tube(0, 0.1, 0, 0.13, 0.13, 0.006, 'y', 0x7a4a2c, 10); }); }
  function arm() {
    return make((m) => { m.tube(0, 0, 0.1, 0.038, 0.05, 0.42, 'z', 0x3f6ea8, 8, false); m.ball(0, 0, -0.17, 0.09, 0.08, 0.14, 0xdcb48f, 7, 4); });
  }
  function door(color, along) {
    const g = new THREE.Group();
    g.add(make((m) => {
      if (along === 'x') {
        m.box(0.5, 1, 0, 1, 2, 0.08, color); m.box(0.5, 0.52, 0, 0.74, 0.62, 0.1, 0x5d4026); m.box(0.5, 1.46, 0, 0.74, 0.62, 0.1, 0x5d4026);
        m.ball(0.87, 1, 0.07, 0.07, 0.07, 0.07, 0xd8c76a, 6, 3); m.ball(0.87, 1, -0.07, 0.07, 0.07, 0.07, 0xd8c76a, 6, 3);
      } else {
        m.box(0, 1, 0.5, 0.08, 2, 1, color); m.box(0, 0.52, 0.5, 0.1, 0.62, 0.74, 0x5d4026); m.box(0, 1.46, 0.5, 0.1, 0.62, 0.74, 0x5d4026);
        m.ball(0.07, 1, 0.87, 0.07, 0.07, 0.07, 0xd8c76a, 6, 3); m.ball(-0.07, 1, 0.87, 0.07, 0.07, 0.07, 0xd8c76a, 6, 3);
      }
    }));
    return g;
  }
  function textSprite(text, color, size = 56) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    x.font = `bold ${size}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = color; x.strokeStyle = '#000'; x.lineWidth = 4;
    x.strokeText(text, 32, 34); x.fillText(text, 32, 34);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  }
  function paintSign(canvas, lines, bg, fg, stripes) {
    const x = canvas.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, canvas.width, canvas.height);
    if (stripes) {
      // Small flag at the left edge of the sign.
      const fw = canvas.height * 1.1, fh = canvas.height * 0.7, fy = canvas.height * 0.15, fx = canvas.height * 0.15;
      stripes.colors.forEach((col, i) => {
        x.fillStyle = col;
        const n = stripes.colors.length;
        if (stripes.dir === 'v') x.fillRect(fx + (fw * i) / n, fy, fw / n + 1, fh);
        else x.fillRect(fx, fy + (fh * i) / n, fw, fh / n + 1);
      });
      if (stripes.disc) { x.fillStyle = stripes.disc; x.beginPath(); x.arc(fx + fw / 2, fy + fh / 2, fh * 0.28, 0, 6.3); x.fill(); }
    }
    const left = stripes ? canvas.height * 1.4 : 0, cw = canvas.width - left;
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    lines.forEach((l, i) => {
      let size = i === 0 ? 58 : 34;
      x.font = `bold ${size}px "Segoe UI", Roboto, Arial, sans-serif`;
      while (x.measureText(l).width > cw - 24 && size > 14) { size -= 2; x.font = `bold ${size}px "Segoe UI", Roboto, Arial, sans-serif`; }
      x.fillText(l, left + cw / 2, ((i + 0.5) * canvas.height) / lines.length);
    });
  }
  // A sign whose text can change; returns the mesh with .setText(lines, stripes).
  function signPlane(lines, w, h, bg, fg, stripes) {
    const c = document.createElement('canvas'); c.width = 512; c.height = Math.round((512 * h) / w);
    paintSign(c, lines, bg, fg, stripes);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
    m.setText = (l2, s2) => { paintSign(c, l2, bg, fg, s2); t.needsUpdate = true; };
    return m;
  }

  G.models = { Builder, make, chicken, cat, person, blockyPerson, animatePerson, poseCarry, poseReach, car, plane, cockpit, goldKey, carKey, beacon, egg, crate, pallet, bowl, arm, door, textSprite, signPlane };
})();
