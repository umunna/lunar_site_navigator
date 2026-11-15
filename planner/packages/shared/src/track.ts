// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// Per-site Sun and Earth tracks: for every ephemeris sample, where the body is
// against the local horizon and how much of its disc is above the skyline.
// Definitions: docs/history/plan-2026-11-14.md 5.3 and 5.6. Geometry only: not power, not a link (4.2).
import { invariant } from './assert';
import { EARTH_RADIUS_KM, RAD2DEG, SKYLINE_BINS, SUN_RADIUS_KM } from './constants';
import { bodyAzEl, makeSiteFrame, newAzEl } from './geometry';
import { skylineAt, smoothSphereDipDeg } from './skyline';
import type { Ephemeris } from './ephemeris';
import { EPHEMERIS_FLOATS_PER_SAMPLE } from './ephemeris';

export interface BodyTrack {
  /** Elevation of the disc centre above the local horizontal, degrees. */
  readonly elDeg: Float32Array;
  /** Azimuth clockwise from north, degrees. */
  readonly azDeg: Float32Array;
  /**
   * g = elevation + disc radius - skyline, degrees. g > 0 means some part of the
   * disc is above the skyline. Sunset and Earthset are the moments g falls to 0.
   */
  readonly marginDeg: Float32Array;
  /** Share of the disc above the skyline, 0 to 1. */
  readonly fraction: Float32Array;
  /** Angular radius of the disc, degrees, from the sample's distance. */
  readonly discRadiusDeg: Float32Array;
}

export interface SiteTrack {
  readonly count: number;
  readonly sun: BodyTrack;
  readonly earth: BodyTrack;
}

export function discRadiusDeg(bodyRadiusKm: number, distanceKm: number): number {
  invariant(distanceKm > bodyRadiusKm, 'distance must exceed the body radius');
  return Math.asin(bodyRadiusKm / distanceKm) * RAD2DEG;
}

/**
 * Share of a disc of radius `r` (degrees), centred at elevation `el`, that lies
 * above a horizon at elevation `s`. Circular-segment area (docs/history/plan-2026-11-14.md 5.6).
 * 0.5 when the centre sits on the horizon, 1 fully above, 0 fully below.
 */
export function visibleFraction(elDeg: number, rDeg: number, skylineDeg: number): number {
  invariant(rDeg > 0, 'disc radius must be positive');
  const x = Math.max(-1, Math.min(1, (skylineDeg - elDeg) / rDeg));
  return (Math.acos(x) - x * Math.sqrt(1 - x * x)) / Math.PI;
}

function newBodyTrack(n: number): BodyTrack {
  return {
    elDeg: new Float32Array(n),
    azDeg: new Float32Array(n),
    marginDeg: new Float32Array(n),
    fraction: new Float32Array(n),
    discRadiusDeg: new Float32Array(n),
  };
}

/** A flat horizon with only the dip from the sphere and the observer height (terrain not modelled). */
export function flatSkyline(observerHeightM: number, bins: number = SKYLINE_BINS): Float32Array {
  return new Float32Array(bins).fill(smoothSphereDipDeg(observerHeightM));
}

/**
 * Compute both tracks for a site over the whole ephemeris. `skyline` is the
 * terrain skyline (degrees, `bins` samples) or a flat one. Site height is not
 * added to the observer radius: the effect is at most 0.001 degrees (5.6).
 */
export function computeSiteTrack(eph: Ephemeris, latDeg: number, lonDeg: number, skyline: Float32Array): SiteTrack {
  const n = eph.meta.count;
  const frame = makeSiteFrame(latDeg, lonDeg, 0);
  const sun = newBodyTrack(n);
  const earth = newBodyTrack(n);
  const ae = newAzEl();
  const bodies = [
    { track: sun, offset: 0, radiusKm: SUN_RADIUS_KM },
    { track: earth, offset: 3, radiusKm: EARTH_RADIUS_KM },
  ];
  for (let i = 0; i < n; i++) {
    const base = i * EPHEMERIS_FLOATS_PER_SAMPLE;
    for (const b of bodies) {
      bodyAzEl(frame, eph.vectors[base + b.offset] ?? 0, eph.vectors[base + b.offset + 1] ?? 0, eph.vectors[base + b.offset + 2] ?? 0, ae);
      const r = discRadiusDeg(b.radiusKm, ae.rangeKm);
      const s = skylineAt(skyline, ae.azDeg);
      b.track.elDeg[i] = ae.elDeg;
      b.track.azDeg[i] = ae.azDeg;
      b.track.discRadiusDeg[i] = r;
      b.track.marginDeg[i] = ae.elDeg + r - s;
      b.track.fraction[i] = visibleFraction(ae.elDeg, r, s);
    }
  }
  return { count: n, sun, earth };
}
