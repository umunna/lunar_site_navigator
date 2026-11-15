// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// Small helpers for the Compare places page: where a stay starts, and which value is best.
import { invariant } from './assert';

/** Start index of a stay of `lengthSamples` that begins at `idx`, kept inside the data. */
export function windowStart(idx: number, lengthSamples: number, count: number): number {
  invariant(lengthSamples > 0 && lengthSamples <= count, 'window longer than the data');
  return Math.min(Math.max(0, Math.floor(idx)), count - lengthSamples);
}

export type Better = 'higher' | 'lower';

/** Indices of the best value (all of them on a tie, within `tolerance`). Empty for an empty list. */
export function bestIndices(values: readonly number[], better: Better, tolerance = 1e-9): number[] {
  if (values.length === 0) return [];
  const target = better === 'higher' ? Math.max(...values) : Math.min(...values);
  return values.flatMap((v, i) => (Math.abs(v - target) <= tolerance ? [i] : []));
}
