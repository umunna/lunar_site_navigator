// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
// Loading and selecting data. The app reads two binary files and, for the About page, the validation index.
import { CATALOG, DEFAULT_OBSERVER_HEIGHT_M, decodeEphemeris, decodeSkylines, flatSkyline, hasTerrain } from '@lsn/shared';
import type { CatalogSite, Ephemeris, SkylineRecord } from '@lsn/shared';

export interface AppData {
  readonly eph: Ephemeris;
  readonly skylines: ReadonlyMap<string, SkylineRecord>;
  readonly observerHeightM: number;
  readonly flat: Float32Array;
  /** Provenance notes from inside the two files. */
  readonly ephemerisNote: string;
  readonly skylineNote: string;
}

/** Upper limit on the number of pieces of one download (rule: each loop has a fixed limit). */
const MAX_CHUNKS = 1_000_000;

/**
 * Downloads a file. When the server gives the size of the file, `onProgress` gets the
 * share that is loaded (0 to 1) after each piece. Without a size there is no progress.
 */
export async function fetchBytes(url: string, onProgress?: (fraction: number) => void): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${String(response.status)}`);
  }
  const total = Number(response.headers.get('content-length') ?? '');
  if (onProgress === undefined || response.body === null || !(total > 0)) {
    return new Uint8Array(await response.arrayBuffer());
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(Math.min(1, loaded / total));
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/** `onProgress` follows the large file (ephemeris.bin, 3.8 MB); the other file is 24 kB. */
export async function loadAppData(base: string, onProgress?: (fraction: number) => void): Promise<AppData> {
  const [ephBytes, skyBytes] = await Promise.all([fetchBytes(`${base}ephemeris.bin`, onProgress), fetchBytes(`${base}skylines.bin`)]);
  const eph = decodeEphemeris(ephBytes);
  const file = decodeSkylines(skyBytes);
  return {
    eph,
    skylines: new Map(file.records.map((r) => [r.id, r])),
    observerHeightM: file.observerHeightM || DEFAULT_OBSERVER_HEIGHT_M,
    flat: flatSkyline(file.observerHeightM || DEFAULT_OBSERVER_HEIGHT_M, file.bins),
    ephemerisNote: eph.meta.note,
    skylineNote: file.note,
  };
}

export interface ValidationEntry {
  readonly id: string;
  readonly title: string;
  readonly criterion: string;
  readonly status: 'pass' | 'fail' | 'not run';
  readonly summary: string;
}

/**
 * The validation index is optional: it only feeds the About page. A missing file, a
 * network error, or a host that answers an unknown path with index.html and status 200
 * must not stop the app, so every failure gives an empty list.
 */
export async function loadValidationIndex(base: string): Promise<ValidationEntry[]> {
  try {
    const response = await fetch(`${base}validation/index.json`);
    if (!response.ok) {
      return [];
    }
    const parsed: unknown = await response.json();
    return Array.isArray(parsed) ? (parsed as ValidationEntry[]) : [];
  } catch {
    return [];
  }
}

export interface SiteSel {
  readonly id: string;
  readonly name: string;
  readonly latDeg: number;
  readonly lonDeg: number;
  readonly skyline: Float32Array;
  /** 'modelled': terrain skyline from the LOLA DEM. 'flat': only the dip from the sphere and the observer height. */
  readonly terrain: 'modelled' | 'flat';
  /** Why the horizon is flat, when it is. */
  readonly flatReason: string;
  readonly truncatedBins: number;
  readonly siteHeightM: number | null;
  readonly catalog: CatalogSite;
}

export function selectSite(siteId: string, data: AppData): SiteSel {
  const site = CATALOG.find((s) => s.id === siteId) ?? CATALOG[0];
  if (site === undefined) {
    throw new Error('the catalog is empty');
  }
  const rec = data.skylines.get(site.id);
  const modelled = rec !== undefined && hasTerrain(site);
  return {
    id: site.id,
    name: site.name,
    latDeg: site.latDeg,
    lonDeg: site.lonDeg,
    skyline: modelled ? rec.elevationDeg : data.flat,
    terrain: modelled ? 'modelled' : 'flat',
    flatReason: modelled ? '' : 'This place is outside NASA’s south-pole height map, so the app has no hills for it. The horizon is flat.',
    truncatedBins: modelled ? rec.truncatedBins : 0,
    siteHeightM: modelled ? rec.siteHeightM : null,
    catalog: site,
  };
}
