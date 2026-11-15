// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// The panorama: azimuth 0 to 360 across, elevation up. Sun and Earth are drawn
// behind the terrain, so a ridge hides them exactly as it would in the sky.
import { useEffect, useMemo, useRef } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { EPHEMERIS_FLOATS_PER_SAMPLE, bodyAzEl, makeSiteFrame, newAzEl, sampleVectors } from '@lsn/shared';
import type { Ephemeris } from '@lsn/shared';
import { useElementWidth } from '../hooks';
import { formatDeg } from '../lib/format';
import type { SkyNow } from '../lib/live';
import { azToX, discMark, elToY, niceStep, sceneView, skylinePaths, trailPaths, visibleSpanDeg } from '../lib/panorama';
import type { PanoramaView, SkyPoint } from '../lib/panorama';
import type { SiteSel } from '../lib/data';

const HEIGHT_PX = 320;
const MIN_WIDTH_PX = 960;
const TRAIL_HALF_HOURS = 12;
const TRAIL_STEP_MIN = 30;

function trail(eph: Ephemeris, site: SiteSel, idx: number, stepS: number): SkyPoint[][] {
  const frame = makeSiteFrame(site.latDeg, site.lonDeg, 0);
  const v = new Float64Array(EPHEMERIS_FLOATS_PER_SAMPLE);
  const ae = newAzEl();
  const sun: SkyPoint[] = [];
  const earth: SkyPoint[] = [];
  const stepIdx = (TRAIL_STEP_MIN * 60) / stepS;
  const n = (TRAIL_HALF_HOURS * 60) / TRAIL_STEP_MIN;
  for (let k = -n; k <= n; k++) {
    const i = idx + k * stepIdx;
    if (i < 0 || i > eph.meta.count - 1) continue;
    sampleVectors(eph, i, v);
    bodyAzEl(frame, v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, ae);
    sun.push({ azDeg: ae.azDeg, elDeg: ae.elDeg });
    bodyAzEl(frame, v[3] ?? 0, v[4] ?? 0, v[5] ?? 0, ae);
    earth.push({ azDeg: ae.azDeg, elDeg: ae.elDeg });
  }
  return [sun, earth];
}

function Grid({ view }: { view: PanoramaView }): ReactElement {
  const span = visibleSpanDeg(view);
  const step = niceStep(span);
  const lo = view.centerElDeg - span / 2;
  const hi = view.centerElDeg + span / 2;
  const lines: ReactElement[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    const y = elToY(v, view);
    lines.push(
      <g key={v.toFixed(3)}>
        <line className={Math.abs(v) < 1e-9 ? 'pano-horizon' : 'pano-grid'} x1={0} x2={view.widthPx} y1={y} y2={y} />
        <text className="pano-label" x={6} y={y - 4}>
          {Math.abs(v) < 1e-9 ? '0° level ground' : formatDeg(v, step < 1 ? 1 : 0)}
        </text>
      </g>,
    );
  }
  return <>{lines}</>;
}

function AzimuthAxis({ view }: { view: PanoramaView }): ReactElement {
  const ticks: ReactElement[] = [];
  for (let az = 0; az < 360; az += 15) {
    const x = azToX(az, view);
    const label = az % 90 === 0 ? ({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' } as Record<number, string>)[az] : az % 45 === 0 ? `${String(az)}°` : '';
    ticks.push(
      <g key={az}>
        <line className="pano-tick" x1={x} x2={x} y1={view.heightPx - 14} y2={view.heightPx - (az % 45 === 0 ? 4 : 8)} />
        {label !== '' ? (
          <text className={az % 90 === 0 ? 'pano-cardinal' : 'pano-axis-label'} x={x + 4} y={view.heightPx - 16}>
            {label}
          </text>
        ) : null}
      </g>,
    );
  }
  return <>{ticks}</>;
}

interface DiscProps {
  readonly view: PanoramaView;
  readonly az: number;
  readonly el: number;
  readonly kind: 'sun' | 'earth';
  readonly label: string;
  /** True when no part of the real disc is above the hills. */
  readonly hidden: boolean;
}

/** Lowest centre of a "hidden" outline, pixels above the bottom edge, so it never leaves the picture. */
const GHOST_FLOOR_PX = 44;
/** A label stays this far from the left and right edge, so its text is never cut. */
const LABEL_EDGE_PX = 52;

/**
 * The Sun or the Earth. In view: a solid round mark. Hidden: a dashed outline in the same
 * place, drawn in front of the hills, so that the user can see where it is behind them.
 */
function Disc({ view, az, el, kind, label, hidden }: DiscProps): ReactElement {
  const d = discMark(az, el, kind, view);
  const cy = hidden ? Math.min(d.cy, view.heightPx - GHOST_FLOOR_PX) : d.cy;
  const copies = [0, -view.widthPx, view.widthPx].filter((dx) => d.cx + dx + d.rPx > 0 && d.cx + dx - d.rPx < view.widthPx);
  return (
    <>
      {copies.map((dx) => (
        <g key={dx} className={`disc disc-${kind}${hidden ? ' disc-hidden' : ''}`}>
          <circle cx={d.cx + dx} cy={cy} r={d.rPx} />
          {kind === 'earth' && !hidden ? <circle className="disc-ring" cx={d.cx + dx} cy={cy} r={d.rPx * 0.55} /> : null}
          <text className="disc-label" x={Math.min(view.widthPx - LABEL_EDGE_PX, Math.max(LABEL_EDGE_PX, d.cx + dx))} y={cy - d.rPx - 6} textAnchor="middle">
            {hidden ? `${label} (hidden)` : label}
          </text>
        </g>
      ))}
    </>
  );
}

interface Props {
  readonly site: SiteSel;
  readonly now: SkyNow;
  readonly eph: Ephemeris;
  readonly timeIdx: number;
  /** The time controls, shown directly under the picture. */
  readonly children?: ReactNode;
}

export function Panorama({ site, now, eph, timeIdx, children }: Props): ReactElement {
  const boxRef = useRef<HTMLDivElement>(null);
  const boxWidth = useElementWidth(boxRef);
  const width = Math.max(MIN_WIDTH_PX, boxWidth);
  // Memoised: a fresh `view` object every render would redraw the hills on each animation frame.
  const view = useMemo(() => sceneView(width, HEIGHT_PX, site.skyline), [width, site.skyline]);
  const paths = useMemo(() => skylinePaths(site.skyline, view), [site.skyline, view]);
  const [sunTrail, earthTrail] = useMemo(() => trail(eph, site, Math.round(timeIdx), eph.meta.stepS), [eph, site, Math.round(timeIdx / 6)]); // eslint-disable-line react-hooks/exhaustive-deps
  const sunHidden = now.sun.marginDeg <= 0;
  const earthHidden = now.earth.marginDeg <= 0;

  // On a narrow screen the picture is wider than the screen: start with the Sun in the middle.
  useEffect(() => {
    const box = boxRef.current;
    if (box !== null && boxWidth > 0) box.scrollLeft = Math.max(0, azToX(now.sun.azDeg, view) - boxWidth / 2);
  }, [site.id, boxWidth]); // eslint-disable-line react-hooks/exhaustive-deps

  const state = (hidden: boolean): string => (hidden ? 'hidden behind the hills or below the horizon' : 'in view');
  const label = `View from ${site.name}. Sun: ${state(sunHidden)}, compass direction ${now.sun.azDeg.toFixed(0)} degrees, height ${formatDeg(now.sun.elDeg)}. Earth: ${state(earthHidden)}, compass direction ${now.earth.azDeg.toFixed(0)} degrees, height ${formatDeg(now.earth.elDeg)}.`;
  return (
    <section className="panel panorama" aria-label="View of the horizon">
      <h2 className="panorama-title">See it in the sky</h2>
      <div className="panorama-scroll" ref={boxRef}>
        <svg width={width} height={HEIGHT_PX} viewBox={`0 0 ${String(width)} ${String(HEIGHT_PX)}`} role="img" aria-label={label}>
          <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="sky-top" />
              <stop offset="1" className="sky-bottom" />
            </linearGradient>
          </defs>
          <rect width={width} height={HEIGHT_PX} fill="url(#sky)" />
          <Grid view={view} />
          {[sunTrail, earthTrail].map((pts, i) => trailPaths(pts ?? [], view).map((d) => <path key={`${String(i)}${d.slice(0, 12)}`} className={i === 0 ? 'trail trail-sun' : 'trail trail-earth'} d={d} />))}
          {earthHidden ? null : <Disc view={view} az={now.earth.azDeg} el={now.earth.elDeg} kind="earth" label="Earth" hidden={false} />}
          {sunHidden ? null : <Disc view={view} az={now.sun.azDeg} el={now.sun.elDeg} kind="sun" label="Sun" hidden={false} />}
          <path className="pano-ground" d={paths.ground} />
          <path className="pano-skyline" d={paths.line} />
          {earthHidden ? <Disc view={view} az={now.earth.azDeg} el={now.earth.elDeg} kind="earth" label="Earth" hidden /> : null}
          {sunHidden ? <Disc view={view} az={now.sun.azDeg} el={now.sun.elDeg} kind="sun" label="Sun" hidden /> : null}
          <AzimuthAxis view={view} />
        </svg>
      </div>
      {children !== undefined ? <div className="panorama-time">{children}</div> : null}
      <details className="panorama-more">
        <summary>How to read this picture</summary>
        <ul className="note read-list">
          <li>You stand at this place on the Moon and turn around one time. Left to right is that full turn: north (N), east (E), south (S), west (W).</li>
          <li>The grey shape is the Moon’s ground around you: hills and crater rims.</li>
          <li>The black area is the sky. The Moon has no air, so its sky is always black.</li>
          <li>A bright disc is the Sun or the Earth in view. A dashed circle means that it is hidden behind the hills or below the horizon.</li>
          <li>Press Play to see them move. A dotted line shows their path for 12 hours before and after.</li>
          <li>The hills look steeper than they are: the picture is stretched upward 8 times, because the Sun stays very low here.</li>
        </ul>
      </details>
    </section>
  );
}
