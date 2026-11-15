// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { describe, expect, it } from 'vitest';
import {
  EXAGGERATION,
  sceneView,
  azToX,
  discMark,
  elToY,
  makeView,
  niceStep,
  skylinePaths,
  trailPaths,
} from '../src/lib/panorama';

describe('panorama geometry [LSN-UI-002]', () => {
  const view = makeView(1080, 280, 10, 0);

  it('azimuth maps linearly across the width and elevation up the height', () => {
    expect(azToX(0, view)).toBe(0);
    expect(azToX(90, view)).toBe(270);
    expect(azToX(360, view)).toBe(1080);
    expect(elToY(0, view)).toBe(140);
    expect(elToY(1, view)).toBeLessThan(elToY(0, view));
    expect(elToY(1, view) - elToY(0, view)).toBeCloseTo(-view.pxPerDegY, 9);
  });

  it('the height scale is the stretch times the true sideways scale', () => {
    expect(view.pxPerDegY).toBeCloseTo(view.exaggeration * view.pxPerDegX, 12);
    expect(() => makeView(0, 280, 8, 0)).toThrow();
  });

  it('the fixed view of a place has stretch 8 and puts the lowest ground just above the bottom edge', () => {
    const sky = Float32Array.from([-3, 0.2, 1.6, 9]);
    const v = sceneView(1080, 320, sky);
    expect(v.exaggeration).toBe(EXAGGERATION);
    expect(EXAGGERATION).toBe(8);
    expect(elToY(-3, v)).toBeCloseTo(320 - 0.5 * v.pxPerDegY, 9);
    // Ground that is all above level still shows the level line.
    expect(elToY(0, sceneView(1080, 320, Float32Array.from([0.4, 0.8])))).toBeLessThan(320);
  });

  it('the Sun and Earth marks are round, of a fixed size, with the centre at the true direction and height', () => {
    const sun = discMark(180, 0.5, 'sun', view);
    expect(sun.cx).toBe(540);
    expect(sun.cy).toBe(elToY(0.5, view));
    expect(sun.rPx).toBe(8);
    expect(discMark(180, 0.5, 'earth', view).rPx).toBe(12);
  });

  it('skyline paths close the loop at 360 degrees and the ground path closes to the bottom', () => {
    const sky = new Float32Array(720).fill(0.5);
    const p = skylinePaths(sky, view);
    expect(p.line.split(' L')).toHaveLength(721);
    expect(p.line.startsWith('M0.0 ')).toBe(true);
    expect(p.line.endsWith(`${(1080).toFixed(1)} ${elToY(0.5, view).toFixed(1)}`)).toBe(true);
    expect(p.ground.endsWith('Z')).toBe(true);
    expect(p.line).not.toContain('NaN');
  });

  it('trail paths are cut where azimuth wraps from 359 to 1 degrees', () => {
    const pts = [358, 359, 1, 2].map((azDeg) => ({ azDeg, elDeg: 0 }));
    const paths = trailPaths(pts, view);
    expect(paths).toHaveLength(2);
    expect(trailPaths([{ azDeg: 10, elDeg: 0 }], view)).toEqual([]);
  });

  it('niceStep picks a tidy grid spacing', () => {
    expect(niceStep(4.6)).toBe(1);
    expect(niceStep(0.7)).toBe(0.2);
    expect(niceStep(60)).toBe(20);
  });
});
