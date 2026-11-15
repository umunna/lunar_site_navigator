// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
//   npm run build-catalog
//
// P2 (docs/history/plan-2026-11-14.md 5.5): writes packages/shared/src/catalog.generated.ts
// from the IAU Gazetteer, NASA NSSDC Apollo coordinates, the 80 m LOLA DEM and the
// terrain metadata of the rover simulation (../rover-slam).
// Needs data-cache/dem/80m (npm run fetch-dem). Gazetteer (24 MB) and NSSDC page (5 KB) are fetched once.
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DEM_80S_RADIUS_M } from '@lsn/shared';
import { buildCatalog, renderCatalogTs } from '../catalog/build';
import { loadNssdcApollo } from '../catalog/nssdc';
import { ROVER_META_PATH, loadRoverPatch } from '../catalog/rover';
import { Dem } from '../dem/dem';
import { loadMoonGazetteer } from '../gazetteer/gazetteer';
import { CACHE_DIR, REPO_ROOT } from '../paths';

async function main(): Promise<void> {
  const gazetteer = await loadMoonGazetteer(CACHE_DIR);
  const apollo = await loadNssdcApollo(CACHE_DIR);
  const dem = await Dem.open(join(CACHE_DIR, 'dem', '80m', 'LDEM_80S_80MPP_ADJ.TIF'));
  const r = Math.min(DEM_80S_RADIUS_M, dem.usableRadiusM);
  await dem.loadWindow({ xMinM: -r, xMaxM: r, yMinM: -r, yMaxM: r });
  const roverMeta = resolve(REPO_ROOT, '..', ROVER_META_PATH);
  const roverPatch = existsSync(roverMeta) ? await loadRoverPatch(roverMeta) : null;
  if (roverPatch === null) {
    console.log(`[build-catalog] ${roverMeta} not found: the catalog gets no rover simulation area`);
  }
  const sites = buildCatalog({ gazetteer, apollo, roverPatch, height: (x, y) => (Math.hypot(x, y) > r ? Number.NaN : dem.heightXyM(x, y)) });
  const out = join(REPO_ROOT, 'packages', 'shared', 'src', 'catalog.generated.ts');
  await writeFile(out, renderCatalogTs(sites), 'utf8');
  for (const s of sites) {
    console.log(`[build-catalog] ${s.id.padEnd(28)} ${s.precision.padEnd(20)} ${s.latDeg.toFixed(4).padStart(9)} ${s.lonDeg.toFixed(4).padStart(10)}`);
  }
  console.log(`[build-catalog] wrote ${String(sites.length)} sites to ${out}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
