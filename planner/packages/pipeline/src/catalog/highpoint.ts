// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { invariant } from '@lsn/shared';
import type { HeightFn } from '../validation/v0';

export interface HighPoint {
  readonly xM: number;
  readonly yM: number;
  readonly heightM: number;
}

/**
 * Highest sample of `height` on a square grid of spacing `stepM` inside the
 * annulus [rInnerM, rOuterM] around (x0, y0), projected metres. Scan order is
 * fixed (x ascending, then y ascending) and ties keep the first sample, so the
 * result is reproducible. Null if no finite sample lies in the annulus.
 */
export function findHighPoint(height: HeightFn, x0: number, y0: number, rInnerM: number, rOuterM: number, stepM: number): HighPoint | null {
  invariant(rOuterM > rInnerM && rInnerM >= 0 && stepM > 0, 'bad annulus or step');
  const n = Math.ceil(rOuterM / stepM);
  let best: HighPoint | null = null;
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const dx = i * stepM;
      const dy = j * stepM;
      const r = Math.hypot(dx, dy);
      if (r < rInnerM || r > rOuterM) {
        continue;
      }
      const h = height(x0 + dx, y0 + dy);
      if (Number.isFinite(h) && (best === null || h > best.heightM)) {
        best = { xM: x0 + dx, yM: y0 + dy, heightM: h };
      }
    }
  }
  return best;
}
