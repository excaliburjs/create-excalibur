import { searchAlgolia } from "./algolia.js";
import { DEFAULT_LIMIT } from "./constants.js";
import { hasIndex } from "./cache.js";
import { DocsError, DocsNetworkError } from "./errors.js";
import { searchLocal } from "./local-index.js";
import { hasPluginIndex, searchPlugins } from "./plugins.js";

/**
 * Search the docs live via Algolia, falling back to the offline index when the
 * network is unavailable. This is the single home of the live→offline policy;
 * both the `ex docs` flow and the MCP `docs_search` tool go through it.
 *
 * @param {object} opts
 * @param {string} opts.query
 * @param {string} opts.ref cache ref for the offline index (e.g. "v0.32.0" or "main")
 * @param {number} [opts.limit]
 * @param {"docs"|"api"|"plugin"|null} [opts.kind] filter; "plugin" searches the offline plugin-README index
 * @param {boolean} [opts.offline] force the offline index
 * @param {AbortSignal|null} [opts.signal]
 * @returns {Promise<{hits: object[], source: "algolia"|"local", fallback?: DocsNetworkError}>}
 */
export async function runDocsSearch({ query, ref, limit, kind = null, offline = false, signal = null }) {
  // Plugin READMEs are never in Algolia — they always come from the local plugin index.
  if (kind === "plugin") {
    if (!hasPluginIndex()) {
      throw new DocsError("No plugin docs downloaded.", { hint: "Run `ex docs offline` first to fetch the plugin READMEs." });
    }
    return { hits: searchPlugins(query, { limit }) ?? [], source: "local" };
  }
  const localAvailable = hasIndex(ref);
  if (offline) {
    if (!localAvailable) {
      throw new DocsError(`No offline docs for ${ref}.`, { hint: `Run \`ex docs offline${ref !== "main" ? ` --ref ${ref}` : ""}\` first.` });
    }
    return withPluginHits({ hits: searchLocal(ref, query, { limit }), source: "local" }, query, kind, limit);
  }
  try {
    const hits = await searchAlgolia(query, { limit, kind, signal });
    return withPluginHits({ hits, source: "algolia" }, query, kind, limit);
  } catch (error) {
    if (error instanceof DocsNetworkError && localAvailable) {
      return withPluginHits({ hits: searchLocal(ref, query, { limit }), source: "local", fallback: error }, query, kind, limit);
    }
    if (error instanceof DocsNetworkError) {
      error.hint = "You seem to be offline. Run `ex docs offline` while online to enable offline search.";
    }
    throw error;
  }
}

/**
 * Append matching plugin-README hits to an unfiltered search, keeping the
 * total within `limit`: docs hits keep priority, plugins get up to 3 tail
 * slots (more when the docs hits don't fill the limit).
 */
function withPluginHits(result, query, kind, limit = DEFAULT_LIMIT) {
  if (kind !== null || !hasPluginIndex()) return result;
  limit = limit ?? DEFAULT_LIMIT;
  const pluginHits = searchPlugins(query, { limit }) ?? [];
  if (!pluginHits.length) return result;
  const reserve = Math.min(3, pluginHits.length, Math.floor(limit / 2));
  const docsTake = Math.min(result.hits.length, limit - reserve);
  return { ...result, hits: [...result.hits.slice(0, docsTake), ...pluginHits.slice(0, limit - docsTake)] };
}
