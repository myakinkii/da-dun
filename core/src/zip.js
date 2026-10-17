// zip.js: a tiny ZIP writer (no compression, "stored" entries).
// Used where a host only accepts certain file types for download
// (claude.ai artifacts allow .zip but not .mid).

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 as used by ZIP and PNG. */
export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Build a ZIP archive.
 * @param {{name: string, data: Uint8Array | string}[]} files
 * @returns {Uint8Array}
 */
export function makeZip(files) {
  const enc = new TextEncoder();
  const le16 = n => [n & 0xFF, (n >>> 8) & 0xFF];
  const le32 = n => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];
  const DATE = 0x21;          // 1980-01-01, the ZIP epoch; keeps output reproducible
  const UTF8 = 0x0800;        // file names are UTF-8
  const chunks = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const common = [...le16(UTF8), ...le16(0), ...le16(0), ...le16(DATE), ...le32(crc),
                    ...le32(data.length), ...le32(data.length), ...le16(name.length), ...le16(0)];
    const local = Uint8Array.from([...le32(0x04034B50), ...le16(20), ...common]);
    chunks.push(local, name, data);
    central.push(Uint8Array.from([...le32(0x02014B50), ...le16(20), ...le16(20), ...common,
                                  ...le16(0), ...le16(0), ...le16(0), ...le32(0), ...le32(offset)]), name);
    offset += local.length + name.length + data.length;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = Uint8Array.from([...le32(0x06054B50), ...le16(0), ...le16(0), ...le16(files.length),
                               ...le16(files.length), ...le32(cdSize), ...le32(offset), ...le16(0)]);
  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
  let p = 0;
  for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}
