// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// ephemeris.bin codec. Byte layout is the interface contract in
// docs/DATA-FILES.md. Change one, change the other, bump VERSION.
import { invariant } from './assert';
import { crc32 } from './crc32';

export const EPHEMERIS_MAGIC = 'LSNE';
export const EPHEMERIS_VERSION = 1;
/** Fixed part of the header, in bytes. */
export const EPHEMERIS_HEADER_BYTES = 32;
/** Floats per sample: Sun x, y, z then Earth x, y, z, in km, Moon-centred, Moon mean-Earth body-fixed frame. */
export const EPHEMERIS_FLOATS_PER_SAMPLE = 6;
const BYTES_PER_FLOAT = 4;
const MAX_NOTE_BYTES = 4096;

export interface EphemerisMeta {
  /** First sample time, seconds since the Unix epoch, UTC scale. */
  readonly t0UnixS: number;
  /** Seconds between samples. */
  readonly stepS: number;
  /** Number of samples. */
  readonly count: number;
  /** Free-text provenance (source, query, generation date). */
  readonly note: string;
}

export interface Ephemeris {
  readonly meta: EphemerisMeta;
  /** count * 6 floats: [sunX, sunY, sunZ, earthX, earthY, earthZ] per sample, km. */
  readonly vectors: Float32Array;
}

const IS_LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

function align4(n: number): number {
  return Math.ceil(n / 4) * 4;
}

function validateMeta(meta: EphemerisMeta): void {
  invariant(Number.isFinite(meta.t0UnixS), 't0UnixS must be finite');
  invariant(Number.isInteger(meta.stepS) && meta.stepS > 0, 'stepS must be a positive integer');
  invariant(Number.isInteger(meta.count) && meta.count > 0, 'count must be a positive integer');
}

/** Serialise an ephemeris to the ephemeris.bin byte layout. */
export function encodeEphemeris(eph: Ephemeris): Uint8Array {
  invariant(IS_LITTLE_ENDIAN, 'ephemeris.bin is little-endian; this platform is not');
  validateMeta(eph.meta);
  const floatCount = eph.meta.count * EPHEMERIS_FLOATS_PER_SAMPLE;
  invariant(eph.vectors.length === floatCount, 'vectors length must be count * 6');

  const noteBytes = new TextEncoder().encode(eph.meta.note);
  invariant(noteBytes.length <= MAX_NOTE_BYTES, 'note too long');
  const dataOffset = align4(EPHEMERIS_HEADER_BYTES + noteBytes.length);
  const payloadBytes = floatCount * BYTES_PER_FLOAT;
  const out = new Uint8Array(dataOffset + payloadBytes);

  const payload = new Uint8Array(eph.vectors.buffer, eph.vectors.byteOffset, payloadBytes);
  const view = new DataView(out.buffer);
  out.set(new TextEncoder().encode(EPHEMERIS_MAGIC), 0);
  view.setUint16(4, EPHEMERIS_VERSION, true);
  view.setUint16(6, 0, true);
  view.setFloat64(8, eph.meta.t0UnixS, true);
  view.setUint32(16, eph.meta.stepS, true);
  view.setUint32(20, eph.meta.count, true);
  view.setUint32(24, noteBytes.length, true);
  view.setUint32(28, crc32(payload), true);
  out.set(noteBytes, EPHEMERIS_HEADER_BYTES);
  out.set(payload, dataOffset);
  return out;
}

function readHeader(bytes: Uint8Array): { meta: EphemerisMeta; dataOffset: number; crc: number } {
  invariant(bytes.length >= EPHEMERIS_HEADER_BYTES, 'ephemeris.bin: file shorter than header');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = new TextDecoder().decode(bytes.subarray(0, 4));
  invariant(magic === EPHEMERIS_MAGIC, `ephemeris.bin: bad magic "${magic}"`);
  const version = view.getUint16(4, true);
  invariant(version === EPHEMERIS_VERSION, `ephemeris.bin: unsupported version ${String(version)}`);
  invariant(view.getUint16(6, true) === 0, 'ephemeris.bin: reserved field not zero');
  const noteLen = view.getUint32(24, true);
  invariant(noteLen <= MAX_NOTE_BYTES, 'ephemeris.bin: note length out of range');
  const dataOffset = align4(EPHEMERIS_HEADER_BYTES + noteLen);
  invariant(bytes.length >= dataOffset, 'ephemeris.bin: truncated before payload');
  const note = new TextDecoder().decode(bytes.subarray(EPHEMERIS_HEADER_BYTES, EPHEMERIS_HEADER_BYTES + noteLen));
  const meta: EphemerisMeta = {
    t0UnixS: view.getFloat64(8, true),
    stepS: view.getUint32(16, true),
    count: view.getUint32(20, true),
    note,
  };
  validateMeta(meta);
  return { meta, dataOffset, crc: view.getUint32(28, true) };
}

/**
 * Parse and verify ephemeris.bin. Zero-copy when the payload is 4-byte
 * aligned in the underlying buffer, otherwise one copy.
 */
export function decodeEphemeris(bytes: Uint8Array): Ephemeris {
  invariant(IS_LITTLE_ENDIAN, 'ephemeris.bin is little-endian; this platform is not');
  const { meta, dataOffset, crc } = readHeader(bytes);
  const floatCount = meta.count * EPHEMERIS_FLOATS_PER_SAMPLE;
  const payloadBytes = floatCount * BYTES_PER_FLOAT;
  invariant(bytes.length === dataOffset + payloadBytes, 'ephemeris.bin: size does not match header');

  const payload = bytes.subarray(dataOffset, dataOffset + payloadBytes);
  invariant(crc32(payload) === crc, 'ephemeris.bin: payload CRC-32 mismatch (file corrupt)');

  const aligned = (bytes.byteOffset + dataOffset) % BYTES_PER_FLOAT === 0;
  const vectors = aligned
    ? new Float32Array(bytes.buffer, bytes.byteOffset + dataOffset, floatCount)
    : new Float32Array(payload.slice().buffer);
  return { meta, vectors };
}

/**
 * Sun and Earth vectors at a fractional index, linearly interpolated, written
 * into `out` (6 numbers). Linear interpolation error is about 1.6e-5 deg for
 * the Sun at 600 s steps (docs/history/plan-2026-11-14.md 5.3).
 */
export function sampleVectors(eph: Ephemeris, index: number, out: Float64Array): void {
  invariant(out.length >= EPHEMERIS_FLOATS_PER_SAMPLE, 'out must hold 6 numbers');
  invariant(index >= 0 && index <= eph.meta.count - 1, 'index outside ephemeris');
  const last = eph.meta.count - 1;
  const i0 = Math.min(Math.floor(index), Math.max(last - 1, 0));
  const i1 = Math.min(i0 + 1, last);
  const frac = index - i0;
  const base0 = i0 * EPHEMERIS_FLOATS_PER_SAMPLE;
  const base1 = i1 * EPHEMERIS_FLOATS_PER_SAMPLE;
  for (let k = 0; k < EPHEMERIS_FLOATS_PER_SAMPLE; k++) {
    const a = eph.vectors[base0 + k] ?? 0;
    const b = eph.vectors[base1 + k] ?? 0;
    out[k] = a + (b - a) * frac;
  }
}
