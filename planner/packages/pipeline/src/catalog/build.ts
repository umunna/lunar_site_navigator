// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// Assemble the catalog from cited sources. Pure given its inputs: the same
// Gazetteer table, NSSDC page and DEM always give the same entries.
import { ARTEMIS_REGIONS, ROVER_DEMO, invariant, southPolarForward, southPolarInverse } from '@lsn/shared';
import type { CatalogSite } from '@lsn/shared';
import { findUnique } from '../gazetteer/gazetteer';
import type { GazetteerFeature } from '../gazetteer/gazetteer';
import { GAZETTEER_FEATURE_URL } from '../gazetteer/gazetteer';
import type { HeightFn } from '../validation/v0';
import { NSSDC_APOLLO_URL } from './nssdc';
import type { ApolloLanding } from './nssdc';
import { findHighPoint } from './highpoint';
import { ROVER_META_PATH } from './rover';
import type { RoverPatch } from './rover';

/** Date the sources were read. Fixed so the generated file is reproducible from the caches. [design] */
export const RETRIEVED_ON = '2026-11-14';
const HIGH_POINT_STEP_M = 80;

export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function regionsFor(feature: string): string[] {
  return ARTEMIS_REGIONS.filter((r) => r.iauFeature === feature).map((r) => r.name);
}

function gazetteerSource(f: GazetteerFeature): string {
  return `IAU Gazetteer of Planetary Nomenclature, feature id ${String(f.id)} (${GAZETTEER_FEATURE_URL}${String(f.id)}), centre as published (${f.coordSystem}), status ${f.approval}; read ${RETRIEVED_ON}`;
}

function highPointSite(f: GazetteerFeature, height: HeightFn): CatalogSite | null {
  const radiusM = (f.diameterKm * 1000) / 2;
  const isMassif = f.featureType.includes('Mons');
  const [inner, outer] = isMassif ? [0, radiusM] : [0.7 * radiusM, 1.2 * radiusM];
  const xy = southPolarForward(f.centerLatDeg, f.centerLonDeg, { xM: 0, yM: 0 });
  const hp = findHighPoint(height, xy.xM, xy.yM, inner, outer, HIGH_POINT_STEP_M);
  if (hp === null) {
    return null;
  }
  const ll = southPolarInverse(hp.xM, hp.yM, { latDeg: 0, lonDeg: 0 });
  const where = isMassif ? 'within one radius of' : 'between 0.7 and 1.2 radii of';
  return {
    id: `${slug(f.name)}-high`,
    name: isMassif ? `${f.name} (summit)` : `${f.name} rim (high point)`,
    group: 'south-pole',
    latDeg: Number(ll.latDeg.toFixed(4)),
    lonDeg: Number(ll.lonDeg.toFixed(4)),
    source: `Found by our build step: the highest 80 m point of the LRO LOLA south-pole height map (Barker et al. 2023, doi 10.3847/PSJ/acf3e1) ${where} the centre of "${f.name}" (${gazetteerSource(f)}); read ${RETRIEVED_ON}`,
    precision: 'computed-high-point',
    notes: `The ground here is ${hp.heightM.toFixed(0)} m above the Moon's mean radius (1737.4 km). We chose this point because a high point gets more sunlight. NASA Artemis III candidate area(s) near it: ${regionsFor(f.name).join(', ')}. It is not an official NASA landing site.`,
  };
}

/** The centre of the terrain patch of the rover simulation, so that both parts of the project show the same place. */
function roverSite(p: RoverPatch, height: HeightFn): CatalogSite {
  invariant(p.region.includes(ROVER_DEMO.regionName), `the rover area is not in ${ROVER_DEMO.regionName}`);
  const ll = southPolarInverse(p.centreXM, p.centreYM, { latDeg: 0, lonDeg: 0 });
  const h = height(p.centreXM, p.centreYM);
  invariant(Number.isFinite(h), 'the rover area is outside the height map');
  return {
    id: ROVER_DEMO.siteId,
    name: `${ROVER_DEMO.regionName} (rover simulation area)`,
    group: 'south-pole',
    latDeg: Number(ll.latDeg.toFixed(4)),
    lonDeg: Number(ll.lonDeg.toFixed(4)),
    source: `Centre of the ${String(p.sizeM)} m area of our rover simulation: ${ROVER_META_PATH}, centre_xy_m = [${String(p.centreXM)}, ${String(p.centreYM)}] in the south polar stereographic projection. The simulation cut this area from the NASA LOLA 5 m elevation model "${p.sourceDem}" (NASA PGDA product 78, "High-Resolution LOLA Topography for Lunar South Pole Sites", https://pgda.gsfc.nasa.gov/products/78); read ${RETRIEVED_ON}`,
    precision: 'demo-area',
    notes: `The ground here is ${h.toFixed(0)} m above the Moon's mean radius (1737.4 km), from the 80 m height map. The rover simulation names its region: ${p.region}. This is where our simulated rover drives from sunlight into shadow. It is not an official NASA landing site.`,
  };
}

function apolloSite(a: ApolloLanding): CatalogSite {
  return {
    id: `apollo-${String(a.mission)}`,
    name: `Apollo ${String(a.mission)} landing site`,
    group: 'apollo',
    latDeg: a.latDeg,
    lonDeg: a.lonDeg,
    source: `NASA NSSDC "Apollo Landing Site Coordinates", Lunar Module row (${NSSDC_APOLLO_URL}): planetocentric, Mean Earth/Polar Axis, DE421, from LRO images, Wagner et al., Icarus 283, 92-103 (2017); read ${RETRIEVED_ON}`,
    precision: 'landing-site',
    notes: 'Where the Apollo Lunar Module stood. It is outside the south-pole height map, so the app shows a flat horizon here.',
  };
}

export interface CatalogInputs {
  readonly gazetteer: readonly GazetteerFeature[];
  readonly apollo: readonly ApolloLanding[];
  readonly height: HeightFn;
  /** Null when the rover simulation is not in the repository. */
  readonly roverPatch: RoverPatch | null;
}

/** Features of ARTEMIS_REGIONS that map to an IAU name, in region order, without repeats. */
export function artemisFeatureNames(): string[] {
  const names: string[] = [];
  for (const r of ARTEMIS_REGIONS) {
    if (r.iauFeature !== null && !names.includes(r.iauFeature)) {
      names.push(r.iauFeature);
    }
  }
  return names;
}

export function buildCatalog(inputs: CatalogInputs): CatalogSite[] {
  const sites: CatalogSite[] = [];
  for (const name of artemisFeatureNames()) {
    const high = highPointSite(findUnique(inputs.gazetteer, name), inputs.height);
    if (high !== null) {
      sites.push(high);
    }
  }
  if (inputs.roverPatch !== null) {
    sites.push(roverSite(inputs.roverPatch, inputs.height));
  }
  const missions = [...inputs.apollo].sort((a, b) => a.mission - b.mission);
  for (const a of missions) {
    sites.push(apolloSite(a));
  }
  const ids = new Set(sites.map((s) => s.id));
  invariant(ids.size === sites.length, 'catalog build produced duplicate ids');
  return sites;
}

/** The generated TypeScript source for packages/shared/src/catalog.generated.ts. */
export function renderCatalogTs(sites: readonly CatalogSite[]): string {
  const body = sites.map((s) => `  ${JSON.stringify(s, null, 2).replace(/\n/g, '\n  ')},`).join('\n');
  return [
    `// GENERATED by \`npm run build-catalog\` (packages/pipeline) from cited sources read ${RETRIEVED_ON}.`,
    '// Do not edit by hand: change the inputs or the generator and rebuild.',
    "import type { CatalogSite } from './catalog';",
    '',
    'export const CATALOG_SITES: readonly CatalogSite[] = [',
    body,
    '];',
    '',
  ].join('\n');
}
