// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
//   npm run trace
//
// Fails (exit 1) if docs/REQUIREMENTS.md and the tests disagree.
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { buildReport, isClean } from '../trace/trace';
import { DOCS_DIR, REPO_ROOT } from '../paths';

async function findTestFiles(): Promise<string[]> {
  const files: string[] = [];
  const packagesDir = join(REPO_ROOT, 'packages');
  for (const pkg of await readdir(packagesDir)) {
    const testDir = join(packagesDir, pkg, 'test');
    let names: string[] = [];
    try {
      names = await readdir(testDir);
    } catch {
      continue;
    }
    files.push(...names.filter((n) => /\.test\.tsx?$/.test(n)).map((n) => join(testDir, n)));
  }
  return files;
}

async function main(): Promise<void> {
  const requirementsMd = await readFile(join(DOCS_DIR, 'REQUIREMENTS.md'), 'utf8');
  const sources = await Promise.all((await findTestFiles()).map((f) => readFile(f, 'utf8')));
  const report = buildReport(requirementsMd, sources);

  for (const r of report.requirements) {
    const n = report.testCounts.get(r.id) ?? 0;
    console.log(`${r.id}  ${r.status.padEnd(11)} ${r.method.padEnd(4)} tests: ${String(n)}`);
  }
  if (report.untested.length > 0) {
    console.error(`UNTESTED (implemented, method T, no tagged test): ${report.untested.join(', ')}`);
  }
  if (report.orphanTags.length > 0) {
    console.error(`ORPHAN TAGS (in tests, not in REQUIREMENTS.md): ${report.orphanTags.join(', ')}`);
  }
  if (report.duplicates.length > 0) {
    console.error(`DUPLICATE REQUIREMENT IDS: ${report.duplicates.join(', ')}`);
  }
  console.log(isClean(report) ? 'trace: OK' : 'trace: FAILED');
  process.exitCode = isClean(report) ? 0 : 1;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
