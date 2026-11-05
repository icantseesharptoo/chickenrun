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
    const c = [0xece7da, 0xbb7b40, 0x3f3a37, 0xdcc08f][variant % 4];
    const wing = variant % 4 === 2 ? 0x57504b : c === 0xece7da ? 0xd8d2c2 : 0xa06a36;
    const g = new THREE.Group();
    g.add(make((m) => {
      m.ball(0, 0.36, 0.04, 0.34, 0.32, 0.46, c);
      m.ball(0, 0.5, 0.26, 0.15, 0.24, 0.16, c, 6, 4);
      m.ball(0.17, 0.37, 0.06, 0.07, 0.2, 0.32, wing, 6, 4);
      m.ball(-0.17, 0.37, 0.06, 0.07, 0.2, 0.32, wing, 6, 4);
    }));
    const head = new THREE.Group();
    head.position.set(0, 0.46, -0.17);
    head.add(make((m) => {
      m.ball(0, 0.13, -0.03, 0.17, 0.2, 0.17, c, 7, 4);
      m.tube(0, 0.14, -0.15, 0.04, 0.005, 0.1, 'z', 0xdc9a2e, 5, false);
      m.ball(0, 0.25, -0.03, 0.04, 0.1, 0.13, 0xbf3a30, 5, 3);
      m.ball(0, 0.06, -0.12, 0.04, 0.08, 0.04, 0xbf3a30, 5, 3);
      m.ball(0.08, 0.17, -0.09, 0.03, 0.04, 0.04, 0x141414, 5, 3);
      m.ball(-0.08, 0.17, -0.09, 0.03, 0.04, 0.04, 0x141414, 5, 3);
    }));
    g.add(head);
    const leg = () => {
      const l = new THREE.Group(); l.position.y = 0.21;
      l.add(make((m) => { m.tube(0, -0.1, 0, 0.018, 0.024, 0.21, 'y', 0xdc9a2e, 5, false); m.box(0, -0.2, -0.04, 0.09, 0.02, 0.13, 0xdc9a2e); }));
      return l;
    };
    const l1 = leg(), l2 = leg();
    l1.position.x = 0.08; l2.position.x = -0.08;
    g.add(l1, l2);
    g.userData = { head, legs: [l1, l2] };
    return g;
  }

  function cat(variant) {
    const palettes = [[0xc98a48, 0xebdcc4], [0x6f6f72, 0xc4c4c6], [0x2e2d2f, 0xe8e8e8]];
    const [c, belly] = palettes[variant % 3];
    const g = new THREE.Group();
    g.add(make((m) => {
      m.ball(0, 0.33, 0.06, 0.25, 0.25, 0.66, c);
      m.ball(0, 0.26, 0.04, 0.19, 0.13, 0.48, belly, 6, 4);
    }));
    const head = new THREE.Group();
    head.position.set(0, 0.42, -0.25);
    head.add(make((m) => {
      m.ball(0, 0.07, -0.06, 0.26, 0.22, 0.23, c);
      m.tube(0.08, 0.23, -0.03, 0.05, 0.002, 0.13, 'y', c, 4, false);
      m.tube(-0.08, 0.23, -0.03, 0.05, 0.002, 0.13, 'y', c, 4, false);
      m.ball(0, 0.02, -0.16, 0.12, 0.08, 0.06, belly, 6, 3);
      m.ball(0, 0.05, -0.19, 0.03, 0.025, 0.02, 0xcf7a88, 4, 3);
      m.ball(0.065, 0.1, -0.165, 0.045, 0.04, 0.02, 0x88b83f, 5, 3);
      m.ball(-0.065, 0.1, -0.165, 0.045, 0.04, 0.02, 0x88b83f, 5, 3);
    }));
    g.add(head);
    const tail = new THREE.Group();
    tail.position.set(0, 0.4, 0.36);
    tail.add(make((m) => m.tube(0, 0.18, 0.02, 0.04, 0.022, 0.38, 'y', c, 5, false)));
    tail.rotation.x = 0.45;
    g.add(tail);
    const legs = [[0.08, -0.17], [-0.08, -0.17], [0.08, 0.28], [-0.08, 0.28]].map(([x, z]) => {
      const l = new THREE.Group(); l.position.set(x, 0.23, z);
      l.add(make((m) => { m.tube(0, -0.11, 0, 0.03, 0.038, 0.23, 'y', belly, 5, false); m.ball(0, -0.215, -0.012, 0.07, 0.035, 0.09, belly, 5, 3); }));
      g.add(l);
      return l;
    });
    g.userData = { head, tail, legs };
    return g;
  }

  function person(shirt, hair) {
    const skin = 0xdcb48f;
    const g = new THREE.Group();
    g.add(make((m) => {
      m.tube(0, 1.14, 0, 0.21, 0.26, 0.62, 'y', shirt, 8);
      m.ball(0.31, 1.36, 0, 0.14, 0.14, 0.14, shirt, 6, 4);
      m.ball(-0.31, 1.36, 0, 0.14, 0.14, 0.14, shirt, 6, 4);
      m.tube(0.33, 1.12, 0, 0.05, 0.065, 0.5, 'y', shirt, 6);
      m.tube(-0.33, 1.12, 0, 0.05, 0.065, 0.5, 'y', shirt, 6);
      m.ball(0.33, 0.84, 0, 0.09, 0.11, 0.09, skin, 5, 3);
      m.ball(-0.33, 0.84, 0, 0.09, 0.11, 0.09, skin, 5, 3);
      m.tube(0.12, 0.42, 0, 0.075, 0.11, 0.84, 'y', 0x33415e, 7);
      m.tube(-0.12, 0.42, 0, 0.075, 0.11, 0.84, 'y', 0x33415e, 7);
      m.tube(0, 1.5, 0, 0.06, 0.06, 0.14, 'y', skin, 6, false);
      m.ball(0, 1.66, 0, 0.27, 0.32, 0.29, skin);
      m.ball(0, 1.74, 0.03, 0.3, 0.22, 0.32, hair);
      m.ball(0.065, 1.67, -0.135, 0.04, 0.035, 0.02, 0x222222, 5, 3);
      m.ball(-0.065, 1.67, -0.135, 0.04, 0.035, 0.02, 0x222222, 5, 3);
      m.box(0, 1.58, -0.14, 0.07, 0.012, 0.012, 0x8a4a3a);
    }));
    return g;
  }

  // Original rural sedan: sloped hood, raked windshield, separate wheels. Origin: centre at ground level; driver sits on the left.
  function car(options) {
    const o = Object.assign({ body: 0xcfd0c8, lower: 0x9fa19c, taxi: false }, options);
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

  G.models = { Builder, make, chicken, cat, person, car, plane, cockpit, goldKey, carKey, beacon, egg, crate, pallet, bowl, arm, door, textSprite, signPlane };
})();
