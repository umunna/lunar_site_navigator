// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.

const POLY = 0xedb88320;
const TABLE_SIZE = 256;
const BITS_PER_BYTE = 8;

function buildTable(): Uint32Array {
  const table = new Uint32Array(TABLE_SIZE);
  for (let n = 0; n < TABLE_SIZE; n++) {
    let c = n;
    for (let k = 0; k < BITS_PER_BYTE; k++) {
      c = (c & 1) !== 0 ? POLY ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const TABLE = buildTable();

/** CRC-32 (IEEE 802.3, same as zlib and PNG) of a byte array. Returns an unsigned 32-bit number. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = (TABLE[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
