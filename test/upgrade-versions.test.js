import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVersion, compareVersions, resolveTarget, migrationPath, KNOWN_TARGETS } from "../src/upgrade/versions.js";

test("parseVersion handles v-prefix, prerelease, garbage", () => {
  assert.deepEqual(parseVersion("v0.32.0"), { major: 0, minor: 32, patch: 0, pre: [] });
  assert.deepEqual(parseVersion("0.33.0-alpha.197"), { major: 0, minor: 33, patch: 0, pre: ["alpha", "197"] });
  assert.equal(parseVersion("main"), null);
  assert.equal(parseVersion(null), null);
});

test("compareVersions ordering table", () => {
  const ordered = [
    "0.29.3",
    "0.30.0",
    "0.31.0",
    "0.32.0",
    "0.33.0-alpha.2",
    "0.33.0-alpha.174",
    "0.33.0",
    "1.0.0-alpha.1",
    "1.0.0",
  ];
  for (let i = 0; i < ordered.length - 1; i++) {
    assert.equal(compareVersions(ordered[i], ordered[i + 1]), -1, `${ordered[i]} < ${ordered[i + 1]}`);
    assert.equal(compareVersions(ordered[i + 1], ordered[i]), 1);
  }
  assert.equal(compareVersions("1.0.0", "v1.0.0"), 0);
});

test("resolveTarget maps latest/next/v1/exact and rejects garbage", () => {
  assert.deepEqual(resolveTarget(null), KNOWN_TARGETS.latest);
  assert.deepEqual(resolveTarget("latest"), KNOWN_TARGETS.latest);
  for (const t of ["next", "v1", "1", "1.0.0"]) {
    assert.deepEqual(resolveTarget(t), KNOWN_TARGETS.next, t);
  }
  assert.deepEqual(resolveTarget("0.30.0"), { version: "0.30.0", npmSpec: "^0.30.0" });
  assert.throws(() => resolveTarget("main"), /unrecognized --to target/);
});

test("migrationPath selects (from, to] in order, empty hops included naturally", () => {
  const regs = [
    { id: "a", version: "0.30.0" },
    { id: "b", version: "0.30.0" },
    { id: "c", version: "0.32.0" },
    { id: "d", version: "1.0.0" },
  ];
  assert.deepEqual(migrationPath(regs, "0.29.3", "0.32.0").map((m) => m.id), ["a", "b", "c"]);
  assert.deepEqual(migrationPath(regs, "0.30.0", "0.32.0").map((m) => m.id), ["c"], "from is exclusive");
  assert.deepEqual(migrationPath(regs, "0.31.0", "0.31.5").map((m) => m.id), [], "0.31 hop is empty");
  assert.deepEqual(migrationPath(regs, "0.32.0", "1.0.0").map((m) => m.id), ["d"]);
  assert.deepEqual(migrationPath(regs, "0.33.0-alpha.174", "1.0.0").map((m) => m.id), ["d"], "alpha users skip 0.32 bucket");
  assert.deepEqual(migrationPath(regs, "1.0.0", "1.0.0"), [], "up to date");
});
