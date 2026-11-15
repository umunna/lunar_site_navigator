// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { describe, expect, it } from 'vitest';
import { litRuns, neitherRuns } from '../src/lib/runs';
import { clampTime, parseCompare, parseHash, toHash } from '../src/lib/state';
import type { AppState } from '../src/lib/state';

describe('runs for the compare bars [LSN-UI-003]', () => {
  it('runs follow the sign of the margin and are cut at the edges of the range', () => {
    const margin = Float32Array.from([1, 1, -1, 1, -1, -1, 2]);
    expect(litRuns(margin, { i0: 0, i1: 7 })).toEqual([{ from: 0, to: 2 }, { from: 3, to: 4 }, { from: 6, to: 7 }]);
    expect(litRuns(margin, { i0: 1, i1: 4 })).toEqual([{ from: 1, to: 2 }, { from: 3, to: 4 }]);
    const other = Float32Array.from([-1, 1, -1, -1, -1, 1, 1]);
    expect(neitherRuns(margin, other, { i0: 0, i1: 7 })).toEqual([{ from: 2, to: 3 }, { from: 4, to: 5 }]);
  });
});

describe('shareable state [LSN-UI-004]', () => {
  const range = { startUnixS: 1_793_491_200, endUnixS: 1_793_491_200 + 157_823 * 600 };
  const ids = new Set(['shackleton-high', 'apollo-11', 'haworth-high', 'nobile-high', 'faustini-high']);
  const fallback: AppState = {
    siteId: 'shackleton-high', timeUnixS: range.startUnixS + 86_400, view: 'site',
    compareIds: ['shackleton-high', 'apollo-11'], windowDays: 14,
  };

  it('round-trips through the hash', () => {
    const s: AppState = { ...fallback, siteId: 'apollo-11', timeUnixS: range.startUnixS + 7 * 86_400 + 1800, view: 'about' };
    expect(parseHash(toHash(s), fallback, range, ids)).toEqual(s);
  });

  it('bad values fall back instead of breaking the page, and time is clamped to the data', () => {
    const bad = parseHash('#site=nowhere&t=garbage&view=x', fallback, range, ids);
    expect(bad).toEqual(fallback);
    expect(parseHash('#t=2000-01-01T00:00', fallback, range, ids).timeUnixS).toBe(range.startUnixS);
    expect(parseHash('#t=2099-01-01T00:00', fallback, range, ids).timeUnixS).toBe(range.endUnixS);
    expect(clampTime(5, range)).toBe(range.startUnixS);
  });

  it('puts nothing personal in the link', () => {
    expect(toHash(fallback)).toMatch(/^#site=[a-z0-9-]+&t=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}&view=[a-z]+&cmp=[a-z0-9,-]+&win=[\d.]+$/);
  });
});

describe('shareable state for Compare places and Rover sim [LSN-UI-010]', () => {
  const range = { startUnixS: 1_793_491_200, endUnixS: 1_793_491_200 + 157_823 * 600 };
  const ids = new Set(['a-high', 'b-high', 'c-high', 'd-high', 'e-high']);
  const fallback: AppState = {
    siteId: 'a-high', timeUnixS: range.startUnixS, view: 'site',
    compareIds: ['a-high', 'b-high'], windowDays: 14,
  };

  it('round-trips the places to compare, the length of the stay and the page', () => {
    const s: AppState = { ...fallback, view: 'compare', compareIds: ['c-high', 'a-high', 'd-high'], windowDays: 29.5 };
    expect(parseHash(toHash(s), fallback, range, ids)).toEqual(s);
    expect(parseHash(toHash({ ...s, view: 'rover' }), fallback, range, ids).view).toBe('rover');
  });

  it('keeps only known, distinct sites, at most four, and needs at least two', () => {
    expect(parseCompare('a-high,zzz,a-high,b-high', ids, ['x'])).toEqual(['a-high', 'b-high']);
    expect(parseCompare('a-high,b-high,c-high,d-high,e-high', ids, ['x'])).toEqual(['a-high', 'b-high', 'c-high', 'd-high']);
    expect(parseCompare('a-high,zzz', ids, ['x', 'y'])).toEqual(['x', 'y']);
    expect(parseCompare(null, ids, ['x', 'y'])).toEqual(['x', 'y']);
  });

  it('rejects a length of stay that the app does not offer, and a page that no longer exists', () => {
    expect(parseHash('#win=10', fallback, range, ids).windowDays).toBe(14);
    expect(parseHash('#win=7', fallback, range, ids).windowDays).toBe(7);
    expect(parseHash('#view=dates', fallback, range, ids).view).toBe('site');
  });
});
