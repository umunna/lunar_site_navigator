// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
// Small deterministic random numbers, so the set of test epochs is the same on
// every machine for the same seed.

/** mulberry32: uniform numbers in [0, 1). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
