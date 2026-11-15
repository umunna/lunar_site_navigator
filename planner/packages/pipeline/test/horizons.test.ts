// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bodyAzEl, makeSiteFrame, newAzEl, skySeparationDeg } from '@lsn/shared';
import { HorizonsParseError, columnIndexByPrefix, numberCell, parseHorizonsCsv } from '../src/horizons/parse';
import { buildHorizonsUrl } from '../src/horizons/url';
import { geoRequestUrl, planChunks, splitChunk, writeGeoVectors } from '../src/ephemeris/build';
import { sameMinute } from '../src/validation/v1';

const here = dirname(fileURLToPath(import.meta.url));

function fixture(name: string): string {
  return readFileSync(join(here, 'fixtures', name), 'utf8');
}

describe('Horizons URL builder', () => {
  it('quotes values, encodes spaces as %20, keeps key order, leaves format unquoted', () => {
    const url = buildHorizonsUrl({ format: 'text', COMMAND: '301', STEP_SIZE: '10 min' });
    expect(url).toBe("https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='301'&STEP_SIZE='10%20min'");
  });

  it('geo request for the first 4 samples [LSN-EPH-003]', () => {
    const url = geoRequestUrl(0, 4);
    expect(url).toContain("START_TIME='2026-Nov-01%2000%3A00'");
    expect(url).toContain("STOP_TIME='2026-Nov-01%2000%3A30'");
    expect(url).toContain("QUANTITIES='14%2C15%2C19%2C20'");
    expect(url).toContain("CENTER='500%40399'");
    expect(url).toContain("RANGE_UNITS='KM'");
  });

  it('rejects a malformed parameter name', () => {
    expect(() => buildHorizonsUrl({ 'bad name': 'x' })).toThrow(/parameter name/);
  });
});

describe('Horizons CSV parser [LSN-EPH-003]', () => {
  const table = parseHorizonsCsv(fixture('horizons-geo-sample.txt'));

  it('finds header, rows and provenance', () => {
    expect(table.columns[0]).toBe('Date__(UT)__HR:MN');
    expect(table.columns).toContain('ObsSub-LON');
    expect(table.rows).toHaveLength(4);
    expect(table.rows[0]?.[0]).toBe('2026-Nov-01 00:00');
    expect(table.source).toBe('DE441');
    expect(table.apiVersion).toBe('1.2');
    expect(table.responseStamp).toBe('Sat Nov 14 07:11:30 2026');
  });

  it('numberCell fails loudly on junk instead of returning NaN', () => {
    expect(() => numberCell(['x'], 0, 'thing')).toThrow(HorizonsParseError);
    expect(() => numberCell([], 0, 'thing')).toThrow(/not a number/);
  });

  it('rejects an error body that came back with HTTP 200', () => {
    expect(() => parseHorizonsCsv('API VERSION: 1.2\nERROR: bad input\n')).toThrow(/no \$\$SOE/);
  });
});

describe('geo table to vectors [LSN-EPH-003]', () => {
  const table = parseHorizonsCsv(fixture('horizons-geo-sample.txt'));

  it('writes vectors whose length equals the Horizons range and whose direction is the sub-point', () => {
    const out = new Float32Array(4 * 6);
    writeGeoVectors(table, 0, 4, out);
    const sunLon = (285.130931 * Math.PI) / 180;
    const sunLat = (-1.457223 * Math.PI) / 180;
    const r = 1.485751076e8;
    expect(out[0]).toBeCloseTo(r * Math.cos(sunLat) * Math.cos(sunLon), -2);
    expect(out[2]).toBeCloseTo(r * Math.sin(sunLat), -2);
    expect(Math.hypot(out[0] ?? 0, out[1] ?? 0, out[2] ?? 0) / r).toBeCloseTo(1, 6);
    expect(Math.hypot(out[3] ?? 0, out[4] ?? 0, out[5] ?? 0)).toBeCloseTo(3.6990485554e5, 0);
  });

  it('refuses a table that does not match the expected grid', () => {
    const out = new Float32Array(4 * 6);
    expect(() => writeGeoVectors(table, 1, 4, out)).toThrow(/date/);
    expect(() => writeGeoVectors(table, 0, 3, out)).toThrow(/expected 3 rows/);
  });

  it('V1 in miniature: converts to Horizons topocentric az/el within tolerance at 89.9 S [LSN-GEO-002]', () => {
    const out = new Float32Array(4 * 6);
    writeGeoVectors(table, 0, 4, out);
    const site = makeSiteFrame(-89.9, 0);
    const bodies = [
      { file: 'horizons-topo-sun-sample.txt', offset: 0, tolDeg: 0.001 },
      { file: 'horizons-topo-earth-sample.txt', offset: 3, tolDeg: 0.01 },
    ] as const;
    for (const body of bodies) {
      const topo = parseHorizonsCsv(fixture(body.file));
      const iAz = columnIndexByPrefix(topo, 'Azimuth');
      const iEl = columnIndexByPrefix(topo, 'Elevation');
      for (let k = 0; k < 4; k++) {
        const row = topo.rows[k] ?? [];
        const ours = bodyAzEl(site, out[k * 6 + body.offset] ?? 0, out[k * 6 + body.offset + 1] ?? 0, out[k * 6 + body.offset + 2] ?? 0, newAzEl());
        const sep = skySeparationDeg(ours.azDeg, ours.elDeg, numberCell(row, iAz, 'az'), numberCell(row, iEl, 'el'));
        expect(sep).toBeLessThan(body.tolDeg);
      }
    }
  });
});

describe('V1 date matching [LSN-GEO-002]', () => {
  it('accepts whole-minute dates with or without zero seconds, rejects anything else', () => {
    expect(sameMinute('2026-Nov-01 09:00', '2026-Nov-01 09:00')).toBe(true);
    expect(sameMinute('2026-Nov-01 09:00:00.000', '2026-Nov-01 09:00')).toBe(true);
    expect(sameMinute('2026-Nov-01 09:00:30.000', '2026-Nov-01 09:00')).toBe(false);
    expect(sameMinute('2026-Nov-01 09:01:00.000', '2026-Nov-01 09:00')).toBe(false);
    expect(sameMinute(undefined, '2026-Nov-01 09:00')).toBe(false);
  });
});

describe('chunk planning', () => {
  it('covers every sample exactly once', () => {
    const chunks = planChunks(1000, 300);
    expect(chunks).toEqual([
      { start: 0, count: 300 },
      { start: 300, count: 300 },
      { start: 600, count: 300 },
      { start: 900, count: 100 },
    ]);
  });

  it('splitChunk halves without gaps or overlap', () => {
    const [a, b] = splitChunk({ start: 10, count: 7 });
    expect(a).toEqual({ start: 10, count: 4 });
    expect(b).toEqual({ start: 14, count: 3 });
    expect(() => splitChunk({ start: 0, count: 1 })).toThrow(/fewer than 2/);
  });
});
