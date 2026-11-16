#!/usr/bin/env python3
"""Bakes raw OpenStreetMap data into data/akyar.js. The game world is deliberately flat.

Usage (run from the project root):
    python -I tools/bake_map.py data_src data/akyar.js
    python -I tools/bake_map.py data_src data/akyar.js --home-way 777451118
    python -I tools/bake_map.py data_src data/akyar.js --home-lat 51.866 --home-lon 58.208

--home-way is the OpenStreetMap id of the real house; the default is Akmulla St 76.
The homestead lot is laid out around it, with its gate on the street.
--home-lat / --home-lon place it near a coordinate instead.
The airport is invented: it is placed on the most open land a few hundred metres from the homestead.

Map data (c) OpenStreetMap contributors, ODbL 1.0.
"""
import argparse, json, math, os, sys
import xml.etree.ElementTree as ET

LAT0, LON0 = 51.8725, 58.2325
BBOX = dict(minlat=51.845, minlon=58.195, maxlat=51.90, maxlon=58.27)
MX = 111320 * math.cos(math.radians(LAT0))
MZ = 110574.0
SITE = 34  # homestead side, in blocks


def project(lat, lon):
    return (lon - LON0) * MX, -(lat - LAT0) * MZ


BOUNDS = dict(
    x0=project(LAT0, BBOX['minlon'])[0], x1=project(LAT0, BBOX['maxlon'])[0],
    z0=project(BBOX['maxlat'], LON0)[1], z1=project(BBOX['minlat'], LON0)[1],
)


def area(pts):
    return abs(sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))) / 2


def centroid(pts):
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


def seg_dist(px, pz, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]
    l2 = dx * dx + dz * dz
    t = max(0, min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2)) if l2 else 0
    return math.hypot(px - a[0] - t * dx, pz - a[1] - t * dz)


def in_bounds(x, z, m=0):
    return BOUNDS['x0'] - m <= x <= BOUNDS['x1'] + m and BOUNDS['z0'] - m <= z <= BOUNDS['z1'] + m


def flat(pts):
    out = []
    for p in pts:
        out += [round(p[0], 1), round(p[1], 1)]
    return out


ROAD_W = dict(motorway=10, trunk=10, primary=10, secondary=9, tertiary=8, unclassified=6, residential=6,
              service=4, track=3, living_street=5, footway=2, path=2, pedestrian=3, cycleway=2, steps=2)
LANDUSE = dict(grass=0, forest=1, industrial=2, cemetery=3, steppe=4, wetland=5, pitch=6, parking=7, construction=8, playground=9)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--home-lat', type=float)
    ap.add_argument('--home-lon', type=float)
    ap.add_argument('--home-street', default='улица Акмуллы')
    ap.add_argument('--home-way', default='777451118')  # Akmulla St 76
    args = ap.parse_args()

    root = ET.parse(os.path.join(args.src, 'map.osm')).getroot()
    nodes = {n.get('id'): (float(n.get('lat')), float(n.get('lon'))) for n in root.findall('node')}

    roads, blds, rivers, waters, lu_polys, pois = [], [], [], [], [], []
    for el in root.findall('way'):
        tags = {t.get('k'): t.get('v') for t in el.findall('tag')}
        if not tags:
            continue
        pts = [project(*nodes[n.get('ref')]) for n in el.findall('nd') if n.get('ref') in nodes]
        if len(pts) < 2:
            continue
        closed = el.find('nd').get('ref') == el.findall('nd')[-1].get('ref')
        if closed:
            pts = pts[:-1]
        name = tags.get('name', '')
        if 'building' in tags and closed and len(pts) >= 3:
            cx, cz = centroid(pts)
            if in_bounds(cx, cz):
                try:
                    lv = int(float(tags.get('building:levels', 0)))
                except ValueError:
                    lv = 0
                blds.append(dict(id=el.get('id'), t=tags['building'], n=name, a=tags.get('amenity', ''), s=tags.get('shop', ''), l=lv, p=pts))
            continue
        if 'highway' in tags and tags['highway'] in ROAD_W:
            if any(in_bounds(x, z, 40) for x, z in pts):
                roads.append(dict(t=tags['highway'], n=name, s=tags.get('surface', ''), p=pts))
            continue
        if tags.get('waterway') in ('river', 'stream', 'canal', 'ditch'):
            if any(in_bounds(x, z, 150) for x, z in pts):
                rivers.append(dict(t=tags['waterway'], n=name, p=[p for p in pts if in_bounds(p[0], p[1], 400)]))
            continue
        if tags.get('natural') == 'water' and closed:
            waters.append(dict(n=name, p=pts))
            continue
        cls = None
        if tags.get('landuse') == 'forest' or tags.get('natural') == 'wood':
            cls = 'forest'
        elif tags.get('landuse') in ('industrial', 'garages'):
            cls = 'industrial'
        elif tags.get('landuse') == 'cemetery':
            cls = 'cemetery'
        elif tags.get('natural') == 'grassland':
            cls = 'steppe'
        elif tags.get('natural') == 'wetland':
            cls = 'wetland'
        elif tags.get('leisure') in ('pitch', 'track'):
            cls = 'pitch'
        elif tags.get('amenity') == 'parking':
            cls = 'parking'
        elif tags.get('landuse') == 'construction':
            cls = 'construction'
        elif tags.get('leisure') == 'playground':
            cls = 'playground'
        if cls and closed and len(pts) >= 3:
            lu_polys.append((LANDUSE[cls], pts))
    for el in root.findall('node'):
        tags = {t.get('k'): t.get('v') for t in el.findall('tag')}
        if tags.get('name') and ('amenity' in tags or 'shop' in tags or 'office' in tags):
            x, z = project(float(el.get('lat')), float(el.get('lon')))
            pois.append(dict(n=tags['name'], k=tags.get('amenity') or tags.get('shop') or 'office', x=round(x, 1), z=round(z, 1)))

    # ---------- landuse raster, 8 m cells ----------
    lstep = 8
    lx0, lz0 = math.floor(BOUNDS['x0']), math.floor(BOUNDS['z0'])
    lw, lh = int((BOUNDS['x1'] - lx0) // lstep) + 2, int((BOUNDS['z1'] - lz0) // lstep) + 2
    lgrid = bytearray(lw * lh)
    for cls, pts in sorted(lu_polys, key=lambda c: -area(c[1])):
        zs = [p[1] for p in pts]
        for j in range(max(0, int((min(zs) - lz0) // lstep)), min(lh, int((max(zs) - lz0) // lstep) + 2)):
            zc = lz0 + (j + .5) * lstep
            xs = []
            for i in range(len(pts)):
                a, b = pts[i], pts[(i + 1) % len(pts)]
                if (a[1] <= zc) != (b[1] <= zc):
                    xs.append(a[0] + (zc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]))
            xs.sort()
            for k in range(0, len(xs) - 1, 2):
                for i in range(max(0, int((xs[k] - lx0) / lstep)), min(lw, int((xs[k + 1] - lx0) / lstep) + 1)):
                    lgrid[i + j * lw] = cls
    rle, i = [], 0
    while i < len(lgrid):
        n = 1
        while i + n < len(lgrid) and lgrid[i + n] == lgrid[i]:
            n += 1
        rle += [lgrid[i], n]
        i += n

    # ---------- rivers + ponds ----------
    out_rivers = [dict(n=r['n'], w=14 if r['t'] == 'river' else 4, p=flat(r['p'])) for r in rivers if len(r['p']) >= 2]
    out_waters = [dict(n=wt['n'], p=flat(wt['p'])) for wt in waters]

    # ---------- buildings: classify ----------
    for b in blds:
        a_ = area(b['p'])
        b['area'] = a_
        t = b['t']
        if t in ('mosque', 'church'):
            k = t
        elif t in ('apartments', 'dormitory'):
            k = 'apartments'
        elif t in ('school', 'college', 'kindergarten', 'hospital', 'public') or b['a'] in ('school', 'college', 'hospital', 'townhall'):
            k = 'civic'
        elif t == 'retail' or b['s']:
            k = 'retail'
        elif t in ('industrial', 'garages'):
            k = 'industrial'
        elif t in ('roof', 'grandstand'):
            k = 'shed'
        elif a_ < 30:
            k = 'shed'
        elif a_ > 320:
            k = 'big'
        else:
            k = 'house'
        b['k'] = k

    # ---------- pick the shop and the workplace from real buildings ----------
    town = project(51.8651, 58.2202)

    def dist_to_any_road(px, pz, limit=1e9):
        best = limit
        for r in roads:
            p = r['p']
            for i in range(len(p) - 1):
                if abs(p[i][0] - px) > best + 60 and abs(p[i + 1][0] - px) > best + 60:
                    continue
                best = min(best, seg_dist(px, pz, p[i], p[i + 1]))
        return best

    shops = [b for b in blds if b['k'] == 'retail' and 180 <= b['area'] <= 1600 and dist_to_any_road(*centroid(b['p']), 80) < 70]
    shop = next((b for b in shops if b['n'] == 'Магнит'), None) or min(shops, key=lambda b: math.dist(centroid(b['p']), town))
    # The job is in the town centre: the closest unnamed commercial building, not next door to the shop.
    inds = [b for b in blds if b['k'] in ('retail', 'big', 'industrial') and not b['n'] and b is not shop and 180 <= b['area'] <= 1500
            and math.dist(centroid(b['p']), centroid(shop['p'])) >= 120 and dist_to_any_road(*centroid(b['p']), 80) < 70]

    def skew(b):
        # Degrees between the building's longest wall and the nearest map axis.
        p = b['p']
        e = max(((p[(i + 1) % len(p)][0] - p[i][0], p[(i + 1) % len(p)][1] - p[i][1]) for i in range(len(p))), key=lambda v: math.hypot(*v))
        a = abs(math.degrees(math.atan2(e[1], e[0]))) % 90
        return min(a, 90 - a)

    straight = [b for b in inds if skew(b) < 8] or inds
    work = min(straight, key=lambda b: math.dist(centroid(b['p']), town))
    shop['k'], work['k'] = 'shop', 'work'
    print(f"skew: shop {skew(shop):.0f} deg, depot {skew(work):.0f} deg")
    for b in (shop, work):
        xs, zs = [p[0] for p in b['p']], [p[1] for p in b['p']]
        b['p'] = [(min(xs), min(zs)), (max(xs), min(zs)), (max(xs), max(zs)), (min(xs), max(zs))]

    # ---------- homestead: free-ish square lot beside a riverside residential street ----------
    all_segs = []
    for r in roads:
        p = r['p']
        for i in range(len(p) - 1):
            all_segs.append((p[i], p[i + 1], ROAD_W[r['t']] / 2, r))
    river_segs = [(r['p'][i], r['p'][i + 1]) for r in rivers for i in range(len(r['p']) - 1)]
    half = SITE / 2

    def seg_near(s, cx, cz, m):
        return min(s[0][0], s[1][0]) - m < cx < max(s[0][0], s[1][0]) + m and min(s[0][1], s[1][1]) - m < cz < max(s[0][1], s[1][1]) + m

    def closest_on(seg, px, pz):
        a, b = seg[0], seg[1]
        dx, dz = b[0] - a[0], b[1] - a[1]
        l2 = dx * dx + dz * dz or 1
        t = max(0, min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2))
        return a[0] + t * dx, a[1] + t * dz

    # ---------- homestead: a lot laid out around the real house ----------
    LOT_W, LOT_D = 26, 56          # along the street, and back from it
    HOUSE_U, HOUSE_V = 7.5, 13.5   # centre of the planned house in lot coordinates
    GATE_U = 19.5                  # car gate
    best_score = 0
    if args.home_lat is not None:
        hc = project(args.home_lat, args.home_lon)
        home_b = None
    else:
        home_b = next((b for b in blds if b.get('id') == args.home_way), None)
        if home_b is None:
            sys.exit('no building with way id ' + str(args.home_way))
        hc = centroid(home_b['p'])
    street_segs = [s_ for s_ in all_segs if s_[3]['n'] == args.home_street and seg_near(s_, hc[0], hc[1], 200)]
    if not street_segs:
        street_segs = [s_ for s_ in all_segs if seg_near(s_, hc[0], hc[1], 150)]
    q, rs = min(((closest_on(s_, *hc), s_) for s_ in street_segs), key=lambda t: math.dist(t[0], hc))
    dx, dz = q[0] - hc[0], q[1] - hc[1]
    if abs(dx) > abs(dz):
        gate = 'w' if dx < 0 else 'e'
    else:
        gate = 'n' if dz < 0 else 's'
    edge = rs[2] + 1.5
    if gate == 'w':
        x_0, z_0 = q[0] + edge, hc[1] - LOT_W + HOUSE_U
    elif gate == 'e':
        x_0, z_0 = q[0] - edge - LOT_D, hc[1] - HOUSE_U
    elif gate == 'n':
        x_0, z_0 = hc[0] - HOUSE_U, q[1] + edge
    else:
        x_0, z_0 = hc[0] - LOT_W + HOUSE_U, q[1] - edge - LOT_D
    x_0, z_0 = round(x_0), round(z_0)
    if gate in 'ns':
        x_1, z_1 = x_0 + LOT_W, z_0 + LOT_D
    else:
        x_1, z_1 = x_0 + LOT_D, z_0 + LOT_W
    removed, kept = [], []
    for b in blds:
        cx, cz = centroid(b['p'])
        hit = (x_0 - 1 <= cx <= x_1 + 1 and z_0 - 1 <= cz <= z_1 + 1) or any(x_0 + 1 <= p[0] <= x_1 - 1 and z_0 + 1 <= p[1] <= z_1 - 1 for p in b['p'])
        (removed if hit else kept).append(b)
    blds = kept
    # Gate position in world coordinates, then a short drive to the street.
    gx, gz = {'w': (x_0, z_0 + LOT_W - GATE_U), 'e': (x_0 + LOT_D, z_0 + GATE_U), 'n': (x_0 + GATE_U, z_0), 's': (x_0 + LOT_W - GATE_U, z_0 + LOT_D)}[gate]
    drive_end = closest_on(rs, gx, gz)
    road_name = rs[3]['n']
    roads.append(dict(t='service', n='', s='dirt', p=[(gx, gz), drive_end]))

    # ---------- airport: invented, on the most open land a few hundred metres from home ----------
    AL, AW, MIN_D, MAX_D, CELL = 380, 96, 150, 500, 100
    grid = {}

    def grid_add(kind, x, z, weight):
        grid.setdefault((int(x // CELL), int(z // CELL)), []).append((kind, x, z, weight))

    for r in roads:
        p = r['p']
        big = r['t'] in ('secondary', 'tertiary', 'unclassified', 'residential')
        for i in range(len(p) - 1):
            n = max(1, int(math.dist(p[i], p[i + 1]) // 8))
            for k in range(n + 1):
                grid_add('road', p[i][0] + (p[i + 1][0] - p[i][0]) * k / n, p[i][1] + (p[i + 1][1] - p[i][1]) * k / n, 4000 if big else 300)
    for a, b in river_segs:
        n = max(1, int(math.dist(a, b) // 8))
        for k in range(n + 1):
            grid_add('water', a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, 1e8)
    for wt in waters:
        for p in wt['p']:
            grid_add('water', p[0], p[1], 1e8)
    for b in blds:
        c = centroid(b['p'])
        grid_add('building', c[0], c[1], 1e8 if b['k'] in ('shop', 'work') or b['n'] else b['area'] * 12)

    def rect_score(x0, z0, x1, z1):
        total = 0
        for gx in range(int((x0 - 30) // CELL), int((x1 + 30) // CELL) + 1):
            for gz in range(int((z0 - 30) // CELL), int((z1 + 30) // CELL) + 1):
                for kind, x, z, w_ in grid.get((gx, gz), ()):
                    m = 14 if kind == 'building' else 2
                    if x0 - m <= x <= x1 + m and z0 - m <= z <= z1 + m:
                        total += w_
        return total

    ap_best, ap_score = None, 1e18
    for x0 in range(int(x_0 - MAX_D - AL), int(x_1 + MAX_D), 20):
        for z0 in range(int(z_0 - MAX_D - AL), int(z_1 + MAX_D), 20):
            for w_, d_ in ((AL, AW), (AW, AL)):
                x1, z1 = x0 + w_, z0 + d_
                if not (in_bounds(x0, z0, -40) and in_bounds(x1, z1, -40)):
                    continue
                gap = math.hypot(max(x0 - x_1, x_0 - x1, 0), max(z0 - z_1, z_0 - z1, 0))
                if gap < MIN_D or gap > MAX_D:
                    continue
                sc = rect_score(x0, z0, x1, z1) + gap * 2
                if sc < ap_score:
                    ap_score, ap_best = sc, (x0, z0, x1, z1)
    if ap_best is None:
        sys.exit('could not find an airport site')
    ax0, az0, ax1, az1 = ap_best
    ap_gap = math.hypot(max(ax0 - x_1, x_0 - ax1, 0), max(az0 - z_1, z_0 - az1, 0))
    blds, ap_removed = [b for b in blds if not (ax0 - 14 <= centroid(b['p'])[0] <= ax1 + 14 and az0 - 14 <= centroid(b['p'])[1] <= az1 + 14)], [b for b in blds if ax0 - 14 <= centroid(b['p'])[0] <= ax1 + 14 and az0 - 14 <= centroid(b['p'])[1] <= az1 + 14]

    # Roads that ran across the site stop at its edge.
    inside = lambda q: ax0 - 2 <= q[0] <= ax1 + 2 and az0 - 2 <= q[1] <= az1 + 2
    new_roads = []
    for r in roads:
        run = []
        for q in r['p']:
            if inside(q):
                if len(run) >= 2:
                    new_roads.append(dict(r, p=run))
                run = []
            else:
                run.append(q)
        if len(run) >= 2:
            new_roads.append(dict(r, p=run))
    roads = new_roads

    # The terminal faces the long side nearest a proper road; a short access road links them.
    if AL == ax1 - ax0:
        sides = dict(n=((ax0 + ax1) / 2, az0), s=((ax0 + ax1) / 2, az1))
    else:
        sides = dict(w=(ax0, (az0 + az1) / 2), e=(ax1, (az0 + az1) / 2))
    good = [s_ for s_ in all_segs if s_[3]['t'] in ('secondary', 'tertiary', 'unclassified', 'residential', 'service') and not (inside(s_[0]) or inside(s_[1]))]
    ap_side, ap_end, ap_d = None, None, 1e9
    for side, (gx, gz) in sides.items():
        for s_ in good:
            q = closest_on(s_, gx, gz)
            outward = {'n': q[1] < gz, 's': q[1] > gz, 'w': q[0] < gx, 'e': q[0] > gx}[side]
            if outward and math.dist(q, (gx, gz)) < ap_d:
                ap_side, ap_end, ap_d = side, q, math.dist(q, (gx, gz))
    gx, gz = sides[ap_side]
    roads.append(dict(t='tertiary', n='Airport Road', s='asphalt', p=[(gx, gz), ap_end]))

    # ---------- bridges: roads crossing rivers (for key placement and the map) ----------
    bridges = []
    for r in roads:
        if r['t'] in ('secondary', 'tertiary', 'residential', 'unclassified', 'track'):
            p = r['p']
            for i in range(len(p) - 1):
                for a, b in river_segs:
                    d1 = (b[0] - a[0]) * (p[i][1] - a[1]) - (b[1] - a[1]) * (p[i][0] - a[0])
                    d2 = (b[0] - a[0]) * (p[i + 1][1] - a[1]) - (b[1] - a[1]) * (p[i + 1][0] - a[0])
                    d3 = (p[i + 1][0] - p[i][0]) * (a[1] - p[i][1]) - (p[i + 1][1] - p[i][1]) * (a[0] - p[i][0])
                    d4 = (p[i + 1][0] - p[i][0]) * (b[1] - p[i][1]) - (p[i + 1][1] - p[i][1]) * (b[0] - p[i][0])
                    if d1 * d2 < 0 and d3 * d4 < 0:
                        t = d1 / (d1 - d2)
                        bx, bz = p[i][0] + t * (p[i + 1][0] - p[i][0]), p[i][1] + t * (p[i + 1][1] - p[i][1])
                        if in_bounds(bx, bz, -20):
                            bridges.append(dict(x=round(bx, 1), z=round(bz, 1), n=r['n']))

    named = []
    for b in blds:
        if b['n']:
            cx, cz = centroid(b['p'])
            named.append(dict(n=b['n'], k=b['k'], x=round(cx, 1), z=round(cz, 1)))

    road_names = {}
    out_roads = []
    for r in roads:
        names = road_names.setdefault(r['n'], len(road_names))
        surface = r['s'] if r['s'] in ('asphalt', 'paved', 'concrete', 'unpaved', 'dirt', 'gravel', 'ground', 'compacted', 'sand') else ''
        out_roads.append([r['t'], names, surface, flat(r['p'])])

    data = dict(
        meta=dict(lat0=LAT0, lon0=LON0, bounds={k: round(v) for k, v in BOUNDS.items()},
                  attribution='Map data © OpenStreetMap contributors (ODbL).'),
        landuse=dict(x0=lx0, z0=lz0, step=lstep, w=lw, h=lh, rle=rle),
        roadNames=list(road_names.keys()),
        roads=out_roads,
        buildings=[dict(k=b['k'], n=b['n'], l=b['l'], p=flat(b['p'])) for b in blds],
        rivers=out_rivers,
        waters=out_waters,
        pois=pois,
        named=named,
        bridges=bridges,
        home=dict(x=x_0, z=z_0, w=LOT_W, d=LOT_D, gate=gate, street=road_name, way=args.home_way, number='76' if args.home_way == '777451118' else ''),
        airport=dict(x0=ax0, z0=az0, x1=ax1, z1=az1, side=ap_side),
    )
    os.makedirs(os.path.dirname(args.out) or '.', exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as f:
        f.write('// Generated by tools/bake_map.py. Map data (c) OpenStreetMap contributors, ODbL 1.0.\n')
        f.write('window.AKYAR=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')

    print(f'bounds {data["meta"]["bounds"]}')
    print(f'airport {data["airport"]} gap from home {ap_gap:.0f} m, access road {ap_d:.0f} m, score {ap_score:.0f}, removed {len(ap_removed)} buildings {[round(b["area"]) for b in ap_removed]}')
    print(f'buildings {len(blds)} (removed {len(removed)} for homestead: {[round(b["area"]) for b in removed]})  roads {len(out_roads)}  rivers {len(out_rivers)} ponds {len(out_waters)}  bridges {len(bridges)}')
    kinds = {}
    for b in blds:
        kinds[b['k']] = kinds.get(b['k'], 0) + 1
    print('kinds', kinds)
    print('landuse', lw, lh, 'rle', len(rle))
    print('home', data['home'], 'house area', round(home_b['area']) if home_b else '-', 'removed', [(b.get('id'), round(b['area'])) for b in removed])
    print('shop', shop['n'], round(shop['area']), [round(v) for v in centroid(shop['p'])])
    print('work', work['n'], round(work['area']), [round(v) for v in centroid(work['p'])])
    print('bridges', bridges[:6])
    print('size KB', os.path.getsize(args.out) // 1024)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
