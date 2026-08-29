import { test } from "node:test";
import assert from "node:assert/strict";
import { MIGRATIONS } from "../src/upgrade/registry.ts";
import { compareVersions } from "../src/upgrade/versions.ts";

test("registry: unique ids, ascending versions, taxonomy enforced", () => {
  const ids = MIGRATIONS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, "ids unique");
  for (let i = 1; i < MIGRATIONS.length; i++) {
    assert.ok(compareVersions(MIGRATIONS[i - 1].version, MIGRATIONS[i].version) <= 0, `order at ${ids[i]}`);
  }
  for (const m of MIGRATIONS) {
    assert.ok(["auto", "manual", "notification"].includes(m.promptType), m.id);
    assert.equal(typeof m.check, "function", m.id);
    assert.equal(typeof m.prompt, "function", m.id);
    assert.ok(m.title && m.link, m.id);
    if (m.promptType === "auto") {
      assert.equal(typeof m.run, "function", `${m.id} auto gets a default run`);
    } else {
      assert.equal(m.run, undefined, `${m.id} ${m.promptType} must not have run`);
    }
  }
});

test("registry covers the three version buckets", () => {
  const versions = new Set(MIGRATIONS.map((m) => m.version));
  assert.deepEqual([...versions].sort(), ["0.30.0", "0.32.0", "1.0.0"]);
});
