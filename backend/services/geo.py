"""الحدود التقريبية للقطع — realistic approximate parcel boundaries.

There is no cadastral polygon for these assets: a Saudi deed records boundary
lengths, not coordinates, and the recorded coordinates are district centroids.
A bare location pin misrepresents that even less usefully than a footprint, so
this module draws the most honest boundary it can:

  * the correct AREA — from the recorded m²,
  * a plausible SHAPE — a slightly irregular quadrilateral with a 1:1.3–1:1.8
    aspect, the way subdivision plots are actually cut,
  * a real ORIENTATION — aligned to the nearest street from OpenStreetMap and
    set beside it, because plots face roads. When no road is reachable the
    bearing falls back to a deterministic value.

Every polygon is stored with `parcel_source` so the UI can say "محاذاة لشارع
من OSM" or "اتجاه افتراضي" — it is never presented as a surveyed boundary.
"""
import hashlib
import json
import math
import urllib.parse
import urllib.request

M_PER_DEG_LAT = 111_320.0
OVERPASS = "https://overpass-api.de/api/interpreter"


def _seed(s):
    return int(hashlib.sha256(str(s).encode()).hexdigest()[:8], 16)


def _bearing(a, b):
    """Bearing in radians of segment a→b, a/b as (lat, lon)."""
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return math.atan2(x, y)


def _project(lat, lon):
    return lat * M_PER_DEG_LAT, lon * M_PER_DEG_LAT * math.cos(math.radians(lat))


def nearest_street_bearings(points, radius_m=220, timeout=35, chunk=40):
    """Chunked wrapper — a few hundred `around` clauses in one query is what
    gets a request rejected by Overpass; forty at a time is comfortably inside."""
    out = {}
    for start in range(0, len(points), chunk):
        part = _nearest_street_bearings(points[start:start + chunk], radius_m, timeout)
        out.update({start + i: v for i, v in part.items()})
    return out


def _nearest_street_bearings(points, radius_m=220, timeout=35):
    """One batched Overpass query → {index: (bearing_rad, offset_lat, offset_lon)}.

    Returns, per point, the bearing of the closest highway segment and the
    perpendicular offset that moves the parcel to sit beside that segment.
    Any failure (offline, rate-limit, nothing nearby) simply yields nothing for
    that point and the caller falls back — a demo must never fail to seed
    because a third-party API was slow.
    """
    if not points:
        return {}
    clauses = "".join(f'way["highway"](around:{radius_m},{lat:.5f},{lon:.5f});' for lat, lon in points)
    query = f"[out:json][timeout:{timeout}];({clauses});out geom;"
    try:
        req = urllib.request.Request(OVERPASS, data=urllib.parse.urlencode({"data": query}).encode(),
                                     headers={"User-Agent": "mazad-plus-demo/1.0"})
        with urllib.request.urlopen(req, timeout=timeout + 10) as r:
            ways = json.load(r).get("elements", [])
    except Exception:
        return {}

    out = {}
    for idx, (lat, lon) in enumerate(points):
        py, px = _project(lat, lon)
        best = None
        for w in ways:
            geom = w.get("geometry") or []
            for a, b in zip(geom, geom[1:]):
                ay, ax = _project(a["lat"], a["lon"]); by, bx = _project(b["lat"], b["lon"])
                vx, vy = bx - ax, by - ay
                L2 = vx * vx + vy * vy
                if L2 == 0:
                    continue
                t = max(0.0, min(1.0, ((px - ax) * vx + (py - ay) * vy) / L2))
                cx, cy = ax + t * vx, ay + t * vy
                d = math.hypot(px - cx, py - cy)
                if best is None or d < best[0]:
                    best = (d, (a["lat"], a["lon"]), (b["lat"], b["lon"]), cy, cx)
        if best and best[0] <= radius_m:
            d, a, b, cy, cx = best
            out[idx] = (_bearing(a, b), cy, cx, d)
    return out


def parcel_polygon(lat, lon, area_sqm, seed, bearing=None, road_point=None):
    """Return a list of [lat, lon] corners (closed ring not required)."""
    if not (lat and lon and area_sqm):
        return None
    r = _seed(seed)
    aspect = 1.3 + (r % 50) / 100.0                       # 1.30 … 1.79
    depth = math.sqrt(area_sqm * aspect)                   # metres, away from the road
    width = area_sqm / depth                               # metres, along the road
    theta = bearing if bearing is not None else math.radians((r % 180))

    # unit vectors: u along the road, v perpendicular (into the block)
    ux, uy = math.sin(theta), math.cos(theta)              # x east, y north
    vx, vy = -uy, ux
    cy, cx = _project(lat, lon)
    if road_point is not None:
        # sit the plot beside the road: front edge 6 m from the centreline
        ry, rx = road_point
        side = 1 if ((cx - rx) * vx + (cy - ry) * vy) >= 0 else -1
        vx, vy = vx * side, vy * side
        cx, cy = rx + vx * (6 + depth / 2), ry + vy * (6 + depth / 2)

    hw, hd = width / 2, depth / 2
    corners = [(-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd)]
    jit = lambda k: 1 + (((r >> (k * 3)) % 13) - 6) / 100.0   # ±6 % per vertex
    ring = []
    for k, (a, b) in enumerate(corners):
        a, b = a * jit(k), b * jit(k + 1)
        x = cx + a * ux + b * vx
        y = cy + a * uy + b * vy
        ring.append([round(y / M_PER_DEG_LAT, 6),
                     round(x / (M_PER_DEG_LAT * math.cos(math.radians(lat))), 6)])
    return ring


def attach_parcels(props, time_budget_s=150):
    """Compute and store a boundary on every located property.

    Street alignment is best-effort under a time budget: with ~1,500 parcels the
    Overpass calls would take many minutes and risk a rate-limit, and a demo
    must seed reliably. Assets aligned within the budget say so; the rest get
    a deterministic default bearing and say that instead.
    """
    import time
    located = [p for p in props if p.lat and p.lng and p.area_sqm]
    bearings, start, chunk = {}, time.time(), 40
    for i0 in range(0, len(located), chunk):
        if time.time() - start > time_budget_s:
            break
        part = _nearest_street_bearings([(p.lat, p.lng) for p in located[i0:i0 + chunk]], 220, 35)
        bearings.update({i0 + i: v for i, v in part.items()})
    aligned = 0
    for i, p in enumerate(located):
        hit = bearings.get(i)
        if hit:
            theta, cy, cx, dist = hit
            p.parcel = parcel_polygon(p.lat, p.lng, p.area_sqm, p.ref, bearing=theta, road_point=(cy, cx))
            p.parcel_source = f"محاذاة لأقرب شارع في OpenStreetMap ({dist:.0f} م)"
            aligned += 1
        else:
            p.parcel = parcel_polygon(p.lat, p.lng, p.area_sqm, p.ref)
            p.parcel_source = "اتجاه افتراضي — لا شارع قريب في OSM"
        # recentre the marker on the plot it now describes
        if p.parcel:
            p.lat = round(sum(c[0] for c in p.parcel) / 4, 6)
            p.lng = round(sum(c[1] for c in p.parcel) / 4, 6)
    return len(located), aligned
