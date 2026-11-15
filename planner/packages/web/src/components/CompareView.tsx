// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
// Screen 2 (docs/history/plan-2026-11-14.md 5.4): 2 to 4 sites over the same dates.
import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { CATALOG, windowMetrics, windowStart } from '@lsn/shared';
import { CompareStrips } from './CompareStrips';
import { CompareTable } from './CompareTable';
import { explainCompare } from '../lib/explain';
import { formatDateUtc } from '../lib/format';
import { selectSite } from '../lib/data';
import type { AppData } from '../lib/data';
import { MAX_COMPARE, MIN_COMPARE, WINDOW_DAYS } from '../lib/state';
import { SAMPLES_PER_DAY } from '../lib/runs';
import type { TrackCache } from '../lib/trackCache';

interface Props {
  readonly data: AppData;
  readonly cache: TrackCache;
  readonly ids: readonly string[];
  readonly timeIdx: number;
  readonly windowDays: number;
  readonly onIds: (ids: readonly string[]) => void;
  readonly onWindowDays: (d: number) => void;
  readonly onOpen: (siteId: string, idx?: number) => void;
}

export function CompareView(p: Props): ReactElement {
  const { t0UnixS, stepS, count } = p.data.eph.meta;
  const sites = useMemo(() => p.ids.map((id) => selectSite(id, p.data)), [p.ids, p.data]);
  const tracks = sites.map((s) => p.cache.track(s));
  const len = Math.round(p.windowDays * SAMPLES_PER_DAY);
  const i0 = windowStart(p.timeIdx, len, count);
  const w = useMemo(() => ({ i0, i1: i0 + len }), [i0, len]);
  const metrics = tracks.map((t) => windowMetrics(t, w.i0, w.i1, stepS));
  const addable = CATALOG.filter((s) => !p.ids.includes(s.id));
  return (
    <div className="compare">
      <section className="panel compare-controls" aria-label="Places to compare">
        <ul className="chips">
          {sites.map((s) => (
            <li key={s.id} className="chip">
              <span>{s.name}</span>
              <button type="button" className="btn btn-small" onClick={() => { p.onOpen(s.id); }}>Open in Sky view</button>
              <button type="button" className="btn btn-small" disabled={p.ids.length <= MIN_COMPARE} aria-label={`Remove ${s.name}`} onClick={() => { p.onIds(p.ids.filter((id) => id !== s.id)); }}>Remove</button>
            </li>
          ))}
        </ul>
        <div className="compare-fields">
          <label className="field">
            <span>Add a place ({String(p.ids.length)} of {String(MAX_COMPARE)})</span>
            <select value="" disabled={p.ids.length >= MAX_COMPARE} onChange={(e) => { if (e.target.value !== '') p.onIds([...p.ids, e.target.value]); }}>
              <option value="">Choose a place…</option>
              {addable.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Length of the stay</span>
            <select value={p.windowDays} onChange={(e) => { p.onWindowDays(Number(e.target.value)); }}>
              {WINDOW_DAYS.map((d) => <option key={d} value={d}>{d === 29.5 ? '29.5 days (one day on the Moon)' : `${String(d)} days`}</option>)}
            </select>
          </label>
        </div>
        <p className="note">The same dates for every place: {formatDateUtc(t0UnixS + w.i0 * stepS)} to {formatDateUtc(t0UnixS + w.i1 * stepS)}. Change the start date on the Sky view page. To see one place in detail, press “Open in Sky view”.</p>
      </section>
      <CompareStrips sites={sites} tracks={tracks} w={w} t0UnixS={t0UnixS} stepS={stepS} onOpen={p.onOpen} />
      <section className="panel" aria-label="Numbers side by side">
        <h2>Side by side</h2>
        <div className="explain">{explainCompare(sites.map((s) => s.name), metrics).map((s) => <p key={s}>{s}</p>)}</div>
        <CompareTable sites={sites} metrics={metrics} />
        <p className="note">The south-pole places are high points that we found on NASA’s height map, not official landing sites. Apollo sites have a flat horizon in the app.</p>
      </section>
    </div>
  );
}
