// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// NASA NSSDC "Apollo Landing Site Coordinates" page. Read 14 Nov 2026: the page
// states the coordinates are planetocentric, Mean Earth/Polar Axis, DE421, from
// LRO images (Wagner et al., Icarus 283, 92-103, 2017). We take the Lunar Module row.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { invariant } from '@lsn/shared';

export const NSSDC_APOLLO_URL = 'https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html';

export interface ApolloLanding {
  readonly mission: number;
  readonly latDeg: number;
  readonly lonDeg: number;
}

function pageText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

/** Lunar Module coordinates per Apollo mission. Throws if a mission has no Lunar Module row. */
export function parseNssdcApollo(html: string): ApolloLanding[] {
  const text = pageText(html);
  // From "Apollo N" up to the first "Lunar Module lat lon", with no other "Apollo N" in between.
  const re = /Apollo (\d+)(?:(?!Apollo \d)[\s\S])*?Lunar Module (-?\d+\.\d+) (-?\d+\.\d+)/g;
  const out: ApolloLanding[] = [];
  for (const m of text.matchAll(re)) {
    out.push({ mission: Number(m[1]), latDeg: Number(m[2]), lonDeg: Number(m[3]) });
  }
  invariant(out.length >= 6, `NSSDC page: expected 6 Apollo landings, parsed ${String(out.length)}`);
  return out;
}

/** Download the page once (about 5 KB) and cache it. */
export async function loadNssdcApollo(cacheDir: string): Promise<ApolloLanding[]> {
  const dir = join(cacheDir, 'catalog');
  const path = join(dir, 'nssdc-lunar-sites.html');
  let html: string;
  try {
    html = await readFile(path, 'utf8');
  } catch {
    await mkdir(dir, { recursive: true });
    const response = await fetch(NSSDC_APOLLO_URL, {
      headers: { 'User-Agent': 'lunar-site-navigator-build/0.1' },
      signal: AbortSignal.timeout(60_000),
    });
    invariant(response.ok, `NSSDC HTTP ${String(response.status)}`);
    html = await response.text();
    await writeFile(`${path}.tmp`, html, 'utf8');
    await rename(`${path}.tmp`, path);
  }
  return parseNssdcApollo(html);
}
