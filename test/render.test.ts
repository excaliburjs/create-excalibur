import { test } from "node:test";
import assert from "node:assert/strict";
import { setColorLevel } from "../src/console.ts";
import { renderMarkdown, stripAnsi, supportsHyperlinks, wrap } from "../src/docs/render.ts";

const OSC8_OPEN = "\u001b]8;;";
const OSC8_CLOSE = "\u0007";

test("wrap is width-aware and keeps indentation", () => {
  const out = wrap("one two three four five six seven", 12, { indent: "  ", firstIndent: "" });
  assert.deepEqual(out.split("\n"), ["one two", "  three four", "  five six", "  seven"]);
});

test("renderMarkdown produces plain text when colors are disabled", () => {
  setColorLevel(0);
  try {
    const out = renderMarkdown(
      "# Title\n\nSome *text* with `code` and a [link](https://x.test/a).\n\n- a\n- b\n\n```ts\nconst x = 1;\n```\n",
      { width: 60, hyperlinks: false }
    );
    assert.equal(stripAnsi(out), out);
    assert.match(out, /^# Title/);
    assert.match(out, /Some text with code and a link\[1\]\./);
    assert.match(out, /• a\n• b/);
    assert.match(out, /╭─ ts\n│ const x = 1;\n╰─/);
    assert.match(out, /Links:\n {2}\[1\] https:\/\/x\.test\/a/);
  } finally {
    setColorLevel(2);
  }
});

test("renderMarkdown emits OSC-8 hyperlinks when supported and reflows soft breaks", () => {
  setColorLevel(0);
  try {
    const out = renderMarkdown("A line\nthat continues [here](https://x.test).\n", { width: 80, hyperlinks: true });
    assert.ok(out.includes(`A line that continues ${OSC8_OPEN}https://x.test${OSC8_CLOSE}here${OSC8_OPEN}${OSC8_CLOSE}.`), out);
    assert.doesNotMatch(out, /Links:/);
  } finally {
    setColorLevel(2);
  }
});

test("renderMarkdown renders blockquotes, tables and nested lists", () => {
  setColorLevel(0);
  try {
    const out = renderMarkdown(
      "> **Note**\n>\n> Careful.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n1. one\n   - nested\n2. two\n",
      { width: 60, hyperlinks: false }
    );
    assert.match(out, /┃ Note\n┃ \n┃ Careful\./);
    assert.match(out, /a {2}│ {2}b\n/);
    assert.match(out, /1 {2}│ {2}2/);
    assert.match(out, /1\. one\n {3}• nested\n2\. two/);
  } finally {
    setColorLevel(2);
  }
});

test("supportsHyperlinks respects FORCE_HYPERLINK and non-TTY streams", () => {
  assert.equal(supportsHyperlinks({ isTTY: false }, {}), false);
  assert.equal(supportsHyperlinks({ isTTY: false }, { FORCE_HYPERLINK: "1" }), true);
  assert.equal(supportsHyperlinks({ isTTY: true }, { TERM_PROGRAM: "vscode" }), true);
  assert.equal(supportsHyperlinks({ isTTY: true }, { TERM: "dumb" }), false);
});
