import * as fs from "node:fs";

/**
 * Image dimension detection by header parsing — no image dependencies.
 * Covers the formats sprite sheets realistically ship in (png/jpeg/gif).
 * Never throws; returns null for anything unrecognized or truncated.
 */

/**
 * @param {Buffer} buf
 * @returns {{ width: number, height: number, format: "png" | "jpeg" | "gif" } | null}
 */
export function parseImageSize(buf) {
  if (!buf || buf.length < 10) return null;
  return parsePng(buf) ?? parseGif(buf) ?? parseJpeg(buf);
}

/** Read the whole file and parse its header. Null on any error. */
export function readImageSize(filePath) {
  try {
    return parseImageSize(fs.readFileSync(filePath));
  } catch {
    return null;
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function parsePng(buf) {
  if (buf.length < 24) return null;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (buf[i] !== PNG_SIGNATURE[i]) return null;
  }
  // the first chunk must be IHDR: length(4) type(4) width(4) height(4) …
  if (buf.toString("latin1", 12, 16) !== "IHDR") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), format: "png" };
}

function parseGif(buf) {
  const magic = buf.toString("latin1", 0, 6);
  if (magic !== "GIF87a" && magic !== "GIF89a") return null;
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), format: "gif" };
}

// SOF markers carry dimensions; C4/C8/CC look like SOFs but are not.
const JPEG_NON_SOF = new Set([0xc4, 0xc8, 0xcc]);

function parseJpeg(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let pos = 2;
  while (pos + 3 < buf.length) {
    if (buf[pos] !== 0xff) return null; // lost sync
    let marker = buf[pos + 1];
    while (marker === 0xff && pos + 2 < buf.length) {
      pos++;
      marker = buf[pos + 1];
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2; // standalone marker, no length
      continue;
    }
    if (marker >= 0xc0 && marker <= 0xcf && !JPEG_NON_SOF.has(marker)) {
      if (pos + 9 > buf.length) return null;
      return { width: buf.readUInt16BE(pos + 7), height: buf.readUInt16BE(pos + 5), format: "jpeg" };
    }
    const length = buf.readUInt16BE(pos + 2);
    if (length < 2) return null;
    pos += 2 + length;
  }
  return null;
}
