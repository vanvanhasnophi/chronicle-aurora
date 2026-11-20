/**
 * Sync image dimension reader for local build-time assets.
 *
 * The markdown renderer is synchronous (regex-based post-processing), so we can't
 * await sharp here. This reads only the header bytes needed to determine the
 * intrinsic size of PNG / JPEG / GIF / WebP files (the formats markdown images
 * are authored in; AVIF/WebP variants are derived from these at build time).
 *
 * Used to reserve the *real* aspect ratio in .md-image-wrapper at first paint,
 * which eliminates the placeholder → natural-size CLS jump.
 */

import fs from 'node:fs';
import path from 'node:path';

let _dataDir: string | null | undefined;

/** Resolve the data/ directory (same rules as localDataSource). */
function getDataDir(): string | null {
  if (_dataDir !== undefined) return _dataDir;
  try {
    if (process.env.CHRONICLE_DATA_DIR) {
      _dataDir = path.resolve(process.env.CHRONICLE_DATA_DIR);
    } else {
      _dataDir = path.resolve(process.cwd(), '..', '..', 'data');
    }
  } catch {
    _dataDir = null;
  }
  return _dataDir;
}

/**
 * Map a local image URL (as written in the rendered HTML) to a file under data/.
 * Supports post attachments (/post_attachment/<id>/<file>), shared assets
 * (/assets/<file> on the site, /data/assets/<file> in the CMS) and the about
 * page (/about/<file>). External URLs → null.
 */
export function localImagePath(src: string): string | null {
  const dir = getDataDir();
  if (!dir) return null;
  const clean = src.split('?')[0].split('#')[0];
  let rel: string | null = null;
  const m = clean.match(/^\/post_attachment\/([^/]+)\/(.+)$/);
  if (m) rel = path.join('posts', m[1], decodeURIComponent(m[2]));
  else {
    // `asset://meow.jpg` renders as /assets/meow.jpg on the site and as
    // /data/assets/meow.jpg in the CMS — both live in data/assets/.
    const a = clean.match(/^(?:\/data)?\/assets\/(.+)$/);
    if (a) rel = path.join('assets', decodeURIComponent(a[1]));
    else {
      const ab = clean.match(/^\/about\/(.+)$/);
      if (ab) rel = path.join('about', decodeURIComponent(ab[1]));
    }
  }
  return rel ? path.join(dir, rel) : null;
}

/** Parse intrinsic dimensions from a PNG/JPEG/GIF/WebP buffer. */
export function parseImageSize(buf: Buffer): { width: number; height: number } | null {
  try {
    // PNG: signature + IHDR (width @16, height @20, big-endian)
    if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    // GIF: "GIF87a"/"GIF89a" + logical screen width/height (LE 16-bit @6)
    if (buf.length >= 10 && (buf.toString('latin1', 0, 3) === 'GIF')) {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
    // WebP: RIFF....WEBP + chunk headers
    if (buf.length >= 30 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
      const fourcc = buf.toString('latin1', 12, 16);
      if (fourcc === 'VP8 ' && buf.length >= 30) {
        // lossy: 19-byte frame header after chunk header → dims @26 (LE16, 14-bit)
        return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      }
      if (fourcc === 'VP8L' && buf.length >= 25) {
        // lossless: 1-byte signature @20, then 14-bit dims packed in 4 bytes @21
        const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
        return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
      }
      if (fourcc === 'VP8X' && buf.length >= 30) {
        // extended: 24-bit dims @24 (minus one)
        const w = buf.readUIntLE(24, 3) + 1;
        const h = buf.readUIntLE(27, 3) + 1;
        return { width: w, height: h };
      }
      return null;
    }
    // JPEG: walk markers to the first SOF (start of frame) segment
    if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let pos = 2;
      while (pos + 9 < buf.length) {
        if (buf[pos] !== 0xff) { pos++; continue; }
        let marker = buf[pos + 1];
        while (marker === 0xff && pos + 2 < buf.length) { marker = buf[pos + 2]; pos++; }
        pos += 2;
        // standalone markers without length
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        const segLen = buf.readUInt16BE(pos);
        // SOF0-SOF15 (exclude DHT C4, JPG C8, DAC CC)
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buf.readUInt16BE(pos + 3), width: buf.readUInt16BE(pos + 5) };
        }
        pos += segLen;
      }
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

const cache = new Map<string, { width: number; height: number } | null>();

/** Resolve a local image URL to its intrinsic size, or null when unavailable. */
export function getLocalImageSize(src: string): { width: number; height: number } | null {
  const file = localImagePath(src);
  if (!file) return null;
  if (cache.has(file)) return cache.get(file) ?? null;
  let result: { width: number; height: number } | null = null;
  try {
    if (fs.existsSync(file)) {
      const buf = fs.readFileSync(file);
      result = parseImageSize(buf);
    }
  } catch {
    result = null;
  }
  cache.set(file, result);
  return result;
}
