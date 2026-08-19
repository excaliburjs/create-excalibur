import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDocsArgs } from "../src/docs/args.js";

test("parseDocsArgs joins the query and reads flags", () => {
  const a = parseDocsArgs(["actor", "collision", "--list", "-n", "5", "--kind", "api", "--ref", "v0.32.0"]);
  assert.equal(a.query, "actor collision");
  assert.equal(a.list, true);
  assert.equal(a.limit, 5);
  assert.equal(a.kind, "api");
  assert.equal(a.ref, "v0.32.0");
  assert.equal(a.subcommand, null);
});

test("parseDocsArgs recognises the offline subcommand and its flags", () => {
  const a = parseDocsArgs(["offline", "--status"]);
  assert.equal(a.subcommand, "offline");
  assert.equal(a.status, true);
  assert.equal(a.query, "");
  assert.equal(parseDocsArgs(["offline", "--clear"]).clear, true);
});

test("parseDocsArgs ignores bad numbers and unknown kinds", () => {
  const a = parseDocsArgs(["x", "--limit", "abc", "--kind", "weird", "--width", "-3"]);
  assert.equal(a.limit, 10);
  assert.equal(a.kind, null);
  assert.equal(a.width, null);
  assert.equal(parseDocsArgs(["--no-color", "--no-pager"]).noColor, true);
  assert.equal(parseDocsArgs(["--no-color", "--no-pager"]).noPager, true);
});
