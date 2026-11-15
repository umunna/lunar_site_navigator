// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { southPolarInverse } from '@lsn/shared';
import { describe, expect, it } from 'vitest';
import { V3_TOLERANCE_POINTS, gapPoints, lightMapPixel, nasaPercents, v3Passes, v3TableLines } from '../src/validation/v3';
import type { LightMapGrid, V3Row } from '../src/validation/v3';

// The grid of NASA's map AVGVISIB_85S_060M_201608, from its label.
const GRID: LightMapGrid = { widthPx: 5058, heightPx: 5058, originXM: -151_740, originYM: 151_740, pixelM: 60 };

const row = (over: Partial<V3Row>): V3Row => ({ name: 'A', latDeg: -89, lonDeg: 0, ourPercent: 50, nasaPercent: 45, nasaMinPercent: 40, nasaMaxPercent: 48, ...over });

describe('light-map comparison [LSN-VAL-004]', () => {
  it('finds the pixel of a point: the pole is at the centre, and the centre of a pixel maps back to that pixel', () => {
    expect(lightMapPixel(GRID, -90, 0)).toEqual({ col: 2529, row: 2529 });
    for (const [col, r] of [[2483, 2629], [2606, 769], [10, 2529]] as const) {
      const ll = southPolarInverse(GRID.originXM + (col + 0.5) * GRID.pixelM, GRID.originYM - (r + 0.5) * GRID.pixelM, { latDeg: 0, lonDeg: 0 });
      expect(lightMapPixel(GRID, ll.latDeg, ll.lonDeg)).toEqual({ col, row: r });
    }
    // Longitude 0 points up the map (+y), longitude 90 E points right (+x).
    expect(lightMapPixel(GRID, -89, 0).row).toBeLessThan(2529);
    expect(lightMapPixel(GRID, -89, 90).col).toBeGreaterThan(2529);
    expect(() => lightMapPixel(GRID, -80, 0)).toThrow(/outside the light map/);
  });

  it('scales the raw numbers of the map to percent and refuses a value outside 0 to 1', () => {
    const p = nasaPercents([0, 12_500, 25_000], 1);
    expect(p.nearest).toBeCloseTo(50, 9);
    expect(p.min).toBe(0);
    expect(p.max).toBeCloseTo(100, 9);
    expect(() => nasaPercents([26_000], 0)).toThrow(/outside 0 to 1/);
    expect(() => nasaPercents([-32_768], 0)).toThrow(/outside 0 to 1/);
    expect(() => nasaPercents([], 0)).toThrow();
  });

  it('the gap is 0 inside the NASA range and the distance to the range outside it', () => {
    expect(gapPoints(row({ ourPercent: 44 }))).toBe(0);
    expect(gapPoints(row({ ourPercent: 50 }))).toBe(2);
    expect(gapPoints(row({ ourPercent: 31 }))).toBe(9);
  });

  it('passes only when every place is inside the tolerance, and never on an empty list', () => {
    expect(v3Passes([row({}), row({ ourPercent: 48 + V3_TOLERANCE_POINTS })])).toBe(true);
    expect(v3Passes([row({}), row({ ourPercent: 48 + V3_TOLERANCE_POINTS + 0.1 })])).toBe(false);
    expect(v3Passes([])).toBe(false);
    expect(v3TableLines([row({})])[2]).toBe('| A | -89 | 0 | 50.0 | 45.0 | 40.0 to 48.0 | 2.0 |');
  });
});
