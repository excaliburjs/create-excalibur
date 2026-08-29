import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { clearCache, manifestPath, pluginsCacheRoot, writeCachedFile, writeJsonAtomic } from "../src/docs/cache.ts";
import { DocsError, DocsNotFoundError } from "../src/docs/errors.ts";
import { buildPageList } from "../src/docs/fetch-docs.ts";
import { buildIndex, saveIndex } from "../src/docs/local-index.ts";
import { pageSectionMarkdown } from "../src/docs/page.ts";
import {
  buildPluginIndex,
  hasPluginIndex,
  loadPluginPage,
  pluginEntryFromRegistryDoc,
  pluginsManifestPath,
  savePluginIndex,
  searchPlugins,
  writePluginReadme,
} from "../src/docs/plugins.ts";
import { runDocsSearch } from "../src/docs/search.ts";
import { readFixture, withTempHome } from "./helpers.ts";

const registryDoc = JSON.parse(readFixture("plugins/perlin-registry.json"));

async function seedPluginCache() {
  const { entry } = pluginEntryFromRegistryDoc(registryDoc)!;
  await writePluginReadme(entry.short, readFixture("plugins/perlin.md"));
  await savePluginIndex(buildPluginIndex([entry]));
  await writeJsonAtomic(pluginsManifestPath(), { syncedAt: "2026-08-20T00:00:00.000Z", plugins: [entry] });
  return entry;
}

async function seedDocsCache(ref: string) {
  const files = [
    { path: "02-fundamentals/03-actors.mdx", sha: "1", size: 1 },
    { path: "00-welcome.mdx", sha: "2", size: 1 },
  ];
  for (const f of files) await writeCachedFile(ref, f.path, readFixture(`docs/${f.path}`));
  const pages = buildPageList(ref, files);
  await saveIndex(ref, buildIndex(ref, pages));
  await writeJsonAtomic(manifestPath(ref), { ref, syncedAt: 0, files: files.length });
}

test("pluginEntryFromRegistryDoc parses a recorded npm registry doc", () => {
  const { entry, readme } = pluginEntryFromRegistryDoc(registryDoc)!;
  assert.equal(entry.name, "@excaliburjs/plugin-perlin");
  assert.equal(entry.short, "perlin");
  assert.match(entry.version!, /^\d+\.\d+\.\d+/);
  assert.equal(entry.repoUrl, "https://github.com/excaliburjs/excalibur-perlin");
  assert.ok(readme!.includes("Perlin"));

  // non-plugin packages are rejected
  assert.equal(pluginEntryFromRegistryDoc({ name: "@excaliburjs/testing" }), null);
  assert.equal(pluginEntryFromRegistryDoc({ name: "excalibur" }), null);

  // no repository field → npm page fallback; no readme → readme null
  const bare = pluginEntryFromRegistryDoc({ name: "@excaliburjs/plugin-fake" })!;
  assert.equal(bare.entry.repoUrl, "https://www.npmjs.com/package/@excaliburjs/plugin-fake");
  assert.equal(bare.readme, null);
});

test("plugin index finds README sections and stores GitHub urls", async () => {
  await withTempHome(async () => {
    assert.equal(hasPluginIndex(), false);
    const entry = await seedPluginCache();
    assert.equal(hasPluginIndex(), true);

    const hits = searchPlugins("perlin noise")!;
    assert.ok(hits.length > 0);
    assert.equal(hits[0].kind, "plugin");
    assert.equal(hits[0].slug, "/plugins/perlin");
    assert.equal(hits[0].source, "local");
    assert.ok(hits[0].url.startsWith(entry.repoUrl));

    const usage = searchPlugins("npm install usage")!.find((h) => h.anchor === "usage");
    assert.ok(usage, "expected a hit for the Usage section");
    assert.equal(usage.url, `${entry.repoUrl}#usage`);
    assert.equal(usage.breadcrumb, "plugins › @excaliburjs/plugin-perlin");
  });
});

test("loadPluginPage returns a page shape compatible with pageSectionMarkdown", async () => {
  await withTempHome(async () => {
    await seedPluginCache();
    const page = loadPluginPage("/plugins/perlin");
    assert.equal(page.title, "@excaliburjs/plugin-perlin");
    assert.equal(page.url, "https://github.com/excaliburjs/excalibur-perlin");
    assert.ok(page.sections.length > 1);

    const { markdown, partial } = pageSectionMarkdown(page, "usage");
    assert.equal(partial, true);
    assert.ok(markdown.includes("npm install"));

    assert.throws(() => loadPluginPage("/plugins/nope"), DocsNotFoundError);
  });
});

test("runDocsSearch merges plugin hits after docs hits and supports kind=plugin", async () => {
  await withTempHome(async () => {
    const ref = "test-ref";
    await seedDocsCache(ref);
    await seedPluginCache();

    // A query matching both corpora: docs hits first, plugin hits appended.
    const merged = await runDocsSearch({ query: "excalibur", ref, limit: 10, offline: true });
    assert.equal(merged.source, "local");
    const kinds = merged.hits.map((h) => h.kind);
    assert.ok(kinds.includes("docs"));
    assert.ok(kinds.includes("plugin"));
    assert.ok(kinds.indexOf("plugin") > kinds.lastIndexOf("docs"), "plugin hits come after docs hits");
    assert.ok(merged.hits.length <= 10);

    // kind=plugin returns only plugin hits (never touches the network).
    const only = await runDocsSearch({ query: "perlin", ref, limit: 10, kind: "plugin" });
    assert.ok(only.hits.length > 0);
    assert.ok(only.hits.every((h) => h.kind === "plugin"));

    // kind=docs must not include plugin hits.
    const docsOnly = await runDocsSearch({ query: "excalibur", ref, limit: 10, kind: "docs", offline: true });
    assert.ok(docsOnly.hits.every((h) => h.kind === "docs"));
  });
});

test("kind=plugin without a plugin index raises a DocsError with a sync hint", async () => {
  await withTempHome(async () => {
    await assert.rejects(
      runDocsSearch({ query: "perlin", ref: "main", limit: 10, kind: "plugin" }),
      (err: unknown) => err instanceof DocsError && /ex docs offline/.test(err.hint ?? "")
    );
  });
});

test("clearCache removes the plugin cache too", async () => {
  await withTempHome(async () => {
    await seedPluginCache();
    assert.ok(fs.existsSync(pluginsCacheRoot()));
    await clearCache();
    assert.equal(fs.existsSync(pluginsCacheRoot()), false);
    assert.equal(hasPluginIndex(), false);
  });
});
