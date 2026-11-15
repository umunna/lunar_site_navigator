// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// V5 (docs/history/plan-2026-11-14.md 5.7): event and metric logic. Plus physical sanity
// checks of the tracks on the real ephemeris.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EARTH_RADIUS_KM,
  SUN_RADIUS_KM,
  computeSiteTrack,
  decodeEphemeris,
  discRadiusDeg,
  flatSkyline,
  marginAt,
  nextCrossing,
  visibleFraction,
  windowMetrics,
} from '../src';
import type { BodyTrack, SiteTrack } from '../src';

describe('visible fraction [LSN-EVT-001]', () => {
  it('is 0.5 with the centre on the skyline, 1 fully above, 0 fully below', () => {
    expect(visibleFraction(5, 0.27, 5)).toBeCloseTo(0.5, 12);
    expect(visibleFraction(10, 0.27, 5)).toBe(1);
    expect(visibleFraction(-10, 0.27, 5)).toBe(0);
  });

  it('matches a numerical integration of the disc area above the line', () => {
    const r = 1;
    const cells = 600;
    for (const s of [-0.9, -0.4, 0, 0.3, 0.75]) {
      let above = 0;
      let inside = 0;
      for (let i = 0; i < cells; i++) {
        for (let j = 0; j < cells; j++) {
          const x = -r + ((i + 0.5) * 2 * r) / cells;
          const y = -r + ((j + 0.5) * 2 * r) / cells;
          if (x * x + y * y <= r * r) {
            inside += 1;
            above += y >= s ? 1 : 0;
          }
        }
      }
      // `above` counts the disc cells at or above the skyline line y = s: the visible share itself.
      expect(visibleFraction(0, r, s)).toBeCloseTo(above / inside, 2);
    }
  });

  it('rises monotonically as the body climbs', () => {
    let prev = -1;
    for (let el = -1; el <= 1; el += 0.05) {
      const f = visibleFraction(el, 0.27, 0);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });

  it('disc radii: Sun about 0.27 deg and Earth about 0.95 deg at their mean distances', () => {
    expect(discRadiusDeg(SUN_RADIUS_KM, 149_597_870.7)).toBeCloseTo(0.2666, 3);
    expect(discRadiusDeg(EARTH_RADIUS_KM, 384_400)).toBeCloseTo(0.9496, 3);
  });
});

describe('countdown to sunset and sunrise [LSN-EVT-002]', () => {
  /** Smooth, wiggly, seeded margin series that crosses zero many times. */
  function series(n: number, seed: number): Float32Array {
    const g = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      g[i] = Math.sin(i / 7 + seed) * 1.3 + Math.sin(i / 23 + 2 * seed) * 0.9 + 0.1;
    }
    return g;
  }

  /** Brute force: step in 1/2000 of a sample until the interpolated state flips. */
  function brute(g: Float32Array, from: number, direction: 'set' | 'rise'): number | null {
    const up = direction === 'set';
    if ((marginAt(g, from) > 0) !== up) return null;
    for (let t = from; t <= g.length - 1; t += 1 / 2000) {
      if ((marginAt(g, t) > 0) !== up) return t;
    }
    return null;
  }

  it('agrees with a brute-force scan on many start times', () => {
    const g = series(600, 1.7);
    let checked = 0;
    for (let from = 0; from < 590; from += 3.37) {
      for (const dir of ['set', 'rise'] as const) {
        const fast = nextCrossing(g, from, dir, 600);
        const slow = brute(g, from, dir);
        expect(fast === null).toBe(slow === null);
        if (fast !== null && slow !== null) {
          expect(Math.abs(fast.index - slow)).toBeLessThan(2 / 2000 + 1e-3);
          expect(fast.secondsFromStart).toBeCloseTo((fast.index - from) * 600, 6);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('returns null when the body is already in the opposite state, or no event comes before the data ends', () => {
    const up = new Float32Array([1, 1, 1, 1]);
    const down = new Float32Array([-1, -1, -1, -1]);
    expect(nextCrossing(up, 0, 'set', 600)).toBeNull();
    expect(nextCrossing(up, 0, 'rise', 600)).toBeNull();
    expect(nextCrossing(down, 0, 'set', 600)).toBeNull();
    expect(nextCrossing(down, 0, 'rise', 600)).toBeNull();
  });

  it('puts the event inside the step by linear interpolation', () => {
    const g = new Float32Array([2, 1, -1, -2]);
    const c = nextCrossing(g, 0, 'set', 600);
    expect(c?.index).toBeCloseTo(1.5, 9);
    expect(c?.secondsFromStart).toBeCloseTo(900, 6);
  });
});

function body(margin: number[], el: number[], fraction: number[]): BodyTrack {
  const n = margin.length;
  return {
    elDeg: Float32Array.from(el),
    azDeg: new Float32Array(n),
    marginDeg: Float32Array.from(margin),
    fraction: Float32Array.from(fraction),
    discRadiusDeg: new Float32Array(n).fill(0.27),
  };
}

describe('window metrics [LSN-EVT-003]', () => {
  // Sun:   lit lit lit dark dark lit dark dark dark dark
  // Earth: up  up  dark dark up  up  dark dark up   up
  const sun = body([1, 1, 1, -1, -1, 1, -1, -1, -1, -1], [1, 1, 1, -1, -1, 1, -1, -1, -1, -1], [1, 1, 1, 0, 0, 0.5, 0, 0, 0, 0]);
  const earth = body([1, 1, -1, -1, 1, 1, -1, -1, 1, 1], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const track: SiteTrack = { count: 10, sun, earth };

  it('counts shares and longest runs in hours (step 3600 s makes 1 sample = 1 h)', () => {
    const m = windowMetrics(track, 0, 10, 3600);
    expect(m.hours).toBe(10);
    expect(m.litPercent).toBe(40);
    expect(m.longestLitH).toBe(3);
    expect(m.longestDarkH).toBe(4);
    expect(m.earthVisiblePercent).toBe(60);
    expect(m.longestEarthOutageH).toBe(2);
    expect(m.bothPercent).toBe(30);
    expect(m.neitherPercent).toBe(30);
    expect(m.longestNeitherH).toBe(2);
    expect(m.maxSunElDeg).toBe(1);
    expect(m.meanSunFraction).toBeCloseTo(0.35, 6);
  });

  it('obeys the identities: both + neither + only-Sun + only-Earth = 100 and both <= each', () => {
    const m = windowMetrics(track, 0, 10, 3600);
    const onlySun = m.litPercent - m.bothPercent;
    const onlyEarth = m.earthVisiblePercent - m.bothPercent;
    expect(m.bothPercent + m.neitherPercent + onlySun + onlyEarth).toBeCloseTo(100, 9);
    expect(m.bothPercent).toBeLessThanOrEqual(Math.min(m.litPercent, m.earthVisiblePercent));
  });

  it('cuts runs at the window edges', () => {
    const m = windowMetrics(track, 1, 5, 3600);
    expect(m.samples).toBe(4);
    expect(m.longestLitH).toBe(2);
    expect(m.longestDarkH).toBe(2);
  });

  it('rejects bad windows', () => {
    expect(() => windowMetrics(track, 5, 5, 600)).toThrow(/bad window/);
    expect(() => windowMetrics(track, 0, 11, 600)).toThrow(/bad window/);
  });
});

describe('tracks on the real ephemeris [LSN-EVT-004]', () => {
  const eph = decodeEphemeris(new Uint8Array(readFileSync(new URL('../../../data/ephemeris.bin', import.meta.url))));
  const flat = flatSkyline(2);

  function share(margin: Float32Array): number {
    let n = 0;
    for (const g of margin) n += g > 0 ? 1 : 0;
    return (100 * n) / margin.length;
  }

  it('equatorial near-side point: Sun up about half of the three years, Earth up nearly always', () => {
    const t = computeSiteTrack(eph, 0, 0, flat);
    expect(share(t.sun.marginDeg)).toBeGreaterThan(48);
    expect(share(t.sun.marginDeg)).toBeLessThan(52);
    expect(share(t.earth.marginDeg)).toBeGreaterThan(99);
  });

  it('far-side centre never sees Earth', () => {
    const t = computeSiteTrack(eph, 0, 180, flat);
    expect(share(t.earth.marginDeg)).toBe(0);
    expect(share(t.sun.marginDeg)).toBeGreaterThan(48);
  });

  it('89.9 S, 14 Nov to 14 Dec 2026: Sun +1.33 to +1.63 deg, Earth -6.74 to +6.35 deg, as measured on 14 Nov (claim 2)', () => {
    const t = computeSiteTrack(eph, -89.9, 0, flat);
    const i0 = 13 * 144;
    const i1 = 43 * 144;
    const range = (a: Float32Array): [number, number] => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = i0; i <= i1; i++) {
        lo = Math.min(lo, a[i] ?? 0);
        hi = Math.max(hi, a[i] ?? 0);
      }
      return [lo, hi];
    };
    const [sLo, sHi] = range(t.sun.elDeg);
    const [eLo, eHi] = range(t.earth.elDeg);
    expect(Math.abs(sLo - 1.33)).toBeLessThan(0.05);
    expect(Math.abs(sHi - 1.63)).toBeLessThan(0.05);
    expect(Math.abs(eLo - -6.74)).toBeLessThan(0.1);
    expect(Math.abs(eHi - 6.35)).toBeLessThan(0.1);
  });

  it('elevation and azimuth stay in range, fractions in [0, 1], and g > 0 exactly when the fraction is above 0', () => {
    const t = computeSiteTrack(eph, -87.5, 270, flat);
    for (const b of [t.sun, t.earth]) {
      for (let i = 0; i < t.count; i += 97) {
        expect(b.elDeg[i] ?? 0).toBeGreaterThanOrEqual(-90);
        expect(b.elDeg[i] ?? 0).toBeLessThanOrEqual(90);
        expect(b.azDeg[i] ?? 0).toBeGreaterThanOrEqual(0);
        expect(b.azDeg[i] ?? 0).toBeLessThan(360);
        expect(b.fraction[i] ?? 0).toBeGreaterThanOrEqual(0);
        expect(b.fraction[i] ?? 0).toBeLessThanOrEqual(1);
        if ((b.marginDeg[i] ?? 0) > 1e-4) expect(b.fraction[i] ?? 0).toBeGreaterThan(0);
        if ((b.marginDeg[i] ?? 0) < -1e-4) expect(b.fraction[i] ?? 0).toBe(0);
      }
    }
  });
});
