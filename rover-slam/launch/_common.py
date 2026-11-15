"""Shared paths and environments for the lunar SLAM launch files (not a launch file itself)."""
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VENV_PY = ROOT / "venv/bin/python"
PY = str(VENV_PY if VENV_PY.exists() else shutil.which("python3"))
SIM = ["--ros-args", "-p", "use_sim_time:=true"]


def base_env() -> dict:
    env = dict(os.environ)
    env["PYTHONNOUSERSITE"] = "1"   # ~/.local numpy 2.x breaks the ROS-built OpenCV
    env["GZ_SIM_RESOURCE_PATH"] = f"{ROOT / 'models'}:{env.get('GZ_SIM_RESOURCE_PATH', '')}"
    return env


def _prime_mode() -> str:
    try:
        return subprocess.run(["prime-select", "query"], capture_output=True, text=True, timeout=3).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def viewer_env() -> dict:
    """Environment for windowed (OpenGL) programs.

    - vsync on: caps each window at the display refresh rate instead of rendering
      as fast as possible, the biggest cut in GPU load from the viewers.
    - PRIME render offload only when the laptop is in on-demand mode; in 'nvidia'
      mode everything already runs on the RTX GPU and the offload vars do nothing.
    """
    env = base_env()
    env["__GL_SYNC_TO_VBLANK"] = "1"
    env["vblank_mode"] = "1"
    mode = os.environ.get("LUNAR_DEMO_NVIDIA", "auto")
    if mode == "1" or (mode == "auto" and _prime_mode() == "on-demand"):
        env.update({"__NV_PRIME_RENDER_OFFLOAD": "1", "__GLX_VENDOR_LIBRARY_NAME": "nvidia"})
    return env
