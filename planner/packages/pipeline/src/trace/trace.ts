// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// Bidirectional traceability between docs/REQUIREMENTS.md and the tests.
export interface Requirement {
  readonly id: string;
  readonly text: string;
  readonly method: string;
  readonly status: 'implemented' | 'planned';
}

export interface TraceReport {
  readonly requirements: readonly Requirement[];
  /** Requirement ID -> number of tagged tests. */
  readonly testCounts: ReadonlyMap<string, number>;
  /** Implemented, method includes T, but no tagged test. */
  readonly untested: readonly string[];
  /** Tags used in tests that name no requirement. */
  readonly orphanTags: readonly string[];
  /** Duplicate requirement IDs. */
  readonly duplicates: readonly string[];
}

const ROW = /^\|\s*(LSN-[A-Z]+-\d{3})\s*\|(.+)\|\s*([TAID](?:\+[TAID])*)\s*\|\s*(implemented|planned)\s*\|\s*$/;
const TAG = /\[(LSN-[A-Z]+-\d{3})\]/g;

export function parseRequirements(markdown: string): Requirement[] {
  const out: Requirement[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const m = ROW.exec(line);
    if (m !== null) {
      out.push({
        id: m[1] ?? '',
        text: (m[2] ?? '').trim(),
        method: m[3] ?? '',
        status: m[4] === 'planned' ? 'planned' : 'implemented',
      });
    }
  }
  return out;
}

export function countTags(testSources: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const src of testSources) {
    for (const m of src.matchAll(TAG)) {
      const id = m[1] ?? '';
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

export function buildReport(requirementsMd: string, testSources: readonly string[]): TraceReport {
  const requirements = parseRequirements(requirementsMd);
  const counts = countTags(testSources);
  const known = new Set<string>();
  const duplicates: string[] = [];
  for (const r of requirements) {
    if (known.has(r.id)) {
      duplicates.push(r.id);
    }
    known.add(r.id);
  }
  const untested = requirements
    .filter((r) => r.status === 'implemented' && r.method.includes('T') && (counts.get(r.id) ?? 0) === 0)
    .map((r) => r.id);
  const orphanTags = [...counts.keys()].filter((id) => !known.has(id));
  return { requirements, testCounts: counts, untested, orphanTags, duplicates };
}

export function isClean(report: TraceReport): boolean {
  return report.requirements.length > 0 && report.untested.length === 0 && report.orphanTags.length === 0 && report.duplicates.length === 0;
}
