#!/usr/bin/env python3
"""Bakes the distant landscape around Akyar into data/terrain.js.

The town itself stays flat (it is the playable area). Beyond it, real elevation rises
smoothly into the hills around Akyar. Heights are exaggerated, and distances beyond 3 km are compressed, so the real hills
around Akyar read as mountains on the horizon (they are only 100-370 m high in reality).

Usage (run from the project root):
    python -I tools/bake_terrain.py data_src/dem data/terrain.js --exaggerate 2.5

Elevation: Mapzen Terrain Tiles on AWS Open Data (includes SRTM, NASA).
"""
import argparse, array, base64, glob, math, os, re, struct, sys, zlib

LAT0, LON0 = 51.8725, 58.2325
MX = 111320 * math.cos(math.radians(LAT0))
MZ = 110574.0
TOWN = dict(x0=-2577, x1=2577, z0=-3041, z1=3041)
ABROAD = dict(x=20380, z=40)  # the shared country template is flattened too


def read_png(path):
    data = open(path, 'rb').read()
    pos, idat, palette = 8, [], None
    while pos < len(data):
        n, typ = struct.unpack('>I4s', data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + n]
        pos += 12 + n
        if typ == b'IHDR':
            w, h, depth, ctype = struct.unpack('>IIBB', body[:10])
        elif typ == b'PLTE':
            palette = body
        elif typ == b'IDAT':
            idat.append(body)
    ch = {2: 3, 3: 1, 6: 4}[ctype]
    raw = zlib.decompress(b''.join(idat))
    stride = w * ch
    out, prev, p = [], bytearray(stride), 0
    for _ in range(h):
        f = raw[p]
        line = bytearray(raw[p + 1:p + 1 + stride])
        p += stride + 1
        for i in range(stride):
            a = line[i - ch] if i >= ch else 0
            b = prev[i]
            c = prev[i - ch] if i >= ch else 0
            if f == 1: line[i] = (line[i] + a) & 255
            elif f == 2: line[i] = (line[i] + b) & 255
            elif f == 3: line[i] = (line[i] + (a + b) // 2) & 255
            elif f == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        row = []
        for i in range(w):
            if ctype == 3:
                k = line[i] * 3
                r, g, bb = palette[k], palette[k + 1], palette[k + 2]
            else:
                r, g, bb = line[i * ch:i * ch + 3]
            row.append(r * 256 + g + bb / 256 - 32768)
        out.append(row)
        prev = line
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('out')
    ap.add_argument('--exaggerate', type=float, default=2.5)
    ap.add_argument('--radius', type=float, default=14000)
    ap.add_argument('--step', type=float, default=175)
    ap.add_argument('--compress', type=float, default=0.42, help='distances beyond 3 km are shortened by this factor, pulling the hills closer')
    a = ap.parse_args()
    tiles, z = {}, None
    for f in glob.glob(os.path.join(a.src, 't_*.png')):
        m = re.search(r't_(\d+)_(\d+)_(\d+)\.png$', f)
        z = int(m.group(1))
        tiles[(int(m.group(2)), int(m.group(3)))] = read_png(f)
    n = 256 * 2 ** z

    def elev(x, zz):
        lat, lon = LAT0 - zz / MZ, LON0 + x / MX
        fx = (lon + 180) / 360 * n - 0.5
        r = math.radians(lat)
        fy = (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n - 0.5
        ix, iy = math.floor(fx), math.floor(fy)
        tx, ty = fx - ix, fy - iy
        def raw(px, py):
            t = tiles.get((px // 256, py // 256))
            return t[py % 256][px % 256] if t else None
        v = [raw(ix, iy), raw(ix + 1, iy), raw(ix, iy + 1), raw(ix + 1, iy + 1)]
        if any(q is None for q in v):
            return None
        return (v[0] * (1 - tx) + v[1] * tx) * (1 - ty) + (v[2] * (1 - tx) + v[3] * tx) * ty

    town = sorted(e for e in (elev(x, zz) for x in range(TOWN['x0'], TOWN['x1'], 200) for zz in range(TOWN['z0'], TOWN['z1'], 200)) if e is not None)
    base = town[len(town) // 2]
    R, st = a.radius, a.step
    cnt = int(2 * R / st) + 1
    vals, lo, hi = [], 1e9, -1e9
    for j in range(cnt):
        for i in range(cnt):
            x, zz = -R + i * st, -R + j * st
            # Pull distant hills closer: game distance r maps to a longer real distance.
            r = math.hypot(x, zz)
            k_r = 1.0 if r <= 2700 else (3000 + (r - 2700) / a.compress) / r
            e = elev(x * k_r, zz * k_r)
            if e is None:
                e = base
            h = (e - base) * a.exaggerate
            # Flat inside the playable town, rising smoothly beyond it.
            dx = max(TOWN['x0'] - 450 - x, 0, x - TOWN['x1'] - 450)
            dz = max(TOWN['z0'] - 450 - zz, 0, zz - TOWN['z1'] - 450)
            d = math.hypot(dx, dz)
            k = min(1, d / 1800)
            k = k * k * (3 - 2 * k)
            # And flat around the template used for every other country.
            da = math.hypot(x - ABROAD['x'], zz - ABROAD['z'])
            ka = min(1, max(0, (da - 900) / 2200))
            ka = ka * ka * (3 - 2 * ka)
            h = h * k * ka
            h = max(h, -6)  # valleys below the town would dip under the flat ground
            lo, hi = min(lo, h), max(hi, h)
            vals.append(h)
    arr = array.array('h', [max(-32768, min(32767, int(round(v * 4)))) for v in vals])
    if sys.byteorder != 'little':
        arr.byteswap()
    data = dict(x0=-R, z0=-R, step=st, w=cnt, h=cnt, scale=0.25, exaggerate=a.exaggerate, base=round(base, 1), b64=base64.b64encode(arr.tobytes()).decode())
    with open(a.out, 'w', encoding='utf-8') as f:
        f.write('// Generated by tools/bake_terrain.py from Mapzen Terrain Tiles (SRTM). Heights exaggerated x%s.\n' % a.exaggerate)
        f.write('window.AKYAR_TERRAIN=' + __import__('json').dumps(data, separators=(',', ':')) + ';\n')
    real = [e for e in (elev(x, zz) for x in range(-int(R), int(R), 1000) for zz in range(-int(R), int(R), 1000)) if e is not None]
    print(f'town elevation {base:.0f} m; real range in area {min(real):.0f}..{max(real):.0f} m; baked heights {lo:.0f}..{hi:.0f} m after x{a.exaggerate}; grid {cnt}x{cnt}; {os.path.getsize(a.out) // 1024} KB')


if __name__ == '__main__':
    main()
