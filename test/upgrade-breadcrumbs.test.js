import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { insertBreadcrumbs, hasMarker, marker } from "../src/upgrade/breadcrumbs.js";
import { withTempDirAsync } from "./helpers.js";

test("insertBreadcrumbs annotates with indent, bottom-up, and is idempotent", async () => {
  await withTempDirAsync(async (dir) => {
    const file = path.join(dir, "src", "a.ts");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, ["line1();", "  line2();", "line3();"].join("\n"));
    const sites = [
      { file: "src/a.ts", line: 1, id: "rule-a", message: "first thing changed", link: "https://x" },
      { file: "src/a.ts", line: 2, id: "rule-b", message: "second thing changed" },
    ];
    const modified = insertBreadcrumbs(dir, sites);
    assert.deepEqual(modified, ["src/a.ts"]);
    const text = fs.readFileSync(file, "utf8");
    assert.deepEqual(text.split("\n"), [
      "// ex-upgrade(rule-a): first thing changed — https://x",
      "line1();",
      "  // ex-upgrade(rule-b): second thing changed",
      "  line2();",
      "line3();",
    ]);
    assert.ok(hasMarker(text, 2, "rule-a"));
    assert.ok(!hasMarker(text, 2, "rule-b"));

    // Re-inserting the same sites (at their new line numbers) is a no-op.
    const again = insertBreadcrumbs(dir, [
      { file: "src/a.ts", line: 2, id: "rule-a", message: "first thing changed", link: "https://x" },
      { file: "src/a.ts", line: 4, id: "rule-b", message: "second thing changed" },
    ]);
    assert.deepEqual(again, []);
    assert.equal(fs.readFileSync(file, "utf8"), text);
  });
});

test("marker format is greppable and id-scoped", () => {
  assert.equal(marker("collision-event-target"), "ex-upgrade(collision-event-target)");
});
