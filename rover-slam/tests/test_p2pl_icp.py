import numpy as np

from p2pl_icp import P2PlOdometry, exp_se3, log_rot, voxel_down


def test_exp_log_roundtrip():
    w = np.array([0.1, -0.2, 0.3])
    T = exp_se3(np.r_[w, 1, 2, 3])
    assert np.allclose(log_rot(T[:3, :3]), w, atol=1e-9)
    assert np.allclose(T[:3, 3], [1, 2, 3])
    assert np.allclose(T[:3, :3] @ T[:3, :3].T, np.eye(3), atol=1e-12)


def test_voxel_down_one_point_per_voxel():
    pts = np.array([[0.1, 0.1, 0.1], [0.2, 0.2, 0.2], [1.1, 0.1, 0.1]])
    assert len(voxel_down(pts, 1.0)) == 2


def _scene(rng):
    """Bumpy ground + a few boxes: enough structure to constrain all 6 DoF."""
    g = rng.uniform(-25, 25, (40000, 2))
    z = 0.4 * np.sin(g[:, 0] / 3) * np.cos(g[:, 1] / 4)
    pts = [np.c_[g, z]]
    for cx, cy in [(6, 4), (-8, 7), (3, -9), (-5, -6), (12, -2)]:
        f = rng.uniform(-1, 1, (3000, 2))
        pts.append(np.c_[cx + f[:, 0], np.full(3000, cy + 1.0), 1 + f[:, 1]])     # wall facing +y
        pts.append(np.c_[np.full(3000, cx + 1.0), cy + f[:, 0], 1 + f[:, 1]])     # wall facing +x
    return np.vstack(pts)


def test_icp_recovers_motion_from_bad_prior():
    rng = np.random.default_rng(0)
    world = _scene(rng)
    odo = P2PlOdometry(map_update_dist=0.0)
    T0 = np.eye(4)
    T0[2, 3] = 1.3
    odo.pose = T0.copy()
    odo.register((world - T0[:3, 3]) @ T0[:3, :3], np.eye(4))           # initialise map

    true_delta = exp_se3(np.array([0.0, 0.0, 0.03, 0.8, 0.1, 0.0]))     # 0.8 m forward, small turn
    T1 = T0 @ true_delta
    scan = (world - T1[:3, 3]) @ T1[:3, :3]
    scan = scan[np.linalg.norm(scan, axis=1) < 20]
    bad_prior = exp_se3(np.array([0.0, 0.0, 0.03, 0.6, 0.0, 0.0]))      # wheels under-read by 0.2 m
    est = odo.register(scan, bad_prior, iters=20)
    assert np.linalg.norm(est[:3, 3] - T1[:3, 3]) < 0.1
    assert np.linalg.norm(log_rot(est[:3, :3] @ T1[:3, :3].T)) < 0.01
