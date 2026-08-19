import { test } from "node:test";
import assert from "node:assert/strict";
import { writeCachedFile } from "../src/docs/cache.js";
import { buildPageList } from "../src/docs/fetch-docs.js";
import { buildIndex, saveIndex, searchLocal } from "../src/docs/local-index.js";
import { readFixture, withTempHome } from "./helpers.js";

test("offline index finds sections by heading and body text", async () => {
  await withTempHome(async () => {
    const ref = "test-ref";
    const files = [
      { path: "02-fundamentals/03-actors.mdx", sha: "1", size: 1 },
      { path: "02-fundamentals/examples/basic-actors.ts", sha: "2", size: 1 },
      { path: "00-welcome.mdx", sha: "3", size: 1 },
    ];
    for (const f of files) await writeCachedFile(ref, f.path, readFixture(`docs/${f.path}`));

    const pages = buildPageList(ref, files);
    assert.deepEqual(
      pages.map((p) => [p.slug, p.title]),
      [["/actors", "Actors"], ["/", "Welcome"]]
    );

    await saveIndex(ref, buildIndex(ref, pages));

    const hits = searchLocal(ref, "custom actors");
    assert.ok(hits.length > 0);
    assert.equal(hits[0].kind, "docs");
    assert.equal(hits[0].slug, "/actors");
    assert.equal(hits[0].anchor, "custom-actors");
    assert.equal(hits[0].url, "https://excaliburjs.com/docs/actors#custom-actors");
    assert.equal(hits[0].source, "local");

    const welcome = searchLocal(ref, "free game engine typescript");
    assert.equal(welcome[0].slug, "/");
    assert.equal(welcome[0].url, "https://excaliburjs.com/docs/#what-is-excalibur");

    // fuzzy / prefix
    assert.ok(searchLocal(ref, "colision").length > 0);
    assert.equal(searchLocal("missing-ref", "x"), null);
  });
});
