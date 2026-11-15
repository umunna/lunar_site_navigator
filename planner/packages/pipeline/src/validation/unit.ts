// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// V2 and V5 are automated tests (docs/history/plan-2026-11-14.md 5.7). This turns a
// vitest JSON result into a validation record, grouped by requirement tag, so
// the report says "PASS" only if those tests really ran and passed.
export interface AssertionResult {
  readonly fullName: string;
  readonly status: string;
}

export interface VitestJson {
  readonly testResults: readonly { readonly assertionResults: readonly AssertionResult[] }[];
}

export interface TagResult {
  readonly tag: string;
  readonly total: number;
  readonly passed: number;
}

export interface VitestRun {
  /** Spawn error message, if the process could not be started. */
  readonly error: string | undefined;
  readonly status: number | null;
  readonly stderr: string | null;
  readonly resultFileExists: boolean;
}

/**
 * Null when vitest ran and wrote its result (even if some tests failed).
 * Otherwise a message that says why there is no result, so the record is never built from nothing.
 */
export function vitestStartFailure(run: VitestRun): string | null {
  if (run.error !== undefined) {
    return `could not start vitest: ${run.error}`;
  }
  if (!run.resultFileExists) {
    const tail = (run.stderr ?? '').trim().split('\n').slice(-5).join('\n');
    return `vitest produced no result file (exit status ${String(run.status)}). ${tail}`.trim();
  }
  return null;
}

export function allAssertions(json: VitestJson): AssertionResult[] {
  return json.testResults.flatMap((f) => [...f.assertionResults]);
}

/** Pass counts for each requirement tag, counting tests whose full name contains `[TAG]`. */
export function resultsByTag(assertions: readonly AssertionResult[], tags: readonly string[]): TagResult[] {
  return tags.map((tag) => {
    const hits = assertions.filter((a) => a.fullName.includes(`[${tag}]`));
    return { tag, total: hits.length, passed: hits.filter((a) => a.status === 'passed').length };
  });
}

/** True only if every tag has at least one test and all of them passed. */
export function allPassed(results: readonly TagResult[]): boolean {
  return results.length > 0 && results.every((r) => r.total > 0 && r.passed === r.total);
}

export function tableLines(results: readonly TagResult[]): string[] {
  return ['| Requirement | Tests | Passed |', '|---|---|---|', ...results.map((r) => `| ${r.tag} | ${String(r.total)} | ${String(r.passed)} |`)];
}
