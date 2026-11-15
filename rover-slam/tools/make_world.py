#!/usr/bin/env python3
"""Build a Gazebo world from a real lunar south-pole DEM patch.

Crops a 512 m x 512 m window from the LOLA 5 m/px Site04 DEM (inside the
Artemis III candidate region "Connecting Ridge"), upsamples it to 1 m/px and
adds robot-scale detail (small craters, fractal roughness, rocks) so camera
features and LiDAR returns exist at the scale a rover sees. Real terrain, real
low-angle sun; small-scale detail is synthetic (no real data exists at that
scale).

Outputs (relative to the demo root):
  models/lunar_patch/materials/textures/{heightmap.png,regolith_diffuse.png,regolith_normal.png}
  worlds/south_pole.sdf
  config/terrain_meta.json   (size, z range, sun, spawn, waypoints)
  preview/terrain_preview.png
  config/rocks.csv           (rock positions/sizes - lets the meshes be rebuilt without the DEM)

Meshes (models/lunar_patch/meshes/*.obj, ~63 MB) are generated files and are not kept in git:
  make_world.py --from-assets   rebuilds them in seconds from heightmap.png + rocks.csv
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
N = 513                # heightmap pixels (2^n + 1, required by Gazebo)
SIZE = 512.0           # metres -> 1 m / pixel
RES = SIZE / (N - 1)
ROCK_SHAPE_SEED = 1007  # rock outlines: own generator, so --from-assets rebuilds identical rocks
ROCKS_CSV = ROOT / "config/rocks.csv"
MODEL = ROOT / "models/lunar_patch"


def fractal_noise(n: int, rng: np.random.Generator, octaves=6, persistence=0.5) -> np.ndarray:
    out = np.zeros((n, n))
    amp, total = 1.0, 0.0
    for o in range(octaves):
        cells = 4 * 2 ** o
        coarse = rng.standard_normal((cells + 1, cells + 1))
        out += amp * ndimage.zoom(coarse, n / (cells + 1), order=3)[:n, :n]
        total += amp
        amp *= persistence
    return out / total


def add_craters(z: np.ndarray, rng: np.random.Generator, count: int) -> None:
    n = z.shape[0]
    yy, xx = np.mgrid[0:n, 0:n] * RES
    # power-law sizes: many small, few large (radius in m)
    radii = np.clip(1.5 * (1 - rng.random(count)) ** (-1 / 1.6), 1.5, 22.0)
    for r in radii:
        cx, cy = rng.uniform(0, SIZE, 2)
        d = np.hypot(xx - cx, yy - cy) / r
        m = d < 1.6
        if not m.any():
            continue
        depth = 0.18 * r
        bowl = np.where(d < 1.0, -depth * (1 - d ** 2), 0.0)
        rim = 0.25 * depth * np.exp(-((d - 1.0) / 0.22) ** 2)
        z[m] += (bowl + rim)[m]


def shadow_mask(z: np.ndarray, sun_az_deg: float, sun_el_deg: float, max_dist=400.0) -> np.ndarray:
    """True where terrain blocks the sun (map frame: +x east/right, +y north/up in image)."""
    az = np.radians(sun_az_deg)
    dx, dy = np.sin(az), np.cos(az)       # direction towards the sun
    tan_el = np.tan(np.radians(sun_el_deg))
    n = z.shape[0]
    rows, cols = np.mgrid[0:n, 0:n]
    shadow = np.zeros_like(z, dtype=bool)
    for d in np.arange(RES, max_dist, RES):
        c = np.rint(cols + dx * d / RES).astype(int)
        r = np.rint(rows - dy * d / RES).astype(int)
        inside = (c >= 0) & (c < n) & (r >= 0) & (r < n)
        zz = z[np.clip(r, 0, n - 1), np.clip(c, 0, n - 1)]
        shadow |= inside & (zz > z + d * tan_el)
    return shadow


def make_textures(tex_dir: Path, rng: np.random.Generator) -> None:
    t = 1024
    base = fractal_noise(t, rng, octaves=8, persistence=0.62)
    base = (base - base.min()) / (base.max() - base.min())
    speck = rng.random((t, t))
    img = 0.48 + 0.30 * (base - 0.5) + 0.10 * (speck - 0.5)
    # pebbles: small dark/bright blobs give ORB corners
    for _ in range(2500):
        x, y = rng.integers(0, t, 2)
        rad = rng.integers(2, 7)
        shade = rng.choice([-0.22, 0.18])
        ys, xs = np.ogrid[-y:t - y, -x:t - x]
        img[xs * xs + ys * ys <= rad * rad] += shade
    img = np.clip(img, 0, 1)
    Image.fromarray((img * 255).astype(np.uint8)).convert("RGB").save(tex_dir / "regolith_diffuse.png")
    normal = np.zeros((t, t, 3), dtype=np.uint8)
    normal[..., 0] = normal[..., 1] = 128
    normal[..., 2] = 255
    Image.fromarray(normal).save(tex_dir / "regolith_normal.png")


def write_terrain_obj(z: np.ndarray, mesh_dir: Path, tex_size: float = 6.0) -> None:
    """Static triangle mesh of the terrain (no LOD, so cameras and GPU LiDAR see fixed geometry)."""
    n = z.shape[0]
    rows, cols = np.mgrid[0:n, 0:n]
    x = cols * RES - SIZE / 2
    y = SIZE / 2 - rows * RES
    gy, gx = np.gradient(z, RES)
    nrm = np.dstack([-gx, gy, np.ones_like(z)])            # +y is up the image -> flip row gradient
    nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
    v = np.c_[x.ravel(), y.ravel(), z.ravel()]
    vt = np.c_[x.ravel() / tex_size, y.ravel() / tex_size]
    vn = nrm.reshape(-1, 3)
    idx = (rows * n + cols)[:-1, :-1].ravel() + 1           # OBJ is 1-based
    a, b, c, d = idx, idx + 1, idx + n, idx + n + 1          # a-b top edge, c-d next row
    # counter-clockwise seen from above (+z): a, c, b and b, c, d
    tris = np.r_[np.c_[a, c, b], np.c_[b, c, d]]
    mesh_dir.mkdir(parents=True, exist_ok=True)
    (mesh_dir / "terrain.mtl").write_text(
        "newmtl regolith\nKa 1 1 1\nKd 1 1 1\nKs 0.02 0.02 0.02\nNs 5\nmap_Kd ../materials/textures/regolith_diffuse.png\n")
    with open(mesh_dir / "terrain.obj", "w") as f:
        f.write("mtllib terrain.mtl\no terrain\n")
        np.savetxt(f, v, fmt="v %.3f %.3f %.3f")
        np.savetxt(f, vt, fmt="vt %.4f %.4f")
        np.savetxt(f, vn, fmt="vn %.4f %.4f %.4f")
        f.write("usemtl regolith\ns 1\n")
        np.savetxt(f, np.repeat(tris, 3, axis=1), fmt="f %d/%d/%d %d/%d/%d %d/%d/%d")


def _icosphere(subdiv: int = 1):
    t = (1 + 5 ** 0.5) / 2
    v = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
         (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    f = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6),
         (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10),
         (8, 6, 7), (9, 8, 1)]
    v = [np.array(p, float) / np.linalg.norm(p) for p in v]
    for _ in range(subdiv):
        cache, nf = {}, []
        def mid(a, b):
            k = (min(a, b), max(a, b))
            if k not in cache:
                m = (v[a] + v[b]) / 2
                v.append(m / np.linalg.norm(m))
                cache[k] = len(v) - 1
            return cache[k]
        for a, b, c in f:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            nf += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        f = nf
    return np.array(v), np.array(f)


def write_rock_field(rocks, mesh_dir: Path) -> None:
    """All rocks as one static mesh (fast to render; seen by camera and GPU LiDAR)."""
    rng = np.random.default_rng(ROCK_SHAPE_SEED)
    base_v, base_f = _icosphere(1)                      # 42 vertices, 80 faces
    V, F = [], []
    for k, (x, y, z, a, b, c, yaw) in enumerate(rocks):
        bump = 1 + 0.28 * rng.standard_normal(len(base_v))   # irregular, angular-ish
        p = base_v * bump[:, None] * [a, b, c]
        cy, sy = np.cos(yaw), np.sin(yaw)
        p = p @ np.array([[cy, -sy, 0], [sy, cy, 0], [0, 0, 1]]).T + [x, y, z]
        V.append(p)
        F.append(base_f + k * len(base_v) + 1)
    V, F = np.vstack(V), np.vstack(F)
    mesh_dir.mkdir(parents=True, exist_ok=True)
    (mesh_dir / "rocks.mtl").write_text("newmtl rock\nKa 0.4 0.4 0.4\nKd 0.42 0.41 0.4\nKs 0.02 0.02 0.02\nNs 4\n")
    with open(mesh_dir / "rocks.obj", "w") as f:
        f.write("mtllib rocks.mtl\no rocks\nusemtl rock\n")
        np.savetxt(f, V, fmt="v %.3f %.3f %.3f")
        np.savetxt(f, F, fmt="f %d %d %d")


def save_rocks(rocks) -> None:
    np.savetxt(ROCKS_CSV, np.asarray(rocks), fmt="%.4f", delimiter=",", header="x,y,z,a,b,c,yaw (m, m, m, m, m, m, rad)")


def build_meshes_from_assets() -> None:
    """Rebuild terrain.obj + rocks.obj from the stored heightmap, terrain_meta.json and rocks.csv."""
    meta = json.loads((ROOT / "config/terrain_meta.json").read_text())
    hm = np.asarray(Image.open(MODEL / "materials/textures/heightmap.png"), dtype=np.float64)
    if hm.shape != (N, N):
        raise SystemExit(f"heightmap is {hm.shape}, expected {(N, N)}")
    write_terrain_obj(hm / 65535 * meta["z_range_m"], MODEL / "meshes")
    rocks = np.loadtxt(ROCKS_CSV, delimiter=",", ndmin=2)
    write_rock_field(rocks.tolist(), MODEL / "meshes")
    print(f"meshes rebuilt: terrain {N}x{N} grid, {len(rocks)} rocks -> {MODEL / 'meshes'}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-assets", action="store_true",
                    help="only rebuild the meshes from stored heightmap.png + rocks.csv (no DEM needed)")
    ap.add_argument("--dem", default=str(Path.home() / "artemis-psr-nav/data/raw/Site04_final_adj_5mpp_surf.tif"))
    ap.add_argument("--cx", type=float, default=-4490.0, help="patch centre x (polar stereographic, m)")
    ap.add_argument("--cy", type=float, default=-13410.0, help="patch centre y (m)")
    ap.add_argument("--sun-az", type=float, default=None, help="sun azimuth deg (from +y, clockwise); auto if unset")
    ap.add_argument("--sun-el", type=float, default=3.0)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--rocks", type=int, default=5000)
    # defaults: a flat sunlit start and a drivable spot ~30 m deep inside the ridge shadow
    ap.add_argument("--start", default="105,150", help="'x,y' sunlit start (m); empty = auto")
    ap.add_argument("--target", default="-6,146", help="'x,y' point inside the shadow (m); empty = auto")
    args = ap.parse_args()
    if args.from_assets:
        build_meshes_from_assets()
        return
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.windows import from_bounds
    rng = np.random.default_rng(args.seed)

    h = SIZE / 2
    with rasterio.open(args.dem) as src:
        win = from_bounds(args.cx - h, args.cy - h, args.cx + h, args.cy + h, src.transform)
        z = src.read(1, window=win, out_shape=(N, N), resampling=Resampling.cubic).astype(np.float64)
    if np.isnan(z).any():
        raise SystemExit("DEM patch contains no-data; choose another centre")

    z += 0.35 * fractal_noise(N, rng)            # metre-scale roughness
    add_craters(z, rng, count=260)
    z = ndimage.gaussian_filter(z, 0.6)

    zmin = float(z.min())
    zrange = float(z.max() - zmin)
    hm = np.round((z - zmin) / zrange * 65535).astype(np.uint16)

    # sun direction: pick the azimuth that gives a large shadow near the centre
    if args.sun_az is None:
        best = None
        for az in range(0, 360, 15):
            s = shadow_mask(z, az, args.sun_el)
            core = s[128:385, 128:385].mean()
            score = -abs(core - 0.40)
            if best is None or score > best[0]:
                best = (score, az, core)
        sun_az = float(best[1])
    else:
        sun_az = args.sun_az
    shadow = shadow_mask(z, sun_az, args.sun_el)
    print(f"sun az={sun_az:.0f} el={args.sun_el:.1f}  shadowed: whole {shadow.mean():.0%}, centre {shadow[128:385,128:385].mean():.0%}")

    # --- traverse: start lit, drive into the largest central shadow, loop, return
    gy, gx = np.gradient(z, RES)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    smooth_slope = ndimage.maximum_filter(slope, 5)
    lab, nlab = ndimage.label(shadow & (smooth_slope < 14))
    sizes = ndimage.sum(np.ones_like(lab), lab, index=np.arange(1, nlab + 1))
    rr, cc = np.mgrid[0:N, 0:N]
    centre_pref = sizes * 0
    for k in range(nlab):
        m = lab == k + 1
        dist = np.hypot(rr[m].mean() - N / 2, cc[m].mean() - N / 2)
        centre_pref[k] = sizes[k] / (1 + dist / 60)
    k = int(np.argmax(centre_pref)) + 1
    dark = lab == k
    central = np.zeros_like(dark)
    central[106:407, 106:407] = True                                  # keep the drive inside +-150 m
    dist_in = ndimage.distance_transform_edt(dark)
    # a point well inside the shadow (>= 20 m from lit ground), close to the patch centre
    inner = central & (dist_in >= min(20, dist_in[central].max()))
    ir, ic = np.nonzero(inner)
    j = np.argmin(np.hypot(ir - N / 2, ic - N / 2))
    tr, tc = int(ir[j]), int(ic[j])
    lit_ok = (~shadow) & (smooth_slope < 12) & central
    dist_lit = ndimage.distance_transform_edt(~dark)
    cand = lit_ok & (dist_lit > 30) & (dist_lit < 60)
    cr, ccol = np.nonzero(cand)
    j = np.argmin(np.hypot(cr - tr, ccol - tc))
    sr, sc = int(cr[j]), int(ccol[j])

    def to_world(r, c):
        return float(c * RES - SIZE / 2), float(SIZE / 2 - r * RES)

    def height_at(x, y):
        c = (x + SIZE / 2) / RES
        r = (SIZE / 2 - y) / RES
        return float(ndimage.map_coordinates(z - zmin, [[r], [c]], order=1)[0])

    sx, sy = to_world(sr, sc)
    tx, ty = to_world(tr, tc)
    if args.start:
        sx, sy = map(float, args.start.split(","))
    if args.target:
        tx, ty = map(float, args.target.split(","))
    def rc(x, y):
        return int(round((SIZE / 2 - y) / RES)), int(round((x + SIZE / 2) / RES))
    print(f"start ({sx:.0f},{sy:.0f}) shadow={bool(shadow[rc(sx, sy)])}  target ({tx:.0f},{ty:.0f}) shadow={bool(shadow[rc(tx, ty)])}")
    vx, vy = tx - sx, ty - sy
    L = np.hypot(vx, vy)
    ux, uy = vx / L, vy / L
    px, py = -uy, ux
    loop_r = 12.0
    waypoints = [(sx + ux * 8, sy + uy * 8)]
    for f in (0.35, 0.7):
        waypoints.append((sx + vx * f, sy + vy * f))
    for ang in np.linspace(0, 2 * np.pi, 9)[:-1]:
        waypoints.append((tx - ux * loop_r * np.cos(ang) + px * loop_r * np.sin(ang),
                          ty - uy * loop_r * np.cos(ang) + py * loop_r * np.sin(ang)))
    for f in (0.6, 0.3, 0.05):
        waypoints.append((sx + vx * f + px * 4, sy + vy * f + py * 4))
    waypoints.append((sx + ux * 2, sy + uy * 2))
    yaw0 = float(np.arctan2(uy, ux))

    # --- textures + heightmap files
    model = MODEL
    tex = model / "materials/textures"
    tex.mkdir(parents=True, exist_ok=True)
    Image.fromarray(hm).save(tex / "heightmap.png")
    make_textures(tex, rng)
    # mesh uses the same quantised heights as the collision heightmap so wheels and sensors agree
    write_terrain_obj(hm.astype(np.float64) / 65535 * zrange, model / "meshes")

    # --- rocks: denser along the traverse so the camera always sees some
    rocks = []
    path_pts = np.array([(sx, sy)] + waypoints)
    seg = []
    for a, b in zip(path_pts[:-1], path_pts[1:]):
        for t in np.linspace(0, 1, 12):
            seg.append(a + (b - a) * t)
    seg = np.array(seg)
    tries = 0
    while len(rocks) < args.rocks and tries < 200000:
        tries += 1
        if rng.random() < 0.85:                       # dense rock field around the traverse
            p = seg[rng.integers(len(seg))] + rng.normal(0, 22, 2)
        else:
            p = rng.uniform(-SIZE / 2 + 5, SIZE / 2 - 5, 2)
        if np.abs(p).max() > SIZE / 2 - 2 or np.min(np.hypot(*(seg - p).T)) < 2.5:   # keep drive line clear
            continue
        size = float(np.clip(0.08 * (1 - rng.random()) ** (-1 / 1.7), 0.08, 1.4))  # many small, few boulders
        a, b, c = size, size * rng.uniform(0.6, 1.0), size * rng.uniform(0.4, 0.75)
        rocks.append((p[0], p[1], height_at(*p) + 0.15 * c, a, b, c, rng.uniform(0, 6.28)))
    (ROOT / "config").mkdir(exist_ok=True)
    save_rocks(rocks)
    # build from the saved (rounded) values, so --from-assets reproduces this mesh exactly
    write_rock_field(np.loadtxt(ROCKS_CSV, delimiter=",", ndmin=2).tolist(), model / "meshes")
    rocks_xml = """
    <model name="rock_field"><static>true</static>
      <link name="link"><visual name="visual"><geometry><mesh>
        <uri>model://lunar_patch/meshes/rocks.obj</uri></mesh></geometry></visual></link>
    </model>"""

    # --- sun light: gazebo direction = vector the light travels (from sun to ground)
    az, el = np.radians(sun_az), np.radians(args.sun_el)
    to_sun = np.array([np.sin(az) * np.cos(el), np.cos(az) * np.cos(el), np.sin(el)])
    d = -to_sun
    world = f"""<?xml version="1.0"?>
<sdf version="1.9">
  <world name="south_pole">
    <physics name="4ms" type="ignored"><max_step_size>0.004</max_step_size><real_time_factor>1.0</real_time_factor></physics>
    <gravity>0 0 -1.62</gravity>
    <plugin filename="gz-sim-physics-system" name="gz::sim::systems::Physics"/>
    <plugin filename="gz-sim-user-commands-system" name="gz::sim::systems::UserCommands"/>
    <plugin filename="gz-sim-scene-broadcaster-system" name="gz::sim::systems::SceneBroadcaster"/>
    <plugin filename="gz-sim-sensors-system" name="gz::sim::systems::Sensors"><render_engine>ogre2</render_engine></plugin>
    <plugin filename="gz-sim-imu-system" name="gz::sim::systems::Imu"/>
    <scene>
      <ambient>0.015 0.015 0.018 1</ambient>
      <background>0 0 0 1</background>
      <grid>false</grid>
      <shadows>true</shadows>
    </scene>
    <light type="directional" name="sun">
      <cast_shadows>true</cast_shadows>
      <pose>0 0 200 0 0 0</pose>
      <diffuse>1.0 0.98 0.95 1</diffuse>
      <specular>0.2 0.2 0.2 1</specular>
      <intensity>2.0</intensity>
      <direction>{d[0]:.4f} {d[1]:.4f} {d[2]:.4f}</direction>
    </light>
    <model name="lunar_patch"><static>true</static>
      <link name="link">
        <collision name="collision"><geometry><heightmap>
          <uri>model://lunar_patch/materials/textures/heightmap.png</uri>
          <size>{SIZE} {SIZE} {zrange:.3f}</size><pos>0 0 0</pos>
        </heightmap></geometry></collision>
        <visual name="visual"><geometry><mesh>
          <uri>model://lunar_patch/meshes/terrain.obj</uri>
        </mesh></geometry></visual>
      </link>
    </model>{rocks_xml}
  </world>
</sdf>
"""
    (ROOT / "worlds").mkdir(exist_ok=True)
    (ROOT / "worlds/south_pole.sdf").write_text(world)
    (model / "model.config").write_text(
        "<?xml version='1.0'?><model><name>lunar_patch</name><version>1.0</version>"
        "<sdf version='1.9'>model.sdf</sdf><description>LOLA Site04 crop, Connecting Ridge</description></model>")
    (model / "model.sdf").write_text("<?xml version='1.0'?><sdf version='1.9'><model name='lunar_patch'><static>true</static><link name='l'/></model></sdf>")

    meta = {
        "source_dem": Path(args.dem).name, "centre_xy_m": [args.cx, args.cy], "region": "Connecting Ridge (Artemis III candidate)",
        "size_m": SIZE, "z_range_m": zrange, "z_min_elev_m": zmin,
        "sun_az_deg": sun_az, "sun_el_deg": args.sun_el,
        "spawn": {"x": sx, "y": sy, "z": height_at(sx, sy) + 0.6, "yaw": yaw0},
        "waypoints": [[float(x), float(y)] for x, y in waypoints],
        "shadow_target": [tx, ty], "rocks": len(rocks),
    }
    (ROOT / "config").mkdir(exist_ok=True)
    (ROOT / "config/terrain_meta.json").write_text(json.dumps(meta, indent=2))
    # lighting map (255 = in shadow), same grid as the heightmap: row 0 = +y edge, col 0 = -x edge
    Image.fromarray((shadow * 255).astype(np.uint8)).save(ROOT / "config/shadow_mask.png")

    # --- preview: hillshade + shadow + path
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    ls = matplotlib.colors.LightSource(azdeg=315, altdeg=35)
    fig, ax = plt.subplots(figsize=(8, 8))
    ext = [-SIZE / 2, SIZE / 2, -SIZE / 2, SIZE / 2]
    ax.imshow(ls.hillshade(z, vert_exag=2, dx=RES, dy=RES), cmap="gray", extent=ext)
    ax.imshow(np.ma.masked_where(~shadow, shadow), cmap="Blues", alpha=0.55, extent=ext, vmin=0, vmax=1.4)
    wp = np.array([(sx, sy)] + waypoints)
    ax.plot(wp[:, 0], wp[:, 1], "-o", color="orange", ms=3, lw=1.5, label="robot traverse")
    ax.plot(sx, sy, "g*", ms=16, label="start (sunlit)")
    ax.set_title(f"Connecting Ridge patch 512 m (LOLA 5 m + synthetic detail)\nblue = in shadow at sun az {sun_az:.0f}°, el {args.sun_el}°")
    ax.legend(loc="lower right")
    (ROOT / "preview").mkdir(exist_ok=True)
    fig.savefig(ROOT / "preview/terrain_preview.png", dpi=110, bbox_inches="tight")
    print(json.dumps({k: meta[k] for k in ("z_range_m", "sun_az_deg", "spawn", "rocks")}, indent=1))


if __name__ == "__main__":
    main()
