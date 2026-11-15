// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// Site catalog. Types and the hand-maintained list of NASA's 13 Artemis III
// candidate regions live here. Coordinates live in
// catalog.generated.ts, written by `npm run build-catalog` from cited sources.
// No coordinate is typed from memory. Every entry has `source` and `precision`.
import { CATALOG_SITES as GENERATED_SITES } from './catalog.generated';

export type CatalogGroup = 'south-pole' | 'apollo';

/**
 * How well the coordinate pins down a place:
 * - `landing-site`: where a lander actually sat (Apollo, NASA NSSDC).
 * - `computed-high-point`: highest 80 m LOLA pixel near a feature, found by our build step. Not a NASA region or landing site.
 * - `demo-area`: centre of the terrain patch that our rover simulation uses (../rover-slam). Not a landing site.
 */
export type Precision = 'landing-site' | 'computed-high-point' | 'demo-area';

export interface CatalogSite {
  /** Unique, at most 32 bytes of UTF-8: it is the key in skylines.bin. */
  readonly id: string;
  readonly name: string;
  readonly group: CatalogGroup;
  /** Planetocentric latitude, degrees. */
  readonly latDeg: number;
  /** East longitude, degrees. */
  readonly lonDeg: number;
  /** Where the coordinate came from: document or table, URL, retrieval date. */
  readonly source: string;
  readonly precision: Precision;
  readonly notes: string;
}

export interface ArtemisRegion {
  /** Name as in NASA release 22-089. */
  readonly name: string;
  /** Exact IAU Gazetteer name of the feature the region refers to, or null if no clean match exists. */
  readonly iauFeature: string | null;
  /** Why this mapping was chosen, or why there is none. */
  readonly why: string;
}

/**
 * NASA's 13 Artemis III candidate regions, each about 15 x 15 km (claim 7, NASA release 22-089, [✔]).
 * NASA's release gives no coordinates. A region is mapped to an IAU feature only when the
 * name states it plainly, and the catalog then holds one high point near that feature.
 * Otherwise the region is left out (fewer sites beats invented ones).
 */
export const ARTEMIS_REGIONS: readonly ArtemisRegion[] = [
  { name: 'Faustini Rim A', iauFeature: 'Faustini', why: 'Named for the rim of Faustini crater.' },
  { name: 'Peak Near Shackleton', iauFeature: 'Shackleton', why: 'Named for a peak near Shackleton crater; the peak itself has no IAU name.' },
  { name: 'Connecting Ridge', iauFeature: null, why: 'No IAU feature of that name. The app has the area of our rover simulation in this region.' },
  { name: 'Connecting Ridge Extension', iauFeature: null, why: 'No IAU feature of that name. No coordinate source found.' },
  { name: 'de Gerlache Rim 1', iauFeature: 'de Gerlache', why: 'Named for the rim of de Gerlache crater. Rim 1 and Rim 2 cannot be told apart without NASA coordinates.' },
  { name: 'de Gerlache Rim 2', iauFeature: 'de Gerlache', why: 'Named for the rim of de Gerlache crater. Rim 1 and Rim 2 cannot be told apart without NASA coordinates.' },
  { name: 'de Gerlache-Kocher Massif', iauFeature: null, why: 'A massif between two features. The IAU Kocher crater lies far from de Gerlache, so neither centre is the massif.' },
  { name: 'Haworth', iauFeature: 'Haworth', why: 'Named for Haworth crater.' },
  { name: 'Malapert Massif', iauFeature: 'Mons Malapert', why: 'Named for the Malapert massif, IAU "Mons Malapert".' },
  { name: 'Leibnitz Beta Plateau', iauFeature: null, why: 'The IAU crater "Leibnitz" is at 38 S, far from the pole, so it is not this plateau. No coordinate source found.' },
  { name: 'Nobile Rim 1', iauFeature: 'Nobile', why: 'Named for the rim of Nobile crater. Rim 1 and Rim 2 cannot be told apart without NASA coordinates.' },
  { name: 'Nobile Rim 2', iauFeature: 'Nobile', why: 'Named for the rim of Nobile crater. Rim 1 and Rim 2 cannot be told apart without NASA coordinates.' },
  { name: 'Amundsen Rim', iauFeature: 'Amundsen', why: 'Named for the rim of Amundsen crater.' },
];

/** The Artemis III region where our rover simulation drives, and the id of its catalog entry. */
export const ROVER_DEMO = { regionName: 'Connecting Ridge', siteId: 'connecting-ridge-rover' } as const;

/** The south polar DEM covers 80 to 90 S. Sites north of that get a flat horizon. */
export const DEM_MIN_ABS_LAT_DEG = 80;

export function hasTerrain(site: Pick<CatalogSite, 'latDeg'>): boolean {
  return site.latDeg <= -DEM_MIN_ABS_LAT_DEG;
}

/** All generated catalog entries. */
export const CATALOG: readonly CatalogSite[] = GENERATED_SITES;
