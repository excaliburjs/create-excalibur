import * as fs from "node:fs";
import MiniSearch from "minisearch";
import { DEFAULT_LIMIT } from "./constants.js";
import { indexPath, readCachedFile, writeFileAtomic } from "./cache.js";
import { docsUrlForSlug, parseFrontmatter, splitSections, stripInline, toMarkdown } from "./mdx.js";

const INDEX_OPTIONS = {
  fields: ["title", "heading", "breadcrumb", "text"],
  storeFields: ["slug", "anchor", "title", "heading", "section", "path", "preview"],
  searchOptions: {
    boost: { title: 4, heading: 2, breadcrumb: 1.5 },
    prefix: true,
    fuzzy: 0.2,
    combineWith: "AND",
  },
};

function plainText(markdown) {
  let inFence = false;
  const out = [];
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

/**
 * Build a MiniSearch index: one document per page section.
 * @param {string} ref
 * @param {Array<{path, slug, title, section}>} pages
 */
export function buildIndex(ref, pages) {
  const index = new MiniSearch(INDEX_OPTIONS);
  const docs = [];
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

export async function saveIndex(ref, index) {
  await writeFileAtomic(indexPath(ref), JSON.stringify(index.toJSON()));
}

const loaded = new Map();
export function loadIndex(ref) {
  if (loaded.has(ref)) return loaded.get(ref);
  const file = indexPath(ref);
  if (!fs.existsSync(file)) return null;
  const index = MiniSearch.loadJSON(fs.readFileSync(file, "utf8"), INDEX_OPTIONS);
  loaded.set(ref, index);
  return index;
}

/**
 * Search the offline index. Returns the same normalized hit shape as algolia.js.
 */
export function searchLocal(ref, query, { limit = DEFAULT_LIMIT } = {}) {
  const index = loadIndex(ref);
  if (!index) return null;
  let results = index.search(query);
  if (results.length === 0) {
    // Relax: any term may match.
    results = index.search(query, { combineWith: "OR" });
  }
  const seen = new Set();
  const hits = [];
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
