// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// Fixture requirement IDs are built at run time so the trace scanner, which
// reads this file as text, does not mistake them for real tags.
import { describe, expect, it } from 'vitest';
import { buildReport, countTags, isClean, parseRequirements } from '../src/trace/trace';

const fx = (n: string): string => `LSN-AAA-${n}`;
const tag = (n: string): string => `[${fx(n)}]`;

const MD = [
  '| ID | Requirement | Method | Status |',
  '|---|---|---|---|',
  `| ${fx('001')} | does a | T | implemented |`,
  `| ${fx('002')} | does b | A | implemented |`,
  `| ${fx('003')} | does c | T | planned |`,
  `| ${fx('004')} | does d | T+A | implemented |`,
].join('\n');

describe('traceability check [LSN-VAL-002]', () => {
  it('parses requirement rows and ignores the header', () => {
    const reqs = parseRequirements(MD);
    expect(reqs.map((r) => r.id)).toEqual([fx('001'), fx('002'), fx('003'), fx('004')]);
    expect(reqs[3]?.method).toBe('T+A');
    expect(reqs[2]?.status).toBe('planned');
  });

  it('counts tags in test sources', () => {
    const counts = countTags([`describe('x ${tag('001')}')`, `it('y ${tag('001')} and ${tag('004')}')`]);
    expect(counts.get(fx('001'))).toBe(2);
    expect(counts.get(fx('004'))).toBe(1);
  });

  it('flags an implemented T requirement with no test, and an orphan tag', () => {
    const report = buildReport(MD, [`it('${tag('001')} ${tag('999')}')`]);
    expect(report.untested).toEqual([fx('004')]);
    expect(report.orphanTags).toEqual([fx('999')]);
    expect(isClean(report)).toBe(false);
  });

  it('is clean when every implemented T requirement is tagged, planned ones may lack tests', () => {
    const report = buildReport(MD, [`it('${tag('001')}')`, `it('${tag('004')}')`]);
    expect(isClean(report)).toBe(true);
  });

  it('flags duplicate IDs and an empty requirements file', () => {
    const dup = buildReport(`${MD}\n| ${fx('001')} | again | T | implemented |`, [`${tag('001')} ${tag('004')}`]);
    expect(dup.duplicates).toEqual([fx('001')]);
    expect(isClean(buildReport('nothing here', []))).toBe(false);
  });
});
