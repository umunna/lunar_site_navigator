// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// V2 (docs/history/plan-2026-11-14.md 5.7): skyline unit tests on synthetic terrain.
// The expected values come from closed forms or from the independent 3D path in
// geometry.ts (bodyAzEl), never from the skyline code itself.
import { describe, expect, it } from 'vitest';
import {
  DEG2RAD,
  MOON_RADIUS_KM,
  MOON_RADIUS_M,
  RAD2DEG,
  bodyAzEl,
  computeSkyline,
  makeSiteFrame,
  newAzEl,
  skylineAt,
  smoothSphereDipDeg,
} from '../src';
import type { SiteFrame, SkylineOptions, TerrainSampler } from '../src';

const R = MOON_RADIUS_M;

/** Unit vector at arc `arcM` from the site along `bearingDeg`: cos(t) up + sin(t) (cos(b) north + sin(b) east). */
function unitAt(frame: SiteFrame, bearingDeg: number, arcM: number): [number, number, number] {
  const t = arcM / R;
  const b = bearingDeg * DEG2RAD;
  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    out[k] =
      Math.cos(t) * (frame.up[k] ?? 0) +
      Math.sin(t) * (Math.cos(b) * (frame.north[k] ?? 0) + Math.sin(b) * (frame.east[k] ?? 0));
  }
  return out;
}

function latLonOf(u: readonly number[]): { lat: number; lon: number } {
  return { lat: Math.asin(u[2] ?? 0), lon: Math.atan2(u[1] ?? 0, u[0] ?? 0) };
}

/** Great-circle angular distance (radians) between two lat/lon points, haversine. */
function angDist(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const s1 = Math.sin((lat2 - lat1) / 2);
  const s2 = Math.sin((lon2 - lon1) / 2);
  return 2 * Math.asin(Math.sqrt(s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2));
}

function flat(heightM: number): TerrainSampler {
  return { heightM: () => heightM };
}

/** Flat-topped cap of height `H` and radius `rhoM`, centred `distM` from the site along `bearingDeg`. */
function mesa(site: { latDeg: number; lonDeg: number }, bearingDeg: number, distM: number, rhoM: number, H: number): TerrainSampler {
  const c = latLonOf(unitAt(makeSiteFrame(site.latDeg, site.lonDeg), bearingDeg, distM));
  return { heightM: (lat, lon) => (angDist(lat, lon, c.lat, c.lon) * R <= rhoM ? H : 0) };
}

/** Smooth Gaussian hill, no kinks, so step-size changes are second order. */
function hill(site: { latDeg: number; lonDeg: number }, bearingDeg: number, distM: number, sigmaM: number, H: number): TerrainSampler {
  const c = latLonOf(unitAt(makeSiteFrame(site.latDeg, site.lonDeg), bearingDeg, distM));
  return {
    heightM: (lat, lon) => {
      const d = angDist(lat, lon, c.lat, c.lon) * R;
      return H * Math.exp(-(d * d) / (2 * sigmaM * sigmaM));
    },
  };
}

function options(site: { latDeg: number; lonDeg: number }, over: Partial<SkylineOptions> = {}): SkylineOptions {
  return {
    siteLatDeg: site.latDeg,
    siteLonDeg: site.lonDeg,
    observerHeightM: 2,
    stepM: 10,
    maxRangeM: 20_000,
    maxTerrainHeightM: 0,
    ...over,
  };
}

const SITES = [
  { latDeg: -89.9, lonDeg: 33 },
  { latDeg: 0.67, lonDeg: 23.47 },
  { latDeg: -60, lonDeg: 30 },
  { latDeg: 45, lonDeg: 190 },
];

describe('smooth sphere [LSN-SKY-001]', () => {
  it.each(SITES)('every bin equals -acos(R / (R + h)) = -0.0869 deg for a 2 m observer at %o', (site) => {
    const sky = computeSkyline(flat(0), options(site));
    const expected = smoothSphereDipDeg(2);
    expect(expected).toBeCloseTo(-0.087, 3);
    for (const v of sky.elevationDeg) {
      expect(Math.abs(v - expected)).toBeLessThan(1e-6);
    }
    expect(sky.truncatedBins).toBe(0);
    expect(sky.siteHeightM).toBe(0);
  });

  it('dip scales with observer height as -acos(R / (R + h))', () => {
    const site = SITES[2] ?? { latDeg: 0, lonDeg: 0 };
    for (const h of [0.5, 2, 10, 50]) {
      const sky = computeSkyline(flat(0), options(site, { observerHeightM: h, maxRangeM: 60_000 }));
      expect(Math.abs((sky.elevationDeg[0] ?? 0) - smoothSphereDipDeg(h))).toBeLessThan(1e-5);
    }
  });

  it('a plateau at constant height H gives the same dip, because site and terrain share the datum', () => {
    const H = 1000;
    const sky = computeSkyline(flat(H), options({ latDeg: -80, lonDeg: 10 }, { maxTerrainHeightM: H }));
    const expected = -Math.acos((R + H) / (R + H + 2)) * RAD2DEG;
    expect(sky.siteHeightM).toBe(H);
    for (const v of sky.elevationDeg) {
      expect(Math.abs(v - expected)).toBeLessThan(1e-6);
    }
  });
});

describe('mesa at a known bearing, distance and height [LSN-SKY-002]', () => {
  const site = { latDeg: -60, lonDeg: 30 };
  const H = 500;
  const step = 100;
  const sky = computeSkyline(
    mesa(site, 90, 12_050, 2000, H),
    options(site, { stepM: step, maxRangeM: 40_000, maxTerrainHeightM: H }),
  );

  it('matches the elevation from the independent 3D path at the first sample inside the cap', () => {
    // First sample with |k * step - 12050| <= 2000 is k = 101 (10.1 km). Elevation seen from the
    // observer at R + 2 m, computed with geometry.ts rather than the skyline formula.
    const frame = makeSiteFrame(site.latDeg, site.lonDeg, 0.002);
    const u = unitAt(frame, 90, 101 * step);
    const p = u.map((c) => c * (MOON_RADIUS_KM + H / 1000));
    const expected = bodyAzEl(frame, p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, newAzEl()).elDeg;
    expect(expected).toBeGreaterThan(2);
    expect(Math.abs((sky.elevationDeg[180] ?? 0) - expected)).toBeLessThan(1e-4);
  });

  it('bearing convention: a ridge at bearing 90 hides az 90 and not az 270', () => {
    expect(skylineAt(sky.elevationDeg, 90)).toBeGreaterThan(2);
    expect(Math.abs(skylineAt(sky.elevationDeg, 270) - smoothSphereDipDeg(2))).toBeLessThan(1e-4);
    expect(Math.abs(skylineAt(sky.elevationDeg, 0) - smoothSphereDipDeg(2))).toBeLessThan(1e-4);
  });

  it('rotating the mesa by 90 degrees rotates the skyline by 180 bins', () => {
    const base = { latDeg: -72, lonDeg: 15 };
    const o = options(base, { stepM: 97, maxRangeM: 40_000, maxTerrainHeightM: H });
    const a = computeSkyline(mesa(base, 90, 12_031, 1999.7, H), o);
    const b = computeSkyline(mesa(base, 180, 12_031, 1999.7, H), o);
    for (let j = 0; j < 720; j++) {
      expect(Math.abs((b.elevationDeg[j] ?? 0) - (a.elevationDeg[(j - 180 + 720) % 720] ?? 0))).toBeLessThan(1e-4);
    }
  });
});

describe('numerical behaviour [LSN-SKY-003]', () => {
  const site = { latDeg: -85, lonDeg: 200 };
  const H = 800;
  const terrain = hill(site, 45, 15_000, 2000, H);

  it('halving the step changes the skyline by less than 0.001 deg', () => {
    const base = options(site, { maxRangeM: 60_000, maxTerrainHeightM: H });
    const coarse = computeSkyline(terrain, { ...base, stepM: 80 });
    const fine = computeSkyline(terrain, { ...base, stepM: 40 });
    let worst = 0;
    for (let j = 0; j < 720; j++) {
      worst = Math.max(worst, Math.abs((coarse.elevationDeg[j] ?? 0) - (fine.elevationDeg[j] ?? 0)));
    }
    expect(worst).toBeLessThan(0.001);
    expect(skylineAt(coarse.elevationDeg, 45)).toBeGreaterThan(2);
  });

  it('early termination gives exactly the same skyline as scanning the whole range', () => {
    const base = options(site, { stepM: 80, maxRangeM: 60_000 });
    const early = computeSkyline(terrain, { ...base, maxTerrainHeightM: H });
    const brute = computeSkyline(terrain, { ...base, maxTerrainHeightM: 50_000 });
    expect(Array.from(early.elevationDeg)).toEqual(Array.from(brute.elevationDeg));
  });

  it('reports truncation when rays run into missing data, and none when they stop first', () => {
    const edge: TerrainSampler = {
      heightM: (lat, lon) => {
        const here = makeSiteFrame(-70, 0);
        const c = latLonOf(here.up);
        return angDist(lat, lon, c.lat, c.lon) * R > 5000 ? Number.NaN : 0;
      },
    };
    const o = options({ latDeg: -70, lonDeg: 0 }, { maxRangeM: 20_000 });
    // Terrain top assumed at 500 m, so rays cannot stop before they reach the 5 km data edge.
    expect(computeSkyline(edge, { ...o, maxTerrainHeightM: 500 }).truncatedBins).toBe(720);
    // Terrain top 0 m: rays stop at the 2.6 km horizon, inside the data.
    expect(computeSkyline(edge, { ...o, maxTerrainHeightM: 0 }).truncatedBins).toBe(0);
  });

  it('refuses a site with no data and nonsense options', () => {
    expect(() => computeSkyline(flat(Number.NaN), options({ latDeg: -80, lonDeg: 0 }))).toThrow(/no terrain data/);
    expect(() => computeSkyline(flat(0), options({ latDeg: -80, lonDeg: 0 }, { stepM: 0 }))).toThrow(/stepM/);
    expect(() => computeSkyline(flat(0), options({ latDeg: -80, lonDeg: 0 }, { observerHeightM: -1 }))).toThrow(/observerHeightM/);
  });
});

describe('skylineAt interpolation [LSN-SKY-004]', () => {
  const ramp = new Float32Array(720).map((_, j) => j);

  it('interpolates linearly between bins and wraps at 360', () => {
    expect(skylineAt(ramp, 0)).toBe(0);
    expect(skylineAt(ramp, 0.25)).toBeCloseTo(0.5, 6);
    expect(skylineAt(ramp, 90)).toBe(180);
    expect(skylineAt(ramp, 359.75)).toBeCloseTo(359.5, 6);
    expect(skylineAt(ramp, -0.25)).toBeCloseTo(359.5, 6);
    expect(skylineAt(ramp, 360)).toBe(0);
  });
});
