import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDocsArgs } from "../src/docs/args.ts";
import { parseDoctorArgs } from "../src/doctor/args.ts";
import { parseUpgradeArgs } from "../src/upgrade/args.ts";

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

test("parseDocsArgs maps -1 to --first", () => {
  assert.equal(parseDocsArgs(["vector", "-1"]).first, true);
  assert.equal(parseDocsArgs(["vector", "--first"]).first, true);
  assert.equal(parseDocsArgs(["vector"]).first, false);
  assert.equal(parseDocsArgs(["vector", "-1"]).query, "vector");
});

test("parseDoctorArgs reads json/help flags with quiet defaults", () => {
  assert.deepEqual(parseDoctorArgs([]), { help: false, json: false });
  assert.deepEqual(parseDoctorArgs(["--json"]), { help: false, json: true });
  assert.deepEqual(parseDoctorArgs(["-h"]), { help: true, json: false });
  // unknown flags/positionals are ignored, not fatal (strict: false)
  assert.deepEqual(parseDoctorArgs(["--wat", "extra"]), { help: false, json: false });
});

test("parseUpgradeArgs reads targets and flags", () => {
  assert.deepEqual(parseUpgradeArgs([]), {
    help: false, to: null, from: null, dryRun: false, yes: false,
    allowDirty: false, migrateOnly: false, json: false,
  });
  const parsed = parseUpgradeArgs(["--to", "next", "--from", "0.29.3", "--dry-run", "-y", "--allow-dirty", "--migrate-only", "--json"]);
  assert.deepEqual(parsed, {
    help: false, to: "next", from: "0.29.3", dryRun: true, yes: true,
    allowDirty: true, migrateOnly: true, json: true,
  });
});
