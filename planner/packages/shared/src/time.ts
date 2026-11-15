// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { invariant } from './assert';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function pad2(n: number): string {
  return n < 10 ? `0${String(n)}` : String(n);
}

/**
 * Format a Unix time (whole minutes, UTC) the way Horizons prints and accepts
 * calendar dates: `2026-Nov-01 00:10`. Locale- and time-zone independent.
 */
export function formatHorizonsMinute(unixS: number): string {
  invariant(Number.isFinite(unixS), 'unixS must be finite');
  invariant(unixS % 60 === 0, 'unixS must be a whole number of minutes');
  const d = new Date(unixS * 1000);
  const month = MONTHS[d.getUTCMonth()];
  invariant(month !== undefined, 'month index out of range');
  return `${String(d.getUTCFullYear())}-${month}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/** ISO 8601 UTC string without milliseconds, e.g. `2026-11-01T00:10:00Z`. */
export function formatIsoUtc(unixS: number): string {
  invariant(Number.isFinite(unixS), 'unixS must be finite');
  return new Date(unixS * 1000).toISOString().replace('.000Z', 'Z');
}
