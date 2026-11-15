"""Lunar SLAM viewers: Gazebo window, RViz (3D SLAM map) and the ORB camera view.

Only displays - start/stop/restart freely while core.launch.py runs; it does not affect the run.

    ros2 launch launch/viewers.launch.py              # all windows
    ros2 launch launch/viewers.launch.py gui:=false   # skip the Gazebo window (lightest)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from launch import LaunchDescription  # noqa: E402
from launch.actions import DeclareLaunchArgument, ExecuteProcess, TimerAction  # noqa: E402
from launch.conditions import IfCondition  # noqa: E402
from launch.substitutions import LaunchConfiguration  # noqa: E402

from _common import ROOT, SIM, base_env, viewer_env  # noqa: E402


def generate_launch_description():
    env, venv = base_env(), viewer_env()
    gui = LaunchConfiguration("gui")
    rviz = LaunchConfiguration("rviz")

    client = ExecuteProcess(cmd=["gz", "sim", "-g", "--gui-config", str(ROOT / "config/gz_gui.config")],
                            env=venv, output="log", name="gazebo_gui", condition=IfCondition(gui))
    follow = ExecuteProcess(cmd=["bash", "-c",
                                 "gz service -s /gui/follow/offset --reqtype gz.msgs.Vector3d --reptype gz.msgs.Boolean "
                                 "--timeout 3000 --req 'x: -9, y: 0, z: 4.5' >/dev/null; "
                                 "gz service -s /gui/follow --reqtype gz.msgs.StringMsg --reptype gz.msgs.Boolean "
                                 "--timeout 3000 --req 'data: \"rover\"' >/dev/null"],
                            env=env, output="log", name="gui_follow", condition=IfCondition(gui))
    viz = ExecuteProcess(cmd=["rviz2", "-d", str(ROOT / "config/lunar_slam.rviz"), *SIM],
                         env=venv, output="log", name="rviz", condition=IfCondition(rviz))
    cam_view = ExecuteProcess(cmd=["ros2", "run", "rqt_image_view", "rqt_image_view", "/slam/orb_image"],
                              env=venv, output="log", name="orb_camera_view", condition=IfCondition(rviz))
    tile = ExecuteProcess(cmd=["bash", str(ROOT / "tools/tile_windows.sh")], env=env, output="log", name="tile")

    return LaunchDescription([
        DeclareLaunchArgument("gui", default_value="true", description="open the Gazebo window"),
        DeclareLaunchArgument("rviz", default_value="true", description="open RViz (3D map + camera view)"),
        client, viz, cam_view,
        TimerAction(period=8.0, actions=[follow, tile]),
    ])
