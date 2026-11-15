// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// The tile-based DEM reader on a small synthetic GeoTIFF (16 x 16 float32, 80 m pixels,
// pixel value = 100 * row + col), so the geometry is checked without the 189 MB file.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeArrayBuffer } from 'geotiff';
import { beforeAll, describe, expect, it } from 'vitest';
import { Dem } from '../src/dem/dem';

const N = 16;
const PIXEL = 80;
const ORIGIN_X = -640;
const ORIGIN_Y = 640;
let dem: Dem;

const centreX = (col: number): number => ORIGIN_X + (col + 0.5) * PIXEL;
const centreY = (row: number): number => ORIGIN_Y - (row + 0.5) * PIXEL;

beforeAll(async () => {
  const values = new Float32Array(N * N);
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) values[row * N + col] = 100 * row + col;
  }
  const bytes = writeArrayBuffer(values, {
    width: N,
    height: N,
    ModelPixelScale: [PIXEL, PIXEL, 0],
    ModelTiepoint: [0, 0, 0, ORIGIN_X, ORIGIN_Y, 0],
    // A projected, user-defined system. Without a projection key the writer assumes a whole-globe WGS 84 raster
    // and overwrites the tiepoint.
    GTModelTypeGeoKey: 1,
    ProjectedCSTypeGeoKey: 32767,
    GTRasterTypeGeoKey: 1,
  });
  const path = join(mkdtempSync(join(tmpdir(), 'lsn-dem-')), 'synthetic.tif');
  writeFileSync(path, new Uint8Array(bytes));
  dem = await Dem.open(path);
});

describe('DEM tile reader [LSN-DEM-004]', () => {
  it('reads size, origin, pixel size and raster type from the file', () => {
    expect(dem.info.widthPx).toBe(N);
    expect(dem.info.heightPx).toBe(N);
    expect(dem.info.pixelM).toBe(PIXEL);
    expect(dem.info.originXM).toBe(ORIGIN_X);
    expect(dem.info.originYM).toBe(ORIGIN_Y);
    expect(dem.info.rasterType).toBe(1);
  });

  it('has no data until the tiles around a place are loaded, then decodes them', async () => {
    expect(dem.heightXyM(centreX(3), centreY(5))).toBeNaN();
    expect(dem.loadedTiles).toBe(0);
    await dem.loadWindow({ xMinM: -640, xMaxM: 640, yMinM: -640, yMaxM: 640 });
    expect(dem.loadedTiles).toBeGreaterThanOrEqual(1);
    await dem.loadWindow({ xMinM: -640, xMaxM: 640, yMinM: -640, yMaxM: 640 });
  });

  it('returns the pixel value at a pixel centre: x grows east, row 0 is the top (north)', () => {
    expect(dem.heightXyM(centreX(3), centreY(5))).toBe(503);
    expect(dem.heightXyM(centreX(0), centreY(0))).toBe(0);
    expect(dem.heightXyM(centreX(15), centreY(15))).toBe(1515);
    expect(dem.heightXyM(centreX(15), centreY(0))).toBe(15);
  });

  it('interpolates bilinearly between pixel centres', () => {
    expect(dem.heightXyM(centreX(3) + PIXEL / 2, centreY(5))).toBeCloseTo(503.5, 9);
    expect(dem.heightXyM(centreX(3), centreY(5) - PIXEL / 2)).toBeCloseTo(553, 9);
    expect(dem.heightXyM(centreX(3) + PIXEL / 2, centreY(5) - PIXEL / 2)).toBeCloseTo(553.5, 9);
    expect(dem.heightXyM(centreX(3) + PIXEL / 4, centreY(5))).toBeCloseTo(503.25, 9);
  });

  it('gives NaN outside the image, including the half pixel at its edge that has no neighbour', () => {
    expect(dem.heightXyM(ORIGIN_X - 1, 0)).toBeNaN();
    expect(dem.heightXyM(0, ORIGIN_Y + 1)).toBeNaN();
    expect(dem.heightXyM(ORIGIN_X + N * PIXEL - 1, 0)).toBeNaN();
    expect(dem.heightXyM(0, ORIGIN_Y - N * PIXEL + 1)).toBeNaN();
  });

  it('knows its highest loaded value and its usable radius (the smaller of the 80 S circle and the file)', () => {
    expect(dem.maxLoadedHeightM()).toBe(1515);
    expect(dem.usableRadiusM).toBe(640);
  });

  it('the lat/lon sampler maps through the polar projection and refuses what is outside the usable circle', () => {
    const sampler = dem.sampler();
    const deg = Math.PI / 180;
    const near = sampler.heightM(-89.9985 * deg, 0);
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(1515);
    expect(sampler.heightM(-89.9 * deg, 0)).toBeNaN();
    expect(sampler.heightM(10 * deg, 0)).toBeNaN();
  });
});
