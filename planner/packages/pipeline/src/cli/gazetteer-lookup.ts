// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
//   npm run gazetteer -- Malapert Shackleton "^de Gerlache"
//
// Prints IAU Gazetteer rows for the Moon whose name matches any pattern
// (case-insensitive regular expression). First run downloads the table
// (about 24 MB) into data-cache/gazetteer/. Used to source catalog and V0
// coordinates: nothing is typed from memory (docs/history/plan-2026-11-14.md 5.5 P2).
import { loadMoonGazetteer } from '../gazetteer/gazetteer';
import { CACHE_DIR } from '../paths';

async function main(): Promise<void> {
  const patterns = process.argv.slice(2).map((p) => new RegExp(p, 'i'));
  if (patterns.length === 0) {
    throw new Error('usage: npm run gazetteer -- <name-regex> [<name-regex> ...]');
  }
  const features = await loadMoonGazetteer(CACHE_DIR);
  console.log(`[gazetteer] ${String(features.length)} Moon features with coordinates`);
  for (const f of features) {
    if (patterns.some((p) => p.test(f.name))) {
      console.log(
        [
          `id ${String(f.id)}`,
          `"${f.name}"`,
          f.featureType,
          `centre ${String(f.centerLatDeg)}, ${String(f.centerLonDeg)}`,
          `diam ${String(f.diameterKm)} km`,
          f.coordSystem,
          f.approval,
        ].join(' | '),
      );
    }
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
