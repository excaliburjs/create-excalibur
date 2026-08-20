import path from "node:path";
import { plainSnippet } from "../../docs/algolia.js";
import { docsCacheRoot } from "../../docs/cache.js";
import { DocsError } from "../../docs/errors.js";
import { syncApiSymbols, syncDocs } from "../../docs/fetch-docs.js";
import { loadPage, pageSectionMarkdown } from "../../docs/page.js";
import { loadPluginPage, syncPlugins } from "../../docs/plugins.js";
import { runDocsSearch } from "../../docs/search.js";
import { detectExcaliburVersion, refForVersion } from "../../docs/version.js";
import { jsonResult, textResult } from "../result.js";

const PROJECT_DIR_PROP = {
  projectDir: {
    type: "string",
    description: "Absolute path to the project root (used to auto-detect the installed Excalibur version). Defaults to the server's working directory.",
  },
};

const REF_PROP = {
  ref: {
    type: "string",
    description: 'Docs version ref, e.g. "v0.32.0" or "main". Defaults to the version matching the project\'s installed excalibur (or "main").',
  },
};

export function resolveProjectDir(args, ctx) {
  return path.resolve(ctx.defaultProjectDir, args.projectDir ?? ".");
}

function resolveRef(args, ctx) {
  if (args.ref) return args.ref;
  const projectDir = resolveProjectDir(args, ctx);
  return refForVersion(detectExcaliburVersion(projectDir).version);
}

/** Rewrite CLI-facing hints ("run `ex docs offline`") into tool-facing ones. */
function toolifyHint(error) {
  if (error instanceof DocsError && typeof error.hint === "string" && error.hint.includes("ex docs offline")) {
    error.hint = "Call the docs_sync tool first to download the docs for offline use.";
  }
  if (error instanceof DocsError && typeof error.hint === "string" && error.hint.includes("--ref main")) {
    error.hint = error.hint.replace(/--ref main/g, 'ref: "main"');
  }
  return error;
}

export const docsTools = [
  {
    name: "docs_search",
    description:
      "Search the Excalibur.js documentation, API reference, and @excaliburjs/* plugin READMEs. Returns hits with title, url, snippet, and (for docs/plugin pages) a slug/path usable with docs_get_page. Searches live by default, falling back to the offline cache when the network is unavailable; plugin hits always come from the offline plugin index (see docs_sync).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search terms, e.g. \"actor collision events\"." },
        limit: { type: "integer", minimum: 1, maximum: 25, description: "Max results (default 10)." },
        kind: { type: "string", enum: ["docs", "api", "plugin"], description: "Restrict to guide docs, API reference, or @excaliburjs plugin READMEs. Omit for all." },
        offline: { type: "boolean", description: "Force the offline index (requires a prior docs_sync). Default false." },
        ...REF_PROP,
        ...PROJECT_DIR_PROP,
      },
      required: ["query"],
    },
    async handler(args, ctx) {
      const ref = resolveRef(args, ctx);
      let result;
      try {
        result = await runDocsSearch({
          query: args.query,
          ref,
          limit: args.limit ?? 10,
          kind: args.kind ?? null,
          offline: args.offline ?? false,
        });
      } catch (error) {
        throw toolifyHint(error);
      }
      const hits = result.hits.map((h) => ({ ...h, snippet: plainSnippet(h.snippet) }));
      const payload = { source: result.source, ref, hits };
      if (result.fallback) payload.fallback = `Live search unavailable (${result.fallback.message}); used the offline index.`;
      return jsonResult(payload);
    },
  },
  {
    name: "docs_get_page",
    description:
      "Fetch an Excalibur docs page or plugin README (or one section of it) as markdown. Pass a slug or path from docs_search results; plugin pages use \"/plugins/<name>\" slugs and require a prior docs_sync. Docs pages fetch on demand — no prior docs_sync needed when online.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: 'Page slug from a docs_search hit, e.g. "/colliders-and-shapes" ("/" is the docs root) or "/plugins/tiled" for a plugin README.' },
        path: { type: "string", description: "site/docs-relative mdx path from an offline docs_search hit. Provide either slug or path, not both." },
        anchor: { type: "string", description: "Section anchor from a docs_search hit — returns just that section." },
        full: { type: "boolean", description: "Return the whole page even when anchor is set. Default false." },
        ...REF_PROP,
        ...PROJECT_DIR_PROP,
      },
    },
    async handler(args, ctx) {
      const hasSlug = typeof args.slug === "string";
      const hasPath = typeof args.path === "string";
      if (hasSlug === hasPath) {
        throw new DocsError("docs_get_page needs exactly one of slug or path.", {
          hint: "Use the slug (docs hits) or path (offline hits) from a docs_search result.",
        });
      }
      const isPlugin = hasSlug && args.slug.startsWith("/plugins/");
      let page;
      try {
        page = isPlugin
          ? loadPluginPage(args.slug)
          : await loadPage(resolveRef(args, ctx), { slug: args.slug ?? null, path: args.path ?? null });
      } catch (error) {
        throw toolifyHint(error);
      }
      const { markdown, partial } = pageSectionMarkdown(page, args.anchor ?? null, { full: args.full ?? false });
      const preamble = [
        `Title: ${page.title}`,
        `URL: ${page.url}`,
        `Ref: ${isPlugin ? `plugin@${page.version ?? "latest"}` : page.ref}`,
        `Section: ${partial ? `${args.anchor} (partial)` : "full page"}`,
      ].join("\n");
      return textResult(`${preamble}\n\n${markdown}`);
    },
  },
  {
    name: "docs_sync",
    description:
      "Download the Excalibur docs for a version (plus @excaliburjs plugin READMEs) into the local cache to enable offline docs_search and plugin search. Slow (fetches the whole docs tree); needed for offline use, version-pinned search, or plugin-README search.",
    inputSchema: {
      type: "object",
      properties: {
        force: { type: "boolean", description: "Re-download even if the cache is fresh. Default false." },
        apiSymbols: { type: "boolean", description: "Also refresh the API symbol link map. Default true." },
        plugins: { type: "boolean", description: "Also fetch @excaliburjs/plugin-* READMEs from npm and index them. Default true." },
        ...REF_PROP,
        ...PROJECT_DIR_PROP,
      },
    },
    async handler(args, ctx) {
      const ref = resolveRef(args, ctx);
      const warnings = [];
      const { fetched, total, pages } = await syncDocs(ref, { force: args.force ?? false });
      if (args.apiSymbols ?? true) {
        await syncApiSymbols().catch((error) => {
          warnings.push(`API symbol sync failed: ${error?.message ?? error}`);
        });
      }
      let plugins = null;
      if (args.plugins ?? true) {
        try {
          const result = await syncPlugins();
          plugins = result.plugins;
          warnings.push(...result.warnings);
        } catch (error) {
          warnings.push(`Plugin README sync failed: ${error?.message ?? error}`);
        }
      }
      return jsonResult({ ref, pages, fetched, total, plugins, cacheDir: docsCacheRoot(), warnings });
    },
  },
];
