import numpy as np

from voxel_map import VoxelMap


def _pts(n, seed=0, scale=50.0):
    rng = np.random.default_rng(seed)
    return (rng.random((n, 3)) * scale - scale / 2).astype(np.float32)


def test_insert_dedupes_per_voxel():
    m = VoxelMap(1.0)
    xyz = np.array([[0.1, 0.1, 0.1], [0.9, 0.9, 0.9], [1.5, 0.0, 0.0]], np.float32)
    m.insert(xyz, np.zeros((3, 3), np.uint8), np.zeros(3, bool))
    assert m.n == 2
    m.insert(xyz, np.zeros((3, 3), np.uint8), np.zeros(3, bool))   # same voxels again
    assert m.n == 2


def test_camera_colour_overrides_lidar_colour():
    m = VoxelMap(1.0)
    p = np.array([[0.5, 0.5, 0.5]], np.float32)
    m.insert(p, np.array([[10, 10, 10]], np.uint8), np.array([False]))
    v = m.version
    m.insert(p, np.array([[200, 100, 50]], np.uint8), np.array([True]))
    _, rgb, cam = m.arrays()
    assert rgb[0].tolist() == [200, 100, 50] and cam[0]
    assert m.version > v


def test_growth_keeps_data():
    m = VoxelMap(0.1)
    a = _pts(70000, 1)
    m.insert(a, np.zeros((len(a), 3), np.uint8), np.zeros(len(a), bool))
    n1 = m.n
    b = _pts(70000, 2)
    m.insert(b, np.zeros((len(b), 3), np.uint8), np.zeros(len(b), bool))
    xyz, _, _ = m.arrays()
    assert m.n > n1 and len(xyz) == m.n and np.isfinite(xyz).all()


def test_display_is_capped_and_cached():
    m = VoxelMap(0.25)
    a = _pts(200000, 3, scale=200.0)
    m.insert(a, np.zeros((len(a), 3), np.uint8), np.zeros(len(a), bool))
    xyz, rgb = m.display(0.5, 20000)
    assert 0 < len(xyz) <= 20000 and len(xyz) == len(rgb)
    assert m.display(0.5, 20000)[0] is xyz                # unchanged map -> cached object
    m.insert(np.array([[500, 500, 500]], np.float32), np.zeros((1, 3), np.uint8), np.zeros(1, bool))
    assert m.display(0.5, 20000)[0] is not xyz            # map changed -> recomputed


def test_display_prefers_camera_coloured_points():
    m = VoxelMap(0.1)
    p = np.array([[0.05, 0.05, 0.05], [0.15, 0.05, 0.05]], np.float32)   # same 1 m display voxel
    m.insert(p, np.array([[1, 1, 1], [9, 9, 9]], np.uint8), np.array([False, True]))
    xyz, rgb = m.display(1.0, 10)
    assert len(xyz) == 1 and rgb[0].tolist() == [9, 9, 9]
