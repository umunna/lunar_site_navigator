import numpy as np

import make_world as mw


def test_terrain_obj_counts(tmp_path):
    n = 5
    mw.write_terrain_obj(np.zeros((n, n)), tmp_path)
    lines = (tmp_path / "terrain.obj").read_text().splitlines()
    assert sum(ln.startswith("v ") for ln in lines) == n * n
    assert sum(ln.startswith("f ") for ln in lines) == 2 * (n - 1) ** 2


def test_rock_field_is_deterministic(tmp_path):
    rocks = [(0, 0, 0, 0.3, 0.2, 0.1, 0.5), (5, 5, 1, 1.0, 0.8, 0.6, 2.0)]
    a, b = tmp_path / "a", tmp_path / "b"
    mw.write_rock_field(rocks, a)
    mw.write_rock_field(rocks, b)
    assert (a / "rocks.obj").read_bytes() == (b / "rocks.obj").read_bytes()
    faces = [ln for ln in (a / "rocks.obj").read_text().splitlines() if ln.startswith("f ")]
    assert len(faces) == 2 * 80                                    # icosphere(1) = 80 faces per rock
