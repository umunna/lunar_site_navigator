// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
// The sky at one moment, and the countdowns, for the selected site.
import {
  EARTH_RADIUS_KM,
  EPHEMERIS_FLOATS_PER_SAMPLE,
  SUN_RADIUS_KM,
  bodyAzEl,
  discRadiusDeg,
  makeSiteFrame,
  marginAt,
  newAzEl,
  nextCrossing,
  sampleVectors,
  skylineAt,
  visibleFraction,
} from '@lsn/shared';
import type { Crossing, Ephemeris, SiteTrack } from '@lsn/shared';

export interface BodyNow {
  readonly azDeg: number;
  readonly elDeg: number;
  readonly discRadiusDeg: number;
  /** Terrain skyline at the body's azimuth, degrees. */
  readonly skylineDeg: number;
  /** elevation + disc radius - skyline: above 0 means some part of the disc is above the skyline. */
  readonly marginDeg: number;
  /** Share of the disc above the skyline. */
  readonly fraction: number;
}

export interface SkyNow {
  readonly sun: BodyNow;
  readonly earth: BodyNow;
}

function bodyNow(frame: ReturnType<typeof makeSiteFrame>, v: Float64Array, offset: number, radiusKm: number, skyline: Float32Array): BodyNow {
  const ae = bodyAzEl(frame, v[offset] ?? 0, v[offset + 1] ?? 0, v[offset + 2] ?? 0, newAzEl());
  const r = discRadiusDeg(radiusKm, ae.rangeKm);
  const s = skylineAt(skyline, ae.azDeg);
  return { azDeg: ae.azDeg, elDeg: ae.elDeg, discRadiusDeg: r, skylineDeg: s, marginDeg: ae.elDeg + r - s, fraction: visibleFraction(ae.elDeg, r, s) };
}

/** Sun and Earth at fractional ephemeris index `idx`, from the linearly interpolated vectors. */
export function skyNow(eph: Ephemeris, latDeg: number, lonDeg: number, skyline: Float32Array, idx: number): SkyNow {
  const v = new Float64Array(EPHEMERIS_FLOATS_PER_SAMPLE);
  sampleVectors(eph, idx, v);
  const frame = makeSiteFrame(latDeg, lonDeg, 0);
  return { sun: bodyNow(frame, v, 0, SUN_RADIUS_KM, skyline), earth: bodyNow(frame, v, 3, EARTH_RADIUS_KM, skyline) };
}

export interface Countdown {
  /** 'set' while the body is up, 'rise' while it is down. */
  readonly kind: 'set' | 'rise';
  /** Null: no such event before the data ends. */
  readonly crossing: Crossing | null;
  /** Event time, Unix seconds UTC. Null if no event. */
  readonly atUnixS: number | null;
}

export interface Countdowns {
  readonly sun: Countdown;
  readonly earth: Countdown;
}

function countdown(margin: Float32Array, idx: number, t0UnixS: number, stepS: number): Countdown {
  const up = marginAt(margin, idx) > 0;
  const kind = up ? 'set' : 'rise';
  const crossing = nextCrossing(margin, idx, kind, stepS);
  return { kind, crossing, atUnixS: crossing === null ? null : t0UnixS + crossing.index * stepS };
}

/** Time to the next sunset or sunrise, and Earthset or Earthrise, from fractional index `idx`. */
export function countdowns(track: SiteTrack, idx: number, t0UnixS: number, stepS: number): Countdowns {
  return {
    sun: countdown(track.sun.marginDeg, idx, t0UnixS, stepS),
    earth: countdown(track.earth.marginDeg, idx, t0UnixS, stepS),
  };
}
