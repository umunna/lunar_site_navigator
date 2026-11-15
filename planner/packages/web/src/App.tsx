// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { CATALOG, smoothSphereDipDeg, windowMetrics, windowStart } from '@lsn/shared';
import type { SiteTrack } from '@lsn/shared';
import { About } from './components/About';
import { CompareView } from './components/CompareView';
import { MetricsCard } from './components/MetricsCard';
import { Panorama } from './components/Panorama';
import { Readouts } from './components/Readouts';
import { RoverSim } from './components/RoverSim';
import { SiteHeader } from './components/SiteHeader';
import { SPEEDS, TimeControls } from './components/TimeControls';
import { TopBar } from './components/TopBar';
import { useAppData, useHashSync, usePlayback } from './hooks';
import { countdowns, skyNow } from './lib/live';
import { selectSite } from './lib/data';
import type { AppData, SiteSel, ValidationEntry } from './lib/data';
import { clampTime, parseHash } from './lib/state';
import type { AppState, TimeRange } from './lib/state';
import { SAMPLES_PER_DAY } from './lib/runs';
import { TrackCache } from './lib/trackCache';

// In the 14 days after the default date, ridges hide the Sun at this place part of the time, and
// there are stretches with no Sun and no Earth in view: the clearest example of what the app shows.
const DEFAULT_SITE = 'haworth-high';
const DEFAULT_COMPARE: readonly string[] = ['haworth-high', 'shackleton-high', 'mons-malapert-high'];

function defaultState(range: TimeRange): AppState {
  return {
    siteId: DEFAULT_SITE,
    timeUnixS: clampTime(Math.round(Date.now() / 60_000) * 60, range),
    view: 'site',
    compareIds: DEFAULT_COMPARE,
    windowDays: 14,
  };
}

/** One plain sentence at the top of each page that says what the page is for. */
const PAGE_INTRO: Readonly<Record<AppState['view'], string | null>> = {
  site: null,
  compare: 'Compare 2 to 4 places for the same dates. See which place has more sunlight and more time with the Earth in view.',
  rover: 'What can a rover do when a place has no Sun and no Earth in view? Our rover simulation drives into such a shadow and keeps track of its position.',
  about: null,
};

interface ScreenProps {
  readonly data: AppData;
  readonly state: AppState;
  readonly site: SiteSel;
  readonly track: SiteTrack;
  readonly timeIdx: number;
  readonly onAbout: () => void;
  readonly onChangePlace: () => void;
  /** Date, step and play controls. They sit under the picture of the horizon. */
  readonly timeControls: ReactElement;
}

function SiteScreen({ data, state, site, track, timeIdx, onAbout, onChangePlace, timeControls }: ScreenProps): ReactElement {
  const { t0UnixS, stepS, count } = data.eph.meta;
  const now = skyNow(data.eph, site.latDeg, site.lonDeg, site.skyline, timeIdx);
  const cds = countdowns(track, timeIdx, t0UnixS, stepS);
  const len = Math.round(state.windowDays * SAMPLES_PER_DAY);
  const i0 = windowStart(timeIdx, len, count);
  const metrics = windowMetrics(track, i0, i0 + len, stepS);
  return (
    <>
      <Readouts now={now} cds={cds} dataEndUnixS={t0UnixS + (count - 1) * stepS} flatDipDeg={smoothSphereDipDeg(data.observerHeightM)} />
      <SiteHeader site={site} timeUnixS={t0UnixS + timeIdx * stepS} onChangePlace={onChangePlace} />
      <Panorama key={site.id} site={site} now={now} eph={data.eph} timeIdx={timeIdx}>{timeControls}</Panorama>
      <MetricsCard metrics={metrics} fromUnixS={t0UnixS + i0 * stepS} days={state.windowDays} />
      <footer className="limits">
        The app shows where the Sun and Earth are in the sky. It does not calculate solar power or radio quality.{' '}
        <button type="button" className="link" onClick={onAbout}>Where the data comes from, and its limits</button>
      </footer>
    </>
  );
}

interface PlannerState {
  readonly state: AppState;
  readonly patch: (p: Partial<AppState>) => void;
  /** Functional time update, for playback: reads the latest time, not the one from the last render. */
  readonly setTime: (update: (t: number) => number) => void;
}

function usePlannerState(range: TimeRange): PlannerState {
  const siteIds = useMemo(() => new Set(CATALOG.map((s) => s.id)), []);
  const [state, setState] = useState<AppState>(() => parseHash(window.location.hash, defaultState(range), range, siteIds));
  const patch = useCallback((p: Partial<AppState>) => { setState((s) => ({ ...s, ...p })); }, []);
  const setTime = useCallback((update: (t: number) => number) => { setState((s) => ({ ...s, timeUnixS: update(s.timeUnixS) })); }, []);
  useEffect(() => {
    // Back, forward or an edited link: read the hash again. Our own writes use replaceState, which does not fire this.
    const onHash = (): void => { setState((s) => parseHash(window.location.hash, s, range, siteIds)); };
    window.addEventListener('hashchange', onHash);
    return () => { window.removeEventListener('hashchange', onHash); };
  }, [range, siteIds]);
  return { state, patch, setTime };
}

function Planner({ data, validation }: { data: AppData; validation: ValidationEntry[] }): ReactElement {
  const { t0UnixS, stepS, count } = data.eph.meta;
  const range = useMemo<TimeRange>(() => ({ startUnixS: t0UnixS, endUnixS: t0UnixS + (count - 1) * stepS }), [t0UnixS, stepS, count]);
  const { state, patch, setTime } = usePlannerState(range);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(SPEEDS[1]?.secondsPerSecond ?? 21_600);
  const cache = useMemo(() => new TrackCache(data.eph), [data.eph]);
  const { siteId } = state;
  const site = useMemo(() => selectSite(siteId, data), [siteId, data]);
  const track = useMemo(() => cache.track(site), [cache, site]);
  usePlayback(playing, speed, range, setTime);
  useHashSync(state, playing);
  useEffect(() => { if (playing && state.timeUnixS >= range.endUnixS) setPlaying(false); }, [playing, state.timeUnixS, range.endUnixS]);
  const timeIdx = (state.timeUnixS - t0UnixS) / stepS;
  const open = (id: string, idx?: number): void => { patch({ siteId: id, view: 'site', ...(idx === undefined ? {} : { timeUnixS: clampTime(t0UnixS + idx * stepS, range) }) }); };
  const timeControls = (
    <TimeControls timeUnixS={state.timeUnixS} startUnixS={range.startUnixS} endUnixS={range.endUnixS} playing={playing} speed={speed}
      onTime={(t) => { patch({ timeUnixS: t }); }} onPlaying={setPlaying} onSpeed={setSpeed} />
  );
  return (
    <div className="app">
      <TopBar view={state.view} onView={(view) => { setPlaying(false); patch({ view }); }} />
      <main className="page site-view">
        {PAGE_INTRO[state.view] !== null ? <p className="page-intro">{PAGE_INTRO[state.view]}</p> : null}
        {state.view === 'about' ? <About data={data} validation={validation} /> : null}
        {state.view === 'compare' ? (
          <CompareView data={data} cache={cache} ids={state.compareIds} timeIdx={timeIdx} windowDays={state.windowDays}
            onIds={(ids) => { patch({ compareIds: ids }); }} onWindowDays={(d) => { patch({ windowDays: d }); }} onOpen={open} />
        ) : null}
        {state.view === 'site' ? <SiteScreen data={data} state={state} site={site} track={track} timeIdx={timeIdx} onAbout={() => { patch({ view: 'about' }); }}
          onChangePlace={() => { setPlaying(false); patch({ view: 'compare' }); }} timeControls={timeControls} /> : null}
        {state.view === 'rover' ? <RoverSim onOpen={open} /> : null}
      </main>
    </div>
  );
}

export function App(): ReactElement {
  const load = useAppData();
  if (load.status === 'loading') {
    return (
      <main className="page status-page" aria-busy="true">
        <p>Loading the Sun, Earth and hill data…</p>
      </main>
    );
  }
  if (load.status === 'error') {
    return (
      <main className="page status-page" role="alert">
        <h1>The data files could not be loaded</h1>
        <p>{load.message}</p>
        <p className="note">The app needs the files ephemeris.bin and skylines.bin next to it. The README shows the commands that build them.</p>
      </main>
    );
  }
  return <Planner data={load.data} validation={load.validation} />;
}
