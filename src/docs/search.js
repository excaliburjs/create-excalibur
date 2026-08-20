import { searchAlgolia } from "./algolia.js";
import { hasIndex } from "./cache.js";
import { DocsError, DocsNetworkError } from "./errors.js";
import { searchLocal } from "./local-index.js";

/**
 * Search the docs live via Algolia, falling back to the offline index when the
 * network is unavailable. This is the single home of the live→offline policy;
 * both the `ex docs` flow and the MCP `docs_search` tool go through it.
 *
 * @param {object} opts
 * @param {string} opts.query
 * @param {string} opts.ref cache ref for the offline index (e.g. "v0.32.0" or "main")
 * @param {number} [opts.limit]
 * @param {"docs"|"api"|null} [opts.kind] live-search filter (offline index is docs-only)
 * @param {boolean} [opts.offline] force the offline index
 * @param {AbortSignal|null} [opts.signal]
 * @returns {Promise<{hits: object[], source: "algolia"|"local", fallback?: DocsNetworkError}>}
 */
export async function runDocsSearch({ query, ref, limit, kind = null, offline = false, signal = null }) {
  const localAvailable = hasIndex(ref);
  if (offline) {
    if (!localAvailable) {
      throw new DocsError(`No offline docs for ${ref}.`, { hint: `Run \`ex docs offline${ref !== "main" ? ` --ref ${ref}` : ""}\` first.` });
    }
    return { hits: searchLocal(ref, query, { limit }), source: "local" };
  }
  try {
    const hits = await searchAlgolia(query, { limit, kind, signal });
    return { hits, source: "algolia" };
  } catch (error) {
    if (error instanceof DocsNetworkError && localAvailable) {
      return { hits: searchLocal(ref, query, { limit }), source: "local", fallback: error };
    }
    if (error instanceof DocsNetworkError) {
      error.hint = "You seem to be offline. Run `ex docs offline` while online to enable offline search.";
    }
    throw error;
  }
}
