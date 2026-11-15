// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export class HorizonsError extends Error {
  public readonly retryable: boolean;

  public constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'HorizonsError';
    this.retryable = retryable;
  }
}

export interface FetchOptions {
  /** Directory for raw cached responses. */
  readonly cacheDir: string;
  /** Short human label used in the cache file name. */
  readonly label: string;
  readonly timeoutMs?: number;
  /** Upper bound on attempts per request (P10 rule 2: no unbounded retry loop). */
  readonly maxAttempts?: number;
  /** Pause after each live request, to stay polite to the shared service. */
  readonly politenessMs?: number;
  readonly onRetry?: (attempt: number, reason: string) => void;
}

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_POLITENESS_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
/** Generic client name. No personal or project details go to the service. */
const USER_AGENT = 'lunar-site-navigator-build/0.1';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function cachePath(opts: FetchOptions, url: string): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 16);
  return join(opts.cacheDir, `${opts.label}-${hash}.txt`);
}

async function readCache(path: string): Promise<string | null> {
  try {
    const text = await readFile(path, 'utf8');
    return text.includes('$$SOE') && text.includes('$$EOE') ? text : null;
  } catch {
    return null;
  }
}

async function writeCache(path: string, text: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, text, 'utf8');
  await rename(tmp, path);
}

async function fetchOnce(url: string, timeoutMs: number): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new HorizonsError(`network error: ${err instanceof Error ? err.message : String(err)}`, true);
  }
  if (response.status === 429 || response.status >= 500) {
    throw new HorizonsError(`HTTP ${String(response.status)}`, true);
  }
  if (!response.ok) {
    throw new HorizonsError(`HTTP ${String(response.status)}`, false);
  }
  const text = await response.text();
  // An input error can still arrive as HTTP 200, so check for the data block.
  if (!text.includes('$$SOE') || !text.includes('$$EOE')) {
    const head = text.slice(0, 400).replace(/\s+/g, ' ');
    throw new HorizonsError(`no ephemeris block in response: ${head}`, false);
  }
  return text;
}

/**
 * Fetch a Horizons response as text, using the on-disk cache when present.
 * Retries transient failures with exponential backoff, at most `maxAttempts`.
 */
export async function fetchHorizonsText(url: string, opts: FetchOptions): Promise<string> {
  await mkdir(opts.cacheDir, { recursive: true });
  const path = cachePath(opts, url);
  const cached = await readCache(path);
  if (cached !== null) {
    return cached;
  }
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let lastError: HorizonsError = new HorizonsError('no attempt made', false);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const text = await fetchOnce(url, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      await writeCache(path, text);
      await sleep(opts.politenessMs ?? DEFAULT_POLITENESS_MS);
      return text;
    } catch (err) {
      if (!(err instanceof HorizonsError)) {
        throw err;
      }
      lastError = err;
      if (!err.retryable || attempt === maxAttempts) {
        break;
      }
      opts.onRetry?.(attempt, err.message);
      await sleep(Math.min(MAX_BACKOFF_MS, 2 ** attempt * 1000));
    }
  }
  throw lastError;
}
