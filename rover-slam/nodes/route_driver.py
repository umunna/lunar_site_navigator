#!/usr/bin/env python3
"""Drive the rover along the planned traverse (config/terrain_meta.json).

Stands in for an astronaut / operator walking a planned route. Uses ground truth
pose only to steer; the SLAM node never sees ground truth.
"""
import json
import math
import sys
from pathlib import Path

import rclpy
from geometry_msgs.msg import Twist
from nav_msgs.msg import Odometry
from rclpy.node import Node
from std_msgs.msg import String


def yaw_of(q) -> float:
    return math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z))


class RouteDriver(Node):
    def __init__(self, meta_path: Path):
        super().__init__("route_driver")
        meta = json.loads(meta_path.read_text())
        self.wps = [tuple(w) for w in meta["waypoints"]]
        self.declare_parameter("speed", 0.9)
        self.declare_parameter("start_delay", 6.0)
        # >0: exit this many (sim) seconds after the route is done, so a launch file can shut
        # the whole run down once the SLAM nodes have saved their results
        self.declare_parameter("exit_after_done", 0.0)
        self.exit_after = float(self.get_parameter("exit_after_done").value)
        self.t_done = None
        self.finished = False
        self.speed = float(self.get_parameter("speed").value)
        self.delay = float(self.get_parameter("start_delay").value)
        self.i = 0
        self.pose = None
        self.t_first = None
        self.done = False
        self.pub = self.create_publisher(Twist, "/cmd_vel", 10)
        self.status = self.create_publisher(String, "/route/status", 10)
        self.create_subscription(Odometry, "/ground_truth/odom", self.on_odom, 10)
        self.create_timer(0.1, self.step)
        self.get_logger().info(f"route with {len(self.wps)} waypoints")

    def on_odom(self, m: Odometry):
        p = m.pose.pose
        self.pose = (p.position.x, p.position.y, yaw_of(p.orientation))

    def step(self):
        cmd = Twist()
        now = self.get_clock().now().nanoseconds * 1e-9
        if self.done:
            self.pub.publish(cmd)
            self.status.publish(String(data="done"))      # repeat: late subscribers still save
            if self.t_done is None:
                self.t_done = now
            if self.exit_after > 0 and now - self.t_done >= self.exit_after:
                self.finished = True
            return
        if self.pose is None:
            self.pub.publish(cmd)
            return
        if self.t_first is None:
            self.t_first = now
        if now - self.t_first < self.delay:          # let SLAM initialise standing still
            self.pub.publish(cmd)
            return
        x, y, yaw = self.pose
        tx, ty = self.wps[self.i]
        d = math.hypot(tx - x, ty - y)
        if d < 2.0:
            self.i += 1
            if self.i >= len(self.wps):
                self.done = True
                self.get_logger().info("route complete")
                self.status.publish(String(data="done"))
                self.pub.publish(cmd)
                return
            tx, ty = self.wps[self.i]
        err = math.atan2(ty - y, tx - x) - yaw
        err = math.atan2(math.sin(err), math.cos(err))
        cmd.angular.z = max(-0.6, min(0.6, 1.5 * err))
        cmd.linear.x = self.speed * max(0.0, math.cos(err)) ** 2   # slow down while turning
        self.pub.publish(cmd)
        self.status.publish(String(data=f"waypoint {self.i + 1}/{len(self.wps)}"))


def main():
    rclpy.init(args=sys.argv)
    meta = Path(__file__).resolve().parents[1] / "config/terrain_meta.json"
    node = RouteDriver(meta)
    try:
        while rclpy.ok() and not node.finished:
            rclpy.spin_once(node, timeout_sec=0.2)
        if node.finished:
            node.get_logger().info("route done, results saved - ending run")
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
