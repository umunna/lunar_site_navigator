// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
// Test helpers: the real generated data files, read from disk.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_OBSERVER_HEIGHT_M, decodeEphemeris, decodeSkylines, flatSkyline } from '@lsn/shared';
import type { AppData } from '../src/lib/data';

// Plain paths, not `new URL(...)`: under the jsdom environment `URL` is jsdom's, which Node's fs rejects.
const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data');

export function dataBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(DATA_DIR, name)));
}

export function dataText(name: string): string {
  return readFileSync(join(DATA_DIR, name), 'utf8');
}

/** The same object loadAppData builds, from the files on disk. */
export function loadTestData(): AppData {
  const eph = decodeEphemeris(dataBytes('ephemeris.bin'));
  const sky = decodeSkylines(dataBytes('skylines.bin'));
  return {
    eph,
    skylines: new Map(sky.records.map((r) => [r.id, r])),
    observerHeightM: sky.observerHeightM || DEFAULT_OBSERVER_HEIGHT_M,
    flat: flatSkyline(sky.observerHeightM || DEFAULT_OBSERVER_HEIGHT_M, sky.bins),
    ephemerisNote: eph.meta.note,
    skylineNote: sky.note,
  };
}
