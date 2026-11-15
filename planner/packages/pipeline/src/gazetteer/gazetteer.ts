// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// IAU Gazetteer of Planetary Nomenclature, Moon (USGS Astrogeology).
// Source for V0 and for catalog coordinates: no coordinate is typed from memory
// (docs/history/plan-2026-11-14.md 5.5 P2, section 4.3).
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { invariant } from '@lsn/shared';

export const GAZETTEER_MOON_URL = 'https://planetarynames.wr.usgs.gov/SearchResults?Target=16_Moon';
export const GAZETTEER_FEATURE_URL = 'https://planetarynames.wr.usgs.gov/Feature/';

export interface GazetteerFeature {
  readonly id: number;
  readonly name: string;
  readonly diameterKm: number;
  /** Centre, degrees. Latitude: planetographic = planetocentric on the Moon's reference sphere. Longitude: east-positive, as stated in `coordSystem`. */
  readonly centerLatDeg: number;
  readonly centerLonDeg: number;
  readonly northLatDeg: number;
  readonly southLatDeg: number;
  readonly eastLonDeg: number;
  readonly westLonDeg: number;
  /** For example "Planetographic, +East, -180 - 180". */
  readonly coordSystem: string;
  readonly featureType: string;
  readonly approval: string;
  readonly lastUpdated: string;
}

const CELL = /<td class="(\w+)[^"]*"[^>]*>([\s\S]*?)<\/td>/g;

function text(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function num(s: string | undefined): number {
  const v = s === undefined || s === '' ? Number.NaN : Number(s);
  return v;
}

function cellsByClass(row: string): Map<string, string[]> {
  const byClass = new Map<string, string[]>();
  for (const m of row.matchAll(CELL)) {
    const key = m[1] ?? '';
    byClass.set(key, [...(byClass.get(key) ?? []), text(m[2] ?? '')]);
  }
  return byClass;
}

function first(cells: Map<string, string[]>, key: string): string {
  return cells.get(key)?.[0] ?? '';
}

function rowToFeature(row: string): GazetteerFeature | null {
  const cells = cellsByClass(row);
  const centre = cells.get('centerLatLonColumn') ?? [];
  const box = cells.get('latLonColumn') ?? [];
  const id = num(first(cells, 'featureIDColumn'));
  const lat = num(centre[0]);
  const lon = num(centre[1]);
  if (!Number.isFinite(id) || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return {
    id,
    name: first(cells, 'cleanFeatureNameColumn'),
    diameterKm: num(first(cells, 'diameterColumn')),
    centerLatDeg: lat,
    centerLonDeg: lon,
    northLatDeg: num(box[0]),
    southLatDeg: num(box[1]),
    eastLonDeg: num(box[2]),
    westLonDeg: num(box[3]),
    coordSystem: first(cells, 'coordSystemColumn'),
    featureType: first(cells, 'featureTypeColumn'),
    approval: first(cells, 'approvalStatusColumn'),
    lastUpdated: first(cells, 'lastUpdatedColumn'),
  };
}

/** Parse the Gazetteer results table. Rows with missing coordinates are skipped. */
export function parseGazetteerHtml(html: string): GazetteerFeature[] {
  const features: GazetteerFeature[] = [];
  for (const row of html.split(/<tr\b/)) {
    const feature = row.includes('featureIDColumn') ? rowToFeature(row) : null;
    if (feature !== null) {
      features.push(feature);
    }
  }
  return features;
}

/** Exact, case-sensitive match on the Gazetteer's clean name. Throws if there is not exactly one. */
export function findUnique(features: readonly GazetteerFeature[], name: string): GazetteerFeature {
  const hits = features.filter((f) => f.name === name);
  invariant(hits.length === 1, `Gazetteer: expected exactly one "${name}", found ${String(hits.length)}: ${hits.map((h) => `${String(h.id)} ${h.featureType}`).join('; ')}`);
  const hit = hits[0];
  invariant(hit !== undefined, 'unreachable');
  return hit;
}

/** Download the full Moon table once (about 24 MB of HTML) and cache it. */
export async function loadMoonGazetteer(cacheDir: string): Promise<GazetteerFeature[]> {
  const dir = join(cacheDir, 'gazetteer');
  const path = join(dir, 'moon-all.html');
  let html: string;
  try {
    html = await readFile(path, 'utf8');
  } catch {
    await mkdir(dir, { recursive: true });
    const response = await fetch(GAZETTEER_MOON_URL, {
      headers: { 'User-Agent': 'lunar-site-navigator-build/0.1' },
      signal: AbortSignal.timeout(300_000),
    });
    invariant(response.ok, `Gazetteer HTTP ${String(response.status)}`);
    html = await response.text();
    await writeFile(`${path}.tmp`, html, 'utf8');
    await rename(`${path}.tmp`, path);
  }
  const features = parseGazetteerHtml(html);
  invariant(features.length > 1000, `Gazetteer parse produced only ${String(features.length)} features`);
  return features;
}
