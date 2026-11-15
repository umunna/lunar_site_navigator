"""Voxel-hashed coloured point map (pure NumPy, no ROS - unit-tested in CI).

The full-resolution map is what gets saved to map.ply. For live display, use
``display()``: a coarser, size-capped copy that is cached until the map grows,
so RViz is not asked to re-upload hundreds of thousands of points every second
(that GPU load is what the 2026-11-14 Xorg/NVIDIA crash happened under).
"""
from __future__ import annotations

import numpy as np

_OFF = 1 << 20  # keeps keys positive for coordinates down to -2^20 voxels


def voxel_keys(xyz: np.ndarray, voxel: float) -> np.ndarray:
    k = np.floor(xyz / voxel).astype(np.int64) + _OFF
    return (k[:, 0] << 42) | (k[:, 1] << 21) | k[:, 2]


class VoxelMap:
    """One point per voxel. Camera colour overrides the 'LiDAR only' colour."""

    def __init__(self, voxel: float):
        self.voxel = voxel
        self.index: dict[int, int] = {}
        self.xyz = np.zeros((0, 3), np.float32)
        self.rgb = np.zeros((0, 3), np.uint8)
        self.cam = np.zeros(0, bool)
        self.n = 0
        self.version = 0                      # bumps on every change (drives display caching)
        self._disp_key = None
        self._disp = (self.xyz, self.rgb)

    def insert(self, xyz: np.ndarray, rgb: np.ndarray, cam: np.ndarray) -> None:
        if not len(xyz):
            return
        keys, first = np.unique(voxel_keys(xyz, self.voxel), return_index=True)
        xyz, rgb, cam = xyz[first], rgb[first], cam[first]
        idx = np.fromiter((self.index.get(k, -1) for k in keys.tolist()), np.int64, len(keys))
        old = idx >= 0
        upg = old & cam
        if upg.any():
            self.rgb[idx[upg]] = rgb[upg]
            self.cam[idx[upg]] = True
            self.version += 1
        new = ~old
        n_new = int(new.sum())
        if n_new:
            need = self.n + n_new
            if need > len(self.xyz):
                cap = max(need, 2 * len(self.xyz), 65536)
                self.xyz = np.resize(self.xyz, (cap, 3))
                self.rgb = np.resize(self.rgb, (cap, 3))
                self.cam = np.resize(self.cam, cap)
            self.xyz[self.n:need], self.rgb[self.n:need], self.cam[self.n:need] = xyz[new], rgb[new], cam[new]
            self.index.update(zip(keys[new].tolist(), range(self.n, need)))
            self.n = need
            self.version += 1

    def arrays(self):
        return self.xyz[:self.n], self.rgb[:self.n], self.cam[:self.n]

    def display(self, voxel: float, max_points: int) -> tuple[np.ndarray, np.ndarray]:
        """Coarse copy for visualisation: one point per ``voxel`` (camera-coloured points
        preferred), grown to a larger voxel if needed to stay under ``max_points``.
        Cached until the map changes."""
        key = (self.version, voxel, max_points)
        if key == self._disp_key:
            return self._disp
        xyz, rgb, cam = self.arrays()
        if voxel > self.voxel and len(xyz):
            order = np.argsort(~cam, kind="stable")        # camera-coloured first -> win the voxel
            xyz, rgb = xyz[order], rgb[order]
            v = voxel
            while True:
                _, first = np.unique(voxel_keys(xyz, v), return_index=True)
                if len(first) <= max_points or v > 64 * voxel:
                    break
                v *= 1.5
            xyz, rgb = xyz[first], rgb[first]
        elif len(xyz) > max_points:
            step = int(np.ceil(len(xyz) / max_points))
            xyz, rgb = xyz[::step], rgb[::step]
        self._disp_key, self._disp = key, (np.ascontiguousarray(xyz), np.ascontiguousarray(rgb))
        return self._disp
