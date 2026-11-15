// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/** SHA-256 of a file, streamed (the DEM is hundreds of MB). Lower-case hex. */
export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}
