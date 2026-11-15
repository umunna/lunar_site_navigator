// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
//   npm run validate:v1
//
// V1: shipped ephemeris.bin vs Horizons topocentric AZ/EL. 8 sites, 300 epochs
// (250 on the 10-minute grid, 50 at half-step to exercise the interpolation).
// Writes data/validation/V1.json and regenerates docs/VALIDATION.md.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { decodeEphemeris, formatIsoUtc } from '@lsn/shared';
import { fetchHorizonsText } from '../horizons/client';
import { CACHE_DIR, DATA_DIR } from '../paths';
import { plannedCheck, saveRecord, writeReport } from '../validation/records';
import type { ValidationRecord } from '../validation/records';
import { V1_SITES, V1_TOLERANCE_DEG, compareResponse, pickEpochs, summarise, topoRequestUrl } from '../validation/v1';
import type { Body, Sample, Stats } from '../validation/v1';

const GRID_EPOCHS = 250;
const HALF_STEP_EPOCHS = 50;
const SEED = 20_261_114;
/** Epochs per Horizons request: keeps the URL short (a few KB). */
const EPOCHS_PER_REQUEST = 50;
const BODIES: readonly Body[] = ['sun', 'earth'];

function log(message: string): void {
  console.log(`[validate-v1] ${message}`);
}

function fmt(deg: number): string {
  return deg.toFixed(6);
}

async function collect(
  eph: ReturnType<typeof decodeEphemeris>,
  indices: readonly number[],
): Promise<Map<string, Sample[]>> {
  const results = new Map<string, Sample[]>();
  for (const site of V1_SITES) {
    for (const body of BODIES) {
      const all: Sample[] = [];
      for (let from = 0; from < indices.length; from += EPOCHS_PER_REQUEST) {
        const part = indices.slice(from, from + EPOCHS_PER_REQUEST);
        const url = topoRequestUrl(site, body, eph.meta.t0UnixS, eph.meta.stepS, part);
        const text = await fetchHorizonsText(url, {
          cacheDir: join(CACHE_DIR, 'horizons'),
          label: `v1-${body}-${String(site.latDeg)}-${String(site.lonDeg)}-${String(from)}`,
        });
        all.push(...compareResponse(text, site, body, eph, part));
      }
      results.set(`${site.name}|${body}`, all);
      const s = summarise(all);
      log(`${site.name} ${body}: max ${fmt(s.maxDeg)} deg, mean ${fmt(s.meanDeg)} deg`);
    }
  }
  return results;
}

function tableFor(body: Body, results: Map<string, Sample[]>): { lines: string[]; worst: number } {
  const lines = [
    `### ${body === 'sun' ? 'Sun' : 'Earth'} (tolerance ${String(V1_TOLERANCE_DEG[body])} deg)`,
    '',
    '| Site | n | max (deg) | mean (deg) | 95th pct (deg) | mean d(el), ours - Horizons (deg) |',
    '|---|---|---|---|---|---|',
  ];
  let worst = 0;
  for (const site of V1_SITES) {
    const stats: Stats = summarise(results.get(`${site.name}|${body}`) ?? []);
    worst = Math.max(worst, stats.maxDeg);
    lines.push(`| ${site.name} | ${String(stats.n)} | ${fmt(stats.maxDeg)} | ${fmt(stats.meanDeg)} | ${fmt(stats.p95Deg)} | ${stats.meanDElDeg.toFixed(6)} |`);
  }
  lines.push('');
  return { lines, worst };
}

function halfStepNote(results: Map<string, Sample[]>): string {
  let worstGrid = 0;
  let worstHalf = 0;
  for (const samples of results.values()) {
    for (const s of samples) {
      if (Number.isInteger(s.index)) {
        worstGrid = Math.max(worstGrid, s.sepDeg);
      } else {
        worstHalf = Math.max(worstHalf, s.sepDeg);
      }
    }
  }
  return `At times on the 10-minute grid the largest difference is ${fmt(worstGrid)} degrees. At times halfway between two grid points it is ${fmt(worstHalf)} degrees.`;
}

async function main(): Promise<void> {
  const binPath = join(DATA_DIR, 'ephemeris.bin');
  const eph = decodeEphemeris(new Uint8Array(await readFile(binPath)));
  log(`loaded ${binPath}: ${String(eph.meta.count)} samples from ${formatIsoUtc(eph.meta.t0UnixS)}`);

  const indices = pickEpochs(eph.meta.count, GRID_EPOCHS, HALF_STEP_EPOCHS, SEED);
  const results = await collect(eph, indices);

  const sun = tableFor('sun', results);
  const earth = tableFor('earth', results);
  const pass = sun.worst <= V1_TOLERANCE_DEG.sun && earth.worst <= V1_TOLERANCE_DEG.earth;
  const record: ValidationRecord = {
    ...plannedCheck('V1'),
    status: pass ? 'pass' : 'fail',
    generatedAtUtc: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    summary: `The largest difference at ${String(V1_SITES.length)} places and ${String(indices.length)} times: Sun ${fmt(sun.worst)} degrees, Earth ${fmt(earth.worst)} degrees. ${halfStepNote(results)}`,
    details: [
      `Input: data/ephemeris.bin (${eph.meta.note}).`,
      `Reference: Horizons topocentric apparent AZ/EL (QUANTITIES=4, airless) with CENTER=coord@301, GEODETIC site coordinates at height 0, UTC, same epochs. Seed ${String(SEED)}.`,
      'This checks our conversion and the shipped Float32 binary against Horizons. It does not check the ephemeris itself.',
      'Five sites are fixed test points (four polar, one equatorial); three are catalog sites (marked "catalog").',
      '',
      ...sun.lines,
      ...earth.lines,
    ],
  };
  await saveRecord(record);
  const report = await writeReport();
  log(`V1 ${record.status.toUpperCase()}: Sun max ${fmt(sun.worst)}, Earth max ${fmt(earth.worst)}. Report: ${report}`);
  process.exitCode = pass ? 0 : 1;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
