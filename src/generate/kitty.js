import { parseImageSize } from "./image.js";

/**
 * Kitty terminal graphics protocol — used to preview sprite sheets and
 * individual sprites in `ex generate spritesheet` / `ex generate animation`.
 *
 * The escape-sequence builders are pure (unit-tested without a TTY); only
 * createKittySession() writes to a stream. Every sequence carries q=2
 * (suppress terminal responses) — inquirer owns stdin, and a reply would
 * corrupt the active prompt. Sprite previews reuse the transmitted sheet via
 * a=p with a source rectangle (x/y/w/h), so no pixel decoding is needed.
 */

const ESC = String.fromCharCode(0x1b);
const CHUNK_SIZE = 4096; // max base64 payload bytes per escape sequence

function apc(keys, payload = "") {
  const ctrl = Object.entries(keys)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  return `${ESC}_G${ctrl};${payload}${ESC}\\`;
}

/**
 * Does this terminal understand the kitty graphics protocol?
 * Env-based detection (a query round-trip would need raw stdin, which the
 * prompts own); EX_KITTY_GRAPHICS=0/1 overrides.
 */
export function supportsKittyGraphics(stream = process.stdout, env = process.env) {
  if (env.EX_KITTY_GRAPHICS === "0") return false;
  if (env.EX_KITTY_GRAPHICS === "1") return true;
  if (!stream.isTTY) return false;
  if (env.TMUX) return false; // needs passthrough wrapping we don't do
  const term = env.TERM ?? "";
  if (term.includes("kitty") || term.includes("ghostty")) return true;
  if (env.KITTY_WINDOW_ID) return true;
  if (env.WEZTERM_EXECUTABLE) return true;
  return env.TERM_PROGRAM === "WezTerm" || env.TERM_PROGRAM === "ghostty";
}

/**
 * Transmit a PNG (f=100) under image id `id` without displaying it.
 * @returns {string[]} escape sequences (chunked at 4096 base64 bytes)
 */
export function transmitChunks(pngBuffer, { id }) {
  const b64 = pngBuffer.toString("base64");
  const chunks = [];
  for (let i = 0; i < b64.length; i += CHUNK_SIZE) chunks.push(b64.slice(i, i + CHUNK_SIZE));
  if (chunks.length === 1) {
    return [apc({ f: 100, a: "t", i: id, q: 2 }, chunks[0])];
  }
  return chunks.map((chunk, idx) => {
    if (idx === 0) return apc({ f: 100, a: "t", i: id, q: 2, m: 1 }, chunk);
    return apc({ m: idx === chunks.length - 1 ? 0 : 1 }, chunk);
  });
}

/**
 * Display a transmitted image at the cursor. x/y/w/h crop a source rectangle
 * (in image pixels); c/r scale the display to that many terminal cells.
 */
export function placeImage({ id, x, y, w, h, c, r }) {
  return apc({ a: "p", i: id, q: 2, x, y, w, h, c, r });
}

/** Delete a transmitted image and free its data. */
export function deleteImage(id) {
  return apc({ a: "d", d: "I", i: id, q: 2 });
}

/**
 * Cell dimensions that show a pxW×pxH image at roughly its aspect ratio,
 * assuming ~1:2 cell aspect. Shrinks to fit maxCols×maxRows; only grows
 * when `upscale` (used for small sprites so they are actually visible).
 */
export function fitCells(pxW, pxH, { maxCols = 40, maxRows = 12, cellW = 10, cellH = 20, upscale = false } = {}) {
  let c = Math.max(pxW / cellW, 1e-6);
  let r = Math.max(pxH / cellH, 1e-6);
  let scale = Math.min(maxCols / c, maxRows / r);
  if (!upscale) scale = Math.min(scale, 1);
  return {
    c: Math.max(1, Math.round(c * scale)),
    r: Math.max(1, Math.round(r * scale)),
  };
}

/**
 * A preview session for one wizard run. `show` is best-effort: it returns
 * false (and writes nothing) on unsupported terminals or non-PNG buffers.
 * Call `dispose()` in a finally to free the transmitted images.
 */
export function createKittySession(stream = process.stdout, env = process.env) {
  const enabled = supportsKittyGraphics(stream, env);
  let nextId = ((Date.now() & 0xffff) << 8) | (process.pid & 0xff);
  const transmitted = new Map(); // buffer -> image id
  function show(buf, { sourceRect, maxCols = 40, maxRows = 12, upscale = false } = {}) {
    if (!enabled || !buf) return false;
    const size = parseImageSize(buf);
    if (!size || size.format !== "png") return false; // only PNG transmits as f=100
    let id = transmitted.get(buf);
    if (!id) {
      id = nextId++;
      for (const chunk of transmitChunks(buf, { id })) stream.write(chunk);
      transmitted.set(buf, id);
    }
    const rect = sourceRect ?? { x: 0, y: 0, w: size.width, h: size.height };
    const { c, r } = fitCells(rect.w, rect.h, { maxCols, maxRows, upscale });
    stream.write(placeImage({ id, x: rect.x, y: rect.y, w: rect.w, h: rect.h, c, r }));
    stream.write("\n");
    return true;
  }
  function dispose() {
    for (const id of transmitted.values()) stream.write(deleteImage(id));
    transmitted.clear();
  }
  return { enabled, show, dispose };
}
