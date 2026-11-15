// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// V1 (docs/history/plan-2026-11-14.md 5.7): our Sun/Earth direction conversion, run on
// the shipped Float32 binary, against Horizons' own topocentric output.
// This checks the conversion and the binary, not the ephemeris itself.
import {
  CATALOG,
  EPHEMERIS_FLOATS_PER_SAMPLE,
  bodyAzEl,
  formatHorizonsMinute,
  invariant,
  makeRng,
  makeSiteFrame,
  newAzEl,
  sampleVectors,
  skySeparationDeg,
} from '@lsn/shared';
import type { Ephemeris } from '@lsn/shared';
import { COMMON_PARAMS, buildHorizonsUrl } from '../horizons/url';
import { columnIndexByPrefix, numberCell, parseHorizonsCsv } from '../horizons/parse';

export type Body = 'sun' | 'earth';

export interface V1Site {
  readonly name: string;
  readonly latDeg: number;
  readonly lonDeg: number;
}

function catalogSite(id: string): V1Site {
  const s = CATALOG.find((c) => c.id === id);
  invariant(s !== undefined, `catalog site ${id} not found`);
  return { name: `${s.name} (catalog)`, latDeg: s.latDeg, lonDeg: s.lonDeg };
}

/** Test sites (docs/history/plan-2026-11-14.md 5.7): four polar, one equatorial, three catalog sites. */
export const V1_SITES: readonly V1Site[] = [
  { name: '89.9 S, 0 E', latDeg: -89.9, lonDeg: 0 },
  { name: '89.0 S, 123 E', latDeg: -89.0, lonDeg: 123 },
  { name: '87.5 S, 270 E', latDeg: -87.5, lonDeg: 270 },
  { name: '85.9 S, 45 E', latDeg: -85.9, lonDeg: 45 },
  { name: '0.67 N, 23.47 E', latDeg: 0.67, lonDeg: 23.47 },
  catalogSite('haworth-high'),
  // Centre of Mons Malapert as published by the IAU Gazetteer (feature id 16338). A fixed point, so that the check does not change when the catalog changes.
  { name: 'Mons Malapert centre (85.98 S, 1.67 W)', latDeg: -85.98, lonDeg: -1.67 },
  catalogSite('nobile-high'),
];

export const V1_TOLERANCE_DEG: Readonly<Record<Body, number>> = { sun: 0.001, earth: 0.01 };

/**
 * Pick distinct sample indices: `gridCount` on the 10-minute grid and `halfCount`
 * at half-step offsets (index + 0.5), which exercise the linear interpolation.
 * Returned sorted ascending.
 */
export function pickEpochs(total: number, gridCount: number, halfCount: number, seed: number): number[] {
  invariant(gridCount + halfCount <= total / 2, 'too many epochs requested for this ephemeris length');
  const rng = makeRng(seed);
  const chosen = new Set<number>();
  const maxAttempts = (gridCount + halfCount) * 50;
  for (let attempt = 0; attempt < maxAttempts && chosen.size < gridCount + halfCount; attempt++) {
    const base = Math.floor(rng() * (total - 1));
    const isHalf = chosen.size >= gridCount;
    chosen.add(isHalf ? base + 0.5 : base);
  }
  invariant(chosen.size === gridCount + halfCount, 'could not pick enough distinct epochs');
  return [...chosen].sort((x, y) => x - y);
}

export function topoRequestUrl(site: V1Site, body: Body, t0UnixS: number, stepS: number, indices: readonly number[]): string {
  const tlist = indices.map((i) => `'${formatHorizonsMinute(t0UnixS + i * stepS)}'`).join(' ');
  return buildHorizonsUrl({
    ...COMMON_PARAMS,
    COMMAND: body === 'sun' ? '10' : '399',
    CENTER: 'coord@301',
    COORD_TYPE: 'GEODETIC',
    SITE_COORD: `${String(site.lonDeg)},${String(site.latDeg)},0`,
    TLIST: tlist,
    QUANTITIES: '4',
    ANG_FORMAT: 'DEG',
    EXTRA_PREC: 'YES',
  });
}

export interface Sample {
  readonly index: number;
  readonly sepDeg: number;
  readonly dElDeg: number;
}

/**
 * Horizons prints TLIST epochs with seconds ("2026-Nov-01 09:00:00.000") but
 * STEP_SIZE epochs without ("2026-Nov-01 09:00"). Accept both, but only when
 * the seconds are zero: anything else is a real time mismatch.
 */
export function sameMinute(rowDate: string | undefined, expected: string): boolean {
  if (rowDate === undefined || !rowDate.startsWith(expected)) {
    return false;
  }
  return /^(:00(\.0+)?)?$/.test(rowDate.slice(expected.length));
}

/** Compare one Horizons topocentric response with our conversion at the same epochs. */
export function compareResponse(
  text: string,
  site: V1Site,
  body: Body,
  eph: Ephemeris,
  indices: readonly number[],
): Sample[] {
  const table = parseHorizonsCsv(text);
  invariant(table.rows.length === indices.length, `expected ${String(indices.length)} rows, got ${String(table.rows.length)}`);
  const iAz = columnIndexByPrefix(table, 'Azimuth');
  const iEl = columnIndexByPrefix(table, 'Elevation');
  const frame = makeSiteFrame(site.latDeg, site.lonDeg, 0);
  const vec = new Float64Array(EPHEMERIS_FLOATS_PER_SAMPLE);
  const ours = newAzEl();
  const offset = body === 'sun' ? 0 : 3;
  const samples: Sample[] = [];
  for (let k = 0; k < indices.length; k++) {
    const index = indices[k] ?? 0;
    const row = table.rows[k] ?? [];
    const expectedDate = formatHorizonsMinute(eph.meta.t0UnixS + index * eph.meta.stepS);
    invariant(sameMinute(row[0], expectedDate), `row ${String(k)}: date ${String(row[0])} != ${expectedDate}`);
    sampleVectors(eph, index, vec);
    bodyAzEl(frame, vec[offset] ?? 0, vec[offset + 1] ?? 0, vec[offset + 2] ?? 0, ours);
    const hAz = numberCell(row, iAz, 'azimuth');
    const hEl = numberCell(row, iEl, 'elevation');
    samples.push({ index, sepDeg: skySeparationDeg(ours.azDeg, ours.elDeg, hAz, hEl), dElDeg: ours.elDeg - hEl });
  }
  return samples;
}

export interface Stats {
  readonly n: number;
  readonly maxDeg: number;
  readonly meanDeg: number;
  readonly p95Deg: number;
  readonly meanDElDeg: number;
}

export function summarise(samples: readonly Sample[]): Stats {
  invariant(samples.length > 0, 'no samples');
  const seps = samples.map((s) => s.sepDeg).sort((a, b) => a - b);
  const sum = seps.reduce((acc, v) => acc + v, 0);
  const dEl = samples.reduce((acc, s) => acc + s.dElDeg, 0);
  return {
    n: seps.length,
    maxDeg: seps[seps.length - 1] ?? 0,
    meanDeg: sum / seps.length,
    p95Deg: seps[Math.min(seps.length - 1, Math.ceil(0.95 * seps.length) - 1)] ?? 0,
    meanDElDeg: dEl / samples.length,
  };
}
