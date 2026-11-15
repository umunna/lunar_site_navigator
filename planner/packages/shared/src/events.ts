// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// Sunset, Earthset, sunrise, Earthrise and window metrics from a body track.
// Definitions: docs/history/plan-2026-11-14.md 5.3. "Lit" / "visible" means g > 0: any part
// of the disc above the skyline, the same rule as PGDA's Earth visibility (claim 10).
import { invariant } from './assert';
import type { BodyTrack, SiteTrack } from './track';

/** Interpolated margin g at fractional sample index t. */
export function marginAt(margin: Float32Array, t: number): number {
  invariant(t >= 0 && t <= margin.length - 1, 'index outside the track');
  const i0 = Math.min(Math.floor(t), margin.length - 2);
  const a = margin[i0] ?? 0;
  const b = margin[i0 + 1] ?? 0;
  return a + (b - a) * (t - i0);
}

export interface Crossing {
  /** Fractional sample index of the event. */
  readonly index: number;
  /** Seconds from the start time. */
  readonly secondsFromStart: number;
}

/**
 * Next time at or after fractional index `from` when g goes from above 0 to at
 * or below 0 (`direction` 'set') or from at or below 0 to above 0 ('rise').
 * Linear interpolation inside the step. Null if there is no such event before the
 * data ends, or if the body is not in the starting state at `from` (asking for a
 * set while it is already down, or a rise while it is already up).
 */
export function nextCrossing(margin: Float32Array, from: number, direction: 'set' | 'rise', stepS: number): Crossing | null {
  const n = margin.length;
  invariant(n >= 2 && from >= 0 && from <= n - 1, 'start outside the track');
  const wantUp = direction === 'rise';
  const gStart = marginAt(margin, from);
  if (wantUp ? gStart > 0 : gStart <= 0) {
    return null;
  }
  let prevT = from;
  let prevG = gStart;
  for (let i = Math.floor(from) + 1; i < n; i++) {
    const g = margin[i] ?? 0;
    if (wantUp ? g > 0 : g <= 0) {
      const t = prevT + ((i - prevT) * prevG) / (prevG - g);
      return { index: t, secondsFromStart: (t - from) * stepS };
    }
    prevT = i;
    prevG = g;
  }
  return null;
}

export interface WindowMetrics {
  /** Samples in the window. */
  readonly samples: number;
  readonly hours: number;
  readonly litPercent: number;
  readonly longestLitH: number;
  readonly longestDarkH: number;
  readonly earthVisiblePercent: number;
  readonly longestEarthOutageH: number;
  readonly bothPercent: number;
  readonly neitherPercent: number;
  readonly longestNeitherH: number;
  /** Maximum Sun elevation (disc centre) in the window, degrees. */
  readonly maxSunElDeg: number;
  /** Mean share of the Sun's disc above the skyline (comparable in kind to PGDA's average illumination). */
  readonly meanSunFraction: number;
}

/** Longest run of samples where `flag(i)` equals `value`, in samples. */
function longestRun(i0: number, i1: number, flag: (i: number) => boolean, value: boolean): number {
  let best = 0;
  let run = 0;
  for (let i = i0; i < i1; i++) {
    run = flag(i) === value ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

function percent(count: number, total: number): number {
  return total === 0 ? 0 : (100 * count) / total;
}

function sunMeasures(sun: BodyTrack, i0: number, i1: number): { max: number; mean: number } {
  let max = -Infinity;
  let sum = 0;
  for (let i = i0; i < i1; i++) {
    max = Math.max(max, sun.elDeg[i] ?? -Infinity);
    sum += sun.fraction[i] ?? 0;
  }
  return { max, mean: sum / (i1 - i0) };
}

/** Metrics over samples [i0, i1). Run lengths are cut at the window edges. */
export function windowMetrics(track: SiteTrack, i0: number, i1: number, stepS: number): WindowMetrics {
  invariant(Number.isInteger(i0) && Number.isInteger(i1) && i0 >= 0 && i1 <= track.count && i1 > i0, 'bad window');
  const lit = (i: number): boolean => (track.sun.marginDeg[i] ?? 0) > 0;
  const earth = (i: number): boolean => (track.earth.marginDeg[i] ?? 0) > 0;
  const neither = (i: number): boolean => !lit(i) && !earth(i);
  const n = i1 - i0;
  let litN = 0;
  let earthN = 0;
  let bothN = 0;
  let neitherN = 0;
  for (let i = i0; i < i1; i++) {
    litN += lit(i) ? 1 : 0;
    earthN += earth(i) ? 1 : 0;
    bothN += lit(i) && earth(i) ? 1 : 0;
    neitherN += neither(i) ? 1 : 0;
  }
  const h = stepS / 3600;
  const sunStats = sunMeasures(track.sun, i0, i1);
  return {
    samples: n,
    hours: n * h,
    litPercent: percent(litN, n),
    longestLitH: longestRun(i0, i1, lit, true) * h,
    longestDarkH: longestRun(i0, i1, lit, false) * h,
    earthVisiblePercent: percent(earthN, n),
    longestEarthOutageH: longestRun(i0, i1, earth, false) * h,
    bothPercent: percent(bothN, n),
    neitherPercent: percent(neitherN, n),
    longestNeitherH: longestRun(i0, i1, neither, true) * h,
    maxSunElDeg: sunStats.max,
    meanSunFraction: sunStats.mean,
  };
}
