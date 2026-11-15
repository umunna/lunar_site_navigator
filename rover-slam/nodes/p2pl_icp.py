"""Scan-to-map point-to-plane ICP with an odometry prior (LiDAR + wheel-odometry fusion).

Why point-to-plane: on smooth lunar terrain the LiDAR rings slide along the ground,
which pulls point-to-point ICP (e.g. KISS-ICP) off. Point-to-plane makes flat ground
constrain height, roll and pitch exactly while staying neutral along the surface;
along those weak directions a prior from wheel odometry holds the pose, and rocks,
crater rims and slopes correct it.
"""
from __future__ import annotations

import numpy as np
from scipy.spatial import cKDTree


def voxel_keys(pts: np.ndarray, voxel: float) -> np.ndarray:
    k = np.floor(pts / voxel).astype(np.int64) + (1 << 20)
    return (k[:, 0] << 42) | (k[:, 1] << 21) | k[:, 2]


def voxel_down(pts: np.ndarray, voxel: float) -> np.ndarray:
    _, first = np.unique(voxel_keys(pts, voxel), return_index=True)
    return pts[first]


def exp_se3(xi: np.ndarray) -> np.ndarray:
    """xi = (rx, ry, rz, tx, ty, tz) -> 4x4 (rotation by Rodrigues, translation as is)."""
    w, t = xi[:3], xi[3:]
    th = np.linalg.norm(w)
    Wx = np.array([[0, -w[2], w[1]], [w[2], 0, -w[0]], [-w[1], w[0], 0]])
    R = np.eye(3) + Wx if th < 1e-9 else np.eye(3) + np.sin(th) / th * Wx + (1 - np.cos(th)) / th ** 2 * Wx @ Wx
    T = np.eye(4)
    T[:3, :3], T[:3, 3] = R, t
    return T


def log_rot(R: np.ndarray) -> np.ndarray:
    c = np.clip((np.trace(R) - 1) / 2, -1, 1)
    th = np.arccos(c)
    v = np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]])
    return v / 2 if th < 1e-6 else v * th / (2 * np.sin(th))


class LocalMap:
    """Rolling local map (voxelised points + normals + planarity) around the sensor."""

    def __init__(self, voxel=0.3, radius=50.0):
        self.voxel, self.radius = voxel, radius
        self.pts = np.zeros((0, 3))
        self.keys = np.zeros(0, np.int64)
        self.normals = np.zeros((0, 3))
        self.planarity = np.zeros(0)
        self.tree = None

    def add(self, world_pts: np.ndarray, centre: np.ndarray):
        """Insert new voxels; keep existing ones (and their normals); crop to radius."""
        keys = voxel_keys(world_pts, self.voxel)
        keys, first = np.unique(keys, return_index=True)
        new = ~np.isin(keys, self.keys, assume_unique=True)
        n_old = len(self.pts)
        self.pts = np.vstack([self.pts, world_pts[first[new]]])
        self.keys = np.r_[self.keys, keys[new]]
        self.normals = np.vstack([self.normals, np.zeros((int(new.sum()), 3))])
        self.planarity = np.r_[self.planarity, np.zeros(int(new.sum()))]
        fresh = np.zeros(len(self.pts), bool)
        fresh[n_old:] = True
        keep = np.linalg.norm(self.pts[:, :2] - centre[:2], axis=1) < self.radius
        self.pts, self.keys, self.normals, self.planarity, fresh = (
            self.pts[keep], self.keys[keep], self.normals[keep], self.planarity[keep], fresh[keep])
        self.tree = cKDTree(self.pts)
        # normals for new points + refresh near the sensor, where neighbourhoods keep filling in
        fresh |= np.linalg.norm(self.pts - centre, axis=1) < 12.0
        if fresh.any():
            q = self.pts[fresh]
            _, nn = self.tree.query(q, k=8)
            nb = self.pts[nn] - self.pts[nn].mean(axis=1, keepdims=True)
            cov = np.einsum("nki,nkj->nij", nb, nb) / 8
            evals, evecs = np.linalg.eigh(cov)
            self.normals[fresh] = evecs[:, :, 0]
            self.planarity[fresh] = np.clip(1 - evals[:, 0] / np.maximum(evals[:, 1], 1e-12), 0, 1)


class P2PlOdometry:
    """LiDAR odometry: point-to-plane scan-to-map ICP, damped towards an odometry prior.

    prior_sigma: 1-sigma trust in the prior, body frame (roll, pitch, yaw [rad], fwd, left, up [m]).
    Rotation comes from the IMU gyro (tight), distance from the wheels (looser: slip),
    sideways barely slips; height is left to the LiDAR.
    """

    def __init__(self, scan_voxel=0.35, map_voxel=0.25, max_corr=1.0,
                 prior_sigma=(0.01, 0.01, 0.01, 0.05, 0.02, 0.2), point_sigma=0.03, map_update_dist=0.0):
        self.scan_voxel = scan_voxel
        self.map_update_dist = map_update_dist
        self.map = LocalMap(map_voxel)
        self.max_corr = max_corr
        self.Wb = np.diag(1.0 / np.square(prior_sigma))
        self.point_w = 1.0 / point_sigma ** 2
        self.pose = np.eye(4)
        self.n_corr = 0
        self.ready = False

    def register(self, scan: np.ndarray, delta_prior: np.ndarray, iters=10) -> np.ndarray:
        """scan: (N,3) sensor frame. delta_prior: predicted motion, sensor_{k-1} <- sensor_k."""
        src = voxel_down(scan, self.scan_voxel)
        if not self.ready:
            self.map.add(src @ self.pose[:3, :3].T + self.pose[:3, 3], self.pose[:3, 3])
            self._last_map_pos = self.pose[:3, 3].copy()
            self._pending = []
            self.ready = True
            return self.pose
        prior = self.pose @ delta_prior
        Rb = prior[:3, :3]
        Ww = np.zeros((6, 6))
        Ww[:3, :3] = Rb @ self.Wb[:3, :3] @ Rb.T
        Ww[3:, 3:] = Rb @ self.Wb[3:, 3:] @ Rb.T
        T = prior.copy()
        for _ in range(iters):
            c = T[:3, 3]
            w = src @ T[:3, :3].T + c
            d, i = self.map.tree.query(w, distance_upper_bound=self.max_corr)
            ok = np.isfinite(d)
            if ok.sum() < 30:
                break
            p, q, n = w[ok], self.map.pts[i[ok]], self.map.normals[i[ok]]
            r = np.einsum("ij,ij->i", p - q, n)
            wt = self.point_w * self.map.planarity[i[ok]] / (1 + (r / 0.15) ** 2)
            J = np.hstack([np.cross(p - c, n), n])              # perturbation about the sensor centre
            H = (J * wt[:, None]).T @ J
            g = (J * wt[:, None]).T @ r
            e = np.r_[log_rot(T[:3, :3] @ prior[:3, :3].T), T[:3, 3] - prior[:3, 3]]
            dx = -np.linalg.solve(H + Ww + 1e-6 * np.eye(6), g + Ww @ e)
            dT = exp_se3(dx)
            M = np.eye(4)
            M[:3, :3] = dT[:3, :3]
            M[:3, 3] = c - dT[:3, :3] @ c + dx[3:]
            T = M @ T
            self.n_corr = int(ok.sum())
            if np.linalg.norm(dx) < 1e-4:
                break
        self.pose = T
        # rebuilding the map (KD-tree + normals) is the expensive part: do it every ~0.8 m
        self._pending.append(src @ T[:3, :3].T + T[:3, 3])
        if np.linalg.norm(T[:3, 3] - self._last_map_pos) > self.map_update_dist:
            self.map.add(np.vstack(self._pending), T[:3, 3])
            self._pending = []
            self._last_map_pos = T[:3, 3].copy()
        return T
