// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
//   npm run validate:v3
//
// V3: compares our "Sun in view" share at three catalog places with NASA's published
// light map. It reads only the few pixels it needs from the NASA file (HTTP range
// requests on the raw IMG file), keeps them in data-cache, writes data/validation/V3.json
// and regenerates docs/VALIDATION.md.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CATALOG, computeSiteTrack, decodeEphemeris, decodeSkylines, windowMetrics } from '@lsn/shared';
import { CACHE_DIR, DATA_DIR } from '../paths';
import { plannedCheck, saveRecord, writeReport } from '../validation/records';
import type { ValidationRecord } from '../validation/records';
import { V3_HALF_WINDOW_PX, V3_SITE_IDS, V3_TOLERANCE_POINTS, gapPoints, lightMapPixel, nasaPercents, v3Passes, v3TableLines } from '../validation/v3';
import type { LightMapGrid, V3Row } from '../validation/v3';

/**
 * The raw file of the map, as listed on the NASA PGDA page of product 69.
 * Its label (same name, .LBL) says: 5058 lines of 5058 samples, 16-bit integers, least significant
 * byte first, no header, 60 m per pixel, pole at line and sample 2528.5, polar stereographic,
 * centre longitude 0, radius 1737.4 km.
 */
const MAP_URL = 'http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/AVGVISIB_85S_060M_201608.IMG';
const MAP_GRID: LightMapGrid = { widthPx: 5058, heightPx: 5058, originXM: -151_740, originYM: 151_740, pixelM: 60 };
const BYTES_PER_PIXEL = 2;
const CACHE_FILE = join(CACHE_DIR, 'nasa-light-map', 'AVGVISIB_85S_060M_201608-blocks.json');

interface Block {
  readonly id: string;
  readonly col: number;
  readonly row: number;
  /** Raw numbers of the block, row by row. */
  readonly dn: number[];
}

interface BlockCache {
  readonly url: string;
  readonly readAtUtc: string;
  readonly grid: LightMapGrid;
  readonly blocks: Block[];
}

function log(message: string): void {
  console.log(`[validate-v3] ${message}`);
}

function sitesToCheck(): { id: string; name: string; latDeg: number; lonDeg: number }[] {
  return V3_SITE_IDS.map((id) => {
    const s = CATALOG.find((c) => c.id === id);
    if (s === undefined) {
      throw new Error(`catalog site ${id} not found`);
    }
    return { id: s.id, name: s.name, latDeg: s.latDeg, lonDeg: s.lonDeg };
  });
}

/** `count` pixels of one line, starting at `col`. */
async function readPixels(row: number, col: number, count: number): Promise<number[]> {
  const first = (row * MAP_GRID.widthPx + col) * BYTES_PER_PIXEL;
  const last = first + count * BYTES_PER_PIXEL - 1;
  const response = await fetch(MAP_URL, { headers: { Range: `bytes=${String(first)}-${String(last)}` } });
  if (response.status !== 206) {
    throw new Error(`${MAP_URL}: expected a partial answer (206), got ${String(response.status)}`);
  }
  const bytes = new DataView(await response.arrayBuffer());
  if (bytes.byteLength !== count * BYTES_PER_PIXEL) {
    throw new Error(`${MAP_URL}: expected ${String(count * BYTES_PER_PIXEL)} bytes, got ${String(bytes.byteLength)}`);
  }
  return Array.from({ length: count }, (_, i) => bytes.getInt16(i * BYTES_PER_PIXEL, true));
}

async function readBlocksFromNasa(): Promise<BlockCache> {
  log(`reading ${MAP_URL} (only the pixels around ${String(V3_SITE_IDS.length)} places)`);
  const blocks: Block[] = [];
  const h = V3_HALF_WINDOW_PX;
  for (const s of sitesToCheck()) {
    const { col, row } = lightMapPixel(MAP_GRID, s.latDeg, s.lonDeg);
    const dn: number[] = [];
    for (let r = row - h; r <= row + h; r++) {
      dn.push(...(await readPixels(r, col - h, 2 * h + 1)));
    }
    blocks.push({ id: s.id, col, row, dn });
  }
  return { url: MAP_URL, readAtUtc: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), grid: MAP_GRID, blocks };
}

async function loadBlocks(): Promise<BlockCache> {
  try {
    const cached = JSON.parse(await readFile(CACHE_FILE, 'utf8')) as BlockCache;
    if (cached.url === MAP_URL && V3_SITE_IDS.every((id) => cached.blocks.some((b) => b.id === id))) {
      log(`using the cached pixels read at ${cached.readAtUtc}`);
      return cached;
    }
  } catch {
    // No usable cache: read from NASA.
  }
  const fresh = await readBlocksFromNasa();
  await mkdir(join(CACHE_DIR, 'nasa-light-map'), { recursive: true });
  await writeFile(CACHE_FILE, `${JSON.stringify(fresh, null, 2)}\n`, 'utf8');
  return fresh;
}

async function main(): Promise<void> {
  const eph = decodeEphemeris(new Uint8Array(await readFile(join(DATA_DIR, 'ephemeris.bin'))));
  const skylines = decodeSkylines(new Uint8Array(await readFile(join(DATA_DIR, 'skylines.bin'))));
  const cache = await loadBlocks();
  const side = 2 * V3_HALF_WINDOW_PX + 1;
  const rows: V3Row[] = sitesToCheck().map((s) => {
    const sky = skylines.records.find((r) => r.id === s.id);
    const block = cache.blocks.find((b) => b.id === s.id);
    if (sky === undefined || block === undefined) {
      throw new Error(`no skyline or no NASA pixels for ${s.id}`);
    }
    const track = computeSiteTrack(eph, s.latDeg, s.lonDeg, sky.elevationDeg);
    const ours = windowMetrics(track, 0, track.count, eph.meta.stepS).litPercent;
    const nasa = nasaPercents(block.dn, Math.floor((side * side) / 2));
    return { name: s.name, latDeg: s.latDeg, lonDeg: s.lonDeg, ourPercent: ours, nasaPercent: nasa.nearest, nasaMinPercent: nasa.min, nasaMaxPercent: nasa.max };
  });
  const worst = Math.max(...rows.map(gapPoints));
  const pass = v3Passes(rows);
  const record: ValidationRecord = {
    ...plannedCheck('V3'),
    status: pass ? 'pass' : 'fail',
    generatedAtUtc: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    summary:
      `At ${String(rows.length)} places, our share of time with the Sun in view is at most ${worst.toFixed(1)} percentage points away from the NASA values around the place` +
      ` (allowed: ${String(V3_TOLERANCE_POINTS)}). ` +
      rows.map((r) => `${r.name}: ours ${r.ourPercent.toFixed(0)}%, NASA ${r.nasaMinPercent.toFixed(0)} to ${r.nasaMaxPercent.toFixed(0)}%`).join('; ') + '.',
    details: [
      `NASA map: AVGVISIB_85S_060M_201608 (${cache.url}), read ${cache.readAtUtc}. NASA LOLA team, PGDA product 69. Cite Mazarico et al. (2011), Icarus 211, 1066-1081, doi:10.1016/j.icarus.2010.10.030.`,
      'The label of the map says that each value is the share of hourly time steps in which the pixel was sunlit by any fraction of the solar disc. That is the same rule as ours.',
      `Ours: the share of the ${String(eph.meta.count)} samples of data/ephemeris.bin (3 years, 10-minute steps) with any part of the Sun above the skyline of the place, from data/skylines.bin (80 m height map, observer 2 m above the ground).`,
      `NASA: the nearest 60 m pixel and the ${String(side)} x ${String(side)} pixels around it (${String(side * cache.grid.pixelM)} m). Near a rim the value changes much from one pixel to the next, so the table gives the lowest and the highest value.`,
      `Gap: 0 when our share is between the lowest and the highest NASA value nearby, otherwise the distance to that range. The check passes when every gap is ${String(V3_TOLERANCE_POINTS)} points or less. We set this tolerance before the first run.`,
      'An exact match is not expected: NASA averaged about 18.6 years and we use 3 years, the two height maps have different detail, and the label does not give the observer height.',
      '',
      ...v3TableLines(rows),
    ],
  };
  await saveRecord(record);
  log(`V3 ${record.status.toUpperCase()}: ${record.summary}`);
  log(`wrote ${await writeReport()}`);
  process.exitCode = pass ? 0 : 1;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
