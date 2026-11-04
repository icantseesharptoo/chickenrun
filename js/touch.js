// Touch controls for phones: joystick, drag-to-look, on-screen buttons, pinch-zoom on the big map.
// Buttons call the same actions as the keyboard, so game logic has no touch-specific paths.
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  const stick = { x: 0, y: 0 };
  const STICK_R = 52;
  let api = null, inCarShown = null, btnUse = null, btnRun = null;

  function makeButton(parent, label, cls, kind, code) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 't-btn ' + cls;
    b.textContent = label;
    if (code) b.dataset.code = code;
    const press = (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
      b.classList.add('down');
      if (kind === 'hold') api.keys[code] = true;
      else if (typeof kind === 'function') kind();
      else api.action(code);
    };
    const release = () => {
      b.classList.remove('down');
      if (kind === 'hold') api.keys[code] = false;
    };
    b.addEventListener('pointerdown', press);
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('lostpointercapture', release);
    parent.appendChild(b);
    return b;
  }

  function init(a) {
    api = a;
    const hud = document.getElementById('hud');

    // Everything not covered by a button is the touch pad: left side walks, the rest looks.
    const pad = document.createElement('div');
    pad.id = 't-pad';
    hud.insertBefore(pad, hud.firstChild);
    const base = document.createElement('div'); base.id = 't-stick';
    const knob = document.createElement('div'); knob.id = 't-knob';
    base.appendChild(knob);
    pad.appendChild(base);

    const pointers = new Map();
    let stickId = null;
    const placeStick = (x, y) => { base.style.left = x + 'px'; base.style.top = y + 'px'; base.classList.add('on'); };
    const resetStick = () => {
      stick.x = stick.y = 0;
      stickId = null;
      knob.style.transform = '';
      base.classList.remove('on');
      base.style.left = base.style.top = '';
    };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { pad.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
      const walkSide = e.clientX < innerWidth * 0.42 && !api.inCar() && stickId === null;
      pointers.set(e.pointerId, { role: walkSide ? 'stick' : 'look', ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY });
      if (walkSide) { stickId = e.pointerId; placeStick(e.clientX, e.clientY); }
    });
    pad.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      if (p.role === 'look') {
        api.look(e.clientX - p.x, e.clientY - p.y);
      } else {
        let dx = e.clientX - p.ox, dy = e.clientY - p.oy;
        const l = Math.hypot(dx, dy);
        if (l > STICK_R) { dx *= STICK_R / l; dy *= STICK_R / l; }
        stick.x = dx / STICK_R; stick.y = -dy / STICK_R;
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    const endPointer = (e) => {
      if (e.pointerId === stickId) resetStick();
      pointers.delete(e.pointerId);
    };
    pad.addEventListener('pointerup', endPointer);
    pad.addEventListener('pointercancel', endPointer);

    // Walking buttons
    btnUse = makeButton(hud, 'USE', 't-walk t-use t-big', 'tap', 'KeyE');
    makeButton(hud, 'JUMP', 't-walk t-jump', 'hold', 'Space');
    btnRun = makeButton(hud, 'RUN', 't-walk t-run', () => { api.keys.ShiftLeft = !api.keys.ShiftLeft; });
    makeButton(hud, 'EAT', 't-walk t-eat', 'tap', 'KeyQ');
    // Driving buttons
    makeButton(hud, '▲', 't-car t-gas t-big', 'hold', 'KeyW');
    makeButton(hud, 'BRAKE', 't-car t-brake', 'hold', 'Space');
    makeButton(hud, '▼', 't-car t-rev', 'hold', 'KeyS');
    makeButton(hud, 'EXIT', 't-car t-exit', 'tap', 'KeyE');
    makeButton(hud, '◀', 't-car t-left t-big', 'hold', 'KeyA');
    makeButton(hud, '▶', 't-car t-right t-big', 'hold', 'KeyD');
    makeButton(hud, 'VIEW', 't-car t-view', 'tap', 'KeyV');
    makeButton(hud, 'HORN', 't-car t-horn', 'tap', 'KeyH');
    // Always there
    makeButton(hud, 'MAP', 't-top t-map', 'tap', 'KeyM');
    makeButton(hud, 'SOUND', 't-top t-sound', 'tap', 'KeyN');
    makeButton(hud, '❚❚', 't-top t-pause', () => api.pause());

    const rot = document.createElement('div');
    rot.id = 't-rotate';
    rot.textContent = 'Rotate your phone sideways to play';
    hud.appendChild(rot);

    document.getElementById('minimap').addEventListener('pointerdown', (e) => { e.preventDefault(); api.action('KeyM'); });

    // Big map: close button and pinch to zoom.
    const wrap = document.getElementById('bigmap-wrap');
    const close = document.createElement('button');
    close.id = 't-map-close';
    close.type = 'button';
    close.textContent = '✕ Close';
    close.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); api.action('KeyM'); });
    wrap.appendChild(close);
    const pinch = new Map();
    let pinchStart = 0;
    const spread = () => { const [a1, b1] = [...pinch.values()]; return Math.hypot(a1.x - b1.x, a1.y - b1.y); };
    wrap.addEventListener('pointerdown', (e) => {
      try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
      pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.size === 2) pinchStart = spread();
    });
    wrap.addEventListener('pointermove', (e) => {
      if (!pinch.has(e.pointerId)) return;
      pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.size === 2 && pinchStart > 0) {
        const s = spread();
        if (s > pinchStart * 1.5) { api.zoomMap(1); pinchStart = s; } else if (s < pinchStart / 1.5) { api.zoomMap(-1); pinchStart = s; }
      }
    });
    const endPinch = (e) => { pinch.delete(e.pointerId); pinchStart = 0; };
    wrap.addEventListener('pointerup', endPinch);
    wrap.addEventListener('pointercancel', endPinch);

    // Stops long-press menus and double-tap zoom from interrupting play.
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    G.touch.releaseAll = () => {
      pointers.clear();
      resetStick();
      document.querySelectorAll('.t-btn.down').forEach((b) => b.classList.remove('down'));
    };
  }

  function update(prompt) {
    const inCar = api.inCar();
    if (inCar !== inCarShown) {
      inCarShown = inCar;
      document.body.classList.toggle('in-car', inCar);
      G.touch.releaseAll();
    }
    btnUse.classList.toggle('ready', !!prompt);
    btnRun.classList.toggle('active', !!api.keys.ShiftLeft);
  }

  G.touch = { init, update, stick, releaseAll() {} };
})();
