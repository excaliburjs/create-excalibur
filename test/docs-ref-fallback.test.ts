import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { indexPath, manifestPath } from "../src/docs/cache.ts";
import { resolveDocsRef } from "../src/docs/fetch-docs.ts";
import { withTempHome } from "./helpers.ts";

/** A ref with an (empty) offline index, as a sync would leave it. */
function fakeIndex(ref: string): void {
  for (const file of [indexPath(ref), manifestPath(ref)]) {
    fs.mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true });
    fs.writeFileSync(file, "{}");
  }
}

test("resolveDocsRef keeps explicit refs, main, and refs that already have an offline index (no network)", async () => {
  await withTempHome(async () => {
    assert.deepEqual(await resolveDocsRef("v1.0.0", { derived: false, network: false }), { ref: "v1.0.0", fellBack: false, reason: null });
    assert.deepEqual(await resolveDocsRef("main", { derived: true, network: false }), { ref: "main", fellBack: false, reason: null });
    fakeIndex("v1.1.0-alpha.313");
    assert.deepEqual(await resolveDocsRef("v1.1.0-alpha.313", { derived: true, network: false }), { ref: "v1.1.0-alpha.313", fellBack: false, reason: null });
  });
});

test("resolveDocsRef (offline search) falls back to main's index only when the derived ref has none and main does", async () => {
  await withTempHome(async () => {
    // Nothing synced at all: keep the ref so the real "no offline docs" error surfaces.
    assert.equal((await resolveDocsRef("v1.0.0", { derived: true, network: false })).fellBack, false);
    fakeIndex("main");
    const resolved = await resolveDocsRef("v1.0.0", { derived: true, network: false });
    assert.equal(resolved.ref, "main");
    assert.equal(resolved.fellBack, true);
    assert.match(resolved.reason ?? "", /no offline docs for v1\.0\.0; using the main docs/);
    // An explicit --ref is never second-guessed, even with main synced.
    assert.equal((await resolveDocsRef("v1.0.0", { derived: false, network: false })).ref, "v1.0.0");
  });
});
