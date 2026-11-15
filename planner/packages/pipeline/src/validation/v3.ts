// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// V3: sunlight at three catalog places compared with NASA's published light map.
//
// The map is AVGVISIB_85S_060M_201608 (NASA LOLA team, PGDA product 69, Mazarico et al. 2011).
// Its label says: each value is the share of hourly time steps, over about 18.6 years, in which
// the pixel was sunlit "by any fraction of the solar disc". That is the same rule as our
// "Sun in view" share. The two numbers still cannot match exactly:
//   - we use 3 years at 10-minute steps, the map uses about 18.6 years at 1-hour steps;
//   - our height map has 80 m points, the map was made from a 60 m height map;
//   - our observer is 2 m above the ground.
// So the check reports the difference and passes when it is inside a stated tolerance.
import { invariant, southPolarForward } from '@lsn/shared';

/** The three places: the default set of the Compare places page. All are inside the map (85 to 90 S). */
export const V3_SITE_IDS: readonly string[] = ['shackleton-high', 'haworth-high', 'mons-malapert-high'];

/** Largest allowed gap, in percentage points, between our share and the NASA values around the place. [design], set before the first run. */
export const V3_TOLERANCE_POINTS = 15;

/** Pixels on each side of the nearest pixel that are read. 1 gives a 3 x 3 block (180 m), which covers one 80 m point of our height map. */
export const V3_HALF_WINDOW_PX = 1;

/** Label value SCALING_FACTOR: map value = DN x 0.00004, from 0 (never sunlit) to 1. */
export const NASA_LIGHT_MAP_SCALE = 0.00004;

export interface LightMapGrid {
  readonly widthPx: number;
  readonly heightPx: number;
  /** Projected x and y of the top-left corner of the top-left pixel, metres. */
  readonly originXM: number;
  readonly originYM: number;
  /** Pixel size, metres. */
  readonly pixelM: number;
}

/** Column and row of the pixel that holds a point. The map uses the same south polar projection as the height map. */
export function lightMapPixel(grid: LightMapGrid, latDeg: number, lonDeg: number): { col: number; row: number } {
  const xy = southPolarForward(latDeg, lonDeg, { xM: 0, yM: 0 });
  const col = Math.floor((xy.xM - grid.originXM) / grid.pixelM);
  const row = Math.floor((grid.originYM - xy.yM) / grid.pixelM);
  invariant(col >= 0 && col < grid.widthPx && row >= 0 && row < grid.heightPx, 'the point is outside the light map');
  return { col, row };
}

export interface V3Row {
  readonly name: string;
  readonly latDeg: number;
  readonly lonDeg: number;
  /** Our share of time with any part of the Sun in view, percent, over the 3 years of the app's data. */
  readonly ourPercent: number;
  /** NASA map value at the nearest pixel, percent. */
  readonly nasaPercent: number;
  /** Lowest and highest NASA value in the block around the nearest pixel, percent. */
  readonly nasaMinPercent: number;
  readonly nasaMaxPercent: number;
}

/** NASA values of a block of raw numbers (DN), in percent: nearest pixel, lowest and highest. */
export function nasaPercents(dn: readonly number[], centreIndex: number): { nearest: number; min: number; max: number } {
  invariant(dn.length > 0 && centreIndex >= 0 && centreIndex < dn.length, 'empty block or centre outside it');
  const pct = dn.map((v) => {
    invariant(Number.isFinite(v) && v >= 0 && v * NASA_LIGHT_MAP_SCALE <= 1 + 1e-9, 'light-map value outside 0 to 1');
    return 100 * v * NASA_LIGHT_MAP_SCALE;
  });
  return { nearest: pct[centreIndex] ?? 0, min: Math.min(...pct), max: Math.max(...pct) };
}

/** How far our share is from the range of NASA values around the place, percentage points. 0 when it is inside the range. */
export function gapPoints(row: V3Row): number {
  if (row.ourPercent < row.nasaMinPercent) return row.nasaMinPercent - row.ourPercent;
  if (row.ourPercent > row.nasaMaxPercent) return row.ourPercent - row.nasaMaxPercent;
  return 0;
}

export function v3Passes(rows: readonly V3Row[]): boolean {
  return rows.length > 0 && rows.every((r) => gapPoints(r) <= V3_TOLERANCE_POINTS);
}

export function v3TableLines(rows: readonly V3Row[]): string[] {
  return [
    '| Place | Latitude | East longitude | Ours, 3 years (%) | NASA, nearest pixel (%) | NASA, lowest to highest nearby (%) | Gap (points) |',
    '|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.name} | ${String(r.latDeg)} | ${String(r.lonDeg)} | ${r.ourPercent.toFixed(1)} | ${r.nasaPercent.toFixed(1)} | ${r.nasaMinPercent.toFixed(1)} to ${r.nasaMaxPercent.toFixed(1)} | ${gapPoints(r).toFixed(1)} |`),
  ];
}
