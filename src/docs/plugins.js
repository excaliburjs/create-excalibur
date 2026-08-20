import * as fs from "node:fs";
import * as path from "node:path";
import MiniSearch from "minisearch";
import { DEFAULT_LIMIT, FETCH_CONCURRENCY } from "./constants.js";
import { pluginsCacheRoot, readJsonSync, writeFileAtomic, writeJsonAtomic } from "./cache.js";
import { DocsNetworkError, DocsNotFoundError } from "./errors.js";
import { mapConcurrent, requestJson } from "./http.js";
import { plainText } from "./local-index.js";
import { parseFrontmatter, splitSections } from "./mdx.js";

/**
 * Offline index of @excaliburjs/plugin-* READMEs.
 *
 * READMEs come from the npm registry, not GitHub: the registry doc for every
 * plugin carries the full readme markdown in its top-level `readme` field
 * (one unauthenticated GET per plugin), while raw.githubusercontent needs
 * per-repo casing guesses (readme.md vs README.md). Plugins version-lockstep
 * with the engine, so the cache is not ref-scoped — we index the latest
 * publish under <cacheRoot>/plugins/ (a sibling of docs/, kept out of
 * cachedRefs()).
 */

const NPM_REGISTRY = "https://registry.npmjs.org";
const NPM_HEADERS = { Accept: "application/json", "User-Agent": "create-excalibur (ex docs)" };
const PLUGIN_SCOPE_PREFIX = "@excaliburjs/plugin-";

/** Fallback when the registry search endpoint flakes or returns nothing. */
const KNOWN_PLUGINS = [
  "@excaliburjs/plugin-aseprite",
  "@excaliburjs/plugin-jsfxr",
  "@excaliburjs/plugin-ldtk",
  "@excaliburjs/plugin-pathfinding",
  "@excaliburjs/plugin-perlin",
  "@excaliburjs/plugin-spritefusion",
  "@excaliburjs/plugin-tiled",
];

const PLUGIN_INDEX_OPTIONS = {
  fields: ["title", "heading", "breadcrumb", "text"],
  storeFields: ["slug", "anchor", "title", "heading", "section", "preview", "url"],
  searchOptions: {
    boost: { title: 4, heading: 2, breadcrumb: 1.5 },
    prefix: true,
    fuzzy: 0.2,
    combineWith: "AND",
  },
};

function readmePath(short) {
  return path.join(pluginsCacheRoot(), "files", `${short}.md`);
}
export function pluginsManifestPath() {
  return path.join(pluginsCacheRoot(), "manifest.json");
}
function indexFile() {
  return path.join(pluginsCacheRoot(), "index.json");
}

export function readPluginsManifest() {
  return readJsonSync(pluginsManifestPath());
}

export function hasPluginIndex() {
  return fs.existsSync(indexFile()) && fs.existsSync(pluginsManifestPath());
}

export function pluginSlug(short) {
  return `/plugins/${short}`;
}

export function readPluginReadme(short) {
  try {
    return fs.readFileSync(readmePath(short), "utf8");
  } catch {
    return null;
  }
}

export async function writePluginReadme(short, contents) {
  await writeFileAtomic(readmePath(short), contents);
}

function normalizeRepoUrl(url) {
  if (!url) return null;
  let u = String(url).replace(/^git\+/, "").replace(/\.git$/, "");
  u = u.replace(/^git:\/\//, "https://").replace(/^ssh:\/\/git@/, "https://");
  return /^https?:\/\//.test(u) ? u : null;
}

/**
 * Manifest entry + readme from a full npm registry document.
 * @returns {{ entry: {name, short, version, description, repoUrl}, readme: string|null } | null}
 */
export function pluginEntryFromRegistryDoc(doc) {
  const name = doc?.name;
  if (typeof name !== "string" || !name.startsWith(PLUGIN_SCOPE_PREFIX)) return null;
  const readme = typeof doc.readme === "string" && doc.readme.trim() ? doc.readme : null;
  return {
    entry: {
      name,
      short: name.slice(PLUGIN_SCOPE_PREFIX.length),
      version: doc["dist-tags"]?.latest ?? null,
      description: typeof doc.description === "string" ? doc.description : "",
      repoUrl: normalizeRepoUrl(doc.repository?.url) ?? `https://www.npmjs.com/package/${name}`,
    },
    readme,
  };
}

/** Current @excaliburjs/plugin-* package names (registry search, curated fallback). */
export async function discoverPlugins() {
  try {
    const data = await requestJson(
      `${NPM_REGISTRY}/-/v1/search?text=${encodeURIComponent("@excaliburjs")}&size=100`,
      { headers: NPM_HEADERS }
    );
    const names = (data?.objects ?? [])
      .map((o) => o?.package?.name)
      .filter((n) => typeof n === "string" && n.startsWith(PLUGIN_SCOPE_PREFIX));
    if (names.length) return [...new Set(names)].sort();
  } catch {
    // registry search unavailable — use the curated set
  }
  return [...KNOWN_PLUGINS];
}

/**
 * Build a MiniSearch index over the cached READMEs: one document per section.
 * Docs store their final `url` (GitHub repo README anchors), since these pages
 * do not live on excaliburjs.com.
 */
export function buildPluginIndex(entries) {
  const index = new MiniSearch(PLUGIN_INDEX_OPTIONS);
  const docs = [];
  let id = 0;
  for (const entry of entries) {
    const src = readPluginReadme(entry.short);
    if (src == null) continue;
    const { body } = parseFrontmatter(src);
    for (const section of splitSections(body)) {
      const text = plainText(section.markdown);
      if (!text && !section.heading) continue;
      const heading = section.heading && section.heading !== entry.name ? section.heading : "";
      docs.push({
        id: id++,
        slug: pluginSlug(entry.short),
        anchor: section.anchor,
        title: entry.name,
        heading,
        section: "plugins",
        breadcrumb: ["plugins", entry.name].join(" › "),
        text,
        preview: text.slice(0, 240),
        url: section.anchor ? `${entry.repoUrl}#${section.anchor}` : entry.repoUrl,
      });
    }
  }
  index.addAll(docs);
  return index;
}

export async function savePluginIndex(index) {
  await writeFileAtomic(indexFile(), JSON.stringify(index.toJSON()));
  loadedIndexes.delete(indexFile());
}

// Keyed by resolved path so tests that repoint EXCALIBUR_HOME don't see stale indexes.
const loadedIndexes = new Map();
function loadPluginIndex() {
  const file = indexFile();
  if (loadedIndexes.has(file)) return loadedIndexes.get(file);
  if (!fs.existsSync(file)) return null;
  const index = MiniSearch.loadJSON(fs.readFileSync(file, "utf8"), PLUGIN_INDEX_OPTIONS);
  loadedIndexes.set(file, index);
  return index;
}

/** Search the plugin READMEs. Same hit shape as the other sources, kind "plugin". */
export function searchPlugins(query, { limit = DEFAULT_LIMIT } = {}) {
  const index = loadPluginIndex();
  if (!index) return null;
  let results = index.search(query);
  if (results.length === 0) {
    results = index.search(query, { combineWith: "OR" });
  }
  const seen = new Set();
  const hits = [];
  for (const r of results) {
    const key = `${r.slug}#${r.anchor ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      kind: "plugin",
      title: r.heading || r.title,
      breadcrumb: r.heading ? ["plugins", r.title].join(" › ") : r.section ?? "",
      url: r.url,
      slug: r.slug,
      anchor: r.anchor,
      snippet: r.preview,
      score: r.score,
      source: "local",
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

/**
 * Load a cached plugin README as a page (same shape as loadPage's result, so
 * pageSectionMarkdown works unchanged). `slug` is "/plugins/<short>".
 */
export function loadPluginPage(slug) {
  const short = String(slug).replace(/^\/plugins\//, "");
  const manifest = readPluginsManifest();
  const entry = manifest?.plugins?.find((p) => p.short === short || p.name === short);
  const src = entry ? readPluginReadme(entry.short) : null;
  if (!entry || src == null) {
    throw new DocsNotFoundError(`No plugin docs for ${slug}.`, {
      hint: "Run `ex docs offline` to download the plugin READMEs.",
    });
  }
  const { body } = parseFrontmatter(src);
  return {
    ref: null,
    path: null,
    slug: pluginSlug(entry.short),
    title: entry.name,
    section: "plugins",
    url: entry.repoUrl,
    version: entry.version,
    markdown: body,
    sections: splitSections(body),
  };
}

/**
 * Fetch every plugin's registry doc, cache the READMEs, and rebuild the index.
 * Individual plugin failures become warnings; throws only when nothing synced.
 * @returns {{ plugins: number, warnings: string[] }}
 */
export async function syncPlugins({ onProgress } = {}) {
  const names = await discoverPlugins();
  const warnings = [];
  let done = 0;
  const results = await mapConcurrent(names, FETCH_CONCURRENCY, async (name) => {
    try {
      const doc = await requestJson(`${NPM_REGISTRY}/${name.replace("/", "%2F")}`, { headers: NPM_HEADERS });
      const parsed = pluginEntryFromRegistryDoc(doc);
      if (!parsed) return null;
      if (!parsed.readme) {
        warnings.push(`${name}: the registry doc has no readme`);
        return null;
      }
      await writePluginReadme(parsed.entry.short, parsed.readme);
      return parsed.entry;
    } catch (error) {
      warnings.push(`${name}: ${error?.message ?? error}`);
      return null;
    } finally {
      done++;
      onProgress?.(done, names.length);
    }
  });
  const plugins = results.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  if (!plugins.length) {
    throw new DocsNetworkError(
      `Couldn't fetch any plugin READMEs from the npm registry${warnings.length ? ` (${warnings[0]})` : ""}.`
    );
  }
  await savePluginIndex(buildPluginIndex(plugins));
  await writeJsonAtomic(pluginsManifestPath(), { syncedAt: new Date().toISOString(), plugins });
  return { plugins: plugins.length, warnings };
}
