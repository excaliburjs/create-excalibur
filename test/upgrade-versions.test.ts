import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseVersion,
  compareVersions,
  resolveTarget,
  resolveLatestTarget,
  migrationPath,
  KNOWN_TARGETS,
} from "../src/upgrade/versions.ts";

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

test("resolveTarget maps next/v1/exact and rejects garbage (network-free targets)", async () => {
  for (const t of ["next", "v1", "1", "1.0.0"]) {
    assert.deepEqual(await resolveTarget(t), KNOWN_TARGETS.next, t);
  }
  assert.deepEqual(await resolveTarget("0.30.0"), { version: "0.30.0", npmSpec: "^0.30.0" });
  await assert.rejects(() => resolveTarget("main"), /unrecognized --to target/);
});

test("resolveTarget/resolveLatestTarget resolve `latest` off an injected dist-tag fetch, not the network", async () => {
  const fetchDistTags = async () => ({ latest: "0.35.2", next: "0.36.0-alpha.9" });
  assert.deepEqual(await resolveLatestTarget(fetchDistTags), { version: "0.35.2", npmSpec: "^0.35.2" });
  assert.deepEqual(await resolveTarget(null, { fetchDistTags }), { version: "0.35.2", npmSpec: "^0.35.2" });
  assert.deepEqual(await resolveTarget("latest", { fetchDistTags }), { version: "0.35.2", npmSpec: "^0.35.2" });
});

test("resolveLatestTarget falls back to the pinned KNOWN_TARGETS.latest when the registry is unreachable or returns garbage", async () => {
  assert.deepEqual(await resolveLatestTarget(async () => { throw new Error("offline"); }), KNOWN_TARGETS.latest);
  assert.deepEqual(await resolveLatestTarget(async () => ({})), KNOWN_TARGETS.latest, "no latest tag");
  assert.deepEqual(await resolveLatestTarget(async () => ({ latest: "not-a-version" })), KNOWN_TARGETS.latest);
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
