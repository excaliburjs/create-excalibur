import { ALGOLIA, ALGOLIA_ENDPOINT, DEFAULT_LIMIT, SITE_URL } from "./constants.js";
import { requestJson } from "./http.js";

// Private-use markers so highlighted terms survive until we colorize them.
export const HIGHLIGHT_PRE = "";
export const HIGHLIGHT_POST = "";

const ZERO_WIDTH_SPACE = /​/g;
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };
function unescapeHtml(s) {
  return String(s).replace(/&(#?\w+);/g, (m, name) => ENTITIES[name] ?? m);
}

/**
 * Normalize a DocSearch record into the hit shape shared with the local index.
 * @returns {{ kind:'docs'|'api', title:string, breadcrumb:string, url:string, slug:string|null, anchor:string|null, snippet:string, source:'algolia' }}
 */
export function normalizeHit(record) {
  const hierarchy = record.hierarchy ?? {};
  const levels = ["lvl0", "lvl1", "lvl2", "lvl3", "lvl4", "lvl5", "lvl6"]
    .map((k) => hierarchy[k])
    .filter((v) => typeof v === "string" && v.trim() !== "")
    .map((v) => unescapeHtml(v.replace(ZERO_WIDTH_SPACE, "")).trim());

  const url = record.url ?? "";
  let pathname = "";
  try {
    pathname = new URL(url, SITE_URL).pathname;
  } catch {
    pathname = "";
  }
  const kind = pathname.startsWith("/api") ? "api" : "docs";

  // Docs pages: deepest heading is the title. API pages (TypeDoc) are indexed as
  // "API › Symbol › <signature fragment>", so the symbol is the useful title.
  let title;
  let breadcrumb;
  if (kind === "api" && levels.length >= 2) {
    title = levels[1];
    breadcrumb = [levels[0], ...levels.slice(2)].join(" › ");
  } else {
    title = levels[levels.length - 1] ?? url;
    breadcrumb = levels.slice(0, -1).join(" › ");
  }

  let slug = null;
  if (kind === "docs" && pathname.startsWith("/docs")) {
    slug = pathname.slice("/docs".length).replace(/\/+$/, "") || "/";
  }

  const snippetRaw =
    record._snippetResult?.content?.value ??
    (record.type === "content" ? record.content ?? "" : "");
  const snippet = unescapeHtml(snippetRaw)
    .replace(/\s*[\r\n]+\s*/g, " ")
    .trim();

  return {
    kind,
    title,
    breadcrumb,
    url,
    slug,
    anchor: record.anchor || null,
    snippet,
    source: "algolia",
  };
}

/**
 * Query the excaliburjs.com DocSearch index.
 * @param {string} query
 * @param {{ limit?: number, kind?: 'docs'|'api'|null }} options
 */
/** Remove highlight markers (for machine-readable output). */
export function plainSnippet(snippet) {
  return String(snippet ?? "").split(HIGHLIGHT_PRE).join("").split(HIGHLIGHT_POST).join("");
}

export async function searchAlgolia(query, { limit = DEFAULT_LIMIT, kind = null, signal = null } = {}) {
  // Ask for more than we need so client-side dedupe / kind filtering can still fill `limit`.
  const hitsPerPage = Math.min(Math.max(limit * 3, 20), 100);
  const body = {
    query,
    hitsPerPage,
    attributesToRetrieve: ["hierarchy", "url", "anchor", "type", "content"],
    attributesToSnippet: ["content:30"],
    attributesToHighlight: [],
    highlightPreTag: HIGHLIGHT_PRE,
    highlightPostTag: HIGHLIGHT_POST,
    snippetEllipsisText: "…",
  };
  const data = await requestJson(ALGOLIA_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Algolia-API-Key": ALGOLIA.apiKey,
      "X-Algolia-Application-Id": ALGOLIA.appId,
    },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });

  const seen = new Set();
  const hits = [];
  for (const record of data.hits ?? []) {
    const hit = normalizeHit(record);
    if (kind && hit.kind !== kind) continue;
    if (!hit.url || seen.has(hit.url)) continue;
    seen.add(hit.url);
    hits.push(hit);
    if (hits.length >= limit) break;
  }
  return hits;
}
