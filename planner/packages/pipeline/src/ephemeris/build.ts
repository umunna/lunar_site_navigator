// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// Turns Horizons "sub-point" tables into Sun and Earth vectors.
// Method validated 14 Nov 2026 (docs/history/plan-2026-11-14.md 5.5 P1):
//   COMMAND=301 (Moon), CENTER=500@399 (Earth centre), QUANTITIES=14,15,19,20.
//   14 = sub-Earth lon/lat on the Moon, 15 = sub-solar lon/lat on the Moon,
//   19 = Sun-Moon distance (r), 20 = Earth-Moon distance (delta), all in the
//   Moon's mean-Earth body-fixed frame, east longitude positive.
// Do not use VECTORS with REF_PLANE='BODY': it is inertial (5.5).
import {
  EPHEMERIS_FLOATS_PER_SAMPLE,
  EPHEMERIS_STEP_S,
  EPHEMERIS_T0_UNIX_S,
  formatHorizonsMinute,
  invariant,
  lonLatToUnit,
} from '@lsn/shared';
import { COMMON_PARAMS, buildHorizonsUrl } from '../horizons/url';
import type { HorizonsParams } from '../horizons/url';
import { HorizonsParseError, columnIndex, numberCell } from '../horizons/parse';
import type { HorizonsTable } from '../horizons/parse';

/** Sanity windows (km). Moon-Earth 356,400 to 406,800 km; Sun-Moon about 147.1e6 to 152.1e6 km. Windows are looser. */
const EARTH_DIST_KM: readonly [number, number] = [3.0e5, 4.5e5];
const SUN_DIST_KM: readonly [number, number] = [1.4e8, 1.6e8];

/** Horizons request for samples [startIndex, startIndex + count) of the ephemeris grid. */
export function geoRequestParams(startIndex: number, count: number): HorizonsParams {
  invariant(Number.isInteger(startIndex) && startIndex >= 0, 'startIndex must be a non-negative integer');
  invariant(Number.isInteger(count) && count > 0, 'count must be a positive integer');
  const start = EPHEMERIS_T0_UNIX_S + startIndex * EPHEMERIS_STEP_S;
  const stop = EPHEMERIS_T0_UNIX_S + (startIndex + count - 1) * EPHEMERIS_STEP_S;
  return {
    ...COMMON_PARAMS,
    COMMAND: '301',
    CENTER: '500@399',
    START_TIME: formatHorizonsMinute(start),
    STOP_TIME: formatHorizonsMinute(stop),
    STEP_SIZE: `${String(EPHEMERIS_STEP_S / 60)} min`,
    QUANTITIES: '14,15,19,20',
    RANGE_UNITS: 'KM',
  };
}

export function geoRequestUrl(startIndex: number, count: number): string {
  return buildHorizonsUrl(geoRequestParams(startIndex, count));
}

function checkWindow(value: number, window: readonly [number, number], what: string): void {
  if (value < window[0] || value > window[1]) {
    throw new HorizonsParseError(`${what} = ${String(value)} km is outside the sanity window`);
  }
}

/**
 * Convert a parsed geo table into Float32 vectors written at `out[startIndex * 6 ...]`.
 * Checks the row count and every row's date against the expected grid.
 */
export function writeGeoVectors(table: HorizonsTable, startIndex: number, count: number, out: Float32Array): void {
  if (table.rows.length !== count) {
    throw new HorizonsParseError(`expected ${String(count)} rows, got ${String(table.rows.length)}`);
  }
  const iDate = 0;
  const iObsLon = columnIndex(table, 'ObsSub-LON');
  const iObsLat = columnIndex(table, 'ObsSub-LAT');
  const iSunLon = columnIndex(table, 'SunSub-LON');
  const iSunLat = columnIndex(table, 'SunSub-LAT');
  const iSunR = columnIndex(table, 'r');
  const iEarthR = columnIndex(table, 'delta');

  for (let k = 0; k < count; k++) {
    const row = table.rows[k] ?? [];
    const expected = formatHorizonsMinute(EPHEMERIS_T0_UNIX_S + (startIndex + k) * EPHEMERIS_STEP_S);
    if (row[iDate] !== expected) {
      throw new HorizonsParseError(`row ${String(k)}: date "${String(row[iDate])}" != expected "${expected}"`);
    }
    const sunR = numberCell(row, iSunR, 'r');
    const earthR = numberCell(row, iEarthR, 'delta');
    checkWindow(sunR, SUN_DIST_KM, 'Sun distance r');
    checkWindow(earthR, EARTH_DIST_KM, 'Earth distance delta');
    const sun = lonLatToUnit(numberCell(row, iSunLon, 'SunSub-LON'), numberCell(row, iSunLat, 'SunSub-LAT'));
    const earth = lonLatToUnit(numberCell(row, iObsLon, 'ObsSub-LON'), numberCell(row, iObsLat, 'ObsSub-LAT'));
    const base = (startIndex + k) * EPHEMERIS_FLOATS_PER_SAMPLE;
    out[base] = sun[0] * sunR;
    out[base + 1] = sun[1] * sunR;
    out[base + 2] = sun[2] * sunR;
    out[base + 3] = earth[0] * earthR;
    out[base + 4] = earth[1] * earthR;
    out[base + 5] = earth[2] * earthR;
  }
}

export interface Chunk {
  readonly start: number;
  readonly count: number;
}

/** Split [0, total) into chunks of at most `chunkSamples` samples. */
export function planChunks(total: number, chunkSamples: number): Chunk[] {
  invariant(Number.isInteger(total) && total > 0, 'total must be a positive integer');
  invariant(Number.isInteger(chunkSamples) && chunkSamples > 0, 'chunkSamples must be a positive integer');
  const chunks: Chunk[] = [];
  const n = Math.ceil(total / chunkSamples);
  for (let i = 0; i < n; i++) {
    const start = i * chunkSamples;
    chunks.push({ start, count: Math.min(chunkSamples, total - start) });
  }
  return chunks;
}

/** Split one chunk into two halves, first half first. */
export function splitChunk(chunk: Chunk): [Chunk, Chunk] {
  invariant(chunk.count >= 2, 'cannot split a chunk of fewer than 2 samples');
  const firstCount = Math.ceil(chunk.count / 2);
  return [
    { start: chunk.start, count: firstCount },
    { start: chunk.start + firstCount, count: chunk.count - firstCount },
  ];
}
