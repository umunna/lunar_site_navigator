// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { describe, expect, it } from 'vitest';
import {
  EPHEMERIS_COUNT,
  EPHEMERIS_FLOATS_PER_SAMPLE,
  EPHEMERIS_STEP_S,
  EPHEMERIS_T0_UNIX_S,
  EPHEMERIS_SPAN_DAYS,
  crc32,
  decodeEphemeris,
  encodeEphemeris,
  formatIsoUtc,
  sampleVectors,
} from '../src';
import type { Ephemeris } from '../src';

function makeEphemeris(count: number): Ephemeris {
  const vectors = new Float32Array(count * EPHEMERIS_FLOATS_PER_SAMPLE);
  for (let i = 0; i < vectors.length; i++) {
    vectors[i] = i * 1.25 - 7;
  }
  return { meta: { t0UnixS: EPHEMERIS_T0_UNIX_S, stepS: EPHEMERIS_STEP_S, count, note: 'unit test, ünïcode ok' }, vectors };
}

describe('constants [LSN-EPH-002]', () => {
  it('t0 is 2026-11-01T00:00:00Z', () => {
    expect(EPHEMERIS_T0_UNIX_S).toBe(1_793_491_200);
    expect(formatIsoUtc(EPHEMERIS_T0_UNIX_S)).toBe('2026-11-01T00:00:00Z');
  });

  it('three years: 1096 days, 157,824 samples, ending 2029-11-01 exclusive', () => {
    expect(EPHEMERIS_SPAN_DAYS).toBe(365 + 366 + 365);
    expect(EPHEMERIS_COUNT).toBe(157_824);
    const endExclusive = EPHEMERIS_T0_UNIX_S + EPHEMERIS_COUNT * EPHEMERIS_STEP_S;
    expect(formatIsoUtc(endExclusive)).toBe('2029-11-01T00:00:00Z');
  });
});

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('ephemeris.bin codec [LSN-EPH-001]', () => {
  it('round-trips meta and payload exactly', () => {
    const eph = makeEphemeris(50);
    const back = decodeEphemeris(encodeEphemeris(eph));
    expect(back.meta).toEqual(eph.meta);
    expect(Array.from(back.vectors)).toEqual(Array.from(eph.vectors));
  });

  it('decodes when the buffer offset is not 4-byte aligned', () => {
    const eph = makeEphemeris(10);
    const bytes = encodeEphemeris(eph);
    const shifted = new Uint8Array(bytes.length + 3);
    shifted.set(bytes, 3);
    const back = decodeEphemeris(shifted.subarray(3));
    expect(Array.from(back.vectors)).toEqual(Array.from(eph.vectors));
  });

  it('rejects a flipped payload byte (CRC)', () => {
    const bytes = encodeEphemeris(makeEphemeris(10));
    const last = bytes.length - 1;
    bytes[last] = (bytes[last] ?? 0) ^ 0x01;
    expect(() => decodeEphemeris(bytes)).toThrow(/CRC/);
  });

  it('rejects bad magic, bad version, truncation', () => {
    const good = encodeEphemeris(makeEphemeris(10));
    const badMagic = good.slice();
    badMagic[0] = 0x58;
    expect(() => decodeEphemeris(badMagic)).toThrow(/magic/);
    const badVersion = good.slice();
    new DataView(badVersion.buffer).setUint16(4, 99, true);
    expect(() => decodeEphemeris(badVersion)).toThrow(/version/);
    expect(() => decodeEphemeris(good.subarray(0, good.length - 4))).toThrow(/size/);
    expect(() => decodeEphemeris(good.subarray(0, 8))).toThrow(/shorter/);
  });

  it('refuses to encode when vectors length disagrees with count', () => {
    const eph = makeEphemeris(10);
    expect(() => encodeEphemeris({ meta: { ...eph.meta, count: 11 }, vectors: eph.vectors })).toThrow(/count/);
  });
});

describe('sampling', () => {
  const eph = makeEphemeris(5);

  it('interpolates linearly, hits samples exactly, handles the last sample [LSN-EPH-001]', () => {
    const out = new Float64Array(6);
    sampleVectors(eph, 1.5, out);
    for (let k = 0; k < 6; k++) {
      const a = eph.vectors[6 + k] ?? 0;
      const b = eph.vectors[12 + k] ?? 0;
      expect(out[k]).toBeCloseTo((a + b) / 2, 9);
    }
    sampleVectors(eph, 4, out);
    expect(out[0]).toBe(eph.vectors[24]);
    sampleVectors(eph, 0, out);
    expect(out[5]).toBe(eph.vectors[5]);
  });
});
