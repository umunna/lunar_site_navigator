// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// Terrain skyline from a height sampler, exact on a sphere.
// Algorithm: docs/history/plan-2026-11-14.md 5.6. Method as in Mazarico et al. 2011:
// a horizon profile per location, then any Sun geometry (claim 3).
//
// Per azimuth alpha (clockwise from north), walking out in steps of `stepM`:
//   R_o   = R + h_site + h_obs                 observer radius
//   theta = d / R                              arc angle
//   P     = point at arc theta, bearing alpha  (great-circle)
//   eps   = atan2( (R + h_t) cos(theta) - R_o , (R + h_t) sin(theta) )
//   skyline[alpha] = max eps
// Stops early when no terrain up to `maxTerrainHeightM` could still beat the
// maximum so far (see isPastUsefulRange), or when the sampler reports no data.
import { assertRange, invariant } from './assert';
import { DEG2RAD, MOON_RADIUS_M, RAD2DEG, SKYLINE_BINS } from './constants';
import { wrapDeg360 } from './geometry';

export interface TerrainSampler {
  /**
   * Terrain height in metres above the reference sphere (R = 1,737,400 m) at
   * planetocentric latitude and east longitude (radians). NaN where there is no data.
   */
  heightM(latRad: number, lonRad: number): number;
}

export interface SkylineOptions {
  readonly siteLatDeg: number;
  readonly siteLonDeg: number;
  readonly observerHeightM: number;
  /** Along-ray step, metres. DEM pixel size is the natural choice. */
  readonly stepM: number;
  /** Hard cap on ray length, metres. */
  readonly maxRangeM: number;
  /** Highest terrain anywhere in the data (DEM maximum). Used only to stop rays early. */
  readonly maxTerrainHeightM: number;
  /** Bins around the full circle. Default SKYLINE_BINS (720). */
  readonly bins?: number;
}

export interface Skyline {
  /** Elevation of the terrain horizon, degrees, at azimuth j * (360 / bins). */
  readonly elevationDeg: Float32Array;
  /** Terrain height under the site, metres (bilinear from the sampler). */
  readonly siteHeightM: number;
  /** Number of azimuth bins whose ray ran into missing data before it could stop. */
  readonly truncatedBins: number;
}

/** Elevation (radians) of a point at height `heightM`, arc `theta` away, seen from observer radius `observerRadiusM`. */
export function pointElevationRad(heightM: number, theta: number, observerRadiusM: number): number {
  const a = MOON_RADIUS_M + heightM;
  return Math.atan2(a * Math.cos(theta) - observerRadiusM, a * Math.sin(theta));
}

/**
 * True once no terrain of height <= maxTerrainHeightM at arc >= theta can rise
 * above `best` (radians). Elevation falls monotonically with arc beyond the
 * tangent arc acos(A / R_o) (just 0 when the terrain top is above the observer),
 * so the test is only valid past that arc, `thetaStar`.
 */
function isPastUsefulRange(theta: number, best: number, ctx: RayContext): boolean {
  return theta > ctx.thetaStar && pointElevationRad(ctx.opts.maxTerrainHeightM, theta, ctx.observerRadiusM) < best;
}

/** The tangent arc acos(A / R_o) for terrain of the highest possible top; 0 when that top is above the observer. Constant per site. */
function tangentArc(maxTerrainHeightM: number, observerRadiusM: number): number {
  const aMax = MOON_RADIUS_M + maxTerrainHeightM;
  return aMax < observerRadiusM ? Math.acos(aMax / observerRadiusM) : 0;
}

interface RayContext {
  readonly sinLat: number;
  readonly cosLat: number;
  readonly lonRad: number;
  readonly observerRadiusM: number;
  readonly maxSteps: number;
  readonly thetaStar: number;
  readonly opts: SkylineOptions;
}

interface RayResult {
  elevationRad: number;
  truncated: boolean;
}

function castRay(sampler: TerrainSampler, ctx: RayContext, bearingRad: number): RayResult {
  const sinB = Math.sin(bearingRad);
  const cosB = Math.cos(bearingRad);
  let best = -Math.PI / 2;
  for (let k = 1; k <= ctx.maxSteps; k++) {
    const theta = (k * ctx.opts.stepM) / MOON_RADIUS_M;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    const sinLat2 = Math.min(1, Math.max(-1, ctx.sinLat * cosT + ctx.cosLat * sinT * cosB));
    const lat2 = Math.asin(sinLat2);
    const lon2 = ctx.lonRad + Math.atan2(sinB * sinT * ctx.cosLat, cosT - ctx.sinLat * sinLat2);
    const h = sampler.heightM(lat2, lon2);
    if (Number.isNaN(h)) {
      return { elevationRad: best, truncated: true };
    }
    best = Math.max(best, pointElevationRad(h, theta, ctx.observerRadiusM));
    if (isPastUsefulRange(theta, best, ctx)) {
      return { elevationRad: best, truncated: false };
    }
  }
  return { elevationRad: best, truncated: false };
}

function validateOptions(opts: SkylineOptions): number {
  assertRange(opts.siteLatDeg, -90, 90, 'siteLatDeg');
  invariant(Number.isFinite(opts.siteLonDeg), 'siteLonDeg must be finite');
  invariant(opts.observerHeightM >= 0 && Number.isFinite(opts.observerHeightM), 'observerHeightM must be >= 0');
  invariant(opts.stepM > 0 && Number.isFinite(opts.stepM), 'stepM must be positive');
  invariant(opts.maxRangeM > opts.stepM, 'maxRangeM must exceed stepM');
  invariant(Number.isFinite(opts.maxTerrainHeightM), 'maxTerrainHeightM must be finite');
  const bins = opts.bins ?? SKYLINE_BINS;
  invariant(Number.isInteger(bins) && bins >= 4, 'bins must be an integer >= 4');
  return bins;
}

/** Compute the terrain skyline for a site. Cost: bins * (up to maxRange / step) height lookups. */
export function computeSkyline(sampler: TerrainSampler, opts: SkylineOptions): Skyline {
  const bins = validateOptions(opts);
  const latRad = opts.siteLatDeg * DEG2RAD;
  const lonRad = opts.siteLonDeg * DEG2RAD;
  const siteHeightM = sampler.heightM(latRad, lonRad);
  invariant(!Number.isNaN(siteHeightM), 'the site itself has no terrain data');
  const observerRadiusM = MOON_RADIUS_M + siteHeightM + opts.observerHeightM;
  const ctx: RayContext = {
    sinLat: Math.sin(latRad),
    cosLat: Math.cos(latRad),
    lonRad,
    observerRadiusM,
    maxSteps: Math.floor(opts.maxRangeM / opts.stepM),
    thetaStar: tangentArc(opts.maxTerrainHeightM, observerRadiusM),
    opts,
  };
  const elevationDeg = new Float32Array(bins);
  let truncatedBins = 0;
  for (let j = 0; j < bins; j++) {
    const ray = castRay(sampler, ctx, ((j * 360) / bins) * DEG2RAD);
    elevationDeg[j] = ray.elevationRad * RAD2DEG;
    if (ray.truncated) {
      truncatedBins += 1;
    }
  }
  return { elevationDeg, siteHeightM, truncatedBins };
}

/** Skyline elevation (degrees) at any azimuth, linear interpolation between bins, wrapping at 360. */
export function skylineAt(elevationDeg: Float32Array, azDeg: number): number {
  const bins = elevationDeg.length;
  invariant(bins >= 4, 'skyline too short');
  const x = (wrapDeg360(azDeg) / 360) * bins;
  const i0 = Math.floor(x) % bins;
  const i1 = (i0 + 1) % bins;
  const frac = x - Math.floor(x);
  const a = elevationDeg[i0] ?? 0;
  const b = elevationDeg[i1] ?? 0;
  return a + (b - a) * frac;
}

/** Smooth-sphere horizon dip for an observer `heightM` above a surface at the sphere: -acos(R / (R + h)), degrees. */
export function smoothSphereDipDeg(observerHeightM: number): number {
  invariant(observerHeightM >= 0, 'observerHeightM must be >= 0');
  return -Math.acos(MOON_RADIUS_M / (MOON_RADIUS_M + observerHeightM)) * RAD2DEG;
}
