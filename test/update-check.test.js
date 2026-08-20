import { test } from "node:test";
import assert from "node:assert/strict";
import { currentVersion, isNewer } from "../src/docs/update-check.js";

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
  assert.match(currentVersion(), /^\d+\.\d+\.\d+/);
});
