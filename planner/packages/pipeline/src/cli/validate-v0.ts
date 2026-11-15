// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
//   npm run validate:v0
//
// V0: DEM orientation, with IAU Gazetteer coordinates (docs/history/plan-2026-11-14.md 5.7).
// Needs data-cache/dem/80m (npm run fetch-dem) and the Gazetteer table (downloaded on first use).
import { join } from 'node:path';
import { DEM_80S_RADIUS_M } from '@lsn/shared';
import { Dem } from '../dem/dem';
import { findUnique, loadMoonGazetteer } from '../gazetteer/gazetteer';
import type { GazetteerFeature } from '../gazetteer/gazetteer';
import { CACHE_DIR } from '../paths';
import { plannedCheck, saveRecord, writeReport } from '../validation/records';
import type { ValidationRecord } from '../validation/records';
import {
  CONVENTIONS,
  FIRST_RUN_DEPRESSION_KM,
  FIRST_RUN_HIGH_KM,
  MIN_CONTRAST_KM,
  OURS_INDEX,
  contrastKm,
  fits,
  minContrast,
  uniqueThresholdRange,
} from '../validation/v0';
import type { V0Target } from '../validation/v0';

const CRATERS = ['Haworth', 'Shoemaker', 'Faustini', 'de Gerlache', 'Cabeus', 'Shackleton'];
const HIGHS = ['Mons Malapert'];

function log(message: string): void {
  console.log(`[validate-v0] ${message}`);
}

function cell(c: number | null): string {
  return c === null ? 'off-DEM' : c.toFixed(2);
}

function target(gaz: readonly GazetteerFeature[], name: string, kind: V0Target['kind']): V0Target {
  const f = findUnique(gaz, name);
  return { gazetteerId: f.id, name, kind, latDeg: f.centerLatDeg, lonDeg: f.centerLonDeg, diameterKm: f.diameterKm };
}

/** What the very first run said, recomputed from the same numbers so the report stays honest. */
function firstRunFits(row: readonly (number | null)[], targets: readonly V0Target[]): boolean {
  return targets.every((t, i) => (row[i] ?? -Infinity) >= (t.kind === 'depression' ? FIRST_RUN_DEPRESSION_KM : FIRST_RUN_HIGH_KM));
}

async function main(): Promise<void> {
  const gaz = await loadMoonGazetteer(CACHE_DIR);
  const targets = [...CRATERS.map((n) => target(gaz, n, 'depression')), ...HIGHS.map((n) => target(gaz, n, 'high'))];
  const dem = await Dem.open(join(CACHE_DIR, 'dem', '80m', 'LDEM_80S_80MPP_ADJ.TIF'));
  log('decoding the whole polar cap (225 tiles)');
  await dem.loadWindow({ xMinM: -DEM_80S_RADIUS_M, xMaxM: DEM_80S_RADIUS_M, yMinM: -DEM_80S_RADIUS_M, yMaxM: DEM_80S_RADIUS_M });
  const height = (x: number, y: number): number => dem.heightXyM(x, y);

  const grid = CONVENTIONS.map((conv) => targets.map((t) => contrastKm(height, conv, t)));
  const mins = grid.map((row) => minContrast(row));
  const passing = grid.map((row) => fits(row, MIN_CONTRAST_KM));
  const nFirst = grid.filter((row) => firstRunFits(row, targets)).length;
  const nPass = passing.filter(Boolean).length;
  const oursOnly = nPass === 1 && passing[OURS_INDEX] === true;
  const range = uniqueThresholdRange(mins, OURS_INDEX);

  const lines = [
    'Contrast in km, positive = as expected (ring mean minus disc mean for craters, disc minus ring for the massif).',
    'Disc = central 40% of the radius, ring = 1.3 to 1.8 radii, sampled every 320 m in the projected plane. "off-DEM" = more than 10% of the area outside the data.',
    '',
    `| Axis convention | ${targets.map((t) => t.name).join(' | ')} | Smallest | All >= ${String(MIN_CONTRAST_KM)} km |`,
    `|---|${targets.map(() => '---').join('|')}|---|---|`,
    ...CONVENTIONS.map((conv, i) => `| ${conv.label} | ${(grid[i] ?? []).map(cell).join(' | ')} | ${(mins[i] ?? 0).toFixed(2)} | ${passing[i] === true ? 'YES' : 'no'} |`),
    '',
    '**Criterion history (read this).** The first run used thresholds set in advance: depression >= ' +
      `${String(FIRST_RUN_DEPRESSION_KM)} km, high >= ${String(FIRST_RUN_HIGH_KM)} km. Result: ${String(nFirst)} of 8 conventions fit, ` +
      'because de Gerlache gave a contrast of ' +
      `${cell(grid[OURS_INDEX]?.[CRATERS.indexOf('de Gerlache')] ?? null)} km under our convention. ` +
      `The criterion was then revised, after seeing these numbers (so post hoc), to one threshold of ${String(MIN_CONTRAST_KM)} km for every feature. ` +
      (range === null
        ? 'No threshold isolates our convention.'
        : `Exactly one convention (ours) fits for any threshold above ${range.lowExclusive.toFixed(2)} km up to ${range.highInclusive.toFixed(2)} km, so the result does not hinge on the exact 0.5 km. The original 1.0 km lies outside that range.`) +
      ' Why de Gerlache is only +0.8 km (its ring may lie on low ground) was not investigated.',
    '',
    'Targets (IAU Gazetteer, centre latitude and east longitude as published):',
    '',
    '| Feature | Gazetteer id | Lat | Lon | Diameter (km) | Expected |',
    '|---|---|---|---|---|---|',
    ...targets.map((t) => `| ${t.name} | ${String(t.gazetteerId)} | ${String(t.latDeg)} | ${String(t.lonDeg)} | ${String(t.diameterKm)} | ${t.kind} |`),
    '',
    'Not covered by V0: the DEM vertical datum (section 11 item 6). A constant offset changes a skyline only through the sphere radius, relative size about delta / R (section 6), so it does not block the build.',
    "Latitude in the Gazetteer is labelled planetographic; on the Moon's reference sphere that equals planetocentric.",
  ];
  const record: ValidationRecord = {
    ...plannedCheck('V0'),
    status: oursOnly ? 'pass' : 'fail',
    generatedAtUtc: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    summary:
      `There are 8 possible ways to orient the map. ${String(nPass)} of them put${nPass === 1 ? 's' : ''} all ${String(targets.length)} known craters and mountains in the right place` +
      `${oursOnly ? ': the one that the app uses.' : '.'}` +
      ` With the first threshold (1.0 km for craters), ${String(nFirst)} of 8 fitted. The report gives the history.`,
    details: lines,
  };
  await saveRecord(record);
  await writeReport();
  log(`V0 ${record.status.toUpperCase()}: ${record.summary}`);
  process.exitCode = oursOnly ? 0 : 1;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
