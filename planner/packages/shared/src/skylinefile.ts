// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// skylines.bin codec: one skyline per site (720 x f32 each). Layout is the
// interface contract in docs/DATA-FILES.md. Change one, change the other, bump VERSION.
import { invariant } from './assert';
import { crc32 } from './crc32';

export const SKYLINES_MAGIC = 'LSNK';
export const SKYLINES_VERSION = 1;
export const SKYLINES_HEADER_BYTES = 32;
/** Per-record metadata before the skyline floats: id 32, lat 8, lon 8, siteHeight 4, truncatedBins 4, reserved 8. */
export const SKYLINES_RECORD_META_BYTES = 64;
export const SKYLINES_ID_BYTES = 32;
const MAX_NOTE_BYTES = 4096;

export interface SkylineRecord {
  /** Site id, UTF-8, at most 32 bytes. */
  readonly id: string;
  readonly latDeg: number;
  readonly lonDeg: number;
  /** Terrain height under the site, metres. */
  readonly siteHeightM: number;
  /** Azimuth bins whose ray ran into the edge of the data. Greater than 0 means "window truncated". */
  readonly truncatedBins: number;
  /** `bins` floats: terrain horizon elevation in degrees at azimuth j * 360 / bins. */
  readonly elevationDeg: Float32Array;
}

export interface SkylineFile {
  readonly bins: number;
  readonly observerHeightM: number;
  readonly stepM: number;
  readonly note: string;
  readonly records: readonly SkylineRecord[];
}

const IS_LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

function align4(n: number): number {
  return Math.ceil(n / 4) * 4;
}

function writeRecord(view: DataView, out: Uint8Array, offset: number, rec: SkylineRecord, bins: number): void {
  const idBytes = new TextEncoder().encode(rec.id);
  invariant(idBytes.length > 0 && idBytes.length <= SKYLINES_ID_BYTES, `site id must be 1 to ${String(SKYLINES_ID_BYTES)} bytes: "${rec.id}"`);
  invariant(rec.elevationDeg.length === bins, `site ${rec.id}: skyline length ${String(rec.elevationDeg.length)} != ${String(bins)}`);
  out.set(idBytes, offset);
  view.setFloat64(offset + 32, rec.latDeg, true);
  view.setFloat64(offset + 40, rec.lonDeg, true);
  view.setFloat32(offset + 48, rec.siteHeightM, true);
  view.setUint32(offset + 52, rec.truncatedBins, true);
  out.set(new Uint8Array(rec.elevationDeg.buffer, rec.elevationDeg.byteOffset, bins * 4), offset + SKYLINES_RECORD_META_BYTES);
}

export function encodeSkylines(file: SkylineFile): Uint8Array {
  invariant(IS_LITTLE_ENDIAN, 'skylines.bin is little-endian; this platform is not');
  invariant(Number.isInteger(file.bins) && file.bins >= 4 && file.bins <= 65_535, 'bins out of range');
  const ids = new Set(file.records.map((r) => r.id));
  invariant(ids.size === file.records.length, 'duplicate site ids');
  const noteBytes = new TextEncoder().encode(file.note);
  invariant(noteBytes.length <= MAX_NOTE_BYTES, 'note too long');
  const recordBytes = SKYLINES_RECORD_META_BYTES + file.bins * 4;
  const dataOffset = align4(SKYLINES_HEADER_BYTES + noteBytes.length);
  const out = new Uint8Array(dataOffset + recordBytes * file.records.length);
  const view = new DataView(out.buffer);
  file.records.forEach((rec, i) => {
    writeRecord(view, out, dataOffset + i * recordBytes, rec, file.bins);
  });
  out.set(new TextEncoder().encode(SKYLINES_MAGIC), 0);
  view.setUint16(4, SKYLINES_VERSION, true);
  view.setUint16(6, file.bins, true);
  view.setUint32(8, file.records.length, true);
  view.setFloat32(12, file.observerHeightM, true);
  view.setFloat32(16, file.stepM, true);
  view.setUint32(20, recordBytes, true);
  view.setUint32(24, noteBytes.length, true);
  view.setUint32(28, crc32(out.subarray(dataOffset)), true);
  out.set(noteBytes, SKYLINES_HEADER_BYTES);
  return out;
}

function readRecord(view: DataView, bytes: Uint8Array, offset: number, bins: number): SkylineRecord {
  const idRaw = bytes.subarray(offset, offset + SKYLINES_ID_BYTES);
  const end = idRaw.indexOf(0);
  const id = new TextDecoder().decode(end < 0 ? idRaw : idRaw.subarray(0, end));
  const floatStart = offset + SKYLINES_RECORD_META_BYTES;
  const elevationDeg = new Float32Array(bins);
  for (let j = 0; j < bins; j++) {
    elevationDeg[j] = view.getFloat32(floatStart + j * 4, true);
  }
  return {
    id,
    latDeg: view.getFloat64(offset + 32, true),
    lonDeg: view.getFloat64(offset + 40, true),
    siteHeightM: view.getFloat32(offset + 48, true),
    truncatedBins: view.getUint32(offset + 52, true),
    elevationDeg,
  };
}

export function decodeSkylines(bytes: Uint8Array): SkylineFile {
  invariant(bytes.length >= SKYLINES_HEADER_BYTES, 'skylines.bin: shorter than header');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = new TextDecoder().decode(bytes.subarray(0, 4));
  invariant(magic === SKYLINES_MAGIC, `skylines.bin: bad magic "${magic}"`);
  const version = view.getUint16(4, true);
  invariant(version === SKYLINES_VERSION, `skylines.bin: unsupported version ${String(version)}`);
  const bins = view.getUint16(6, true);
  const count = view.getUint32(8, true);
  const recordBytes = view.getUint32(20, true);
  const noteLen = view.getUint32(24, true);
  invariant(bins >= 4, 'skylines.bin: bins out of range');
  invariant(recordBytes === SKYLINES_RECORD_META_BYTES + bins * 4, 'skylines.bin: record size does not match bins');
  invariant(noteLen <= MAX_NOTE_BYTES, 'skylines.bin: note length out of range');
  const dataOffset = align4(SKYLINES_HEADER_BYTES + noteLen);
  invariant(bytes.length === dataOffset + recordBytes * count, 'skylines.bin: size does not match header');
  invariant(crc32(bytes.subarray(dataOffset)) === view.getUint32(28, true), 'skylines.bin: CRC-32 mismatch (file corrupt)');
  const records: SkylineRecord[] = [];
  for (let i = 0; i < count; i++) {
    records.push(readRecord(view, bytes, dataOffset + i * recordBytes, bins));
  }
  return {
    bins,
    observerHeightM: view.getFloat32(12, true),
    stepM: view.getFloat32(16, true),
    note: new TextDecoder().decode(bytes.subarray(SKYLINES_HEADER_BYTES, SKYLINES_HEADER_BYTES + noteLen)),
    records,
  };
}
