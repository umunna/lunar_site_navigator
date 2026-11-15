// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// Units convention (applies to the whole repo): every numeric name carries its
// unit as a suffix. _km, _m, _s, _deg, _rad. Angles are degrees at module
// boundaries and radians only inside a function body. See docs/STANDARDS.md.

/** Lunar reference sphere radius (same as the DEM's CRS, docs/history/plan-2026-11-14.md 5.3). [tested] */
export const MOON_RADIUS_KM = 1737.4;
export const MOON_RADIUS_M = MOON_RADIUS_KM * 1000;

/** IAU nominal solar radius. [design] per 5.3 */
export const SUN_RADIUS_KM = 695_700;

/** Earth mean radius used for the Earth disc size. [design] per 5.3 */
export const EARTH_RADIUS_KM = 6371;

/** Ephemeris sampling: one sample every 600 s from t0. [design] */
export const EPHEMERIS_STEP_S = 600;

/** First sample, UTC: 2026-11-01T00:00:00Z. */
export const EPHEMERIS_T0_UNIX_S = Date.UTC(2026, 10, 1) / 1000;

/** Span: 3 years from t0 = 2026-11-01 to 2029-11-01 exclusive (365 + 366 + 365 days). */
export const EPHEMERIS_SPAN_DAYS = 1096;
export const SECONDS_PER_DAY = 86_400;
export const EPHEMERIS_SAMPLES_PER_DAY = SECONDS_PER_DAY / EPHEMERIS_STEP_S;
export const EPHEMERIS_COUNT = EPHEMERIS_SPAN_DAYS * EPHEMERIS_SAMPLES_PER_DAY;

/** Lunar day, about 29.5 Earth days. [✔] Space.com, section 12 */
export const LUNAR_DAY_DAYS = 29.5;

/** Skyline resolution: 720 bins of 0.5 degrees. Sample j sits at azimuth j * 0.5. [design] */
export const SKYLINE_BINS = 720;

/** Default observer height above the DEM surface. [design] */
export const DEFAULT_OBSERVER_HEIGHT_M = 2;

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
