#!/bin/bash
# Lunar south-pole SLAM demo - one command.
#
#   ./run_demo.sh                 run: Gazebo window + RViz (3D map) + ORB camera view
#   ./run_demo.sh gui:=false      no Gazebo window (lightest on the GPU)
#   ./run_demo.sh speed:=1.2      faster rover
#   ./run_demo.sh --viewers       reopen the windows for a run that is still going
#   ./run_demo.sh --stop          stop a running run (results are saved)
#   ./run_demo.sh --status        is a run going? where is its log?
#
# Crash-proofing: the simulation + SLAM ("core") runs in its own session, detached from the
# desktop. If the display server crashes, the windows die but the run keeps going, ends by
# itself after the route and saves results/run_<date>/ - reopen windows with --viewers.
# Ctrl+C here stops the whole run cleanly (results are saved).
set -u
DEMO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIDFILE="$DEMO/results/.core.pid"
PERF_STATE="$DEMO/results/.perf_restore"
mkdir -p "$DEMO/results"

pause() { [ -t 0 ] && read -rp "$1" _; }
core_pid() { local p; p=$(cat "$PIDFILE" 2>/dev/null) && kill -0 "$p" 2>/dev/null && echo "$p"; }
stop_core() {
    local p; p=$(core_pid) || return 0
    echo "Stopping run (saving results)..."
    kill -INT -- "-$p" 2>/dev/null
    for _ in $(seq 1 40); do kill -0 "$p" 2>/dev/null || return 0; sleep 0.5; done
    kill -TERM -- "-$p" 2>/dev/null
}

# ---- environment (ROS 2 + all data on the SATA disk); ROS setup scripts need nounset off
set +u
SATA_ENV="$DEMO/../../ros2_env.sh"
if [ -f "$SATA_ENV" ]; then
    source "$SATA_ENV" >/dev/null
elif [ -f /opt/ros/jazzy/setup.bash ]; then
    source /opt/ros/jazzy/setup.bash             # cloned elsewhere: plain ROS 2 Jazzy
else
    echo "ROS 2 Jazzy not found (and SATA disk env not mounted)." >&2; pause "Enter to close"; exit 1
fi
set -u
export PYTHONNOUSERSITE=1
PY="$DEMO/venv/bin/python"; [ -x "$PY" ] || PY=python3

case "${1:-}" in
    --stop)    stop_core; exit 0 ;;
    --status)  if p=$(core_pid); then echo "run active (pid $p), log: $(cat "$PIDFILE.log" 2>/dev/null)"; else echo "no run active"; fi; exit 0 ;;
    --viewers) shift; core_pid >/dev/null || echo "note: no run active - windows will stay empty"
               exec ros2 launch "$DEMO/launch/viewers.launch.py" "$@" ;;
esac

if p=$(core_pid); then
    echo "A run is already active (pid $p). Use --viewers to see it or --stop to end it." >&2; exit 1
fi

# ---- split args: speed -> core, gui/rviz -> viewers
CORE_ARGS=(); VIEW_ARGS=()
for a in "$@"; do
    case "$a" in gui:=*|rviz:=*) VIEW_ARGS+=("$a") ;; *) CORE_ARGS+=("$a") ;; esac
done

# ---- world assets (meshes are generated, not stored in git)
if [ ! -f "$DEMO/models/lunar_patch/meshes/terrain.obj" ] || [ ! -f "$DEMO/models/lunar_patch/meshes/rocks.obj" ]; then
    echo "Building terrain + rock meshes from the stored heightmap (a few seconds)..."
    "$PY" "$DEMO/tools/make_world.py" --from-assets || { pause "Mesh build failed. Enter to close"; exit 1; }
fi

# ---- performance mode (restored when the run ends)
perf_on() {
    : > "$PERF_STATE"
    if command -v powerprofilesctl >/dev/null; then
        echo "profile=$(powerprofilesctl get)" >> "$PERF_STATE"
        powerprofilesctl set performance 2>/dev/null
    fi
    if command -v nvidia-settings >/dev/null && [ -n "${DISPLAY:-}" ]; then
        echo "powermizer=$(nvidia-settings -tq GpuPowerMizerMode 2>/dev/null | head -1)" >> "$PERF_STATE"
        nvidia-settings -a GpuPowerMizerMode=1 >/dev/null 2>&1    # prefer maximum performance
    fi
    echo "Performance mode: power profile=$(powerprofilesctl get 2>/dev/null || echo n/a), NVIDIA PowerMizer=$(nvidia-settings -tq GpuPowerMizerMode 2>/dev/null | head -1 || echo n/a) (1 = max performance)"
}
perf_on

# ---- core: detached session, own log; restores performance settings when it ends
OUT="$DEMO/results/run_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$OUT"
echo "$OUT/core.log" > "$PIDFILE.log"
# (env --default-signal: bash makes background jobs ignore SIGINT, which would make the
#  run deaf to Ctrl+C / --stop and leave it to the slower SIGTERM escalation)
env --default-signal=INT,QUIT setsid bash -c '
    echo $$ > "$1"; shift
    out=$1; perf=$2; demo=$3; shift 3
    ros2 launch "$demo/launch/core.launch.py" out_dir:="$out" exit_after_done:=8.0 "$@"
    if [ -f "$perf" ]; then
        p=$(sed -n "s/^profile=//p" "$perf"); [ -n "$p" ] && powerprofilesctl set "$p" 2>/dev/null
        m=$(sed -n "s/^powermizer=//p" "$perf"); [ -n "$m" ] && [ -n "${DISPLAY:-}" ] && nvidia-settings -a GpuPowerMizerMode="$m" >/dev/null 2>&1
        rm -f "$perf"
    fi
    trap "" TERM; kill -TERM 0 2>/dev/null   # nothing from this run may outlive it
' core "$PIDFILE" "$OUT" "$PERF_STATE" "$DEMO" "${CORE_ARGS[@]}" > "$OUT/core.log" 2>&1 < /dev/null &
for _ in $(seq 1 20); do core_pid >/dev/null && break; sleep 0.1; done
CORE=$(core_pid) || { echo "core failed to start, see $OUT/core.log" >&2; pause "Enter to close"; exit 1; }

echo "Run started (Connecting Ridge, lunar south pole): $OUT"
echo "The rover drives from sunlight into the shadow and back (~5 min), then the run ends by itself."
echo "Core log: $OUT/core.log    Ctrl+C = stop the run"

# Ctrl+C / kill: stop everything. Terminal closed (HUP, e.g. the desktop crashed): leave the core running.
trap 'stop_core; kill $VIEW 2>/dev/null; wait 2>/dev/null; exit 130' INT TERM
trap 'exit 0' HUP

sleep 7                                            # world + rover up before the windows connect
env --default-signal=INT,QUIT ros2 launch "$DEMO/launch/viewers.launch.py" "${VIEW_ARGS[@]}" > "$OUT/viewers.log" 2>&1 &
VIEW=$!

while kill -0 "$CORE" 2>/dev/null; do sleep 1; done
echo
if [ -f "$OUT/summary.txt" ]; then echo "Results: $OUT"; cat "$OUT/summary.txt"; else echo "Run ended without a summary - see $OUT/core.log"; fi
pause "Run finished - windows stay open to inspect the map. Press Enter to close them"
close_viewers() {
    kill -INT "$VIEW" 2>/dev/null
    for _ in $(seq 1 20); do kill -0 "$VIEW" 2>/dev/null || return 0; sleep 0.5; done
    kill -TERM "$VIEW" 2>/dev/null; wait "$VIEW" 2>/dev/null
}
close_viewers
