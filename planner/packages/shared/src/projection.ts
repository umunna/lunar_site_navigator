// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// South polar stereographic, scale 1 at the pole, central longitude 0, sphere
// R = 1,737,400 m, planetocentric latitude (docs/history/plan-2026-11-14.md 5.5,
// "Projection"; orientation confirmed by V0 on the 80 m file):
//   x = rho * sin(lon),  y = rho * cos(lon),  rho = 2R * tan(45 deg - |lat| / 2)
// Longitude is east-positive. Valid only for latitudes south of the equator.
import { assertRange, invariant } from './assert';
import { DEG2RAD, MOON_RADIUS_M, RAD2DEG } from './constants';

export interface Xy {
  xM: number;
  yM: number;
}

export interface LatLon {
  latDeg: number;
  lonDeg: number;
}

/** Projected radius of the 80 S circle: 2R * tan(5 deg) = 304.0 km. */
export const DEM_80S_RADIUS_M = 2 * MOON_RADIUS_M * Math.tan(5 * DEG2RAD);

export function southPolarForward(latDeg: number, lonDeg: number, out: Xy): Xy {
  assertRange(latDeg, -90, 0, 'latDeg');
  invariant(Number.isFinite(lonDeg), 'lonDeg must be finite');
  const rho = 2 * MOON_RADIUS_M * Math.tan((45 - Math.abs(latDeg) / 2) * DEG2RAD);
  const lon = lonDeg * DEG2RAD;
  out.xM = rho * Math.sin(lon);
  out.yM = rho * Math.cos(lon);
  return out;
}

export function southPolarInverse(xM: number, yM: number, out: LatLon): LatLon {
  invariant(Number.isFinite(xM) && Number.isFinite(yM), 'x and y must be finite');
  const rho = Math.hypot(xM, yM);
  out.latDeg = -(90 - 2 * Math.atan(rho / (2 * MOON_RADIUS_M)) * RAD2DEG);
  out.lonDeg = rho === 0 ? 0 : Math.atan2(xM, yM) * RAD2DEG;
  return out;
}
