// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
// Runs of "in view" samples for the bars of the Compare places page.

export const SAMPLES_PER_DAY = 144;

export interface IndexWindow {
  /** First sample index shown. */
  readonly i0: number;
  /** One past the last sample index shown. */
  readonly i1: number;
}

export interface Run {
  readonly from: number;
  /** Exclusive end index. */
  readonly to: number;
}

/** Runs of consecutive samples in [i0, i1) where `flag(i)` is true. */
export function runsOf(flag: (i: number) => boolean, w: IndexWindow): Run[] {
  const runs: Run[] = [];
  let start = -1;
  for (let i = w.i0; i < w.i1; i++) {
    const on = flag(i);
    if (on && start < 0) {
      start = i;
    } else if (!on && start >= 0) {
      runs.push({ from: start, to: i });
      start = -1;
    }
  }
  if (start >= 0) {
    runs.push({ from: start, to: w.i1 });
  }
  return runs;
}

/** Runs of consecutive samples in [i0, i1) where `margin > 0` (the body has some part above the skyline). */
export function litRuns(margin: Float32Array, w: IndexWindow): Run[] {
  return runsOf((i) => (margin[i] ?? 0) > 0, w);
}

/** Runs where neither body has any part above the skyline. */
export function neitherRuns(sunMargin: Float32Array, earthMargin: Float32Array, w: IndexWindow): Run[] {
  return runsOf((i) => (sunMargin[i] ?? 0) <= 0 && (earthMargin[i] ?? 0) <= 0, w);
}
