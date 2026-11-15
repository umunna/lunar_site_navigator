"""Lunar SLAM core: headless Gazebo + rover + bridge + LiDAR-inertial SLAM + ORB camera + route driver.

Opens no windows. Sensors render off-screen (EGL on the GPU), so the run does not depend
on the desktop/X server: if the display crashes, the run still finishes and saves results.

    ros2 launch launch/core.launch.py                      # run until Ctrl+C
    ros2 launch launch/core.launch.py exit_after_done:=8   # stop 8 s after the route ends
    ros2 launch launch/core.launch.py speed:=1.2 out_dir:=/tmp/run1
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from launch import LaunchDescription  # noqa: E402
from launch.actions import DeclareLaunchArgument, EmitEvent, ExecuteProcess, RegisterEventHandler, TimerAction  # noqa: E402
from launch.event_handlers import OnProcessExit  # noqa: E402
from launch.events import Shutdown  # noqa: E402
from launch.substitutions import LaunchConfiguration  # noqa: E402
from launch_ros.actions import Node  # noqa: E402

from _common import PY, ROOT, SIM, base_env  # noqa: E402


def generate_launch_description():
    meta = json.loads((ROOT / "config/terrain_meta.json").read_text())
    sp = meta["spawn"]
    env = base_env()
    speed = LaunchConfiguration("speed")
    out_dir = LaunchConfiguration("out_dir")
    exit_after = LaunchConfiguration("exit_after_done")

    server = ExecuteProcess(cmd=["gz", "sim", "-s", "-r", "--headless-rendering", str(ROOT / "worlds/south_pole.sdf")],
                            env=env, output="screen", name="gazebo_server")
    # Node (not `ros2 run`): launch signals the bridge binary itself; the `ros2 run` wrapper used to
    # die on shutdown and leave the real parameter_bridge process orphaned
    bridge = Node(package="ros_gz_bridge", executable="parameter_bridge", output="log",
                  parameters=[{"config_file": str(ROOT / "config/bridge.yaml")}])
    spawn = ExecuteProcess(cmd=["ros2", "run", "ros_gz_sim", "create", "-world", "south_pole", "-name", "rover",
                                "-file", str(ROOT / "models/rover/model.sdf"),
                                "-x", str(sp["x"]), "-y", str(sp["y"]), "-z", str(sp["z"]), "-Y", str(sp["yaw"])],
                           env=env, output="screen", name="spawn_rover")
    lidar = ExecuteProcess(cmd=[PY, str(ROOT / "nodes/slam_node.py"), "--role", "lidar", *SIM, "-p", ["out_dir:=", out_dir]],
                           env=env, output="screen", name="lidar_slam")
    camera = ExecuteProcess(cmd=[PY, str(ROOT / "nodes/slam_node.py"), "--role", "camera", *SIM, "-p", ["out_dir:=", out_dir]],
                            env=env, output="screen", name="camera_orb")
    driver = ExecuteProcess(cmd=[PY, str(ROOT / "nodes/route_driver.py"), *SIM, "-p", ["speed:=", speed],
                                 "-p", ["exit_after_done:=", exit_after]],
                            env=env, output="screen", name="route_driver")

    return LaunchDescription([
        DeclareLaunchArgument("speed", default_value="0.9", description="rover speed m/s"),
        DeclareLaunchArgument("out_dir", default_value=str(ROOT / "results" / time.strftime("run_%Y%m%d_%H%M%S")),
                              description="where map.ply / trajectories / summary.txt go"),
        DeclareLaunchArgument("exit_after_done", default_value="0.0",
                              description=">0: end the whole run this many sim-seconds after the route is complete"),
        server, bridge,
        TimerAction(period=6.0, actions=[spawn]),
        TimerAction(period=9.0, actions=[lidar, camera]),
        TimerAction(period=12.0, actions=[driver]),
        # driver exits only when exit_after_done > 0 (or on Ctrl+C) -> end the run cleanly
        RegisterEventHandler(OnProcessExit(target_action=driver,
                                           on_exit=[TimerAction(period=3.0, actions=[EmitEvent(event=Shutdown(reason="route done"))])])),
    ])
