// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// Fixture tags are built at run time so the trace scanner does not read them as real tags.
import { describe, expect, it } from 'vitest';
import { allAssertions, allPassed, resultsByTag, tableLines, vitestStartFailure } from '../src/validation/unit';
import { PLANNED_TESTS, isRecordFile, renderIndex, renderReport } from '../src/validation/records';
import type { ValidationRecord } from '../src/validation/records';

const tag = (n: string): string => `[LSN-ZZZ-${n}]`;

const json = {
  testResults: [
    { assertionResults: [
      { fullName: `a ${tag('001')} one`, status: 'passed' },
      { fullName: `a ${tag('001')} two`, status: 'passed' },
      { fullName: `b ${tag('002')} one`, status: 'failed' },
    ] },
    { assertionResults: [{ fullName: `c ${tag('002')} two`, status: 'passed' }] },
  ],
};

describe('validation record from test results [LSN-VAL-003]', () => {
  const results = resultsByTag(allAssertions(json), ['LSN-ZZZ-001', 'LSN-ZZZ-002']);

  it('counts tests and passes per requirement tag across files', () => {
    expect(results).toEqual([
      { tag: 'LSN-ZZZ-001', total: 2, passed: 2 },
      { tag: 'LSN-ZZZ-002', total: 2, passed: 1 },
    ]);
  });

  it('passes only if every tag has tests and all passed', () => {
    expect(allPassed(results)).toBe(false);
    expect(allPassed(results.slice(0, 1))).toBe(true);
    expect(allPassed(resultsByTag(allAssertions(json), ['LSN-ZZZ-999']))).toBe(false);
    expect(allPassed([])).toBe(false);
  });

  it('renders a markdown table', () => {
    expect(tableLines(results)[2]).toBe('| LSN-ZZZ-001 | 2 | 2 |');
  });
});

describe('vitest start failures [LSN-VAL-003]', () => {
  it('is silent when vitest ran, even if tests failed, and explains every way it can fail to produce a result', () => {
    expect(vitestStartFailure({ error: undefined, status: 1, stderr: '', resultFileExists: true })).toBeNull();
    expect(vitestStartFailure({ error: 'spawn ENOENT', status: null, stderr: null, resultFileExists: false })).toMatch(/could not start vitest: spawn ENOENT/);
    const msg = vitestStartFailure({ error: undefined, status: 1, stderr: 'a\nb\nc\nd\ne\nf\nCannot find module x', resultFileExists: false });
    expect(msg).toMatch(/no result file \(exit status 1\)/);
    expect(msg).toContain('Cannot find module x');
    expect(msg).not.toContain('\na\n');
  });
});

describe('validation report files [LSN-VAL-001]', () => {
  const rec: ValidationRecord = { id: 'V1', title: 't', criterion: 'c', status: 'pass', generatedAtUtc: '2026-11-14T00:00:00Z', summary: 'ok', details: ['x'] };

  it('only <ID>.json files are records: the generated index must never be read as one', () => {
    expect(isRecordFile('V0.json')).toBe(true);
    expect(isRecordFile('V12.json')).toBe(true);
    expect(isRecordFile('index.json')).toBe(false);
    expect(isRecordFile('V1.json.tmp')).toBe(false);
    expect(isRecordFile('notes.json')).toBe(false);
  });

  it('a test with no record is "not run" in both the report and the index, and is never given a summary', () => {
    const index = JSON.parse(renderIndex([rec])) as { id: string; status: string; summary: string }[];
    expect(index).toHaveLength(PLANNED_TESTS.length);
    expect(index.find((e) => e.id === 'V1')?.status).toBe('pass');
    const v3 = index.find((e) => e.id === 'V3');
    expect(v3?.status).toBe('not run');
    expect(v3?.summary).toBe('');
    expect(renderReport([rec])).toContain('| V3 | Sunlight at 3 places');
    expect(renderReport([rec])).toMatch(/\| V3 .* \| not run \|/);
  });
});
