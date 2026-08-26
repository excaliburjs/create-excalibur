import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  createKittySession,
  deleteImage,
  fitCells,
  placeImage,
  supportsKittyGraphics,
  transmitChunks,
} from "../src/generate/kitty.js";
import { FIXTURES } from "./helpers.js";

const ESC = String.fromCharCode(0x1b);
const wrapped = (s) => s.startsWith(`${ESC}_G`) && s.endsWith(`${ESC}\\`);
/** The control-key list between "<ESC>_G" and the payload ";". */
const ctrlOf = (s) => s.slice(3, s.indexOf(";"));

test("supportsKittyGraphics: env matrix", () => {
  const tty = { isTTY: true };
  const noTty = { isTTY: false };
  assert.equal(supportsKittyGraphics(tty, { TERM: "xterm-kitty" }), true);
  assert.equal(supportsKittyGraphics(tty, { TERM: "xterm-ghostty" }), true);
  assert.equal(supportsKittyGraphics(tty, { KITTY_WINDOW_ID: "1", TERM: "xterm-256color" }), true);
  assert.equal(supportsKittyGraphics(tty, { WEZTERM_EXECUTABLE: "/bin/wezterm" }), true);
  assert.equal(supportsKittyGraphics(tty, { TERM_PROGRAM: "WezTerm" }), true);
  assert.equal(supportsKittyGraphics(tty, { TERM_PROGRAM: "ghostty" }), true);
  assert.equal(supportsKittyGraphics(tty, { TERM: "xterm-256color" }), false);
  // tmux has no passthrough support here, even inside kitty
  assert.equal(supportsKittyGraphics(tty, { TERM: "xterm-kitty", TMUX: "/tmp/tmux-1000/default,1,0" }), false);
  // not a TTY
  assert.equal(supportsKittyGraphics(noTty, { TERM: "xterm-kitty" }), false);
  // explicit overrides beat everything
  assert.equal(supportsKittyGraphics(noTty, { EX_KITTY_GRAPHICS: "1" }), true);
  assert.equal(supportsKittyGraphics(tty, { TERM: "xterm-kitty", EX_KITTY_GRAPHICS: "0" }), false);
});

test("transmitChunks: single chunk carries the full header", () => {
  const [seq, ...rest] = transmitChunks(Buffer.from("hello"), { id: 7 });
  assert.equal(rest.length, 0);
  assert.ok(wrapped(seq));
  assert.equal(ctrlOf(seq), "f=100,a=t,i=7,q=2");
  assert.ok(seq.includes(`;${Buffer.from("hello").toString("base64")}`));
});

test("transmitChunks: multi-chunk framing (m=1 … m=0, header on first only)", () => {
  const big = Buffer.alloc(9000); // base64 length 12000 → 3 chunks
  const chunks = transmitChunks(big, { id: 3 });
  assert.equal(chunks.length, 3);
  assert.ok(chunks.every(wrapped));
  assert.equal(ctrlOf(chunks[0]), "f=100,a=t,i=3,q=2,m=1");
  assert.equal(ctrlOf(chunks[1]), "m=1");
  assert.equal(ctrlOf(chunks[2]), "m=0");
  // the base64 payload reassembles exactly
  const joined = chunks.map((c) => c.slice(c.indexOf(";") + 1, -2)).join("");
  assert.equal(joined, big.toString("base64"));
});

test("placeImage: source rectangle and cell sizing keys", () => {
  const seq = placeImage({ id: 5, x: 8, y: 16, w: 8, h: 8, c: 12, r: 6 });
  assert.ok(wrapped(seq));
  assert.equal(ctrlOf(seq), "a=p,i=5,q=2,x=8,y=16,w=8,h=8,c=12,r=6");
  // omitted keys are dropped entirely
  assert.equal(ctrlOf(placeImage({ id: 5 })), "a=p,i=5,q=2");
});

test("deleteImage frees by id", () => {
  const seq = deleteImage(9);
  assert.ok(wrapped(seq));
  assert.equal(ctrlOf(seq), "a=d,d=I,i=9,q=2");
});

test("fitCells: shrinks to fit, keeps aspect, upscales only when asked", () => {
  // 320×240 at 10×20 px cells is 32×12 cells naturally — fits under the defaults
  assert.deepEqual(fitCells(320, 240), { c: 32, r: 12 });
  // 1000×1000 must shrink: r bound wins (50 → 12), c scales with it
  const big = fitCells(1000, 1000);
  assert.equal(big.r, 12);
  assert.equal(big.c, 24); // 100 cols × (12/50)
  // a tiny 8×8 sprite stays tiny without upscale…
  assert.deepEqual(fitCells(8, 8), { c: 1, r: 1 });
  // …and grows to the bounds with it (square sprite → r bound, c ≈ 2r)
  const up = fitCells(8, 8, { maxCols: 16, maxRows: 6, upscale: true });
  assert.equal(up.r, 6);
  assert.equal(up.c, 12);
});

test("createKittySession: transmits once, crops per show, deletes on dispose", () => {
  const png = fs.readFileSync(path.join(FIXTURES, "generate", "vite-project", "public", "images", "run.png"));
  const writes = [];
  const stream = { isTTY: true, write: (s) => writes.push(s) };
  const session = createKittySession(stream, { TERM: "xterm-kitty" });
  assert.equal(session.enabled, true);

  assert.equal(session.show(png), true);
  const transmits = () => writes.filter((s) => s.includes("a=t")).length;
  assert.equal(transmits(), 1);

  assert.equal(session.show(png, { sourceRect: { x: 8, y: 0, w: 8, h: 8 }, upscale: true }), true);
  assert.equal(transmits(), 1); // memoized — no second transmit
  assert.ok(writes.some((s) => s.includes("x=8,y=0,w=8,h=8")));

  // non-PNG buffers are refused without writing
  const before = writes.length;
  assert.equal(session.show(Buffer.from("GIF89a....")), false);
  assert.equal(writes.length, before);

  session.dispose();
  assert.ok(writes.some((s) => s.includes("a=d,d=I")));
});

test("createKittySession: disabled on plain terminals, show is a silent no-op", () => {
  const writes = [];
  const stream = { isTTY: true, write: (s) => writes.push(s) };
  const session = createKittySession(stream, { TERM: "xterm-256color" });
  assert.equal(session.enabled, false);
  assert.equal(session.show(Buffer.from("anything")), false);
  session.dispose();
  assert.equal(writes.length, 0);
});
