#!/usr/bin/env python3
"""Camera + LiDAR SLAM for the lunar south-pole demo. Runs as two processes:

  --role lidar   LiDAR-inertial SLAM: point-to-plane scan-to-map ICP; motion prior =
                 IMU gyro (rotation) + wheel odometry (distance) -> rover pose (works in
                 total darkness), coloured 3D map
                 (camera colour where the ground is lit, height colour = LiDAR only),
                 paths, TF, results on disk.
  --role camera  ORB-SLAM3-style camera view: ORB features, frame-to-frame tracking
                 state, ORB keypoints lifted to 3D with LiDAR depth (red map points),
                 HUD with lighting state from the site's shadow map.

Ground truth is used for exactly two things: the start pose (the known landing site,
as a real crew would have) and the on-screen error readout.
"""
from __future__ import annotations

import json
import math
import sys
import threading
import time
from pathlib import Path

import cv2
import numpy as np
import rclpy
from geometry_msgs.msg import PoseStamped, TransformStamped
from nav_msgs.msg import Odometry
from nav_msgs.msg import Path as PathMsg
from PIL import Image as PILImage
from rclpy.callback_groups import MutuallyExclusiveCallbackGroup
from rclpy.executors import MultiThreadedExecutor
from rclpy.node import Node
from sensor_msgs.msg import Image, Imu, PointCloud2, PointField
from sensor_msgs_py import point_cloud2 as pc2
from std_msgs.msg import Header, String
from tf2_ros import TransformBroadcaster
from visualization_msgs.msg import Marker

sys.path.insert(0, str(Path(__file__).resolve().parent))
from p2pl_icp import P2PlOdometry, voxel_down  # noqa: E402
from voxel_map import VoxelMap  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]

# ---- sensor mounts relative to the model origin (must match models/rover/model.sdf;
#      base_link sits 0.35 m above the model origin)
def _T(t, pitch=0.0):
    c, s = math.cos(pitch), math.sin(pitch)
    T = np.eye(4)
    T[:3, :3] = [[c, 0, s], [0, 1, 0], [-s, 0, c]]
    T[:3, 3] = t
    return T

T_MODEL_LIDAR = _T([0.2, 0.0, 1.30])
T_MODEL_CAM = _T([0.3, 0.0, 1.20], pitch=0.25)
T_CAM_LIDAR = np.linalg.inv(T_MODEL_CAM) @ T_MODEL_LIDAR
IMG_W, IMG_H, HFOV = 640, 480, 1.3
FX = (IMG_W / 2) / math.tan(HFOV / 2)
K = np.array([[FX, 0, IMG_W / 2], [0, FX, IMG_H / 2], [0, 0, 1.0]])

MAP_VOXEL = 0.25
ORB_VOXEL = 0.10
# live display (RViz) only - the saved map.ply keeps full resolution
DISPLAY_PERIOD_S = 2.0
MAP_DISPLAY_VOXEL, MAP_DISPLAY_MAX = 0.5, 120_000
ORB_DISPLAY_VOXEL, ORB_DISPLAY_MAX = 0.3, 40_000
DARK_RAW = 14          # raw pixel value below which ground counts as unlit


# ----------------------------------------------------------------------------- helpers
def pose_from_msg(p) -> np.ndarray:
    q = p.orientation
    x, y, z, w = q.x, q.y, q.z, q.w
    T = np.eye(4)
    T[:3, :3] = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                 [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                 [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    T[:3, 3] = [p.position.x, p.position.y, p.position.z]
    return T


def quat_from_R(R) -> tuple[float, float, float, float]:
    w = math.sqrt(max(0.0, 1 + R[0, 0] + R[1, 1] + R[2, 2])) / 2
    x = math.copysign(math.sqrt(max(0.0, 1 + R[0, 0] - R[1, 1] - R[2, 2])) / 2, R[2, 1] - R[1, 2])
    y = math.copysign(math.sqrt(max(0.0, 1 - R[0, 0] + R[1, 1] - R[2, 2])) / 2, R[0, 2] - R[2, 0])
    z = math.copysign(math.sqrt(max(0.0, 1 - R[0, 0] - R[1, 1] + R[2, 2])) / 2, R[1, 0] - R[0, 1])
    return x, y, z, w


def fill_pose(pose_msg, T):
    pose_msg.position.x, pose_msg.position.y, pose_msg.position.z = map(float, T[:3, 3])
    q = quat_from_R(T[:3, :3])
    pose_msg.orientation.x, pose_msg.orientation.y, pose_msg.orientation.z, pose_msg.orientation.w = q


def transform(T, pts):
    return pts @ T[:3, :3].T + T[:3, 3]


def project(pts_lidar):
    """LiDAR-frame points -> pixel coords (u, v), depth along optical axis, valid mask."""
    pc = transform(T_CAM_LIDAR, pts_lidar)          # camera link frame: x fwd, y left, z up
    xo, yo, zo = -pc[:, 1], -pc[:, 2], pc[:, 0]     # optical frame
    ok = zo > 0.5
    u = np.full(len(pc), -1.0)
    v = np.full(len(pc), -1.0)
    u[ok] = FX * xo[ok] / zo[ok] + IMG_W / 2
    v[ok] = FX * yo[ok] / zo[ok] + IMG_H / 2
    ok &= (u >= 0) & (u < IMG_W - 1) & (v >= 0) & (v < IMG_H - 1)
    return u, v, zo, ok


def read_xyz(m: PointCloud2) -> np.ndarray:
    pts = pc2.read_points_numpy(m, field_names=("x", "y", "z"), skip_nans=True).astype(np.float64)
    pts = pts[np.isfinite(pts).all(1)]
    r = np.linalg.norm(pts, axis=1)
    return pts[(r > 1.0) & (r < 59.5)]


def height_colour(z, z0, z1):
    t = np.clip((z - z0) / max(z1 - z0, 1e-3), 0, 1)
    # dark blue -> violet -> magenta: clearly "not camera", readable on black
    return np.stack([(40 + 180 * t), (60 + 40 * t), (200 - 40 * t)], 1).astype(np.uint8)


def cloud_msg(header, xyz, rgb) -> PointCloud2:
    rgb = rgb.astype(np.uint32)
    packed = ((rgb[:, 0] << 16) | (rgb[:, 1] << 8) | rgb[:, 2]).view(np.float32)
    data = np.zeros(len(xyz), dtype=[("x", "f4"), ("y", "f4"), ("z", "f4"), ("rgb", "f4")])
    data["x"], data["y"], data["z"], data["rgb"] = xyz[:, 0], xyz[:, 1], xyz[:, 2], packed
    fields = [PointField(name=n, offset=4 * i, datatype=PointField.FLOAT32, count=1)
              for i, n in enumerate(("x", "y", "z", "rgb"))]
    return PointCloud2(header=header, height=1, width=len(xyz), fields=fields, is_bigendian=False,
                       point_step=16, row_step=16 * len(xyz), is_dense=True, data=data.tobytes())


def write_ply(path: Path, xyz, rgb):
    v = np.zeros(len(xyz), dtype=[("x", "<f4"), ("y", "<f4"), ("z", "<f4"),
                                  ("red", "u1"), ("green", "u1"), ("blue", "u1")])
    v["x"], v["y"], v["z"] = xyz.T
    v["red"], v["green"], v["blue"] = rgb.T
    hdr = ("ply\nformat binary_little_endian 1.0\n"
           f"element vertex {len(v)}\nproperty float x\nproperty float y\nproperty float z\n"
           "property uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n")
    with open(path, "wb") as f:
        f.write(hdr.encode())
        f.write(v.tobytes())


def stamp_s(stamp) -> float:
    return stamp.sec + stamp.nanosec * 1e-9


def rot_exp(w) -> np.ndarray:
    th = float(np.linalg.norm(w))
    Wx = np.array([[0, -w[2], w[1]], [w[2], 0, -w[0]], [-w[1], w[0], 0]])
    if th < 1e-12:
        return np.eye(3) + Wx
    return np.eye(3) + math.sin(th) / th * Wx + (1 - math.cos(th)) / th ** 2 * Wx @ Wx


class GyroIntegrator:
    """Buffers IMU angular rates and integrates the body rotation between two times."""

    def __init__(self):
        self.buf: list[tuple[float, np.ndarray]] = []
        self.t_last = None
        self.lock = threading.Lock()

    def add(self, t, w):
        with self.lock:
            self.buf.append((t, w))

    def rotation_until(self, t_end) -> np.ndarray | None:
        with self.lock:
            buf, self.buf = self.buf, []
        if self.t_last is None:
            self.t_last = t_end
            with self.lock:
                self.buf = [s for s in buf if s[0] > t_end] + self.buf
            return None
        R = np.eye(3)
        t_prev = self.t_last
        keep = []
        for t, w in buf:
            if t <= t_prev:
                continue
            if t > t_end:
                keep.append((t, w))
                continue
            R = R @ rot_exp(w * (t - t_prev))
            t_prev = t
        with self.lock:
            self.buf = keep + self.buf
        self.t_last = t_end
        return R


# ----------------------------------------------------------------------------- LiDAR SLAM
class LidarSlam(Node):
    def __init__(self):
        super().__init__("lunar_lidar_slam")
        self.declare_parameter("out_dir", str(ROOT / "results" / time.strftime("run_%Y%m%d_%H%M%S")))
        self.out_dir = Path(self.get_parameter("out_dir").value)
        self.odo = P2PlOdometry()
        self.gyro = GyroIntegrator()
        self.wheel = self.wheel_at_last_scan = None
        self.T_world_L = None
        self.gt = self.gt_first = None
        self.dist, self.err, self.max_err, self.icp_ms = 0.0, float("nan"), 0.0, 0.0
        self.last_pos = self.last_insert = None
        self.scan_count = 0
        self.gray, self.gain = None, 1.0
        self.map = VoxelMap(MAP_VOXEL)
        self.z_lo = self.z_hi = None
        self.slam_traj, self.gt_traj = [], []
        self.vis_status = {}
        self.saved = False
        self.tfb = TransformBroadcaster(self)
        self.path = PathMsg(header=Header(frame_id="map"))
        self.gtpath = PathMsg(header=Header(frame_id="map"))

        self.pub_map = self.create_publisher(PointCloud2, "/slam/map", 1)
        self.pub_scan = self.create_publisher(PointCloud2, "/slam/scan", 1)
        self.pub_path = self.create_publisher(PathMsg, "/slam/path", 1)
        self.pub_gtpath = self.create_publisher(PathMsg, "/ground_truth/path", 1)
        self.pub_odom = self.create_publisher(Odometry, "/slam/odom", 5)
        self.pub_status = self.create_publisher(String, "/slam/status", 5)
        self.pub_marker = self.create_publisher(Marker, "/slam/rover", 1)
        g_lidar, g_sens, g_misc = (MutuallyExclusiveCallbackGroup() for _ in range(3))
        self.create_subscription(PointCloud2, "/lidar/points", self.on_lidar, 2, callback_group=g_lidar)
        self.create_subscription(Imu, "/imu", self.on_imu, 400, callback_group=g_sens)
        self.create_subscription(Odometry, "/wheel_odom", self.on_wheel, 50, callback_group=g_sens)
        self.create_subscription(Odometry, "/ground_truth/odom", self.on_gt, 20, callback_group=g_sens)
        self.create_subscription(Image, "/camera/image", self.on_image, 1, callback_group=g_misc)
        self.create_subscription(String, "/slam/vis_status", self.on_vis, 5, callback_group=g_misc)
        self.create_subscription(String, "/route/status", self.on_route, 10, callback_group=g_misc)
        self.create_timer(DISPLAY_PERIOD_S, self.publish_map, callback_group=g_misc)
        self._map_sent = -1
        self.get_logger().info("LiDAR-inertial SLAM ready (point-to-plane ICP, prior = IMU gyro + wheel distance)")

    def on_imu(self, m: Imu):
        w = m.angular_velocity
        self.gyro.add(stamp_s(m.header.stamp), np.array([w.x, w.y, w.z]))

    def on_gt(self, m: Odometry):
        self.gt = pose_from_msg(m.pose.pose)
        if self.gt_first is None:
            self.gt_first = self.gt.copy()
        if not self.gt_traj or np.linalg.norm(self.gt[:3, 3] - self.gt_traj[-1][1][:3, 3]) > 0.3:
            self.gt_traj.append((stamp_s(m.header.stamp), self.gt.copy()))
            ps = PoseStamped(header=Header(stamp=m.header.stamp, frame_id="map"))
            fill_pose(ps.pose, self.gt)
            self.gtpath.poses.append(ps)

    def on_wheel(self, m: Odometry):
        self.wheel = pose_from_msg(m.pose.pose)

    def on_image(self, m: Image):
        a = np.frombuffer(m.data, np.uint8).reshape(m.height, m.width, -1)
        g = cv2.cvtColor(a, cv2.COLOR_RGB2GRAY)
        self.gain = float(np.clip(95.0 / max(float(g[IMG_H // 3:].mean()), 1.0), 1.0, 8.0))
        self.gray = g

    def on_vis(self, m: String):
        self.vis_status = json.loads(m.data)

    def on_route(self, m: String):
        if m.data == "done":
            self.save_results()

    def on_lidar(self, m: PointCloud2):
        if self.gt_first is None or self.wheel is None:
            return                                        # wait for the known start pose + odometry
        pts = read_xyz(m)
        if len(pts) < 500:
            return
        wheel = self.wheel.copy()
        R_gyro = self.gyro.rotation_until(stamp_s(m.header.stamp))
        D = np.eye(4)
        if self.T_world_L is None:
            self.odo.pose = self.gt_first @ T_MODEL_LIDAR  # start = known landing site
        else:
            Dw = np.linalg.inv(self.wheel_at_last_scan) @ wheel
            D[:3, :3] = R_gyro if R_gyro is not None else Dw[:3, :3]   # rotation: gyro
            D[0, 3] = float(np.linalg.norm(Dw[:3, 3])) * np.sign(Dw[0, 3] or 1.0)  # distance: wheels
        self.wheel_at_last_scan = wheel
        t0 = time.perf_counter()
        self.T_world_L = self.odo.register(pts, np.linalg.inv(T_MODEL_LIDAR) @ D @ T_MODEL_LIDAR).copy()
        self.icp_ms = 0.8 * self.icp_ms + 0.2 * (time.perf_counter() - t0) * 1e3
        self.scan_count += 1

        T_model = self.T_world_L @ np.linalg.inv(T_MODEL_LIDAR)
        pos = T_model[:3, 3]
        if self.last_pos is not None:
            self.dist += float(np.linalg.norm(pos - self.last_pos))
        self.last_pos = pos
        if self.gt is not None:
            self.err = float(np.linalg.norm(pos - self.gt[:3, 3]))
            self.max_err = max(self.max_err, self.err)
        self.slam_traj.append((stamp_s(m.header.stamp), T_model.copy()))

        hdr = Header(stamp=m.header.stamp, frame_id="map")
        od = Odometry(header=hdr, child_frame_id="slam_base")
        fill_pose(od.pose.pose, T_model)
        self.pub_odom.publish(od)
        if not self.path.poses or self.dist - getattr(self, "_path_d", 0.0) > 0.2:
            self._path_d = self.dist
            ps = PoseStamped(header=hdr)
            fill_pose(ps.pose, T_model)
            self.path.poses.append(ps)
        self.path.header.stamp = self.gtpath.header.stamp = m.header.stamp
        self.pub_path.publish(self.path)
        self.pub_gtpath.publish(self.gtpath)
        self._publish_tf_marker(hdr, T_model)

        near = pts[np.linalg.norm(pts, axis=1) < 40.0]
        live = voxel_down(transform(self.T_world_L, near), 0.3)
        self.pub_scan.publish(cloud_msg(hdr, live, np.full((len(live), 3), 235, np.uint8)))
        if self.last_insert is None or np.linalg.norm(pos - self.last_insert) > 0.4:
            self.last_insert = pos
            self._insert_map(near)
        self.pub_status.publish(String(data=json.dumps(
            {"icp_ms": round(self.icp_ms, 1), "map_k": round(self.map.n / 1000), "dist": round(self.dist, 1),
             "err": round(self.err, 2), "scans": self.scan_count})))

    def _insert_map(self, pts_lidar):
        pts_lidar = voxel_down(pts_lidar, MAP_VOXEL * 0.6)
        world = transform(self.T_world_L, pts_lidar)
        if self.z_lo is None:
            self.z_lo, self.z_hi = float(np.percentile(world[:, 2], 2)) - 10, float(np.percentile(world[:, 2], 98)) + 10
        rgb = height_colour(world[:, 2], self.z_lo, self.z_hi)
        cam = np.zeros(len(world), bool)
        img = self.gray
        if img is not None:
            u, v, depth, ok = project(pts_lidar)
            ok &= depth < 30.0
            if ok.any():
                val = img[v[ok].astype(int), u[ok].astype(int)].astype(np.float32)
                lit = val >= DARK_RAW
                g = np.clip(val * self.gain, 0, 255)
                col = np.stack([g, g * 0.97, g * 0.9], 1).astype(np.uint8)
                idx = np.nonzero(ok)[0][lit]
                rgb[idx] = col[lit]
                cam[idx] = True
        self.map.insert(world.astype(np.float32), rgb, cam)

    def _publish_tf_marker(self, hdr, T):
        tf = TransformStamped(header=hdr, child_frame_id="slam_base")
        tf.transform.translation.x, tf.transform.translation.y, tf.transform.translation.z = map(float, T[:3, 3])
        q = quat_from_R(T[:3, :3])
        tf.transform.rotation.x, tf.transform.rotation.y, tf.transform.rotation.z, tf.transform.rotation.w = q
        self.tfb.sendTransform(tf)
        mk = Marker(header=hdr, ns="rover", id=0, type=Marker.CUBE, action=Marker.ADD)
        fill_pose(mk.pose, T)
        mk.pose.position.z += 0.35
        mk.scale.x, mk.scale.y, mk.scale.z = 1.1, 0.7, 0.3
        mk.color.r, mk.color.g, mk.color.b, mk.color.a = 1.0, 0.75, 0.1, 1.0
        self.pub_marker.publish(mk)

    def publish_map(self):
        if self.map.version == self._map_sent:
            return
        self._map_sent = self.map.version
        xyz, rgb = self.map.display(MAP_DISPLAY_VOXEL, MAP_DISPLAY_MAX)
        if len(xyz):
            self.pub_map.publish(cloud_msg(Header(stamp=self.get_clock().now().to_msg(), frame_id="map"), xyz, rgb))

    def save_results(self):
        if self.saved or not self.slam_traj:
            return
        self.saved = True
        self.out_dir.mkdir(parents=True, exist_ok=True)
        xyz, rgb, cam = self.map.arrays()
        write_ply(self.out_dir / "map.ply", xyz, rgb)
        for name, traj in (("slam_traj.txt", self.slam_traj), ("gt_traj.txt", self.gt_traj)):
            with open(self.out_dir / name, "w") as f:
                for t, T in traj:
                    q = quat_from_R(T[:3, :3])
                    f.write(f"{t:.4f} {T[0,3]:.4f} {T[1,3]:.4f} {T[2,3]:.4f} {q[0]:.6f} {q[1]:.6f} {q[2]:.6f} {q[3]:.6f}\n")
        vs = self.vis_status
        tot = max(1, vs.get("OK", 0) + vs.get("WEAK", 0) + vs.get("LOST", 0))
        summary = (f"driven distance      : {self.dist:.1f} m\n"
                   f"final position error : {self.err:.2f} m ({100 * self.err / max(self.dist, 1):.2f} % of distance)\n"
                   f"max position error   : {self.max_err:.2f} m\n"
                   f"LiDAR scans used     : {self.scan_count}\n"
                   f"map points           : {len(xyz)} ({cam.mean() * 100:.0f} % coloured by camera, rest LiDAR-only)\n"
                   f"camera frames        : {vs.get('frames', 0)} ({vs.get('shadow_pct', 0)} % in shadow)\n"
                   f"visual tracking      : OK {100 * vs.get('OK', 0) / tot:.0f} %  WEAK {100 * vs.get('WEAK', 0) / tot:.0f} %  "
                   f"LOST {100 * vs.get('LOST', 0) / tot:.0f} %\n"
                   f"   ...in shadow      : OK {vs.get('shadow_ok_pct', 0)} %  (headlamp range only)\n")
        (self.out_dir / "summary.txt").write_text(summary)
        self.get_logger().info(f"results saved to {self.out_dir}\n{summary}")


# ----------------------------------------------------------------------------- camera / ORB
class CameraOrb(Node):
    def __init__(self):
        super().__init__("lunar_camera_orb")
        self.declare_parameter("out_dir", str(ROOT / "results" / time.strftime("run_%Y%m%d_%H%M%S")))
        self.out_dir = Path(self.get_parameter("out_dir").value)
        meta = json.loads((ROOT / "config/terrain_meta.json").read_text())
        self.size = meta["size_m"]
        self.sun_el = meta["sun_el_deg"]
        self.shadow = np.array(PILImage.open(ROOT / "config/shadow_mask.png")) > 127
        self.orb = cv2.ORB_create(nfeatures=1200, scaleFactor=1.2, nlevels=8, fastThreshold=12)
        self.bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        self.prev_kp = self.prev_des = None
        self.scan = None                     # latest LiDAR scan (sensor frame)
        self.T_model = None                  # latest SLAM pose
        self.status = {}
        self.state = "INIT"
        self.hist = {"OK": 0, "WEAK": 0, "LOST": 0}
        self.frames = self.shadow_frames = self.shadow_ok = 0
        self.orbmap = VoxelMap(ORB_VOXEL)
        self.saved = False
        self.pub_img = self.create_publisher(Image, "/slam/orb_image", 1)
        self.pub_pts = self.create_publisher(PointCloud2, "/slam/orb_points", 1)
        self.pub_vis = self.create_publisher(String, "/slam/vis_status", 5)
        self.create_subscription(Image, "/camera/image", self.on_image, 1)
        self.create_subscription(PointCloud2, "/lidar/points", lambda m: setattr(self, "scan", m), 1)
        self.create_subscription(Odometry, "/slam/odom", lambda m: setattr(self, "T_model", pose_from_msg(m.pose.pose)), 5)
        self.create_subscription(String, "/slam/status", lambda m: setattr(self, "status", json.loads(m.data)), 5)
        self.create_subscription(String, "/route/status", self.on_route, 10)
        self.create_timer(DISPLAY_PERIOD_S, self.publish_points)
        self._pts_sent = -1
        self.get_logger().info("camera ORB node ready")

    def in_shadow(self) -> bool:
        if self.T_model is None:
            return False
        x, y = self.T_model[0, 3], self.T_model[1, 3]
        n = self.shadow.shape[0]
        r = int(round((self.size / 2 - y) / self.size * (n - 1)))
        c = int(round((x + self.size / 2) / self.size * (n - 1)))
        return bool(self.shadow[np.clip(r, 0, n - 1), np.clip(c, 0, n - 1)])

    def on_image(self, m: Image):
        a = np.frombuffer(m.data, np.uint8).reshape(m.height, m.width, -1)
        gray = cv2.cvtColor(a, cv2.COLOR_RGB2GRAY)
        gain = float(np.clip(95.0 / max(float(gray[IMG_H // 3:].mean()), 1.0), 1.0, 8.0))   # auto-exposure
        work = cv2.convertScaleAbs(gray, alpha=gain)
        dark = self.in_shadow()
        self.frames += 1
        kp, des = self.orb.detectAndCompute(work, None)
        p0 = p1 = np.zeros((0, 2), np.float32)
        if des is not None and self.prev_des is not None and len(kp) >= 8 and len(self.prev_kp) >= 8:
            matches = [mm for mm in self.bf.match(self.prev_des, des) if mm.distance < 48]
            if len(matches) >= 8:
                a0 = np.float32([self.prev_kp[mm.queryIdx].pt for mm in matches])
                a1 = np.float32([kp[mm.trainIdx].pt for mm in matches])
                _, mask = cv2.findEssentialMat(a0, a1, K, method=cv2.RANSAC, prob=0.999, threshold=1.0)
                if mask is not None:
                    keep = mask.ravel().astype(bool)
                    p0, p1 = a0[keep], a1[keep]
        n_trk = len(p1)
        self.state = "OK" if n_trk >= 60 else ("WEAK" if n_trk >= 20 else "LOST")
        if self.frames > 3:
            self.hist[self.state] += 1
            if dark:
                self.shadow_frames += 1
                self.shadow_ok += self.state == "OK"
        self.prev_kp, self.prev_des = kp, des
        if n_trk and self.scan is not None and self.T_model is not None:
            self._lift(p1)
        self.pub_img.publish(self._draw(work, kp, p0, p1, n_trk, gain, dark, m.header))
        if self.frames % 10 == 0:
            self.pub_vis.publish(String(data=json.dumps(self._vis())))

    def _vis(self):
        return {**self.hist, "frames": self.frames,
                "shadow_pct": round(100 * self.shadow_frames / max(self.frames, 1)),
                "shadow_ok_pct": round(100 * self.shadow_ok / max(self.shadow_frames, 1))}

    def _lift(self, kpts):
        """ORB keypoints + LiDAR depth -> 3D map points (camera-LiDAR fusion)."""
        pts_l = read_xyz(self.scan)
        u, v, depth, ok = project(pts_l)
        dimg = np.full((IMG_H, IMG_W), np.inf, np.float32)
        np.minimum.at(dimg, (v[ok].astype(int), u[ok].astype(int)), depth[ok].astype(np.float32))
        dimg = cv2.erode(dimg, np.ones((7, 7), np.uint8))           # nearest depth within 3 px
        d = dimg[kpts[:, 1].astype(int), kpts[:, 0].astype(int)]
        good = np.isfinite(d) & (d < 25)
        if not good.any():
            return
        kk, dd = kpts[good], d[good]
        xo = (kk[:, 0] - IMG_W / 2) * dd / FX
        yo = (kk[:, 1] - IMG_H / 2) * dd / FX
        pc = np.stack([dd, -xo, -yo], 1)                             # camera link frame
        pw = transform(self.T_model @ T_MODEL_CAM, pc)
        self.orbmap.insert(pw.astype(np.float32), np.tile([255, 40, 40], (len(pw), 1)).astype(np.uint8),
                           np.ones(len(pw), bool))

    def _draw(self, work, kp, p0, p1, n_trk, gain, dark, header):
        vis = cv2.cvtColor(work, cv2.COLOR_GRAY2BGR)
        for k in kp:
            x, y = map(int, k.pt)
            cv2.circle(vis, (x, y), 2, (0, 120, 255), 1)
        for (x0, y0), (x1, y1) in zip(p0.astype(int), p1.astype(int)):
            cv2.line(vis, (x0, y0), (x1, y1), (0, 200, 0), 1)
            cv2.rectangle(vis, (x1 - 3, y1 - 3), (x1 + 3, y1 + 3), (0, 255, 0), 1)
        overlay = vis.copy()
        cv2.rectangle(overlay, (0, 0), (IMG_W, 112), (0, 0, 0), -1)
        vis = cv2.addWeighted(overlay, 0.6, vis, 0.4, 0)
        f = cv2.FONT_HERSHEY_SIMPLEX
        col = {"OK": (0, 220, 0), "WEAK": (0, 200, 255), "LOST": (0, 0, 255), "INIT": (200, 200, 200)}
        s = self.status
        cv2.putText(vis, f"CAMERA  ORB features {len(kp):4d}  tracked {n_trk:4d}", (8, 20), f, 0.5, (255, 255, 255), 1)
        cv2.putText(vis, f"VISUAL TRACKING: {self.state}", (8, 42), f, 0.55, col[self.state], 2)
        cv2.putText(vis, f"LIDAR SLAM: {'TRACKING' if s else 'WAITING'}   icp {s.get('icp_ms', 0):4.0f} ms   "
                         f"map {s.get('map_k', 0):4d}k pts", (8, 64), f, 0.5, (255, 220, 120), 1)
        cv2.putText(vis, f"driven {s.get('dist', 0):6.1f} m   error vs truth {s.get('err', float('nan')):5.2f} m   "
                         f"gain x{gain:.1f}", (8, 86), f, 0.5, (255, 255, 255), 1)
        light = "IN SHADOW - headlamp only" if dark else f"SUNLIT - sun {self.sun_el:.0f} deg above horizon"
        cv2.putText(vis, f"LIGHT: {light}", (8, 106), f, 0.5, (120, 160, 255) if dark else (180, 255, 255), 1)
        cv2.putText(vis, "Connecting Ridge, lunar south pole (LOLA 5 m DEM)", (8, IMG_H - 10), f, 0.45, (200, 200, 200), 1)
        out = Image(header=header, height=IMG_H, width=IMG_W, encoding="bgr8", step=IMG_W * 3, data=vis.tobytes())
        out.header.frame_id = "camera_link"
        return out

    def publish_points(self):
        if self.orbmap.version == self._pts_sent:
            return
        self._pts_sent = self.orbmap.version
        xyz, rgb = self.orbmap.display(ORB_DISPLAY_VOXEL, ORB_DISPLAY_MAX)
        if len(xyz):
            self.pub_pts.publish(cloud_msg(Header(stamp=self.get_clock().now().to_msg(), frame_id="map"), xyz, rgb))

    def on_route(self, m: String):
        if m.data == "done":
            self.save_results()

    def save_results(self):
        if self.saved:
            return
        self.saved = True
        self.pub_vis.publish(String(data=json.dumps(self._vis())))
        xyz, rgb, _ = self.orbmap.arrays()
        if len(xyz):
            self.out_dir.mkdir(parents=True, exist_ok=True)
            write_ply(self.out_dir / "orb_points.ply", xyz, rgb)


def main():
    role = "lidar"
    if "--role" in sys.argv:
        role = sys.argv[sys.argv.index("--role") + 1]
    rclpy.init(args=sys.argv)
    node = LidarSlam() if role == "lidar" else CameraOrb()
    ex = MultiThreadedExecutor(num_threads=3)
    ex.add_node(node)
    try:
        ex.spin()
    except KeyboardInterrupt:
        pass
    finally:
        try:
            node.save_results()
        except Exception as e:  # never lose the run because of a shutdown race
            print(f"save failed: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
