// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// A small picture of the Moon as we see it from Earth, with a dot at the place.
// It gives a rough idea of where the place is. It is not a map to measure from.
import type { ReactElement } from 'react';
import { DEG2RAD, MOON_RADIUS_M } from '@lsn/shared';

const SIZE = 84;
const R = 34;

/** Position of a point on the disc of the Moon as seen from Earth (x to the right, y down), and if it is on the far side. */
export function discPoint(latDeg: number, lonDeg: number): { x: number; y: number; farSide: boolean } {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  return { x: Math.cos(lat) * Math.sin(lon), y: -Math.sin(lat), farSide: Math.cos(lat) * Math.cos(lon) < 0 };
}

/** One plain sentence that says where the place is on the Moon. */
export function whereOnMoon(latDeg: number, lonDeg: number): string {
  const kmFromPole = ((90 - Math.abs(latDeg)) * DEG2RAD * MOON_RADIUS_M) / 1000;
  if (kmFromPole <= 400) {
    return `About ${String(Math.round(kmFromPole))} km from the Moon’s ${latDeg < 0 ? 'south' : 'north'} pole, at the ${latDeg < 0 ? 'bottom' : 'top'} of the Moon as we see it from Earth.`;
  }
  const side = discPoint(latDeg, lonDeg).farSide ? 'On the far side of the Moon, which we never see from Earth' : 'On the side of the Moon that faces Earth';
  const band = Math.abs(latDeg) < 30 ? 'near its equator' : latDeg < 0 ? 'in its southern half' : 'in its northern half';
  return `${side}, ${band}.`;
}

export function MoonLocator({ latDeg, lonDeg }: { latDeg: number; lonDeg: number }): ReactElement {
  const p = discPoint(latDeg, lonDeg);
  const c = SIZE / 2;
  return (
    <svg className="locator" width={SIZE} height={SIZE} viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`} role="img" aria-label={whereOnMoon(latDeg, lonDeg)}>
      <circle className="locator-moon" cx={c} cy={c} r={R} />
      <line className="locator-equator" x1={c - R} x2={c + R} y1={c} y2={c} />
      <text className="locator-label" x={c} y={7} textAnchor="middle">N</text>
      <text className="locator-label" x={c} y={SIZE - 1} textAnchor="middle">S</text>
      <circle className={p.farSide ? 'locator-dot locator-dot-far' : 'locator-dot'} cx={c + p.x * R} cy={c + p.y * R} r={4.5} />
    </svg>
  );
}
