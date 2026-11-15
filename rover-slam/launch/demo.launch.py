"""Lunar south-pole SLAM demo, all in one launch: core (sim + SLAM) + viewers.

    ros2 launch launch/demo.launch.py            # everything
    ros2 launch launch/demo.launch.py gui:=false # no Gazebo window (RViz only, lighter)
    ros2 launch launch/demo.launch.py speed:=1.2 # faster drive

Here the run lives in the same process tree as the windows. For crash-proof runs use
./run_demo.sh, which starts the core detached from the desktop session.
"""
from pathlib import Path

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription, TimerAction
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration

HERE = Path(__file__).resolve().parent


def generate_launch_description():
    core = IncludeLaunchDescription(PythonLaunchDescriptionSource(str(HERE / "core.launch.py")),
                                    launch_arguments={"speed": LaunchConfiguration("speed")}.items())
    viewers = IncludeLaunchDescription(PythonLaunchDescriptionSource(str(HERE / "viewers.launch.py")),
                                       launch_arguments={"gui": LaunchConfiguration("gui"),
                                                         "rviz": LaunchConfiguration("rviz")}.items())
    return LaunchDescription([
        DeclareLaunchArgument("gui", default_value="true"),
        DeclareLaunchArgument("rviz", default_value="true"),
        DeclareLaunchArgument("speed", default_value="0.9"),
        core,
        TimerAction(period=7.0, actions=[viewers]),
    ])
