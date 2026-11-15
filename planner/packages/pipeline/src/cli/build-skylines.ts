// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// P3 build-skylines (docs/history/plan-2026-11-14.md 5.5). One skyline per site from the
// LOLA DEM, exact on a sphere (5.6). The app ships only data/skylines.bin, never the DEM.
//
//   npm run build-skylines -- --catalog        every catalog site inside the DEM -> data/skylines.bin
//   npm run build-skylines -- --gazetteer Shackleton --gazetteer "Mons Malapert" --site my-site,-86.2,40
//   options: --observer 2 (m)  --out data/skylines.bin  --res 80
//
// Sites come from the IAU Gazetteer (--gazetteer, centre of the named feature)
// or are given directly (--site id,lat,lon). Repeat the flag for each site.
// When the catalog (P2) exists it replaces both.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { CATALOG, DEFAULT_OBSERVER_HEIGHT_M, SKYLINE_BINS, computeSkyline, encodeSkylines, hasTerrain } from '@lsn/shared';
import type { SkylineRecord } from '@lsn/shared';
import { Dem } from '../dem/dem';
import { findUnique, loadMoonGazetteer } from '../gazetteer/gazetteer';
import { CACHE_DIR, REPO_ROOT } from '../paths';
import { sha256File } from '../util/hash';

const DEM_FILES: Readonly<Record<string, string>> = {
  '80': 'LDEM_80S_80MPP_ADJ.TIF',
  '40': 'LDEM_80S_40MPP_ADJ.TIF',
  '20': 'LDEM_80S_20MPP_ADJ.TIF',
};
/** Hard cap on ray length. Rays normally stop much earlier (about 156 km for a 7 km high terrain bound). */
const MAX_RANGE_M = 300_000;

interface SiteSpec {
  readonly id: string;
  readonly latDeg: number;
  readonly lonDeg: number;
}

function log(message: string): void {
  console.log(`[build-skylines] ${message}`);
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function parseSite(arg: string): SiteSpec {
  const [id, lat, lon] = arg.split(',');
  const latDeg = Number(lat);
  const lonDeg = Number(lon);
  if (id === undefined || id === '' || !Number.isFinite(latDeg) || !Number.isFinite(lonDeg)) {
    throw new Error(`--site must be id,lat,lon (got "${arg}")`);
  }
  return { id, latDeg, lonDeg };
}

async function collectSites(gazNames: readonly string[], siteArgs: readonly string[], useCatalog: boolean): Promise<SiteSpec[]> {
  const sites = siteArgs.map(parseSite);
  if (useCatalog) {
    // Every catalog site inside the DEM. Sites north of 80 S get a flat horizon in the app instead.
    sites.push(...CATALOG.filter(hasTerrain).map((s) => ({ id: s.id, latDeg: s.latDeg, lonDeg: s.lonDeg })));
  }
  if (gazNames.length > 0) {
    const gaz = await loadMoonGazetteer(CACHE_DIR);
    for (const name of gazNames) {
      const f = findUnique(gaz, name);
      sites.push({ id: slug(name), latDeg: f.centerLatDeg, lonDeg: f.centerLonDeg });
    }
  }
  if (sites.length === 0) {
    throw new Error('no sites: give --gazetteer <name> and/or --site id,lat,lon');
  }
  return sites;
}

function describe(rec: SkylineRecord): string {
  let min = Infinity;
  let max = -Infinity;
  let at = 0;
  rec.elevationDeg.forEach((v, j) => {
    min = Math.min(min, v);
    if (v > max) {
      max = v;
      at = (j * 360) / rec.elevationDeg.length;
    }
  });
  return `${rec.id}: site ${rec.siteHeightM.toFixed(0)} m, skyline ${min.toFixed(2)} to ${max.toFixed(2)} deg (max toward az ${at.toFixed(1)}), truncated bins ${String(rec.truncatedBins)}`;
}

function buildRecords(dem: Dem, sites: readonly SiteSpec[], observerHeightM: number): SkylineRecord[] {
  const sampler = dem.sampler();
  const maxTerrainHeightM = dem.maxLoadedHeightM();
  const records: SkylineRecord[] = [];
  for (const site of sites) {
    const t0 = performance.now();
    const sky = computeSkyline(sampler, {
      siteLatDeg: site.latDeg,
      siteLonDeg: site.lonDeg,
      observerHeightM,
      stepM: dem.info.pixelM,
      maxRangeM: MAX_RANGE_M,
      maxTerrainHeightM,
    });
    const rec: SkylineRecord = {
      id: site.id,
      latDeg: site.latDeg,
      lonDeg: site.lonDeg,
      siteHeightM: sky.siteHeightM,
      truncatedBins: sky.truncatedBins,
      elevationDeg: sky.elevationDeg,
    };
    records.push(rec);
    log(`${describe(rec)} (${(performance.now() - t0).toFixed(0)} ms)`);
  }
  return records;
}

async function provenanceNote(demPath: string, demName: string, res: string, dem: Dem, observerHeightM: number): Promise<string> {
  const sha = await sha256File(demPath);
  return [
    `LRO LOLA south-pole DEM ${demName} (${res} m), sha256 ${sha.slice(0, 16)}...`,
    'Barker et al. 2023, Planetary Science Journal 4, 183, doi 10.3847/PSJ/acf3e1',
    `observer ${String(observerHeightM)} m above the DEM surface, step ${String(dem.info.pixelM)} m, ${String(SKYLINE_BINS)} bins`,
    'planetocentric sphere R = 1737.4 km, south polar stereographic, usable inside the 80 S circle',
    'built by packages/pipeline build-skylines',
  ].join('; ');
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      catalog: { type: 'boolean' },
      gazetteer: { type: 'string', multiple: true },
      site: { type: 'string', multiple: true },
      observer: { type: 'string' },
      out: { type: 'string' },
      res: { type: 'string' },
    },
  });
  const res = values.res ?? '80';
  const demName = DEM_FILES[res];
  if (demName === undefined) {
    throw new Error('--res must be 80, 40 or 20');
  }
  const observerHeightM = Number(values.observer ?? DEFAULT_OBSERVER_HEIGHT_M);
  const outArg = values.out ?? join('data', 'skylines.bin');
  const outPath = isAbsolute(outArg) ? outArg : resolve(REPO_ROOT, outArg);
  const sites = await collectSites(values.gazetteer ?? [], values.site ?? [], values.catalog === true);

  const demPath = join(CACHE_DIR, 'dem', `${res}m`, demName);
  const dem = await Dem.open(demPath);
  const r = dem.usableRadiusM;
  log(`decoding the polar cap (${res} m)`);
  await dem.loadWindow({ xMinM: -r, xMaxM: r, yMinM: -r, yMaxM: r });
  const records = buildRecords(dem, sites, observerHeightM);

  const note = await provenanceNote(demPath, demName, res, dem, observerHeightM);
  const bytes = encodeSkylines({ bins: SKYLINE_BINS, observerHeightM, stepM: dem.info.pixelM, note, records });
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, bytes);
  log(`wrote ${outPath}: ${String(bytes.length)} bytes, ${String(records.length)} sites`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
