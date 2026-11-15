// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// The area of the rover simulation (../rover-slam). Its file config/terrain_meta.json
// gives the centre of the 512 m terrain patch in the south polar stereographic projection.
// The planner adds that centre to the catalog, so both parts of the project show the same place.
import { readFile } from 'node:fs/promises';

/** Path of the metadata file, relative to the repository root (one level above planner/). */
export const ROVER_META_PATH = 'rover-slam/config/terrain_meta.json';

export interface RoverPatch {
  /** Centre of the patch, south polar stereographic x and y, metres. */
  readonly centreXM: number;
  readonly centreYM: number;
  readonly sizeM: number;
  /** File name of the NASA elevation model that the patch was cut from. */
  readonly sourceDem: string;
  /** Region name as the rover simulation states it. */
  readonly region: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Reads the fields that the catalog needs. Throws on a missing or malformed field instead of guessing. */
export function parseRoverPatch(text: string): RoverPatch {
  const meta: unknown = JSON.parse(text);
  if (!isRecord(meta)) {
    throw new Error('rover terrain metadata is not an object');
  }
  const centre = meta.centre_xy_m;
  const [x, y] = Array.isArray(centre) ? (centre as unknown[]) : [];
  const size = meta.size_m;
  const dem = meta.source_dem;
  const region = meta.region;
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error('rover terrain metadata: centre_xy_m must be two numbers');
  }
  if (typeof size !== 'number' || !(size > 0) || typeof dem !== 'string' || dem === '' || typeof region !== 'string' || region === '') {
    throw new Error('rover terrain metadata: size_m, source_dem or region is missing');
  }
  return { centreXM: x, centreYM: y, sizeM: size, sourceDem: dem, region };
}

export async function loadRoverPatch(path: string): Promise<RoverPatch> {
  return parseRoverPatch(await readFile(path, 'utf8'));
}
