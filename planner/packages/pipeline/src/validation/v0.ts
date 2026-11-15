// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// V0 (docs/history/plan-2026-11-14.md 5.7): DEM orientation. Known crater centres from
// the IAU Gazetteer must sit on depressions and the Mons Malapert massif on a
// high, under exactly one of the 8 axis conventions.
import { DEG2RAD, MOON_RADIUS_M, invariant } from '@lsn/shared';

/** Height in metres at projected (x, y) metres, NaN outside the data. */
export type HeightFn = (xM: number, yM: number) => number;

export interface Convention {
  readonly label: string;
  /** Projected position for projected radius rho (m) and east longitude lon (rad). */
  readonly xy: (rhoM: number, lonRad: number) => readonly [number, number];
}

/** The 8 ways to place (rho, lon) on the x, y axes: swap or not, and the two signs. */
export const CONVENTIONS: readonly Convention[] = [
  { label: 'x = rho sin(lon), y = rho cos(lon)  [ours]', xy: (r, l) => [r * Math.sin(l), r * Math.cos(l)] },
  { label: 'x = rho sin(lon), y = -rho cos(lon)', xy: (r, l) => [r * Math.sin(l), -r * Math.cos(l)] },
  { label: 'x = -rho sin(lon), y = rho cos(lon)', xy: (r, l) => [-r * Math.sin(l), r * Math.cos(l)] },
  { label: 'x = -rho sin(lon), y = -rho cos(lon)', xy: (r, l) => [-r * Math.sin(l), -r * Math.cos(l)] },
  { label: 'x = rho cos(lon), y = rho sin(lon)', xy: (r, l) => [r * Math.cos(l), r * Math.sin(l)] },
  { label: 'x = rho cos(lon), y = -rho sin(lon)', xy: (r, l) => [r * Math.cos(l), -r * Math.sin(l)] },
  { label: 'x = -rho cos(lon), y = rho sin(lon)', xy: (r, l) => [-r * Math.cos(l), r * Math.sin(l)] },
  { label: 'x = -rho cos(lon), y = -rho sin(lon)', xy: (r, l) => [-r * Math.cos(l), -r * Math.sin(l)] },
];

export const OURS_INDEX = 0;

export interface V0Target {
  readonly gazetteerId: number;
  readonly name: string;
  readonly kind: 'depression' | 'high';
  readonly latDeg: number;
  readonly lonDeg: number;
  readonly diameterKm: number;
}

/**
 * Criterion history, kept in the report on purpose.
 * First run (set before looking at any result): depression >= 1.0 km, high >= 0.5 km. Result: 0 of 8 fit,
 * because de Gerlache gave +0.80 km under the correct convention.
 * Revised (after seeing the numbers, so post hoc): one threshold of 0.5 km for every feature.
 */
export const FIRST_RUN_DEPRESSION_KM = 1.0;
export const FIRST_RUN_HIGH_KM = 0.5;
export const MIN_CONTRAST_KM = 0.5;

/** Sampling step along the polar grid (m): 4 pixels of the 80 m file. */
const SAMPLE_STEP_M = 320;
const DISC_FRACTION = 0.4;
const RING_INNER = 1.3;
const RING_OUTER = 1.8;

export interface MeanResult {
  readonly mean: number;
  readonly validFraction: number;
}

/** Mean height over the annulus [rInnerM, rOuterM] around (x0, y0) in projected metres. */
export function annulusMean(height: HeightFn, x0: number, y0: number, rInnerM: number, rOuterM: number): MeanResult {
  invariant(rOuterM > rInnerM && rInnerM >= 0, 'bad annulus');
  let sum = 0;
  let valid = 0;
  let total = 0;
  const rings = Math.ceil(rOuterM / SAMPLE_STEP_M);
  for (let i = 0; i <= rings; i++) {
    const r = i * SAMPLE_STEP_M;
    if (r < rInnerM || r > rOuterM) {
      continue;
    }
    const n = r === 0 ? 1 : Math.max(8, Math.ceil((2 * Math.PI * r) / SAMPLE_STEP_M));
    for (let k = 0; k < n; k++) {
      const a = (2 * Math.PI * k) / n;
      const h = height(x0 + r * Math.cos(a), y0 + r * Math.sin(a));
      total += 1;
      if (Number.isFinite(h)) {
        sum += h;
        valid += 1;
      }
    }
  }
  return { mean: valid === 0 ? Number.NaN : sum / valid, validFraction: total === 0 ? 0 : valid / total };
}

/**
 * Contrast in km, signed so that positive means "as expected": ring mean minus
 * disc mean for a depression, disc mean minus ring mean for a high.
 * Null if too much of the area lies outside the data (a wrong convention can throw a feature off the DEM).
 */
export function contrastKm(height: HeightFn, conv: Convention, target: V0Target): number | null {
  const rho = 2 * MOON_RADIUS_M * Math.tan((45 - Math.abs(target.latDeg) / 2) * DEG2RAD);
  const [x0, y0] = conv.xy(rho, target.lonDeg * DEG2RAD);
  const radiusM = (target.diameterKm * 1000) / 2;
  const disc = annulusMean(height, x0, y0, 0, DISC_FRACTION * radiusM);
  const ring = annulusMean(height, x0, y0, RING_INNER * radiusM, RING_OUTER * radiusM);
  if (disc.validFraction < 0.9 || ring.validFraction < 0.9) {
    return null;
  }
  const diffM = target.kind === 'depression' ? ring.mean - disc.mean : disc.mean - ring.mean;
  return diffM / 1000;
}

/** Smallest contrast over all features. Off-DEM (null) counts as -Infinity. */
export function minContrast(contrasts: readonly (number | null)[]): number {
  let min = Infinity;
  for (const c of contrasts) {
    min = Math.min(min, c ?? -Infinity);
  }
  return min;
}

/** Every feature at or above `thresholdKm`. */
export function fits(contrasts: readonly (number | null)[], thresholdKm: number): boolean {
  return contrasts.length > 0 && minContrast(contrasts) >= thresholdKm;
}

/**
 * Range of thresholds T (km) for which exactly one convention, `oursIndex`, has every contrast >= T:
 * (largest minimum among the others, ours' minimum]. Null if there is none.
 */
export function uniqueThresholdRange(minContrasts: readonly number[], oursIndex: number): { lowExclusive: number; highInclusive: number } | null {
  const ours = minContrasts[oursIndex];
  invariant(ours !== undefined, 'oursIndex out of range');
  let others = -Infinity;
  minContrasts.forEach((m, i) => {
    if (i !== oursIndex) {
      others = Math.max(others, m);
    }
  });
  return ours > others ? { lowExclusive: others, highInclusive: ours } : null;
}
