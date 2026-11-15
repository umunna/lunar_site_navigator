// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { describe, expect, it } from 'vitest';
import { decodeSkylines, encodeSkylines } from '../src';
import type { SkylineFile } from '../src';

function sample(): SkylineFile {
  const ramp = (offset: number): Float32Array => new Float32Array(720).map((_, j) => offset + j * 0.001);
  return {
    bins: 720,
    observerHeightM: 2,
    stepM: 80,
    note: 'unit test, ünïcode ok',
    records: [
      { id: 'shackleton-rim', latDeg: -89.67, lonDeg: 129.78, siteHeightM: 1234.5, truncatedBins: 0, elevationDeg: ramp(-0.087) },
      { id: 'edge-site', latDeg: -81.1, lonDeg: 300, siteHeightM: -50, truncatedBins: 37, elevationDeg: ramp(1) },
    ],
  };
}

describe('skylines.bin codec [LSN-SKY-006]', () => {
  it('round-trips every field exactly', () => {
    const back = decodeSkylines(encodeSkylines(sample()));
    const orig = sample();
    expect(back.bins).toBe(720);
    expect(back.observerHeightM).toBe(2);
    expect(back.stepM).toBe(80);
    expect(back.note).toBe(orig.note);
    expect(back.records).toHaveLength(2);
    back.records.forEach((rec, i) => {
      const want = orig.records[i];
      expect(rec.id).toBe(want?.id);
      expect(rec.latDeg).toBe(want?.latDeg);
      expect(rec.lonDeg).toBe(want?.lonDeg);
      expect(rec.siteHeightM).toBe(want?.siteHeightM);
      expect(rec.truncatedBins).toBe(want?.truncatedBins);
      expect(Array.from(rec.elevationDeg)).toEqual(Array.from(want?.elevationDeg ?? []));
    });
  });

  it('file size is header + note + records * (64 + 4 * bins)', () => {
    const bytes = encodeSkylines(sample());
    const noteLen = new TextEncoder().encode(sample().note).length;
    const dataOffset = Math.ceil((32 + noteLen) / 4) * 4;
    expect(bytes.length).toBe(dataOffset + 2 * (64 + 720 * 4));
  });

  it('rejects corruption, truncation, bad magic and bad version', () => {
    const good = encodeSkylines(sample());
    const flipped = good.slice();
    flipped[flipped.length - 1] = (flipped[flipped.length - 1] ?? 0) ^ 1;
    expect(() => decodeSkylines(flipped)).toThrow(/CRC/);
    expect(() => decodeSkylines(good.subarray(0, good.length - 1))).toThrow(/size/);
    const badMagic = good.slice();
    badMagic[1] = 0x00;
    expect(() => decodeSkylines(badMagic)).toThrow(/magic/);
    const badVersion = good.slice();
    new DataView(badVersion.buffer).setUint16(4, 9, true);
    expect(() => decodeSkylines(badVersion)).toThrow(/version/);
  });

  it('refuses duplicate ids, empty or over-long ids, and wrong skyline length', () => {
    const base = sample();
    const first = base.records[0];
    expect(first).toBeDefined();
    if (first === undefined) {
      return;
    }
    expect(() => encodeSkylines({ ...base, records: [first, first] })).toThrow(/duplicate/);
    expect(() => encodeSkylines({ ...base, records: [{ ...first, id: '' }] })).toThrow(/site id/);
    expect(() => encodeSkylines({ ...base, records: [{ ...first, id: 'x'.repeat(33) }] })).toThrow(/site id/);
    expect(() => encodeSkylines({ ...base, records: [{ ...first, elevationDeg: new Float32Array(10) }] })).toThrow(/skyline length/);
  });
});
