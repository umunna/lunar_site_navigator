// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
// Number and time formatting. UTC everywhere, independent of the browser's locale and time zone.
import { formatIsoUtc, invariant } from '@lsn/shared';

const MINUS = '−';

/** "3 d 4 h 12 min", "4 h 12 min", "12 min", "under 1 min". Minutes say "min" so they never read as metres. */
export function formatDuration(seconds: number): string {
  invariant(Number.isFinite(seconds) && seconds >= 0, 'duration must be a non-negative number');
  const total = Math.round(seconds / 60);
  if (total < 1) {
    return 'under 1 min';
  }
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${String(d)} d`);
  if (d > 0 || h > 0) parts.push(`${String(h)} h`);
  parts.push(`${String(m)} min`);
  return parts.join(' ');
}

/** "2026-11-14 07:30 UTC". */
export function formatUtc(unixS: number): string {
  return `${formatIsoUtc(unixS).slice(0, 16).replace('T', ' ')} UTC`;
}

/** "2026-11-14". */
export function formatDateUtc(unixS: number): string {
  return formatIsoUtc(unixS).slice(0, 10);
}

/** Value for an <input type="datetime-local"> (minute precision, read as UTC by this app). */
export function toUtcInput(unixS: number): string {
  return formatIsoUtc(unixS).slice(0, 16);
}

/** Unix seconds from a datetime-local value read as UTC. NaN if malformed. */
export function fromUtcInput(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return Number.NaN;
  }
  return Date.parse(`${value}:00Z`) / 1000;
}

/** Signed degrees with a true minus sign: "+1.33°", "−0.40°". */
export function formatDeg(deg: number, digits = 2): string {
  invariant(Number.isFinite(deg), 'degrees must be finite');
  const abs = Math.abs(deg).toFixed(digits);
  const zero = Number(abs) === 0;
  return `${deg < 0 && !zero ? MINUS : '+'}${abs}°`;
}

/** "89.67° S". */
export function formatLat(latDeg: number): string {
  return `${Math.abs(latDeg).toFixed(2)}° ${latDeg < 0 ? 'S' : 'N'}`;
}

/** "129.78° E", longitude shown in -180..180. */
export function formatLon(lonDeg: number): string {
  const w = ((((lonDeg + 180) % 360) + 360) % 360) - 180;
  return `${Math.abs(w).toFixed(2)}° ${w < 0 ? 'W' : 'E'}`;
}

export function formatPercent(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`;
}

/** Hours as "3 d 4 h" for long runs, "5.5 h" for short ones. */
export function formatHoursSpan(hours: number): string {
  invariant(Number.isFinite(hours) && hours >= 0, 'hours must be non-negative');
  if (hours >= 48) {
    // Round to whole hours first, then split: rounding the remainder alone could print "2 d 24 h".
    const whole = Math.round(hours);
    const d = Math.floor(whole / 24);
    const h = whole % 24;
    return h === 0 ? `${String(d)} d` : `${String(d)} d ${String(h)} h`;
  }
  return `${hours.toFixed(hours < 10 ? 1 : 0)} h`;
}
