// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
// Geometry of the panorama: azimuth 0 to 360 left to right, elevation up.
// Horizontal scale is true (degrees of azimuth). The vertical scale is exaggerated by
// `k` because at the poles everything lies within a few degrees of the horizon.
import { invariant, skylineAt } from '@lsn/shared';

/** The height is always stretched by this factor. [design] */
export const EXAGGERATION = 8;
/** The bottom edge of the picture is this far below the lowest ground, degrees. */
const BOTTOM_MARGIN_DEG = 0.5;

export interface PanoramaView {
  readonly widthPx: number;
  readonly heightPx: number;
  /** Pixels per degree of azimuth (true scale). */
  readonly pxPerDegX: number;
  /** Pixels per degree of elevation: exaggeration * pxPerDegX. */
  readonly pxPerDegY: number;
  readonly exaggeration: number;
  /** Elevation shown at the vertical centre of the panorama, degrees. */
  readonly centerElDeg: number;
}

export function makeView(widthPx: number, heightPx: number, exaggeration: number, centerElDeg: number): PanoramaView {
  invariant(widthPx > 0 && heightPx > 0 && exaggeration > 0, 'view size and stretch must be positive');
  const pxPerDegX = widthPx / 360;
  return { widthPx, heightPx, pxPerDegX, pxPerDegY: exaggeration * pxPerDegX, exaggeration, centerElDeg };
}

/**
 * The fixed view of a place: stretch 8, with the lowest ground just above the bottom edge.
 * A very high hill can go past the top edge. The Sun and Earth stay near the horizon, so they fit.
 */
export function sceneView(widthPx: number, heightPx: number, skyline: Float32Array): PanoramaView {
  let lowest = 0;
  for (const v of skyline) {
    lowest = Math.min(lowest, v);
  }
  const spanDeg = heightPx / (EXAGGERATION * (widthPx / 360));
  return makeView(widthPx, heightPx, EXAGGERATION, lowest - BOTTOM_MARGIN_DEG + spanDeg / 2);
}

/** Elevation span (degrees) visible in the view. */
export function visibleSpanDeg(view: PanoramaView): number {
  return view.heightPx / view.pxPerDegY;
}

export function azToX(azDeg: number, view: PanoramaView): number {
  return (azDeg / 360) * view.widthPx;
}

/** Pixel row (from the top) of an elevation. */
export function elToY(elDeg: number, view: PanoramaView): number {
  return view.heightPx / 2 - (elDeg - view.centerElDeg) * view.pxPerDegY;
}

export interface SkylinePaths {
  /** Open path along the skyline. */
  readonly line: string;
  /** Closed path: the skyline and the bottom of the view, i.e. the ground. */
  readonly ground: string;
}

/** SVG paths for the terrain silhouette: bins + 1 points so 360 degrees meets 0. */
export function skylinePaths(skyline: Float32Array, view: PanoramaView): SkylinePaths {
  const bins = skyline.length;
  invariant(bins >= 4, 'skyline too short');
  const pts: string[] = [];
  for (let j = 0; j <= bins; j++) {
    const az = (j * 360) / bins;
    pts.push(`${azToX(az, view).toFixed(1)} ${elToY(skylineAt(skyline, az), view).toFixed(1)}`);
  }
  const line = `M${pts.join(' L')}`;
  const bottom = view.heightPx + 2;
  return { line, ground: `${line} L${view.widthPx.toFixed(1)} ${bottom.toFixed(1)} L0 ${bottom.toFixed(1)} Z` };
}

/** Radius of the Sun and Earth marks on the screen, pixels. */
export const DISC_RADIUS_PX = { sun: 8, earth: 12 } as const;

export interface DiscMark {
  readonly cx: number;
  readonly cy: number;
  readonly rPx: number;
}

/**
 * Where to draw the Sun or the Earth. The centre is at the true direction and height.
 * The mark is a round disc of a fixed size: the real discs are too small to see at this
 * scale, and a disc drawn to the stretched height scale would be a tall oval.
 */
export function discMark(azDeg: number, elDeg: number, kind: keyof typeof DISC_RADIUS_PX, view: PanoramaView): DiscMark {
  return { cx: azToX(azDeg, view), cy: elToY(elDeg, view), rPx: DISC_RADIUS_PX[kind] };
}

export interface SkyPoint {
  readonly azDeg: number;
  readonly elDeg: number;
}

/**
 * SVG path pieces for a track across the panorama. The track is cut wherever it
 * wraps from 360 back to 0 degrees of azimuth, so no line runs across the whole picture.
 */
export function trailPaths(points: readonly SkyPoint[], view: PanoramaView): string[] {
  const paths: string[] = [];
  let current: string[] = [];
  let prevAz = Number.NaN;
  for (const p of points) {
    if (!Number.isNaN(prevAz) && Math.abs(p.azDeg - prevAz) > 180) {
      if (current.length > 1) paths.push(`M${current.join(' L')}`);
      current = [];
    }
    current.push(`${azToX(p.azDeg, view).toFixed(1)} ${elToY(p.elDeg, view).toFixed(1)}`);
    prevAz = p.azDeg;
  }
  if (current.length > 1) paths.push(`M${current.join(' L')}`);
  return paths;
}

/** A tidy grid step (degrees) giving roughly `target` lines over `spanDeg`. */
export function niceStep(spanDeg: number, target = 5): number {
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 30];
  const wanted = spanDeg / target;
  return steps.find((s) => s >= wanted) ?? 30;
}
