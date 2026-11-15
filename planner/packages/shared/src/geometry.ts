// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// Sky position of a body (Sun or Earth) from a lunar site.
// Formulas: docs/history/plan-2026-11-14.md 5.6. Frame: Moon-centred, Moon mean-Earth
// body-fixed (the frame Horizons uses for lunar site coordinates, claim 6).
import { assertRange, invariant } from './assert';
import { DEG2RAD, MOON_RADIUS_KM, RAD2DEG } from './constants';

export type Vec3 = readonly [number, number, number];

export interface SiteFrame {
  /** Planetocentric latitude, degrees, -90 to 90. */
  readonly latDeg: number;
  /** East longitude, degrees. */
  readonly lonDeg: number;
  /** Observer distance from the Moon centre: R + height, km. */
  readonly radiusKm: number;
  readonly up: Vec3;
  readonly east: Vec3;
  readonly north: Vec3;
}

export interface AzEl {
  /** Azimuth clockwise from local north, degrees in [0, 360). */
  azDeg: number;
  /** Elevation above the local horizontal plane, degrees in [-90, 90]. */
  elDeg: number;
  /** Distance observer to body, km. */
  rangeKm: number;
}

export function newAzEl(): AzEl {
  return { azDeg: 0, elDeg: 0, rangeKm: 0 };
}

/** Wrap an angle in degrees to [0, 360). */
export function wrapDeg360(deg: number): number {
  const w = deg % 360;
  return w < 0 ? w + 360 : w;
}

/** Unit vector for east longitude and latitude (degrees) in the body-fixed frame. */
export function lonLatToUnit(lonDeg: number, latDeg: number): Vec3 {
  assertRange(latDeg, -90, 90, 'latDeg');
  invariant(Number.isFinite(lonDeg), 'lonDeg must be finite');
  const lon = lonDeg * DEG2RAD;
  const lat = latDeg * DEG2RAD;
  const cosLat = Math.cos(lat);
  return [cosLat * Math.cos(lon), cosLat * Math.sin(lon), Math.sin(lat)];
}

/**
 * Local up, east, north at a site. `heightKm` is the observer height above
 * the reference sphere. The validated Python script used height 0; the
 * difference is at most 0.001 deg (7 km of height / 384,400 km, claim 5 note).
 */
export function makeSiteFrame(latDeg: number, lonDeg: number, heightKm = 0): SiteFrame {
  assertRange(latDeg, -90, 90, 'latDeg');
  invariant(Number.isFinite(lonDeg), 'lonDeg must be finite');
  invariant(Number.isFinite(heightKm) && heightKm > -MOON_RADIUS_KM, 'heightKm out of range');
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  return {
    latDeg,
    lonDeg,
    radiusKm: MOON_RADIUS_KM + heightKm,
    up: [cosLat * cosLon, cosLat * sinLon, sinLat],
    east: [-sinLon, cosLon, 0],
    north: [-sinLat * cosLon, -sinLat * sinLon, cosLat],
  };
}

function dot(a: Vec3, x: number, y: number, z: number): number {
  return a[0] * x + a[1] * y + a[2] * z;
}

/**
 * Azimuth and elevation of a body at Moon-centred position (bx, by, bz) km,
 * seen from the site. Written into `out` (no allocation in the hot loop).
 *
 *   d  = B - S, with S = radiusKm * up
 *   el = atan2(d.up, hypot(d.east, d.north))     (equals asin(d.up / |d|), better conditioned)
 *   az = atan2(d.east, d.north) mod 360          (clockwise from north)
 */
export function bodyAzEl(frame: SiteFrame, bx: number, by: number, bz: number, out: AzEl): AzEl {
  const dx = bx - frame.radiusKm * frame.up[0];
  const dy = by - frame.radiusKm * frame.up[1];
  const dz = bz - frame.radiusKm * frame.up[2];
  const dUp = dot(frame.up, dx, dy, dz);
  const dEast = dot(frame.east, dx, dy, dz);
  const dNorth = dot(frame.north, dx, dy, dz);
  const horizontal = Math.hypot(dEast, dNorth);
  invariant(Number.isFinite(dUp) && Number.isFinite(horizontal), 'non-finite body vector');
  out.elDeg = Math.atan2(dUp, horizontal) * RAD2DEG;
  out.azDeg = horizontal === 0 ? 0 : wrapDeg360(Math.atan2(dEast, dNorth) * RAD2DEG);
  out.rangeKm = Math.hypot(dx, dy, dz);
  return out;
}

/** Angular separation in degrees between two sky directions given as (az, el) in degrees. */
export function skySeparationDeg(az1Deg: number, el1Deg: number, az2Deg: number, el2Deg: number): number {
  const u = azElToUnit(az1Deg, el1Deg);
  const v = azElToUnit(az2Deg, el2Deg);
  const chord = Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
  return 2 * Math.asin(Math.min(1, chord / 2)) * RAD2DEG;
}

function azElToUnit(azDeg: number, elDeg: number): Vec3 {
  const az = azDeg * DEG2RAD;
  const el = elDeg * DEG2RAD;
  const c = Math.cos(el);
  // x = north, y = east, z = up. Only used for separations, so the handedness is irrelevant.
  return [c * Math.cos(az), c * Math.sin(az), Math.sin(el)];
}
