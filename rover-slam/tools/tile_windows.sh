#!/bin/bash
# Arrange the demo windows:  [ Gazebo (top-left)  ][                     ]
#                            [ ORB camera (b-left)][  RViz 3D SLAM map   ]
command -v wmctrl >/dev/null || exit 0
# Screen size from the root window - NOT xrandr: RandR queries make the NVIDIA driver
# re-probe outputs on this hybrid laptop, which showed up right before the Xorg crash.
read -r W H < <(xwininfo -root 2>/dev/null | awk '/Width:/{w=$2} /Height:/{h=$2} END{print w, h}')
W=${W:-1920}; H=${H:-1080}; H=$((H - 40))        # leave room for the panel
LW=$((W * 45 / 100)); RW=$((W - LW)); TH=$((H / 2))

place() {   # title-substring x y w h
    for _ in $(seq 1 40); do
        id=$(wmctrl -l | grep -i -- "$1" | head -1 | awk '{print $1}')
        if [ -n "$id" ]; then
            wmctrl -i -r "$id" -b remove,maximized_vert,maximized_horz
            wmctrl -i -r "$id" -e "0,$2,$3,$4,$5"
            return 0
        fi
        sleep 0.5
    done
}
place "Gazebo Sim" 0 0 "$LW" "$TH" &
place "rqt_image_view" 0 "$TH" "$LW" $((H - TH)) &
place "RViz" "$LW" 0 "$RW" "$H" &
wait
