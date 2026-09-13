import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseVersion,
  compareVersions,
  resolveTarget,
  resolveLatestTarget,
  migrationPath,
  KNOWN_TARGETS,
  migrationBacklog,
  fromForBacklog,
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
  // Offline: every v1 spelling falls back to the pinned target and warns exactly once each.
  const warnings: string[] = [];
  const offline = { fetchDistTags: async () => ({}), warn: (m: string) => warnings.push(m) };
  for (const t of ["next", "v1", "1", "1.0.0"]) {
    assert.deepEqual(await resolveTarget(t, offline), KNOWN_TARGETS.next, t);
  }
  assert.equal(warnings.length, 4);
  assert.match(warnings[0], /could not resolve the `next` dist-tag[\s\S]*floating tag "next"/);
  assert.deepEqual(await resolveTarget("0.30.0"), { version: "0.30.0", npmSpec: "^0.30.0" });
  await assert.rejects(() => resolveTarget("main"), /unrecognized --to target/);
});

test("resolveTarget(next) pins the live dist-tag to an exact version and keeps the 1.0.0 migration bucket", async () => {
  const warnings: string[] = [];
  const live = { fetchDistTags: async () => ({ latest: "0.32.0", next: "0.33.0-alpha.224" }), warn: (m: string) => warnings.push(m) };
  assert.deepEqual(await resolveTarget("next", live), {
    version: "0.33.0-alpha.224",
    npmSpec: "0.33.0-alpha.224", // exact pin, never the floating tag
    migrationVersion: "1.0.0",
  });
  assert.deepEqual(warnings, [], "a live resolution is not a caveat");
  // An explicit prerelease on the v1 line selects the same bucket as `next`.
  assert.deepEqual(await resolveTarget("0.33.0-alpha.224"), {
    version: "0.33.0-alpha.224",
    npmSpec: "^0.33.0-alpha.224",
    migrationVersion: "1.0.0",
  });
  // A registry that throws is the same as one with no `next` tag.
  assert.deepEqual(
    await resolveTarget("next", { fetchDistTags: async () => { throw new Error("offline"); } }),
    KNOWN_TARGETS.next
  );
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

test("migrationPath re-selects a deprecation-era migration when its removedIn lands in the window", () => {
  const regs = [
    { id: "dep30-gone-v1", version: "0.30.0", removedIn: "1.0.0" },
    { id: "dep30-still-there", version: "0.30.0" },
    { id: "dep32-gone-v1", version: "0.32.0", removedIn: "1.0.0" },
    { id: "v1", version: "1.0.0" },
  ];
  // A project sitting on 0.32 never ran the 0.30 codemods; the ones v1 deletes come back into the path.
  assert.deepEqual(migrationPath(regs, "0.32.0", "1.0.0").map((m) => m.id), ["dep30-gone-v1", "dep32-gone-v1", "v1"]);
  // ...but not when the hop stops before the removal.
  assert.deepEqual(migrationPath(regs, "0.30.0", "0.32.0").map((m) => m.id), ["dep32-gone-v1"]);
  // No double entry when both version and removedIn are inside the window.
  assert.deepEqual(migrationPath(regs, "0.29.3", "1.0.0").map((m) => m.id), ["dep30-gone-v1", "dep30-still-there", "dep32-gone-v1", "v1"]);
  // Backlog is everything at or below `from`, regardless of removedIn.
  assert.deepEqual(migrationBacklog(regs, "0.32.0").map((m) => m.id), ["dep30-gone-v1", "dep30-still-there", "dep32-gone-v1"]);
  // The --from that re-opens the window is the bucket strictly below the item's version.
  const versions = ["0.30.0", "0.32.0", "1.0.0"];
  assert.equal(fromForBacklog("0.30.0", versions), "0.29.3", "floor when nothing is below");
  assert.equal(fromForBacklog("0.32.0", versions), "0.30.0");
  assert.equal(fromForBacklog("1.0.0", versions), "0.32.0");
});
