// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { describe, expect, it } from 'vitest';
import type { WindowMetrics } from '@lsn/shared';
import { bestCells } from '../src/components/CompareTable';
import { explainCompare } from '../src/lib/explain';
import { METRIC_ROWS, formatMetric } from '../src/lib/metrics';
import type { MetricRow } from '../src/lib/metrics';
import { TrackCache, trackKey } from '../src/lib/trackCache';
import { selectSite } from '../src/lib/data';
import { loadTestData } from './helpers';

function metrics(over: Partial<WindowMetrics>): WindowMetrics {
  return { samples: 2016, hours: 336, litPercent: 50, longestLitH: 40, longestDarkH: 30, earthVisiblePercent: 60, longestEarthOutageH: 20, bothPercent: 30, neitherPercent: 20, longestNeitherH: 10, maxSunElDeg: 1.2, meanSunFraction: 0.5, ...over };
}

function row(key: MetricRow['key']): MetricRow {
  const r = METRIC_ROWS.find((m) => m.key === key);
  if (r === undefined) throw new Error(key);
  return r;
}

describe('metric definitions [LSN-UI-011]', () => {
  it('every window metric has exactly one row, with a direction', () => {
    const keys = METRIC_ROWS.map((r) => r.key).sort();
    expect(keys).toEqual(Object.keys(metrics({})).filter((k) => k !== 'samples' && k !== 'hours' && k !== 'meanSunFraction').sort());
  });

  it('formats values by unit', () => {
    expect(formatMetric(row('litPercent'), metrics({ litPercent: 40.25 }))).toBe('40.3%');
    expect(formatMetric(row('longestDarkH'), metrics({ longestDarkH: 71.6 }))).toBe('3 d');
    expect(formatMetric(row('maxSunElDeg'), metrics({ maxSunElDeg: -0.4 }))).toBe('−0.40°');
  });

});

describe('compare table marks [LSN-UI-011]', () => {
  it('marks the best value, keeps ties, and marks nothing when every site ties', () => {
    expect([...bestCells([40, 88, 61], 'higher')]).toEqual([1]);
    expect([...bestCells([47, 12, 12], 'lower')]).toEqual([1, 2]);
    expect([...bestCells([100, 100, 100], 'higher')]).toEqual([]);
  });
});

describe('sentences of the Compare places page [LSN-UI-005]', () => {
  it('names the leading places and never uses power, link or communication wording', () => {
    const lines = [
      ...explainCompare(['A', 'B', 'C'], [metrics({ litPercent: 80, earthVisiblePercent: 30, longestNeitherH: 0 }), metrics({ litPercent: 40, earthVisiblePercent: 90 }), metrics({ litPercent: 80, longestNeitherH: 5 })]),
    ];
    expect(lines[0]).toBe('Most sunlight: A and C (80% of the time).');
    expect(lines[1]).toContain('B (90% of the time)');
    expect(lines[2]).toBe('A always has the Sun or Earth in view in these days.');
    expect(lines.join(' ')).not.toMatch(/\b(power|solar array|battery|link|signal|communicat|contact|antenna)\b/i);
  });
});

describe('track cache [LSN-UI-012]', () => {
  const data = loadTestData();
  const at = (id: string) => selectSite(id, data);

  it('computes each site once, returns the same track again, and drops the least recently used', () => {
    const cache = new TrackCache(data.eph, 2);
    const a = cache.track(at('haworth-high'));
    expect(cache.track(at('haworth-high'))).toBe(a);
    expect(cache.computed).toBe(1);
    cache.track(at('nobile-high'));
    cache.track(at('haworth-high'));
    cache.track(at('apollo-11'));
    expect(cache.size).toBe(2);
    expect(cache.computed).toBe(3);
    cache.track(at('haworth-high'));
    expect(cache.computed).toBe(3);
  });

  it('a flat-horizon site and a terrain site at the same point are different tracks', () => {
    const base = { id: 'x', latDeg: -86, lonDeg: 10 };
    expect(trackKey({ ...base, terrain: 'modelled' })).not.toBe(trackKey({ ...base, terrain: 'flat' }));
  });
});
