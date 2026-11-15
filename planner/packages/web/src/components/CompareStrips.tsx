// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// One block per place over the same dates: a Sun lane, an Earth lane and a "neither" lane.
// Position says which body, so the strips read without colour. Click to open that moment in Sky view.
import { useRef } from 'react';
import type { PointerEvent, ReactElement } from 'react';
import type { SiteTrack } from '@lsn/shared';
import { useElementWidth } from '../hooks';
import { formatDateUtc } from '../lib/format';
import type { SiteSel } from '../lib/data';
import { litRuns, neitherRuns } from '../lib/runs';
import type { IndexWindow, Run } from '../lib/runs';

const GUTTER = 76;
const LANE_H = 10;
const LANE_GAP = 3;
const NAME_H = 18;
const BLOCK_GAP = 12;
const AXIS_H = 24;
const LANES = ['Sun', 'Earth', 'No Sun/Earth'] as const;
const BLOCK_H = NAME_H + LANES.length * (LANE_H + LANE_GAP) + BLOCK_GAP;

interface Props {
  readonly sites: readonly SiteSel[];
  readonly tracks: readonly SiteTrack[];
  readonly w: IndexWindow;
  readonly t0UnixS: number;
  readonly stepS: number;
  readonly onOpen: (siteId: string, idx: number) => void;
}

function lanesFor(track: SiteTrack, w: IndexWindow): Run[][] {
  return [litRuns(track.sun.marginDeg, w), litRuns(track.earth.marginDeg, w), neitherRuns(track.sun.marginDeg, track.earth.marginDeg, w)];
}

export function CompareStrips({ sites, tracks, w, t0UnixS, stepS, onOpen }: Props): ReactElement {
  const boxRef = useRef<HTMLDivElement>(null);
  const width = Math.max(360, useElementWidth(boxRef));
  const plotW = width - GUTTER - 8;
  const xOf = (i: number): number => GUTTER + ((i - w.i0) / (w.i1 - w.i0)) * plotW;
  const height = sites.length * BLOCK_H + AXIS_H;
  const days = (w.i1 - w.i0) / (86_400 / stepS);
  const tickEvery = days <= 14 ? 1 : 5;
  // A date label is about 34 px wide. On a narrow phone, label fewer ticks so neighbours never touch
  // (52 px also leaves room for the last label, which is right-aligned at the edge).
  const pxPerTick = (plotW * tickEvery) / days;
  const labelEvery = Math.max(tickEvery === 1 ? 2 : 1, Math.ceil(52 / pxPerTick));
  const open = (e: PointerEvent<SVGSVGElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    const block = Math.floor(((e.clientY - rect.top) / rect.height) * height / BLOCK_H);
    const site = sites[block];
    if (site === undefined || x < GUTTER) return;
    onOpen(site.id, Math.round(w.i0 + ((x - GUTTER) / plotW) * (w.i1 - w.i0)));
  };
  return (
    <section className="panel strips" aria-label="When the Sun and Earth are in view, place by place">
      <div ref={boxRef}>
        <svg width={width} height={height} viewBox={`0 0 ${String(width)} ${String(height)}`} role="img" onPointerUp={open}
          aria-label={`When the Sun and Earth are in view at ${sites.map((s) => s.name).join(', ')}, from ${formatDateUtc(t0UnixS + w.i0 * stepS)}. Click a point to open it in Sky view.`}>
          {sites.map((site, b) => {
            const track = tracks[b];
            if (track === undefined) return null;
            const top = b * BLOCK_H;
            return (
              <g key={site.id} transform={`translate(0 ${String(top)})`}>
                <text className="strip-site" x={0} y={13}>{site.name}{site.terrain === 'flat' ? ' (flat horizon)' : ''}</text>
                {lanesFor(track, w).map((runs, lane) => {
                  const y = NAME_H + lane * (LANE_H + LANE_GAP);
                  const kind = ['sun', 'earth', 'neither'][lane] ?? 'sun';
                  return (
                    <g key={kind}>
                      <text className="strip-lane-label" x={0} y={y + LANE_H - 1}>{LANES[lane]}</text>
                      <rect className="strip-lane-bg" x={GUTTER} y={y} width={plotW} height={LANE_H} />
                      {runs.map((r) => <rect key={r.from} className={`strip-run strip-${kind}`} x={xOf(r.from)} y={y} width={Math.max(1, xOf(r.to) - xOf(r.from))} height={LANE_H} />)}
                    </g>
                  );
                })}
              </g>
            );
          })}
          {Array.from({ length: Math.floor(days / tickEvery) + 1 }, (_, k) => {
            const idx = w.i0 + Math.round((k * tickEvery * 86_400) / stepS);
            const x = xOf(idx);
            return (
              <g key={k}>
                <line className="strip-tick" x1={x} x2={x} y1={height - AXIS_H} y2={height - AXIS_H + 5} />
                {k % labelEvery === 0 ? (
                  <text className="strip-date" x={x} y={height - 6} textAnchor={x > width - 24 ? 'end' : 'middle'}>{formatDateUtc(t0UnixS + idx * stepS).slice(5)}</text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="note">A coloured bar means: in view. The pink bar shows the times with no Sun and no Earth in view. Click a point to open that place and time in Sky view.</p>
    </section>
  );
}
