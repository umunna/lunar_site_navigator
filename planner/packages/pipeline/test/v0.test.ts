// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// The V0 machinery on synthetic terrain: a bowl placed where our convention
// puts a crater must score as a depression under that convention and not under the others.
import { DEG2RAD, MOON_RADIUS_M } from '@lsn/shared';
import { describe, expect, it } from 'vitest';
import { CONVENTIONS, OURS_INDEX, annulusMean, contrastKm, fits, minContrast, uniqueThresholdRange } from '../src/validation/v0';
import type { Convention, HeightFn, V0Target } from '../src/validation/v0';

const crater: V0Target = { gazetteerId: 1, name: 'synthetic', kind: 'depression', latDeg: -86, lonDeg: 70, diameterKm: 30 };

function conventionAt(index: number): Convention {
  const conv = CONVENTIONS[index];
  if (conv === undefined) {
    throw new Error(`no convention ${String(index)}`);
  }
  return conv;
}

function rhoOf(latDeg: number): number {
  return 2 * MOON_RADIUS_M * Math.tan((45 - Math.abs(latDeg) / 2) * DEG2RAD);
}

/** A flat plain with a 3 km deep, 20 km wide bowl where convention `conv` places the crater. */
function bowlAt(convIndex: number): HeightFn {
  const [cx, cy] = conventionAt(convIndex).xy(rhoOf(crater.latDeg), crater.lonDeg * DEG2RAD);
  return (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    return d < 10_000 ? -3000 * (1 - (d / 10_000) ** 2) : 0;
  };
}

describe('V0 machinery [LSN-DEM-003]', () => {
  it('annulusMean of a constant surface is that constant, and counts off-data samples', () => {
    const flat = annulusMean(() => 5, 0, 0, 0, 2000);
    expect(flat.mean).toBeCloseTo(5, 12);
    expect(flat.validFraction).toBe(1);
    const half = annulusMean((x) => (x < 0 ? Number.NaN : 1), 0, 0, 1000, 3000);
    expect(half.validFraction).toBeGreaterThan(0.4);
    expect(half.validFraction).toBeLessThan(0.6);
  });

  it('a bowl placed by our convention scores as a depression only under our convention', () => {
    const height = bowlAt(OURS_INDEX);
    const results = CONVENTIONS.map((c) => contrastKm(height, c, crater));
    expect(results[OURS_INDEX] ?? 0).toBeGreaterThan(1.5);
    for (let i = 1; i < CONVENTIONS.length; i++) {
      expect(Math.abs(results[i] ?? 0)).toBeLessThan(0.1);
    }
  });

  it('works for every convention: the bowl is found where that convention puts it', () => {
    for (let k = 0; k < CONVENTIONS.length; k++) {
      expect(contrastKm(bowlAt(k), conventionAt(k), crater) ?? 0).toBeGreaterThan(1.5);
    }
  });

  it('a feature thrown off the data is null, and null never passes', () => {
    expect(contrastKm(() => Number.NaN, conventionAt(OURS_INDEX), crater)).toBeNull();
    expect(fits([2, null], 0.5)).toBe(false);
    expect(minContrast([2, null, 1])).toBe(-Infinity);
    expect(fits([], 0.5)).toBe(false);
  });

  it('uniqueThresholdRange gives the interval where only ours passes', () => {
    expect(uniqueThresholdRange([0.8, 0.07, -1], 0)).toEqual({ lowExclusive: 0.07, highInclusive: 0.8 });
    expect(uniqueThresholdRange([0.1, 0.5, -1], 0)).toBeNull();
  });
});
