import * as fs from "node:fs";
import * as path from "node:path";
import {
  ALGOLIA,
  ALGOLIA_ENDPOINT,
  DOCS_DIR_IN_REPO,
  FETCH_CONCURRENCY,
  GITHUB_API,
  GITHUB_RAW,
  GITHUB_REPO,
  TREE_CACHE_TTL_MS,
} from "./constants.ts";
import {
  cacheRoot,
  filesDir,
  manifestPath,
  readCachedFile,
  readJsonSync,
  readManifest,
  readSlugMap,
  recordSlugs,
  treePath,
  writeCachedFile,
  writeJsonAtomic,
} from "./cache.ts";
import { githubHeaders, mapConcurrent, requestJson, requestText } from "./http.ts";
import { DocsNotFoundError } from "./errors.ts";
import { parseFrontmatter, slugFromPath } from "./mdx.ts";
import { buildIndex, saveIndex } from "./local-index.ts";
import type { DocsManifest, DocsPageEntry, TreeFile } from "./types.ts";

const KEEP_RE = /\.(mdx?|ts|js|json)$/i;

/** One entry of the raw GitHub tree response. */
interface GitTreeEntry {
  path: string;
  type: string;
  sha: string;
  size?: number;
}

/** The cached (filtered) tree for a ref. */
export interface DocsTree {
  ref: string;
  sha: string;
  truncated: boolean;
  fetchedAt: string;
  files: TreeFile[];
}

/** Keep only the text-ish docs files (no images/sounds). Paths are site/docs-relative. */
export function filterDocsTree(tree: GitTreeEntry[] | null | undefined): TreeFile[] {
  return (tree ?? [])
    .filter((e) => e.type === "blob" && e.path.startsWith(DOCS_DIR_IN_REPO) && KEEP_RE.test(e.path))
    .map((e) => ({ path: e.path.slice(DOCS_DIR_IN_REPO.length), sha: e.sha, size: e.size ?? 0 }));
}

/** Fetch (or reuse a fresh cached copy of) the repo tree at `ref`. */
export async function loadTree(ref: string, { force = false }: { force?: boolean } = {}): Promise<DocsTree> {
  const cached = readJsonSync<DocsTree>(treePath(ref));
  if (!force && cached && Date.now() - Date.parse(cached.fetchedAt) < TREE_CACHE_TTL_MS) {
    return cached;
  }
  const url = `${GITHUB_API}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
  let data;
  try {
    data = await requestJson<{ sha: string; truncated?: boolean; tree?: GitTreeEntry[] }>(
      url,
      { headers: githubHeaders() },
      { timeout: 20000 }
    );
  } catch (error) {
    if (error instanceof DocsNotFoundError) {
      throw new DocsNotFoundError(`Ref "${ref}" doesn't exist in ${GITHUB_REPO}.`, {
        hint: "Pass a release tag like `--ref v0.32.0`, or `--ref main` for the latest docs.",
        cause: error,
      });
    }
    throw error;
  }
  const files = filterDocsTree(data.tree);
  if (files.length === 0) {
    throw new DocsNotFoundError(`No docs found under ${DOCS_DIR_IN_REPO} at ref "${ref}"`, {
      hint: "Older Excalibur releases did not ship docs in the repo. Try `--ref main`.",
    });
  }
  const tree: DocsTree = { ref, sha: data.sha, truncated: Boolean(data.truncated), fetchedAt: new Date().toISOString(), files };
  await writeJsonAtomic(treePath(ref), tree);
  return tree;
}

export function rawUrl(refOrSha: string, relPath: string): string {
  return `${GITHUB_RAW}/${refOrSha}/${DOCS_DIR_IN_REPO}${relPath.split("/").map(encodeURIComponent).join("/")}`;
}

export interface SyncDocsResult {
  manifest: DocsManifest;
  fetched: number;
  total: number;
  pages: number;
}

/** Download the docs corpus for `ref` into the cache and build the offline index. */
export async function syncDocs(
  ref: string,
  { onProgress, force = false }: { onProgress?: (done: number, total: number) => void; force?: boolean } = {}
): Promise<SyncDocsResult> {
  const tree = await loadTree(ref, { force });
  const previous = force ? null : readManifest(ref);
  const previousSha = new Map((previous?.files ?? []).map((f) => [f.path, f.sha]));

  const toFetch = tree.files.filter(
    (f) => force || previousSha.get(f.path) !== f.sha || !fs.existsSync(path.join(filesDir(ref), f.path))
  );

  let done = 0;
  await mapConcurrent(toFetch, FETCH_CONCURRENCY, async (file) => {
    const contents = await requestText(rawUrl(tree.sha, file.path), {}, { timeout: 20000 });
    await writeCachedFile(ref, file.path, contents);
    done++;
    onProgress?.(done, toFetch.length);
  });

  // Remove files that disappeared upstream.
  const keep = new Set(tree.files.map((f) => f.path));
  for (const old of previous?.files ?? []) {
    if (!keep.has(old.path)) {
      try {
        fs.rmSync(path.join(filesDir(ref), old.path), { force: true });
      } catch {
        /* ignore */
      }
    }
  }

  const pages = buildPageList(ref, tree.files);
  const manifest: DocsManifest = {
    ref,
    commitSha: tree.sha,
    syncedAt: new Date().toISOString(),
    files: tree.files,
    pages,
  };
  await writeJsonAtomic(manifestPath(ref), manifest);

  const index = buildIndex(ref, pages);
  await saveIndex(ref, index);

  return { manifest, fetched: toFetch.length, total: tree.files.length, pages: pages.length };
}

/** Build the slug → page metadata list from cached mdx files. */
export function buildPageList(ref: string, files: TreeFile[]): DocsPageEntry[] {
  const pages: DocsPageEntry[] = [];
  for (const file of files) {
    if (!/\.mdx?$/i.test(file.path)) continue;
    const src = readCachedFile(ref, file.path);
    if (src == null) continue;
    const { slug, title, section } = parseFrontmatter(src);
    pages.push({
      path: file.path,
      slug: slug ?? slugFromPath(file.path),
      title: title ?? path.basename(file.path, path.extname(file.path)),
      section: section ?? sectionFromPath(file.path),
    });
  }
  return pages;
}

function sectionFromPath(relPath: string): string {
  const dir = relPath.includes("/") ? relPath.slice(0, relPath.indexOf("/")) : "";
  return dir.replace(/^\d+(?:\.\d+)?-/, "").replace(/-/g, " ");
}

/**
 * Resolve a docs slug to its file path at `ref`, using the manifest if synced,
 * otherwise the (cached) tree + a cheap slug guess, verified by fetching frontmatter.
 */
export async function resolvePagePath(ref: string, slug: string): Promise<string | null> {
  const manifest = readManifest(ref);
  const fromManifest = manifest?.pages?.find((p) => p.slug === slug);
  if (fromManifest) return fromManifest.path;
  const learned = readSlugMap(ref)[slug];
  if (learned) return learned;

  const tree = await loadTree(ref);
  const mdx = tree.files.filter((f) => /\.mdx?$/i.test(f.path));
  const last = (s: string) => s.split("/").filter(Boolean).pop() ?? "";
  const target = last(slug);
  // Rank cheap guesses first: exact slug-from-path, then matching last segment.
  const ranked = [
    ...mdx.filter((f) => slugFromPath(f.path) === slug),
    ...mdx.filter((f) => slugFromPath(f.path) !== slug && last(slugFromPath(f.path)) === target),
  ];
  const rest = mdx.filter((f) => !ranked.includes(f));

  const learnedEntries: Array<[string, string]> = [];
  const slugOf = async (file: TreeFile): Promise<string> => {
    const src = await getPageSource(ref, file.path, tree.sha);
    const s = parseFrontmatter(src).slug ?? slugFromPath(file.path);
    learnedEntries.push([s, file.path]);
    return s;
  };
  try {
    for (const file of ranked) {
      if ((await slugOf(file)) === slug) return file.path;
    }
    // Fall back to scanning the frontmatter of everything else (≈140 small files).
    const found = await mapConcurrent(rest, FETCH_CONCURRENCY, async (file) =>
      (await slugOf(file)) === slug ? file.path : null
    );
    return found.find(Boolean) ?? null;
  } finally {
    await recordSlugs(ref, learnedEntries);
  }
}

/** Get a docs file's contents from cache, fetching and caching it if missing. */
export async function getPageSource(ref: string, relPath: string, sha: string | null = null): Promise<string> {
  const cached = readCachedFile(ref, relPath);
  if (cached != null) return cached;
  const resolvedSha = sha ?? (await loadTree(ref)).sha;
  const contents = await requestText(rawUrl(resolvedSha, relPath), {}, { timeout: 20000 });
  await writeCachedFile(ref, relPath, contents);
  return contents;
}

// ---------------------------------------------------------------------------
// API symbol map (symbol name → typedoc URL), sourced from the live Algolia index.
// Shared across refs (the live site only indexes "current").
// ---------------------------------------------------------------------------
export function apiSymbolsPath(): string {
  return path.join(cacheRoot(), "docs", "api-symbols.json");
}

export function readApiSymbols(): Record<string, string> | null {
  return readJsonSync<{ symbols?: Record<string, string> }>(apiSymbolsPath())?.symbols ?? null;
}

export async function syncApiSymbols(): Promise<Record<string, string>> {
  const data = await requestJson<{ hits?: Array<{ url?: string; hierarchy?: { lvl1?: string | null } }> }>(
    ALGOLIA_ENDPOINT,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Algolia-API-Key": ALGOLIA.apiKey,
        "X-Algolia-Application-Id": ALGOLIA.appId,
      },
      body: JSON.stringify({
        query: "",
        hitsPerPage: 1000,
        distinct: true,
        attributesToRetrieve: ["url", "hierarchy.lvl1"],
        attributesToHighlight: [],
        attributesToSnippet: [],
      }),
    }
  );
  const symbols: Record<string, string> = {};
  for (const hit of data.hits ?? []) {
    const url = hit.url ?? "";
    const name = hit.hierarchy?.lvl1;
    if (!name || !/\/api\/(class|interface|function|enum|namespace|type|variable)\//.test(url)) continue;
    symbols[name.trim()] = url.split("#")[0];
  }
  await writeJsonAtomic(apiSymbolsPath(), { syncedAt: new Date().toISOString(), symbols });
  return symbols;
}
