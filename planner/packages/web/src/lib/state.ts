// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
// App state that can be shared as a link: place, time, page, places to compare and
// length of the stay. Kept in the URL hash.
import { formatIsoUtc } from '@lsn/shared';
import { fromUtcInput } from './format';

export type View = 'site' | 'compare' | 'rover' | 'about';
export const VIEWS: readonly View[] = ['site', 'compare', 'rover', 'about'];
/** Window lengths offered everywhere, days: a week, the default 14 days ([design], 5.3), one lunar day. */
export const WINDOW_DAYS: readonly number[] = [7, 14, 29.5];
export const MIN_COMPARE = 2;
export const MAX_COMPARE = 4;

export interface AppState {
  readonly siteId: string;
  readonly timeUnixS: number;
  readonly view: View;
  /** 2 to 4 catalog site ids for the Compare screen. */
  readonly compareIds: readonly string[];
  readonly windowDays: number;
}

export interface TimeRange {
  readonly startUnixS: number;
  readonly endUnixS: number;
}

export function clampTime(t: number, range: TimeRange): number {
  return Math.min(range.endUnixS, Math.max(range.startUnixS, t));
}

/** A number from the hash within [min, max], or `fallback` when missing, malformed or out of range. */
function numberParam(p: URLSearchParams, key: string, min: number, max: number, fallback: number): number {
  const raw = p.get(key);
  const v = raw === null || raw === '' ? Number.NaN : Number(raw);
  return Number.isFinite(v) && v >= min && v <= max ? v : fallback;
}

function oneOf<T extends string | number>(value: T | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((a) => a === value) ?? fallback;
}

/** Valid, distinct catalog ids, at most MAX_COMPARE; the fallback when fewer than MIN_COMPARE remain. */
export function parseCompare(raw: string | null, siteIds: ReadonlySet<string>, fallback: readonly string[]): readonly string[] {
  if (raw === null) return fallback;
  const ids = [...new Set(raw.split(',').filter((id) => siteIds.has(id)))].slice(0, MAX_COMPARE);
  return ids.length >= MIN_COMPARE ? ids : fallback;
}

/** Read state from the hash. Bad values fall back one by one instead of breaking the page. */
export function parseHash(hash: string, fallback: AppState, range: TimeRange, siteIds: ReadonlySet<string>): AppState {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const site = p.get('site') ?? fallback.siteId;
  const t = fromUtcInput(p.get('t') ?? '');
  return {
    siteId: siteIds.has(site) ? site : fallback.siteId,
    timeUnixS: Number.isFinite(t) ? clampTime(t, range) : fallback.timeUnixS,
    view: oneOf(p.get('view') as View | null, VIEWS, fallback.view),
    compareIds: parseCompare(p.get('cmp'), siteIds, fallback.compareIds),
    windowDays: oneOf(numberParam(p, 'win', 0, 100, Number.NaN), WINDOW_DAYS, fallback.windowDays),
  };
}

export function toHash(s: AppState): string {
  const p = new URLSearchParams();
  p.set('site', s.siteId);
  p.set('t', formatIsoUtc(Math.round(s.timeUnixS / 60) * 60).slice(0, 16));
  p.set('view', s.view);
  p.set('cmp', s.compareIds.join(','));
  p.set('win', String(s.windowDays));
  // Colons and commas are legal in a fragment: keep the link readable.
  return `#${p.toString().replace(/%3A/g, ':').replace(/%2C/g, ',')}`;
}
