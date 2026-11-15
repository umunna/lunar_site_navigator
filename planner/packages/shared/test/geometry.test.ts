// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { describe, expect, it } from 'vitest';
import { bodyAzEl, formatHorizonsMinute, makeSiteFrame, newAzEl, skySeparationDeg, wrapDeg360 } from '../src';

const FAR_KM = 1e8;

describe('azimuth and elevation [LSN-GEO-001]', () => {
  const equator = makeSiteFrame(0, 0);

  it('body straight up is at elevation 90', () => {
    const r = bodyAzEl(equator, 5e5, 0, 0, newAzEl());
    expect(r.elDeg).toBeCloseTo(90, 9);
  });

  it('cardinal directions from the equator: N=0, E=90, S=180, W=270', () => {
    expect(bodyAzEl(equator, 0, 0, FAR_KM, newAzEl()).azDeg).toBeCloseTo(0, 9);
    expect(bodyAzEl(equator, 0, FAR_KM, 0, newAzEl()).azDeg).toBeCloseTo(90, 9);
    expect(bodyAzEl(equator, 0, 0, -FAR_KM, newAzEl()).azDeg).toBeCloseTo(180, 9);
    expect(bodyAzEl(equator, 0, -FAR_KM, 0, newAzEl()).azDeg).toBeCloseTo(270, 9);
  });

  it('a distant body due east sits just below the horizon by atan(R / distance)', () => {
    const r = bodyAzEl(equator, 0, FAR_KM, 0, newAzEl());
    expect(r.elDeg).toBeCloseTo(-Math.atan(1737.4 / FAR_KM) * (180 / Math.PI), 9);
  });

  it('near the south pole a far body along +x (sub-point on the equator, lon 0) is at az 0, el = 0.1 deg minus the site parallax', () => {
    const site = makeSiteFrame(-89.9, 0);
    const r = bodyAzEl(site, FAR_KM, 0, 0, newAzEl());
    // Elevation of the direction is 0.1 deg (colatitude 89.9). The site sits R = 1737.4 km off-centre,
    // which lowers it by about atan(R / distance) = 0.000995 deg for a body 1e8 km away.
    const parallaxDeg = (1737.4 / FAR_KM) * (180 / Math.PI);
    expect(r.azDeg).toBeCloseTo(0, 6);
    expect(r.elDeg).toBeCloseTo(0.1 - parallaxDeg, 6);
  });

  it('elevation stays in [-90, 90] and azimuth in [0, 360) for a sweep of directions', () => {
    const site = makeSiteFrame(-72.5, 211.3);
    const out = newAzEl();
    for (let i = 0; i < 360; i += 7) {
      const a = (i * Math.PI) / 180;
      bodyAzEl(site, FAR_KM * Math.cos(a), FAR_KM * Math.sin(a), FAR_KM * 0.3 * Math.sin(2 * a), out);
      expect(out.elDeg).toBeGreaterThanOrEqual(-90);
      expect(out.elDeg).toBeLessThanOrEqual(90);
      expect(out.azDeg).toBeGreaterThanOrEqual(0);
      expect(out.azDeg).toBeLessThan(360);
    }
  });

  it('rejects an out-of-range latitude', () => {
    expect(() => makeSiteFrame(91, 0)).toThrow(/latDeg/);
    expect(() => makeSiteFrame(Number.NaN, 0)).toThrow(/latDeg/);
  });
});

describe('angle helpers', () => {
  it('wrapDeg360', () => {
    expect(wrapDeg360(-1)).toBeCloseTo(359, 12);
    expect(wrapDeg360(360)).toBe(0);
    expect(wrapDeg360(725)).toBe(5);
  });

  it('skySeparationDeg is robust at the zenith where azimuth is degenerate', () => {
    expect(skySeparationDeg(0, 0, 90, 0)).toBeCloseTo(90, 9);
    expect(skySeparationDeg(10, 90, 250, 90)).toBeCloseTo(0, 9);
    expect(skySeparationDeg(359.99, 0, 0.01, 0)).toBeCloseTo(0.02, 9);
  });
});

describe('time formatting [LSN-TIME-001]', () => {
  it('prints Horizons-style minutes in UTC', () => {
    expect(formatHorizonsMinute(1_793_491_200)).toBe('2026-Nov-01 00:00');
    expect(formatHorizonsMinute(1_793_491_200 + 600)).toBe('2026-Nov-01 00:10');
    expect(formatHorizonsMinute(Date.UTC(2028, 1, 29, 12, 0) / 1000)).toBe('2028-Feb-29 12:00');
  });

  it('refuses a time that is not a whole minute', () => {
    expect(() => formatHorizonsMinute(1_793_491_201)).toThrow(/minutes/);
  });
});
