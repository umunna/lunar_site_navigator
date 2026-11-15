// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Repository root, resolved from this file so it works from any working directory (Windows and WSL). */
export const REPO_ROOT = resolve(here, '..', '..', '..');
/** Committed, generated data files. */
export const DATA_DIR = resolve(REPO_ROOT, 'data');
/** Raw downloads and cached API responses. Git-ignored. */
export const CACHE_DIR = resolve(REPO_ROOT, 'data-cache');
export const DOCS_DIR = resolve(REPO_ROOT, 'docs');
