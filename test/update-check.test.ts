import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { currentVersion, isNewer } from "../src/docs/update-check.ts";

const rootPkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("isNewer compares semver including prereleases", () => {
  assert.equal(isNewer("1.2.5", "1.2.4"), true);
  assert.equal(isNewer("1.2.4", "1.2.4"), false);
  assert.equal(isNewer("1.2.4", "1.3.0"), false);
  assert.equal(isNewer("2.0.0", "1.9.9"), true);
  assert.equal(isNewer("1.3.0", "1.3.0-alpha.2"), true); // release beats prerelease
  assert.equal(isNewer("1.3.0-alpha.2", "1.3.0"), false);
  assert.equal(isNewer("1.3.0-alpha.10", "1.3.0-alpha.9"), true); // numeric prerelease compare
  assert.equal(isNewer(null, "1.0.0"), false);
});

test("currentVersion reads this package's version", () => {
  // Exact equality, not a shape check: the old ../../package.json hop broke
  // silently under dist/src/ layouts — this pins the walk-up lookup.
  assert.equal(currentVersion(), rootPkg.version);
});
