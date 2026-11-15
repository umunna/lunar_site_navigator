// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
//   npm run validate:unit
//
// Runs the test suite once with the JSON reporter and records V2 (horizon) and
// V4 (countdowns and totals) in data/validation, then regenerates docs/VALIDATION.md.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from '../paths';
import { plannedCheck, saveRecord, writeReport } from '../validation/records';
import type { ValidationRecord } from '../validation/records';
import { allAssertions, allPassed, resultsByTag, tableLines, vitestStartFailure } from '../validation/unit';
import type { VitestJson } from '../validation/unit';

const GROUPS: readonly { id: string; tags: readonly string[]; note: string }[] = [
  {
    id: 'V2',
    tags: ['LSN-SKY-001', 'LSN-SKY-002', 'LSN-SKY-003', 'LSN-SKY-004'],
    note: 'The expected values come from exact formulas or from a second, independent 3D calculation in geometry.ts. We broke the compass convention on purpose one time, and the tests failed as they must.',
  },
  {
    id: 'V4',
    tags: ['LSN-EVT-001', 'LSN-EVT-002', 'LSN-EVT-003', 'LSN-EVT-004', 'LSN-PLN-004'],
    note: 'LSN-EVT-004 also checks the real Sun and Earth data against physics: the near side of the Moon always sees Earth, and the far side never sees it. LSN-PLN-004 covers the best-value marks of the Compare places page.',
  },
];

function runVitest(): VitestJson {
  const dir = mkdtempSync(join(tmpdir(), 'lsn-vitest-'));
  const out = join(dir, 'result.json');
  const vitest = join(REPO_ROOT, 'node_modules', 'vitest', 'vitest.mjs');
  const run = spawnSync(process.execPath, [vitest, 'run', '--reporter=json', `--outputFile=${out}`], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'ignore', 'pipe'],
    encoding: 'utf8',
  });
  // A failing test is not an error here: it shows up in the JSON and in the record.
  // No result file at all means vitest never ran, which must not look like "no tests failed".
  const message = vitestStartFailure({ error: run.error?.message, status: run.status, stderr: run.stderr, resultFileExists: existsSync(out) });
  if (message !== null) {
    throw new Error(message);
  }
  return JSON.parse(readFileSync(out, 'utf8')) as VitestJson;
}

async function main(): Promise<void> {
  const assertions = allAssertions(runVitest());
  let failed = false;
  for (const g of GROUPS) {
    const results = resultsByTag(assertions, g.tags);
    const ok = allPassed(results);
    failed = failed || !ok;
    const total = results.reduce((n, r) => n + r.total, 0);
    const passed = results.reduce((n, r) => n + r.passed, 0);
    const record: ValidationRecord = {
      ...plannedCheck(g.id),
      status: ok ? 'pass' : 'fail',
      generatedAtUtc: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
      summary: `${String(passed)} of ${String(total)} automated tests passed. They cover ${String(g.tags.length)} requirements.`,
      details: [g.note, '', ...tableLines(results)],
    };
    await saveRecord(record);
    console.log(`[validate-unit] ${g.id} ${record.status.toUpperCase()}: ${record.summary}`);
  }
  console.log(`[validate-unit] wrote ${await writeReport()}`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
