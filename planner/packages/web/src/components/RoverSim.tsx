// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// The Rover sim page. The rover simulation (../rover-slam) needs ROS 2 and Gazebo on a
// Linux computer, so a browser cannot run it. This page plays a recording of one run.
// The recording is the file data/rover-demo.mp4. Until that file exists, the page shows
// the terrain picture of the simulation.
import { useState } from 'react';
import type { ReactElement } from 'react';
import { ROVER_DEMO } from '@lsn/shared';
import terrainPreview from '../../../../../rover-slam/preview/terrain_preview.png';

export const ROVER_VIDEO_FILE = 'rover-demo.mp4';

/** Numbers that the rover simulation reports for its run of 14 Nov 2026 (rover-slam/README.md). */
const RUN_FACTS: readonly { label: string; value: string }[] = [
  { label: 'Distance driven', value: '265.4 m' },
  { label: 'Position error at the end', value: '0.25 m' },
  { label: 'Largest position error', value: '0.70 m' },
  { label: 'Camera pictures taken in shadow', value: '60%' },
];

interface Props {
  readonly onOpen: (siteId: string) => void;
}

export function RoverSim({ onOpen }: Props): ReactElement {
  const [videoMissing, setVideoMissing] = useState(false);
  return (
    <div className="rover">
      <div className="rover-main">
        <section className="panel rover-media" aria-label="Recording of the rover simulation">
          <h1>Rover simulation at Connecting Ridge</h1>
          {videoMissing ? (
            <>
              <img src={terrainPreview} alt="Map of the simulation area: the hills, the shadow in blue and the route of the rover in orange." />
              <p className="note">The recording of the run is not in the app yet. The picture shows the area: hills, the shadow (blue) and the route of the rover (orange).</p>
            </>
          ) : (
            <>
              <video controls playsInline preload="metadata" poster={terrainPreview} src={`${import.meta.env.BASE_URL}${ROVER_VIDEO_FILE}`} onError={() => { setVideoMissing(true); }} aria-label="Recording of one run of the rover simulation" />
              <p className="note">Press play to see one full run. Orange line: where the rover thinks it is. Green line: where it really is.</p>
            </>
          )}
        </section>
        <section className="panel rover-side" aria-label="What the rover simulation shows">
          <h2>What you see</h2>
          <div className="explain">
            <p>A rover drives from sunlight into the deep shadow of a ridge, goes around a loop and comes back.</p>
            <p>In the shadow it has no Sun to steer by. It finds its position from a laser scanner, a motion sensor and its wheels, and it draws a map as it drives.</p>
            <p>The simulation uses NASA’s height map of this area. It runs on a Linux computer with ROS 2 and Gazebo, so this page shows a recording.</p>
          </div>
          <h2>Result of the recorded run</h2>
          <dl className="rover-facts">
            {RUN_FACTS.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
          </dl>
          <p className="note">These numbers come from the report of the simulation. The rover is simulated, not real.</p>
          <button type="button" className="btn btn-primary" onClick={() => { onOpen(ROVER_DEMO.siteId); }}>See the Sun and Earth at this place</button>
        </section>
      </div>
    </div>
  );
}
