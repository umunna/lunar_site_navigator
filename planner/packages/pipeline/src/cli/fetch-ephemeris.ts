// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// P1 fetch-ephemeris (docs/history/plan-2026-11-14.md 5.5). Build-time only: the app
// never calls Horizons. Writes data/ephemeris.bin.
//
//   npm run fetch-ephemeris                       full 3 years (157,824 samples)
//   npm run fetch-ephemeris -- --days 30 --out data/ephemeris-t0.bin     T0 slice
//   npm run fetch-ephemeris -- --chunk-days 92    quarterly chunks if big requests fail
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  EPHEMERIS_COUNT,
  EPHEMERIS_FLOATS_PER_SAMPLE,
  EPHEMERIS_SAMPLES_PER_DAY,
  EPHEMERIS_STEP_S,
  EPHEMERIS_T0_UNIX_S,
  decodeEphemeris,
  encodeEphemeris,
  formatIsoUtc,
} from '@lsn/shared';
import { HorizonsError, fetchHorizonsText } from '../horizons/client';
import { HorizonsParseError, parseHorizonsCsv } from '../horizons/parse';
import { geoRequestUrl, planChunks, splitChunk, writeGeoVectors } from '../ephemeris/build';
import type { Chunk } from '../ephemeris/build';
import { CACHE_DIR, DATA_DIR, REPO_ROOT } from '../paths';

/** Largest single request. Horizons caps a request at 90,000 rows (5.5); a leap year is 52,704. */
const DEFAULT_CHUNK_DAYS = 366;
/** Never split below one week of samples. */
const MIN_CHUNK_SAMPLES = 7 * EPHEMERIS_SAMPLES_PER_DAY;
/** Upper bound on the work loop (P10 rule 2). */
const MAX_WORK_ITERATIONS = 2000;

function log(message: string): void {
  console.log(`[fetch-ephemeris] ${message}`);
}

interface Provenance {
  source: string;
  apiVersion: string;
  responseStamp: string;
}

async function fetchChunk(chunk: Chunk, out: Float32Array, prov: Provenance): Promise<void> {
  const url = geoRequestUrl(chunk.start, chunk.count);
  const text = await fetchHorizonsText(url, {
    cacheDir: join(CACHE_DIR, 'horizons'),
    label: `geo-${String(chunk.start)}-${String(chunk.count)}`,
    onRetry: (attempt, reason) => {
      log(`  retry ${String(attempt)} after: ${reason}`);
    },
  });
  const table = parseHorizonsCsv(text);
  writeGeoVectors(table, chunk.start, chunk.count, out);
  if (prov.source === '') {
    prov.source = table.source;
    prov.apiVersion = table.apiVersion;
    prov.responseStamp = table.responseStamp;
  }
}

async function runWork(total: number, chunkSamples: number, out: Float32Array): Promise<Provenance> {
  const prov: Provenance = { source: '', apiVersion: '', responseStamp: '' };
  // Explicit stack instead of recursion (P10 rule 1). Reversed so chunk 0 is popped first.
  const work: Chunk[] = planChunks(total, chunkSamples).reverse();
  let done = 0;
  for (let iter = 0; iter < MAX_WORK_ITERATIONS && work.length > 0; iter++) {
    const chunk = work.pop();
    if (chunk === undefined) {
      break;
    }
    log(`samples ${String(chunk.start)}..${String(chunk.start + chunk.count - 1)} (${String(chunk.count)} rows)`);
    try {
      await fetchChunk(chunk, out, prov);
      done += chunk.count;
    } catch (err) {
      const recoverable = err instanceof HorizonsError || err instanceof HorizonsParseError;
      if (!recoverable || chunk.count / 2 < MIN_CHUNK_SAMPLES) {
        throw err;
      }
      log(`  failed (${err.message.slice(0, 160)}). Splitting the chunk in two.`);
      const [first, second] = splitChunk(chunk);
      work.push(second, first);
    }
  }
  if (work.length > 0 || done !== total) {
    throw new Error(`incomplete: ${String(done)} of ${String(total)} samples fetched`);
  }
  return prov;
}

function buildNote(prov: Provenance, total: number): string {
  const span = formatIsoUtc(EPHEMERIS_T0_UNIX_S + (total - 1) * EPHEMERIS_STEP_S);
  return [
    `JPL Horizons API ${prov.apiVersion}, ephemeris ${prov.source}`,
    'COMMAND=301 CENTER=500@399 QUANTITIES=14,15,19,20 STEP_SIZE=10min RANGE_UNITS=KM',
    'frame: Moon mean-Earth body-fixed, east longitude, UTC (last known leap second held for future dates)',
    `first ${formatIsoUtc(EPHEMERIS_T0_UNIX_S)} last ${span}`,
    `Horizons response ${prov.responseStamp}`,
    'built by packages/pipeline fetch-ephemeris',
  ].join('; ');
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      days: { type: 'string' },
      'chunk-days': { type: 'string' },
      out: { type: 'string' },
    },
  });
  const total = values.days === undefined ? EPHEMERIS_COUNT : Number(values.days) * EPHEMERIS_SAMPLES_PER_DAY;
  const chunkDays = Number(values['chunk-days'] ?? DEFAULT_CHUNK_DAYS);
  if (!Number.isInteger(total) || total <= 0 || !Number.isInteger(chunkDays) || chunkDays <= 0) {
    throw new Error('--days and --chunk-days must be positive integers');
  }
  const outArg = values.out ?? join('data', 'ephemeris.bin');
  const outPath = isAbsolute(outArg) ? outArg : resolve(REPO_ROOT, outArg);

  log(`${String(total)} samples, chunks of ${String(chunkDays)} days, output ${outPath}`);
  const vectors = new Float32Array(total * EPHEMERIS_FLOATS_PER_SAMPLE);
  const prov = await runWork(total, chunkDays * EPHEMERIS_SAMPLES_PER_DAY, vectors);

  const bytes = encodeEphemeris({
    meta: { t0UnixS: EPHEMERIS_T0_UNIX_S, stepS: EPHEMERIS_STEP_S, count: total, note: buildNote(prov, total) },
    vectors,
  });
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, bytes);

  // Read it back through the same decoder the app will use.
  const back = decodeEphemeris(new Uint8Array(await readFile(outPath)));
  log(`wrote ${outPath.replace(DATA_DIR, 'data')} : ${String(bytes.length)} bytes, ${String(back.meta.count)} samples`);
  log(`note: ${back.meta.note}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
