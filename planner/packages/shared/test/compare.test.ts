// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { describe, expect, it } from 'vitest';
import { bestIndices, windowStart } from '../src';

describe('helpers of the Compare places page [LSN-PLN-004]', () => {
  it('picks the highest or lowest, keeps ties, handles empty input', () => {
    expect(bestIndices([40, 88, 61], 'higher')).toEqual([1]);
    expect(bestIndices([40, 88, 61], 'lower')).toEqual([0]);
    expect(bestIndices([100, 100, 61], 'higher')).toEqual([0, 1]);
    expect(bestIndices([], 'higher')).toEqual([]);
  });

  it('the start of a stay is kept inside the data', () => {
    expect(windowStart(-5, 100, 1000)).toBe(0);
    expect(windowStart(950.7, 100, 1000)).toBe(900);
    expect(windowStart(12.9, 100, 1000)).toBe(12);
    expect(() => windowStart(0, 2000, 1000)).toThrow(/longer than the data/);
  });
});
