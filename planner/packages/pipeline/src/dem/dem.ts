// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// Tile-based reader for the LOLA south-pole DEM (GeoTIFF, float32, 512 x 512
// tiles, deflate + floating-point predictor, docs/history/plan-2026-11-14.md 5.5).
// Only the tiles a site needs are decoded and held in memory, so the same code
// serves the 80 m file (231 MB as float32) and the 20 m file (3.7 GB), where a
// whole-file read would crash Node (5.9).
import { fromFile } from 'geotiff';
import type { GeoTIFFImage } from 'geotiff';
import { DEG2RAD, DEM_80S_RADIUS_M, invariant, southPolarForward } from '@lsn/shared';
import type { TerrainSampler, Xy } from '@lsn/shared';

export interface DemInfo {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly tileWidthPx: number;
  readonly tileHeightPx: number;
  /** Projected x of the top-left corner of the top-left pixel, metres. */
  readonly originXM: number;
  /** Projected y of the top-left corner of the top-left pixel, metres. */
  readonly originYM: number;
  /** Pixel size, metres (positive). */
  readonly pixelM: number;
  /** GTRasterTypeGeoKey: 1 = PixelIsArea, 2 = PixelIsPoint. */
  readonly rasterType: number;
}

/** Axis-aligned window in projected metres. */
export interface WindowM {
  readonly xMinM: number;
  readonly xMaxM: number;
  readonly yMinM: number;
  readonly yMaxM: number;
}

export class Dem {
  public readonly info: DemInfo;
  private readonly image: GeoTIFFImage;
  private readonly tilesX: number;
  private readonly tilesY: number;
  private readonly tiles: (Float32Array | undefined)[];
  /** Half a pixel for PixelIsArea (centres sit 0.5 px inside the corner), 0 for PixelIsPoint. */
  private readonly centreOffsetPx: number;

  private constructor(image: GeoTIFFImage, info: DemInfo) {
    this.image = image;
    this.info = info;
    this.tilesX = Math.ceil(info.widthPx / info.tileWidthPx);
    this.tilesY = Math.ceil(info.heightPx / info.tileHeightPx);
    this.tiles = new Array<Float32Array | undefined>(this.tilesX * this.tilesY).fill(undefined);
    this.centreOffsetPx = info.rasterType === 2 ? 0 : 0.5;
  }

  public static async open(path: string): Promise<Dem> {
    const tiff = await fromFile(path);
    const image = await tiff.getImage();
    const origin = image.getOrigin();
    const res = image.getResolution();
    const keys = image.getGeoKeys() as Record<string, unknown> | null;
    const sampleFormat = image.getSampleFormat(0);
    invariant(image.getSamplesPerPixel() === 1, 'DEM must have exactly one band');
    invariant(sampleFormat === 3 && image.getBitsPerSample(0) === 32, 'DEM must be float32');
    const info: DemInfo = {
      widthPx: image.getWidth(),
      heightPx: image.getHeight(),
      tileWidthPx: image.getTileWidth(),
      tileHeightPx: image.getTileHeight(),
      originXM: origin[0] ?? Number.NaN,
      originYM: origin[1] ?? Number.NaN,
      pixelM: Math.abs(res[0] ?? Number.NaN),
      rasterType: typeof keys?.GTRasterTypeGeoKey === 'number' ? keys.GTRasterTypeGeoKey : 1,
    };
    invariant(Number.isFinite(info.originXM) && Number.isFinite(info.originYM), 'DEM has no origin');
    invariant(Number.isFinite(info.pixelM) && info.pixelM > 0, 'DEM has no pixel size');
    invariant(Math.abs(Math.abs(res[1] ?? 0) - info.pixelM) < 1e-9, 'DEM pixels must be square');
    return new Dem(image, info);
  }

  /** Number of tiles currently held in memory. */
  public get loadedTiles(): number {
    return this.tiles.reduce((n, t) => (t === undefined ? n : n + 1), 0);
  }

  /** Decode every tile that intersects the window. Idempotent. */
  public async loadWindow(w: WindowM): Promise<void> {
    const { originXM, originYM, pixelM, tileWidthPx, tileHeightPx, widthPx, heightPx } = this.info;
    const colMin = Math.max(0, Math.floor((w.xMinM - originXM) / pixelM));
    const colMax = Math.min(widthPx - 1, Math.floor((w.xMaxM - originXM) / pixelM));
    const rowMin = Math.max(0, Math.floor((originYM - w.yMaxM) / pixelM));
    const rowMax = Math.min(heightPx - 1, Math.floor((originYM - w.yMinM) / pixelM));
    for (let ty = Math.floor(rowMin / tileHeightPx); ty <= Math.floor(rowMax / tileHeightPx); ty++) {
      for (let tx = Math.floor(colMin / tileWidthPx); tx <= Math.floor(colMax / tileWidthPx); tx++) {
        await this.loadTile(tx, ty);
      }
    }
  }

  private async loadTile(tx: number, ty: number): Promise<void> {
    const idx = ty * this.tilesX + tx;
    invariant(tx >= 0 && ty >= 0 && tx < this.tilesX && ty < this.tilesY, 'tile index out of range');
    if (this.tiles[idx] !== undefined) {
      return;
    }
    const x0 = tx * this.info.tileWidthPx;
    const y0 = ty * this.info.tileHeightPx;
    const x1 = Math.min(x0 + this.info.tileWidthPx, this.info.widthPx);
    const y1 = Math.min(y0 + this.info.tileHeightPx, this.info.heightPx);
    const bands = (await this.image.readRasters({ window: [x0, y0, x1, y1], samples: [0] })) as unknown as Float32Array[];
    const data = bands[0];
    invariant(data instanceof Float32Array && data.length === (x1 - x0) * (y1 - y0), 'unexpected tile data');
    this.tiles[idx] = data;
  }

  /** Raw pixel value, NaN if the pixel is outside the image or its tile is not loaded. */
  public pixel(col: number, row: number): number {
    const { widthPx, heightPx, tileWidthPx, tileHeightPx } = this.info;
    if (col < 0 || row < 0 || col >= widthPx || row >= heightPx) {
      return Number.NaN;
    }
    const tx = Math.floor(col / tileWidthPx);
    const ty = Math.floor(row / tileHeightPx);
    const tile = this.tiles[ty * this.tilesX + tx];
    if (tile === undefined) {
      return Number.NaN;
    }
    const tileW = Math.min(tileWidthPx, widthPx - tx * tileWidthPx);
    return tile[(row - ty * tileHeightPx) * tileW + (col - tx * tileWidthPx)] ?? Number.NaN;
  }

  /** Bilinear height at projected (x, y) metres. NaN outside the loaded data. */
  public heightXyM(xM: number, yM: number): number {
    const fx = (xM - this.info.originXM) / this.info.pixelM - this.centreOffsetPx;
    const fy = (this.info.originYM - yM) / this.info.pixelM - this.centreOffsetPx;
    const c0 = Math.floor(fx);
    const r0 = Math.floor(fy);
    const tx = fx - c0;
    const ty = fy - r0;
    const h00 = this.pixel(c0, r0);
    // Read a neighbour only when it has weight: NaN * 0 is NaN, which would blank the last row and column of the image.
    const h10 = tx === 0 ? h00 : this.pixel(c0 + 1, r0);
    const h01 = ty === 0 ? h00 : this.pixel(c0, r0 + 1);
    const h11 = tx === 0 ? h01 : ty === 0 ? h10 : this.pixel(c0 + 1, r0 + 1);
    return (h00 * (1 - tx) + h10 * tx) * (1 - ty) + (h01 * (1 - tx) + h11 * tx) * ty;
  }

  /** Highest value among loaded tiles, ignoring NaN. Valid bound for rays that only read loaded tiles. */
  public maxLoadedHeightM(): number {
    let max = -Infinity;
    for (const tile of this.tiles) {
      if (tile === undefined) {
        continue;
      }
      for (let i = 0; i < tile.length; i++) {
        const v = tile[i] ?? Number.NaN;
        if (v > max) {
          max = v;
        }
      }
    }
    return max;
  }

  /**
   * Radius of the usable circle, metres: the 80 S circle, or the half-width of the
   * file if smaller. The square's corners hold values but lie outside 80 to 90 S, so
   * they are not used (docs/history/plan-2026-11-14.md 5.5, "Extent").
   */
  public get usableRadiusM(): number {
    const halfExtent = (Math.min(this.info.widthPx, this.info.heightPx) * this.info.pixelM) / 2;
    return Math.min(DEM_80S_RADIUS_M, halfExtent);
  }

  /** Terrain sampler over latitude and longitude in radians (south polar cap inside the usable circle; NaN elsewhere). */
  public sampler(): TerrainSampler {
    const xy: Xy = { xM: 0, yM: 0 };
    const usable = this.usableRadiusM;
    return {
      heightM: (latRad: number, lonRad: number): number => {
        if (latRad > 0) {
          return Number.NaN;
        }
        southPolarForward(latRad / DEG2RAD, lonRad / DEG2RAD, xy);
        return Math.hypot(xy.xM, xy.yM) > usable ? Number.NaN : this.heightXyM(xy.xM, xy.yM);
      },
    };
  }
}
