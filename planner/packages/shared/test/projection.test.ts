// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { describe, expect, it } from 'vitest';
import { DEM_80S_RADIUS_M, southPolarForward, southPolarInverse } from '../src';

describe('south polar stereographic [LSN-DEM-001]', () => {
  it('pole maps to the origin', () => {
    const p = southPolarForward(-90, 0, { xM: 1, yM: 1 });
    expect(p.xM).toBeCloseTo(0, 9);
    expect(p.yM).toBeCloseTo(0, 9);
  });

  it('the 80 S circle has radius 2R tan(5 deg), about 304.0 km, matching the DEM extent', () => {
    expect(Math.abs(DEM_80S_RADIUS_M - 304_000)).toBeLessThan(10);
    const p = southPolarForward(-80, 0, { xM: 0, yM: 0 });
    expect(Math.hypot(p.xM, p.yM)).toBeCloseTo(DEM_80S_RADIUS_M, 6);
  });

  it('axis convention: east longitude 0 is +y, 90 E is +x, 180 is -y, 270 E is -x (as found by V0)', () => {
    const at = (lon: number) => southPolarForward(-85, lon, { xM: 0, yM: 0 });
    expect(at(0).yM).toBeGreaterThan(0);
    expect(at(0).xM).toBeCloseTo(0, 6);
    expect(at(90).xM).toBeGreaterThan(0);
    expect(at(180).yM).toBeLessThan(0);
    expect(at(270).xM).toBeLessThan(0);
  });

  it('inverse undoes forward over the polar cap', () => {
    for (let lat = -90; lat <= -79.9; lat += 1.7) {
      for (let lon = -180; lon <= 360; lon += 37) {
        const xy = southPolarForward(lat, lon, { xM: 0, yM: 0 });
        const back = southPolarInverse(xy.xM, xy.yM, { latDeg: 0, lonDeg: 0 });
        expect(back.latDeg).toBeCloseTo(lat, 9);
        if (lat > -89.999) {
          const dLon = ((back.lonDeg - lon + 540) % 360) - 180;
          expect(Math.abs(dLon)).toBeLessThan(1e-7);
        }
      }
    }
  });

  it('rejects northern latitudes', () => {
    expect(() => southPolarForward(10, 0, { xM: 0, yM: 0 })).toThrow(/latDeg/);
  });
});
