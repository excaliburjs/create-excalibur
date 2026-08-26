import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { parseImageSize, readImageSize } from "../src/generate/image.js";
import { FIXTURES } from "./helpers.js";

function pngHeader(width, height) {
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "latin1");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

test("parseImageSize: PNG header", () => {
  assert.deepEqual(parseImageSize(pngHeader(320, 240)), { width: 320, height: 240, format: "png" });
});

test("parseImageSize: GIF87a and GIF89a headers", () => {
  for (const magic of ["GIF87a", "GIF89a"]) {
    const buf = Buffer.alloc(10);
    buf.write(magic, 0, "latin1");
    buf.writeUInt16LE(64, 6);
    buf.writeUInt16LE(32, 8);
    assert.deepEqual(parseImageSize(buf), { width: 64, height: 32, format: "gif" });
  }
});

function jpegWithSof(sofMarker) {
  // SOI, APP0 (empty), SOF, EOI
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, // APP0, length 4 (2 payload bytes)
    0xff, sofMarker, 0x00, 0x0b, 0x08, 0x00, 0x10, 0x00, 0x20, 0x01, 0x00, 0x11, 0x00, // SOF: h=16 w=32
    0xff, 0xd9,
  ]);
}

test("parseImageSize: JPEG SOF0 and SOF2 markers", () => {
  assert.deepEqual(parseImageSize(jpegWithSof(0xc0)), { width: 32, height: 16, format: "jpeg" });
  assert.deepEqual(parseImageSize(jpegWithSof(0xc2)), { width: 32, height: 16, format: "jpeg" });
});

test("parseImageSize: JPEG DHT (C4) is not mistaken for a SOF", () => {
  // SOI then a DHT segment then truncation — no dimensions to find
  const buf = Buffer.from([0xff, 0xd8, 0xff, 0xc4, 0x00, 0x04, 0x00, 0x00]);
  assert.equal(parseImageSize(buf), null);
});

test("parseImageSize: garbage, truncation, and empty input return null", () => {
  assert.equal(parseImageSize(Buffer.from("not an image at all")), null);
  assert.equal(parseImageSize(pngHeader(8, 8).subarray(0, 20)), null);
  assert.equal(parseImageSize(Buffer.alloc(0)), null);
  assert.equal(parseImageSize(null), null);
  // PNG signature but wrong first chunk
  const bad = pngHeader(8, 8);
  bad.write("IDAT", 12, "latin1");
  assert.equal(parseImageSize(bad), null);
});

test("readImageSize: real fixture PNG and non-image file", () => {
  const images = path.join(FIXTURES, "generate", "vite-project", "public", "images");
  assert.deepEqual(readImageSize(path.join(images, "run.png")), { width: 32, height: 16, format: "png" });
  assert.equal(readImageSize(path.join(images, "sword.png")), null); // 8-byte placeholder
  assert.equal(readImageSize(path.join(images, "nope.png")), null);
});
