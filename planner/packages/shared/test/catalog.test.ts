// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { describe, expect, it } from 'vitest';
import { ARTEMIS_REGIONS, CATALOG, ROVER_DEMO, hasTerrain } from '../src';

const findSite = (id: string) => CATALOG.find((s) => s.id === id);

describe('catalog invariants [LSN-CAT-001]', () => {
  it('has entries, and every entry has a source and a known precision and group', () => {
    expect(CATALOG).toHaveLength(14);
    for (const s of CATALOG) {
      expect(s.source.length, s.id).toBeGreaterThan(40);
      expect(s.source, s.id).toMatch(/https?:\/\/|doi/);
      expect(['landing-site', 'computed-high-point', 'demo-area'], s.id).toContain(s.precision);
      expect(['south-pole', 'apollo'], s.id).toContain(s.group);
      expect(s.notes.length, s.id).toBeGreaterThan(0);
    }
  });

  it('ids are unique, non-empty and fit the 32-byte skylines.bin key', () => {
    const ids = CATALOG.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      const bytes = new TextEncoder().encode(id).length;
      expect(bytes).toBeGreaterThan(0);
      expect(bytes).toBeLessThanOrEqual(32);
    }
  });

  it('coordinates are finite and in range', () => {
    for (const s of CATALOG) {
      expect(s.latDeg).toBeGreaterThanOrEqual(-90);
      expect(s.latDeg).toBeLessThanOrEqual(90);
      expect(s.lonDeg).toBeGreaterThanOrEqual(-180);
      expect(s.lonDeg).toBeLessThanOrEqual(360);
    }
  });

  it('group and precision agree, so a computed point is never labelled a landing site', () => {
    for (const s of CATALOG) {
      if (s.group === 'apollo') expect(s.precision, s.id).toBe('landing-site');
      if (s.group === 'south-pole') expect(['computed-high-point', 'demo-area'], s.id).toContain(s.precision);
      if (s.precision === 'landing-site') expect(s.group, s.id).toBe('apollo');
    }
  });

  it('has the six Apollo landing sites with the NSSDC Lunar Module coordinates', () => {
    const want: Record<string, [number, number]> = {
      'apollo-11': [0.67416, 23.47314],
      'apollo-12': [-3.0128, -23.4219],
      'apollo-14': [-3.64589, -17.47194],
      'apollo-15': [26.13239, 3.6333],
      'apollo-16': [-8.9734, 15.5011],
      'apollo-17': [20.1911, 30.7723],
    };
    for (const [id, [lat, lon]] of Object.entries(want)) {
      const s = findSite(id);
      expect(s, id).toBeDefined();
      expect(s?.latDeg).toBe(lat);
      expect(s?.lonDeg).toBe(lon);
      expect(s?.source).toContain('nssdc.gsfc.nasa.gov');
    }
  });

  it('polar entries are inside the DEM, Apollo entries are not', () => {
    for (const s of CATALOG) {
      expect(hasTerrain(s), s.id).toBe(s.group !== 'apollo');
    }
  });
});

describe('Artemis III regions [LSN-CAT-001]', () => {
  it('lists the 13 regions of NASA release 22-089, once each', () => {
    expect(ARTEMIS_REGIONS).toHaveLength(13);
    expect(new Set(ARTEMIS_REGIONS.map((r) => r.name)).size).toBe(13);
  });

  it('every mapped region has a high-point entry, every unmapped one says why', () => {
    for (const r of ARTEMIS_REGIONS) {
      expect(r.why.length, r.name).toBeGreaterThan(10);
      if (r.iauFeature !== null) {
        const slug = r.iauFeature.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        expect(findSite(`${slug}-high`), r.name).toBeDefined();
      }
    }
  });

  it('the region of the rover simulation has its catalog entry, marked as a demo area', () => {
    expect(ARTEMIS_REGIONS.some((r) => r.name === ROVER_DEMO.regionName)).toBe(true);
    const s = findSite(ROVER_DEMO.siteId);
    expect(s?.precision).toBe('demo-area');
    expect(s?.source).toContain('rover-slam/config/terrain_meta.json');
    expect(s?.latDeg).toBeLessThan(-89);
  });

  it('no region is silently given coordinates it does not have', () => {
    const unmapped = ARTEMIS_REGIONS.filter((r) => r.iauFeature === null).map((r) => r.name);
    expect(unmapped).toEqual(['Connecting Ridge', 'Connecting Ridge Extension', 'de Gerlache-Kocher Massif', 'Leibnitz Beta Plateau']);
  });
});
