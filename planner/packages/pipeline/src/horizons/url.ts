// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { invariant } from '@lsn/shared';

export const HORIZONS_API = 'https://ssd.jpl.nasa.gov/api/horizons.api';

export type HorizonsParams = Readonly<Record<string, string>>;

/** Parameters Horizons wants unquoted. Everything else is wrapped in single quotes. */
const UNQUOTED = new Set(['format']);

function quoteValue(key: string, value: string): string {
  if (UNQUOTED.has(key) || value.startsWith("'")) {
    return value;
  }
  return `'${value}'`;
}

/**
 * Build a Horizons API URL. Values are percent-encoded (spaces as %20, as the
 * API documentation requires; URLSearchParams would use '+').
 * Key order is preserved so the same request always gives the same URL, which
 * is what the on-disk response cache keys on.
 */
export function buildHorizonsUrl(params: HorizonsParams): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    invariant(/^[A-Za-z_]+$/.test(key), `bad Horizons parameter name: ${key}`);
    parts.push(`${key}=${encodeURIComponent(quoteValue(key, value))}`);
  }
  return `${HORIZONS_API}?${parts.join('&')}`;
}

/** Parameters shared by every observer-table request. */
export const COMMON_PARAMS: HorizonsParams = {
  format: 'text',
  MAKE_EPHEM: 'YES',
  OBJ_DATA: 'NO',
  EPHEM_TYPE: 'OBSERVER',
  CSV_FORMAT: 'YES',
};
