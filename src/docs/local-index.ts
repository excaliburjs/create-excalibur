import * as fs from "node:fs";
import MiniSearch, { type Options } from "minisearch";
import { DEFAULT_LIMIT } from "./constants.ts";
import { indexPath, readCachedFile, writeFileAtomic } from "./cache.ts";
import { docsUrlForSlug, parseFrontmatter, splitSections, stripInline, toMarkdown } from "./mdx.ts";
import type { DocsHit, DocsPageEntry } from "./types.ts";

/** One MiniSearch document = one page *section*. */
interface IndexedSectionDoc {
  id: number;
  slug: string;
  path: string;
  anchor: string | null;
  title: string;
  section: string;
  heading: string;
  breadcrumb: string;
  text: string;
  preview: string;
}

/** Offline hit: the shared hit shape plus local-only extras. */
export interface LocalHit extends DocsHit {
  path?: string | null;
  score?: number;
}

const INDEX_OPTIONS: Options<IndexedSectionDoc> = {
  fields: ["title", "heading", "breadcrumb", "text"],
  storeFields: ["slug", "anchor", "title", "heading", "section", "path", "preview"],
  searchOptions: {
    boost: { title: 4, heading: 2, breadcrumb: 1.5 },
    prefix: true,
    fuzzy: 0.2,
    combineWith: "AND",
  },
};

/** Markdown → space-joined plain text for indexing (fence bodies kept verbatim). */
export function plainText(markdown: string): string {
  let inFence = false;
  const out: string[] = [];
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    if (/^#{1,6}\s/.test(line)) continue;
    out.push(stripInline(line.replace(/^>\s?/, "")));
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

/** Build a MiniSearch index: one document per page section. */
export function buildIndex(ref: string, pages: DocsPageEntry[]): MiniSearch<IndexedSectionDoc> {
  const index = new MiniSearch(INDEX_OPTIONS);
  const docs: IndexedSectionDoc[] = [];
  let id = 0;
  for (const page of pages) {
    const src = readCachedFile(ref, page.path);
    if (src == null) continue;
    const { body } = parseFrontmatter(src);
    const markdown = toMarkdown(body, { docRelPath: page.path, ref });
    const sections = splitSections(markdown);
    for (const section of sections) {
      const text = plainText(section.markdown);
      if (!text && !section.heading) continue;
      const heading = section.heading && section.heading !== page.title ? section.heading : "";
      docs.push({
        id: id++,
        slug: page.slug,
        path: page.path,
        anchor: section.anchor,
        title: page.title,
        section: page.section,
        heading,
        breadcrumb: [page.section, page.title].filter(Boolean).join(" › "),
        text,
        preview: text.slice(0, 240),
      });
    }
  }
  index.addAll(docs);
  return index;
}

export async function saveIndex(ref: string, index: MiniSearch<IndexedSectionDoc>): Promise<void> {
  await writeFileAtomic(indexPath(ref), JSON.stringify(index.toJSON()));
}

const loaded = new Map<string, MiniSearch<IndexedSectionDoc>>();
export function loadIndex(ref: string): MiniSearch<IndexedSectionDoc> | null {
  if (loaded.has(ref)) return loaded.get(ref) ?? null;
  const file = indexPath(ref);
  if (!fs.existsSync(file)) return null;
  const index = MiniSearch.loadJSON<IndexedSectionDoc>(fs.readFileSync(file, "utf8"), INDEX_OPTIONS);
  loaded.set(ref, index);
  return index;
}

/**
 * Search the offline index. Returns the same normalized hit shape as algolia.js.
 */
export function searchLocal(ref: string, query: string, { limit = DEFAULT_LIMIT }: { limit?: number } = {}): LocalHit[] | null {
  const index = loadIndex(ref);
  if (!index) return null;
  let results = index.search(query);
  if (results.length === 0) {
    // Relax: any term may match.
    results = index.search(query, { combineWith: "OR" });
  }
  const seen = new Set<string>();
  const hits: LocalHit[] = [];
  for (const r of results) {
    const key = `${r.slug}#${r.anchor ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const pageUrl = docsUrlForSlug(r.slug);
    hits.push({
      kind: "docs",
      title: r.heading || r.title,
      breadcrumb: r.heading ? [r.section, r.title].filter(Boolean).join(" › ") : r.section ?? "",
      url: r.anchor ? `${pageUrl}#${r.anchor}` : pageUrl,
      slug: r.slug,
      anchor: r.anchor,
      path: r.path,
      snippet: r.preview,
      score: r.score,
      source: "local",
    });
    if (hits.length >= limit) break;
  }
  return hits;
}
