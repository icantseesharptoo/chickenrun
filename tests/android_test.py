#!/usr/bin/env python3
"""Plays the game through Chrome's Android device emulation, using real touch input.

The page is opened as a visitor would open it (no debug hash). The script taps Play, then uses the
DevTools protocol to send genuine touch events, so touch detection, pointer capture and the start
flow are all exercised. It does NOT measure real phone speed or how the controls feel.

Usage: python -I tests/android_test.py <url> <screenshot_dir>
"""
import base64, json, os, shutil, socket, struct, subprocess, sys, tempfile, time, urllib.request

CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
PORT = 9333
W, H = 851, 393  # a typical Android phone, held sideways
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'


class WS:
    """Minimal WebSocket client, enough for the DevTools protocol."""

    def __init__(self, url):
        host, path = url[len('ws://'):].split('/', 1)
        h, p = host.split(':')
        self.s = socket.create_connection((h, int(p)))
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall((f'GET /{path} HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
                        f'Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n').encode())
        buf = b''
        while b'\r\n\r\n' not in buf:
            buf += self.s.recv(4096)
        self.n = 0

    def _read(self, n):
        b = b''
        while len(b) < n:
            c = self.s.recv(n - len(b))
            if not c:
                raise EOFError
            b += c
        return b

    def _recv(self):
        msg = b''
        while True:
            a, b = self._read(2)
            ln = b & 127
            if ln == 126:
                ln = struct.unpack('>H', self._read(2))[0]
            elif ln == 127:
                ln = struct.unpack('>Q', self._read(8))[0]
            msg += self._read(ln)
            if a & 0x80:
                return msg

    def call(self, method, **params):
        self.n += 1
        data = json.dumps({'id': self.n, 'method': method, 'params': params}).encode()
        mask = os.urandom(4)
        head = bytes([0x81])
        if len(data) < 126:
            head += bytes([0x80 | len(data)])
        elif len(data) < 65536:
            head += bytes([0x80 | 126]) + struct.pack('>H', len(data))
        else:
            head += bytes([0x80 | 127]) + struct.pack('>Q', len(data))
        self.s.sendall(head + mask + bytes(c ^ mask[i % 4] for i, c in enumerate(data)))
        while True:
            m = json.loads(self._recv())
            if m.get('id') == self.n:
                if 'error' in m:
                    raise RuntimeError(f'{method}: {m["error"]}')
                return m.get('result', {})


results = []


def check(name, ok, info=''):
    results.append(bool(ok))
    print(('ok   ' if ok else 'FAIL ') + name + (f'  [{info}]' if info != '' else ''), flush=True)


def main():
    url, shots = sys.argv[1], sys.argv[2]
    os.makedirs(shots, exist_ok=True)
    profile = tempfile.mkdtemp(prefix='akyar-android-')
    chrome = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={PORT}', '--remote-allow-origins=*',
                               '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-first-run',
                               f'--user-data-dir={profile}', f'--window-size={W},{H}', 'about:blank'],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(60):
            try:
                tabs = json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json'))
                page = next(t for t in tabs if t['type'] == 'page')
                break
            except Exception:
                time.sleep(0.5)
        ws = WS(page['webSocketDebuggerUrl'])
        ws.call('Page.enable')
        ws.call('Runtime.enable')
        ws.call('Network.setUserAgentOverride', userAgent=UA, platform='Linux armv8l')
        ws.call('Emulation.setDeviceMetricsOverride', width=W, height=H, deviceScaleFactor=2.625, mobile=True,
                screenOrientation={'type': 'landscapePrimary', 'angle': 90})
        ws.call('Emulation.setTouchEmulationEnabled', enabled=True, maxTouchPoints=5)
        ws.call('Emulation.setEmulatedMedia', features=[{'name': 'hover', 'value': 'none'}, {'name': 'pointer', 'value': 'coarse'}])
        ws.call('Page.navigate', url=url)

        def js(expr):
            r = ws.call('Runtime.evaluate', expression=expr, returnByValue=True, awaitPromise=True)
            if 'exceptionDetails' in r:
                raise RuntimeError(expr + ' -> ' + json.dumps(r['exceptionDetails'])[:500])
            return r['result'].get('value')

        def touch(kind, pts):
            ws.call('Input.dispatchTouchEvent', type=kind, touchPoints=[{'x': x, 'y': y, 'id': i} for i, x, y in pts])

        def tap(x, y, hold=0.08):
            touch('touchStart', [(1, x, y)])
            time.sleep(hold)
            touch('touchEnd', [])
            time.sleep(0.05)

        def center(sel):
            r = js(f"(()=>{{const b=document.querySelector({json.dumps(sel)}).getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2,b.width,b.height]}})()")
            return r

        def tap_el(sel, hold=0.08):
            x, y, w, h = center(sel)
            if not w:
                raise RuntimeError('not visible: ' + sel)
            tap(x, y, hold)

        def wait(cond, sec=30):
            t = time.time()
            while time.time() - t < sec:
                if js(cond):
                    return True
                time.sleep(0.2)
            return False

        def shot(name):
            d = ws.call('Page.captureScreenshot', format='png')['data']
            with open(os.path.join(shots, name + '.png'), 'wb') as f:
                f.write(base64.b64decode(d))

        G = 'window.G.game'
        loaded = wait("!!document.querySelector('#start-buttons:not(.hidden)')", 90)
        check('game loads on the emulated phone', loaded)
        check('phone is detected from the browser, with no debug flag', js(f'{G}.isTouch') and js("document.body.classList.contains('touch')"))
        check('touch help replaces the keyboard table', js("getComputedStyle(document.querySelector('#touch-help')).display") != 'none' and js("getComputedStyle(document.querySelector('.keys')).display") == 'none')
        check('Play button fits on the screen without scrolling', center('#btn-play')[1] < H, center('#btn-play')[1])
        shot('a_start')

        tap_el('#btn-play')
        check('tapping Play starts the game', wait(f'{G}.isStarted() && !{G}.isPaused()', 5))
        check('start screen is gone', js("document.querySelector('#start').classList.contains('hidden')"))
        time.sleep(1)
        shot('b_bedroom')

        # On-screen controls must fit and must not overlap each other, on foot and in the car.
        overlap = """(()=>{const v=[...document.querySelectorAll('.t-btn')].filter(b=>b.offsetParent!==null&&getComputedStyle(b).display!=='none').map(b=>[b.textContent,b.getBoundingClientRect()]);
          const bad=[];for(let i=0;i<v.length;i++){const a=v[i][1];if(a.left<0||a.top<0||a.right>innerWidth||a.bottom>innerHeight)bad.push('off:'+v[i][0]);
          for(let j=i+1;j<v.length;j++){const b=v[j][1];if(a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom)bad.push(v[i][0]+'/'+v[j][0]);}}return [v.length,bad.join(',')]})()"""
        n, bad = js(overlap)
        check('walking buttons fit and do not overlap', n >= 7 and not bad, f'{n} buttons {bad}')

        # Joystick: real drag with the left thumb.
        js(f"(()=>{{const g={G},h=G.sites.home,p=h.pos(19.5,0,20);g.teleport(p.x,p.y,p.z);const q=h.pos(19.5,0,10);g.setYawPitch(Math.atan2(-(q.x-p.x),-(q.z-p.z)),0);g.P.vx=g.P.vy=g.P.vz=0;}})()".replace('G.sites', 'window.G.sites'))
        time.sleep(0.5)
        x0, z0 = js(f'[{G}.P.x,{G}.P.z]')
        touch('touchStart', [(1, 110, 300)])
        time.sleep(0.05)
        touch('touchMove', [(1, 110, 240)])
        time.sleep(0.2)
        sy = js('window.G.touch.stick.y')
        check('left thumb drag moves the joystick', sy > 0.9, round(sy, 2))
        shot('c_joystick')
        y0, p0 = js(f'[{G}.P.yaw,{G}.P.pitch]')
        # Second finger looks around while the first keeps walking.
        touch('touchStart', [(1, 110, 240), (2, 600, 200)])
        for i in range(1, 6):
            time.sleep(0.05)
            touch('touchMove', [(1, 110, 240), (2, 600 + i * 16, 200)])
        time.sleep(0.8)
        y1 = js(f'{G}.P.yaw')
        x1, z1 = js(f'[{G}.P.x,{G}.P.z]')
        check('right thumb looks around while the left thumb walks', abs(y1 - y0) > 0.2 and js('window.G.touch.stick.y') > 0.9, f'yaw change {abs(y1 - y0):.2f}')
        touch('touchEnd', [])
        time.sleep(0.2)
        check('walking really moved the player', ((x1 - x0) ** 2 + (z1 - z0) ** 2) ** 0.5 > 1.0, f'{((x1 - x0) ** 2 + (z1 - z0) ** 2) ** 0.5:.1f} m')
        check('releasing the thumbs stops the joystick', js('window.G.touch.stick.y') == 0 and js('window.G.touch.stick.x') == 0)

        # USE button: take grain from the sack.
        js(f"(()=>{{const g={G},h=window.G.sites.home,p=h.pos(18.5,0,29.5);g.teleport(p.x,p.y,p.z);g.lookAt(h.sack);window.G.game.doors.find(d=>d.id==='shed');}})()")
        ready = wait("document.querySelector('.t-use').classList.contains('ready')", 5)
        check('USE button lights up when something is usable', ready, js("document.querySelector('#prompt').textContent"))
        shot('d_use')
        tap_el('.t-use')
        check('USE takes the grain', wait(f'{G}.S().items.grain===6', 3), js(f'{G}.S().items.grain'))
        js(f"(()=>{{const g={G},p=g.P;g.setYawPitch(p.yaw,0);}})()")

        # Jump, Run, Eat
        tap_el('.t-jump', 0.15)
        time.sleep(0.1)
        tap_el('.t-run')
        check('RUN toggles on', js(f'{G}.keys.ShiftLeft') is True)
        check('RUN button shows it is on', js("document.querySelector('.t-run').classList.contains('active')") or wait("document.querySelector('.t-run').classList.contains('active')", 2))
        tap_el('.t-run')
        check('RUN toggles off', not js(f'{G}.keys.ShiftLeft'))
        js(f'{G}.S().items.bread=1;{G}.S().hunger=30')
        tap_el('.t-eat')
        check('EAT eats food', js(f'{G}.S().items.bread') == 0 and js(f'{G}.S().hunger') > 45, round(js(f'{G}.S().hunger')))

        # Big map: open from the minimap, pinch, close.
        tap_el('#minimap')
        check('tapping the minimap opens the map', wait(f'{G}.isMapOpen()', 2))
        z0m = js(f'{G}.mapZoom()')
        touch('touchStart', [(1, 380, 190), (2, 470, 190)])
        for i in range(1, 9):
            time.sleep(0.04)
            touch('touchMove', [(1, 380 - i * 14, 190), (2, 470 + i * 14, 190)])
        touch('touchEnd', [])
        time.sleep(0.5)
        check('pinch zooms the map in', js(f'{G}.mapZoom()') > z0m, f'{z0m} -> {js(G + ".mapZoom()")}')
        shot('e_map')
        tap_el('#t-map-close')
        check('map closes', wait(f'!{G}.isMapOpen()', 2))
        time.sleep(0.5)

        # Car: real touch driving.
        js(f"(()=>{{const g={G},h=window.G.sites.home;g.S().carKey=true;const p=h.pos(19.5,0,9);g.teleport(p.x,p.y,p.z);g.lookAt(h.car.clone().setY(h.y+1));}})()")
        wait("document.querySelector('.t-use').classList.contains('ready')", 5)
        tap_el('.t-use')
        check('USE gets in the car', wait(f'{G}.S().inCar', 3))
        check('driving controls replace the walking buttons', wait("getComputedStyle(document.querySelector('.t-gas')).display!=='none'&&getComputedStyle(document.querySelector('.t-use')).display==='none'", 3))
        n, bad = js(overlap)
        check('driving buttons fit and do not overlap', n >= 9 and not bad, f'{n} buttons {bad}')
        time.sleep(0.5)
        shot('f_car')
        cx0, cz0 = js(f'[{G}.S().cx,{G}.S().cz]')
        hx, hy = center('.t-gas')[:2]
        touch('touchStart', [(1, hx, hy)])
        moved = wait(f'Math.hypot({G}.S().cx-({cx0}),{G}.S().cz-({cz0}))>6', 40)
        check('holding the gas button drives the car', moved, f'{js(G + ".car.speed") * 3.6:.0f} km/h')
        # Steer while holding the gas: two fingers on two buttons.
        h0 = js(f'{G}.S().ch')
        lx, ly = center('.t-left')[:2]
        touch('touchStart', [(1, hx, hy), (2, lx, ly)])
        steered = wait(f'Math.abs({G}.S().ch-({h0}))>0.04', 30)
        check('steering works while holding the gas', steered, f'{abs(js(G + ".S().ch") - h0):.2f} rad')
        touch('touchEnd', [])
        time.sleep(0.2)
        check('lifting fingers releases the pedals', not js(f'{G}.keys.KeyW') and not js(f'{G}.keys.KeyA'))
        bx, by = center('.t-brake')[:2]
        touch('touchStart', [(1, bx, by)])
        stopped = wait(f'Math.abs({G}.car.speed)<0.5', 30)
        touch('touchEnd', [])
        check('BRAKE stops the car', stopped, f'{js(G + ".car.speed"):.1f}')
        cam_dist = f'Math.hypot({G}.camera.position.x-{G}.S().cx,{G}.camera.position.z-{G}.S().cz)'
        d0 = js(cam_dist)
        tap_el('.t-view')
        check('VIEW switches between chase and driver view', wait(f'Math.abs({cam_dist}-({d0}))>1', 5), f'{d0:.1f} -> {js(cam_dist):.1f} m')
        time.sleep(0.6)
        shot('g_chase')
        tap_el('.t-view')
        check('VIEW switches back', wait(f'Math.abs({cam_dist}-({d0}))<0.6', 5))
        tap_el('.t-exit')
        check('EXIT gets out of the car', wait(f'!{G}.S().inCar', 3))
        check('walking buttons come back', wait("getComputedStyle(document.querySelector('.t-use')).display!=='none'", 3))

        # Shop on touch: the Leave button must return straight to play, with no pointer lock.
        js(f'{G}.openShop()')
        time.sleep(0.3)
        shot('h_shop')
        tap_el('#shop-items .item button')
        check('buying works by touch', js(f'{G}.S().items.bread') == 1)
        tap_el('#shop-close')
        time.sleep(0.2)
        check('leaving the shop returns to play', not js(f'{G}.isPaused()') and js("document.querySelector('#shop-ui').classList.contains('hidden')"))

        # Pause and resume
        tap_el('.t-pause')
        check('pause button pauses', js(f'{G}.isPaused()') and not js("document.querySelector('#start').classList.contains('hidden')"))
        shot('i_pause')
        tap_el('#btn-play')
        check('Resume continues', wait(f'!{G}.isPaused()', 3))

        # Quality stepping (software rendering here is far slower than a phone GPU, so it also triggers by itself).
        lvl = js(f'{G}.touchLevel()')
        for _ in range(5):
            js(f'{G}.adaptQuality(10)')
        check('slow frame rate steps quality down to the floor', js(f'{G}.touchLevel()') == 3 and js('window.G.voxels.getRadius()') == 3, f'started at level {lvl}, now {js(G + ".touchLevel()")}')
        check('good frame rate leaves quality alone', js(f'{G}.adaptQuality(60)') is False)
        check('the level is remembered', js("localStorage.getItem('akyar-touch-level')") == '3')

        # Flight and taxi on touch: SKIP replaces USE, other controls step aside.
        js(f'{G}.S().money=2000')
        js(f"(()=>{{const g={G},a=window.G.sites.airHome,p=a.frame.pos(190.5,0,10.5);g.teleport(p.x,p.y,p.z);g.lookAt(a.desk);}})()")
        check('USE lights up at the ticket desk', wait("document.querySelector('.t-use').classList.contains('ready')", 5), js("document.querySelector('#prompt').textContent"))
        tap_el('.t-use')
        check('tapping USE buys a ticket and starts the flight', wait(f'{G}.isCut()', 3))
        check('the button reads SKIP during the flight', wait("document.querySelector('.t-use').textContent==='SKIP'", 3))
        check('walking buttons are hidden during the flight', js("getComputedStyle(document.querySelector('.t-jump')).display") == 'none')
        time.sleep(2)
        shot('k_cockpit')
        tap_el('.t-use')
        check('SKIP lands you abroad', wait(f'!{G}.isCut() && !!{G}.S().abroad', 15), js(f'{G}.S().abroad && {G}.S().abroad.id'))
        check('the button reads USE again', wait("document.querySelector('.t-use').textContent==='USE'", 3))
        js(f"(()=>{{const g={G},t=g.taxiPose();g.teleport(t.x,window.G.world.TOP,t.z+3);g.lookAt(new THREE.Vector3(t.x,window.G.world.TOP+1,t.z));}})()")
        check('USE lights up at the taxi', wait("document.querySelector('.t-use').classList.contains('ready')", 5), js("document.querySelector('#prompt').textContent"))
        time.sleep(0.6)
        shot('l_taxi_stop')
        tap_el('.t-use')
        check('tapping USE starts the taxi', wait(f'{G}.isCut()', 3))
        time.sleep(1.5)
        shot('m_taxi_ride')
        tap_el('.t-use')
        check('SKIP reaches the hotel', wait(f'!{G}.isCut() && {G}.S().abroad.reachedHotel', 10))
        time.sleep(0.5)
        shot('n_hotel')
        # Back home, so the next run of the suite starts clean.
        js(f'{G}.S().abroad.taxiAt="airport"')

        # Portrait notice
        ws.call('Emulation.setDeviceMetricsOverride', width=H, height=W, deviceScaleFactor=2.625, mobile=True, screenOrientation={'type': 'portraitPrimary', 'angle': 0})
        time.sleep(0.8)
        check('portrait shows the rotate notice', js("getComputedStyle(document.querySelector('#t-rotate')).display") != 'none')
        shot('j_portrait')
    finally:
        chrome.terminate()
        try:
            chrome.wait(5)
        except Exception:
            chrome.kill()
        shutil.rmtree(profile, ignore_errors=True)
    print(f'total {len(results)}, failed {results.count(False)}')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
