// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { southPolarForward } from '@lsn/shared';
import { describe, expect, it } from 'vitest';
import { artemisFeatureNames, buildCatalog, renderCatalogTs, slug } from '../src/catalog/build';
import { findHighPoint } from '../src/catalog/highpoint';
import { parseNssdcApollo } from '../src/catalog/nssdc';
import { parseRoverPatch } from '../src/catalog/rover';
import type { GazetteerFeature } from '../src/gazetteer/gazetteer';

const here = dirname(fileURLToPath(import.meta.url));

describe('NSSDC Apollo page parser [LSN-CAT-003]', () => {
  const landings = parseNssdcApollo(readFileSync(join(here, 'fixtures', 'nssdc-lunar-sites.html'), 'utf8'));

  it('reads the Lunar Module row of all six landings from the real page', () => {
    expect(landings.map((l) => l.mission)).toEqual([11, 12, 14, 15, 16, 17]);
    expect(landings[0]).toEqual({ mission: 11, latDeg: 0.67416, lonDeg: 23.47314 });
    expect(landings[2]).toEqual({ mission: 14, latDeg: -3.64589, lonDeg: -17.47194 });
    expect(landings[5]).toEqual({ mission: 17, latDeg: 20.1911, lonDeg: 30.7723 });
  });

  it('throws instead of guessing when the page has no table', () => {
    expect(() => parseNssdcApollo('<html>moved</html>')).toThrow(/expected 6/);
  });
});

describe('high point finder [LSN-CAT-003]', () => {
  const bump = (cx: number, cy: number) => (x: number, y: number): number => 1000 - Math.hypot(x - cx, y - cy) / 10;

  it('finds the summit inside the annulus and ignores a higher one outside it', () => {
    const height = (x: number, y: number): number => Math.max(bump(5000, 0)(x, y), bump(0, 20_000)(x, y) + 500);
    const hp = findHighPoint(height, 0, 0, 3000, 8000, 80);
    expect(hp).not.toBeNull();
    expect(Math.hypot((hp?.xM ?? 0) - 5000, hp?.yM ?? 0)).toBeLessThan(100);
  });

  it('is deterministic and returns null when nothing is finite', () => {
    expect(findHighPoint(() => Number.NaN, 0, 0, 0, 1000, 80)).toBeNull();
    const flat = findHighPoint(() => 7, 0, 0, 1000, 2000, 80);
    expect(flat).toEqual(findHighPoint(() => 7, 0, 0, 1000, 2000, 80));
  });
});

function fakeFeature(name: string, i: number): GazetteerFeature {
  return {
    id: 1000 + i, name, diameterKm: 40, centerLatDeg: -86 - (i % 3), centerLonDeg: 30 * i - 100, northLatDeg: 0, southLatDeg: 0,
    eastLonDeg: 0, westLonDeg: 0, coordSystem: 'Planetographic, +East, -180 - 180', featureType: name.startsWith('Mons') ? 'Mons, montes' : 'Crater, craters',
    approval: 'Approved', lastUpdated: '',
  };
}

describe('catalog assembly [LSN-CAT-001]', () => {
  const gazetteer = artemisFeatureNames().map(fakeFeature);
  const apollo = [{ mission: 12, latDeg: -3, lonDeg: -23 }, { mission: 11, latDeg: 0.67, lonDeg: 23.47 }];
  const dome = (x: number, y: number): number => 500 - Math.hypot(x, y) / 1000;
  const sites = buildCatalog({ gazetteer, apollo, height: dome, roverPatch: null });

  it('maps only regions with an IAU feature: 7 features, each with one high point, then Apollo in mission order', () => {
    expect(artemisFeatureNames()).toHaveLength(7);
    expect(sites).toHaveLength(7 + 2);
    expect(sites.slice(-2).map((s) => s.id)).toEqual(['apollo-11', 'apollo-12']);
    expect(new Set(sites.map((s) => s.id)).size).toBe(sites.length);
  });

  it('never labels a computed point as a landing site', () => {
    for (const s of sites.filter((x) => x.group !== 'apollo')) {
      expect(s.precision).toBe('computed-high-point');
      expect(s.notes).toMatch(/not an official NASA landing site/);
    }
  });

  it('refuses a Gazetteer without one of the mapped features', () => {
    expect(() => buildCatalog({ gazetteer: gazetteer.slice(1), apollo, height: dome, roverPatch: null })).toThrow(/expected exactly one/);
  });

  it('adds the area of the rover simulation from its metadata, before the Apollo sites, and never as a landing site', () => {
    const patch = parseRoverPatch('{"centre_xy_m":[-4490,-13410],"size_m":512,"source_dem":"Site04.tif","region":"Connecting Ridge (Artemis III candidate)"}');
    const withRover = buildCatalog({ gazetteer, apollo, height: dome, roverPatch: patch });
    expect(withRover).toHaveLength(7 + 1 + 2);
    const rover = withRover.find((s) => s.id === 'connecting-ridge-rover');
    expect(rover?.precision).toBe('demo-area');
    expect(rover?.group).toBe('south-pole');
    // 14.14 km from the pole: latitude -90 + 0.4664 degrees. x < 0 and y < 0: longitude between -180 and -90.
    expect(rover?.latDeg).toBeCloseTo(-89.5336, 3);
    expect(rover?.lonDeg).toBeCloseTo(-161.4882, 3);
    expect(rover?.notes).toMatch(/not an official NASA landing site/);
    expect(withRover.slice(-2).map((s) => s.id)).toEqual(['apollo-11', 'apollo-12']);
    expect(() => buildCatalog({ gazetteer, apollo, height: dome, roverPatch: { ...patch, region: 'Somewhere else' } })).toThrow(/not in Connecting Ridge/);
  });

  it('refuses rover metadata with a missing or bad field', () => {
    expect(() => parseRoverPatch('{"centre_xy_m":[1],"size_m":512,"source_dem":"a","region":"b"}')).toThrow(/two numbers/);
    expect(() => parseRoverPatch('{"centre_xy_m":[1,2],"size_m":0,"source_dem":"a","region":"b"}')).toThrow(/missing/);
    expect(() => parseRoverPatch('[]')).toThrow();
  });

  it('slug and generated source are stable', () => {
    expect(slug('de Gerlache')).toBe('de-gerlache');
    const ts = renderCatalogTs(sites);
    expect(ts).toContain('GENERATED');
    expect(ts).toContain('"id": "apollo-11"');
    expect(renderCatalogTs(sites)).toBe(ts);
    expect(southPolarForward(-86, 0, { xM: 0, yM: 0 }).yM).toBeGreaterThan(0);
  });
});
