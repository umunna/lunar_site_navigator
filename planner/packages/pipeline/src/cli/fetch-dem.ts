// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
//   npm run fetch-dem                 80 m file (189,158,392 bytes), the decision of 14 Nov (section 2)
//   npm run fetch-dem -- --res 20     20 m file (2.7 GB), only if time remains after block 4
//
// Downloads the LOLA south-pole DEM from NASA PGDA into data-cache/dem/<res>m/
// (its own folder; git-ignored). Resumes an interrupted download with an HTTP
// Range request (the server supports it, docs/history/plan-2026-11-14.md 5.5). The file
// is checked against the size we measured on 14 Nov before it is accepted.
// The DEM is never shipped: the app ships only precomputed skylines.
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { CACHE_DIR } from '../paths';

const BASE_URL = 'https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/';

/** Sizes measured with HTTP range requests on 14 Nov 2026 [tested], docs/history/plan-2026-11-14.md 5.5. */
const FILES: Readonly<Record<string, { name: string; bytes: number }>> = {
  '80': { name: 'LDEM_80S_80MPP_ADJ.TIF', bytes: 189_158_392 },
  '40': { name: 'LDEM_80S_40MPP_ADJ.TIF', bytes: 716_299_920 },
  '20': { name: 'LDEM_80S_20MPP_ADJ.TIF', bytes: 2_696_082_051 },
};

const LONG_TIMEOUT_MS = 60 * 60 * 1000;
const USER_AGENT = 'lunar-site-navigator-build/0.1';

function log(message: string): void {
  console.log(`[fetch-dem] ${message}`);
}

async function sizeOf(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function sha256Of(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

async function download(url: string, partPath: string, expected: number): Promise<void> {
  const have = await sizeOf(partPath);
  if (have === expected) {
    return;
  }
  if (have > expected) {
    throw new Error(`${partPath} is larger (${String(have)}) than expected (${String(expected)}); delete it and retry`);
  }
  log(have > 0 ? `resuming at byte ${String(have)} of ${String(expected)}` : `starting, ${String(expected)} bytes`);
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, ...(have > 0 ? { Range: `bytes=${String(have)}-` } : {}) },
    signal: AbortSignal.timeout(LONG_TIMEOUT_MS),
  });
  const expectedStatus = have > 0 ? 206 : 200;
  if (response.status !== expectedStatus || response.body === null) {
    throw new Error(`unexpected HTTP ${String(response.status)} (wanted ${String(expectedStatus)})`);
  }
  const out = createWriteStream(partPath, { flags: have > 0 ? 'a' : 'w' });
  let received = have;
  let nextReport = Math.floor(have / (expected / 10)) + 1;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    if (!out.write(chunk)) {
      await new Promise<void>((resolve) => out.once('drain', resolve));
    }
    received += chunk.length;
    if (received >= nextReport * (expected / 10)) {
      log(`${String(nextReport * 10)}%`);
      nextReport += 1;
    }
  }
  await new Promise<void>((resolve, reject) => {
    out.end((err?: Error | null) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { res: { type: 'string' } } });
  const res = values.res ?? '80';
  const file = FILES[res];
  if (file === undefined) {
    throw new Error(`--res must be one of ${Object.keys(FILES).join(', ')}`);
  }
  const dir = join(CACHE_DIR, 'dem', `${res}m`);
  await mkdir(dir, { recursive: true });
  const finalPath = join(dir, file.name);
  if ((await sizeOf(finalPath)) === file.bytes) {
    log(`already present: ${finalPath}`);
    return;
  }
  await download(`${BASE_URL}${file.name}`, `${finalPath}.part`, file.bytes);
  const got = await sizeOf(`${finalPath}.part`);
  if (got !== file.bytes) {
    throw new Error(`size mismatch: got ${String(got)}, expected ${String(file.bytes)}. Re-run to resume.`);
  }
  await rename(`${finalPath}.part`, finalPath);
  log(`done: ${finalPath}`);
  log(`sha256 ${await sha256Of(finalPath)} (record this; NASA does not publish a checksum on the product page that we have read)`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
