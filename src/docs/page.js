import * as path from "node:path";
import { readCachedFile } from "./cache.js";
import { getPageSource, readApiSymbols, resolvePagePath } from "./fetch-docs.js";
import { DocsNotFoundError } from "./errors.js";
import { docsUrlForSlug, extractSection, parseFrontmatter, slugFromPath, splitSections, toMarkdown } from "./mdx.js";

const RAW_IMPORT_RE = /^import\s+\w+\s+from\s+['"]!!raw-loader!(.+?)['"];?\s*$/gm;

export function joinDocsPath(fromFile, rel) {
  const dir = fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/")) : "";
  return path.posix.normalize(path.posix.join(dir, rel));
}

/**
 * Load a docs page (by slug or path) at `ref`, converting it to markdown.
 * Fetches the page (and its example snippets) on demand when not cached.
 */
export async function loadPage(ref, { slug = null, path: relPath = null }) {
  if (!relPath) {
    if (!slug) throw new DocsNotFoundError("No page specified");
    relPath = await resolvePagePath(ref, slug);
    if (!relPath) {
      throw new DocsNotFoundError(`Couldn't find a docs page for ${slug} at ${ref}`, {
        hint: "The page may be newer or older than the selected docs version. Try `--ref main`.",
      });
    }
  }
  const src = await getPageSource(ref, relPath);
  const fm = parseFrontmatter(src);

  // Prefetch raw-loader example files so the (sync) converter can inline them.
  const imports = [...fm.body.matchAll(RAW_IMPORT_RE)].map((m) => joinDocsPath(relPath, m[1]));
  await Promise.all(
    imports.map((p) =>
      getPageSource(ref, p).catch(() => null)
    )
  );

  const symbols = readApiSymbols();
  const markdown = toMarkdown(fm.body, {
    docRelPath: relPath,
    ref,
    symbols,
    resolveImport: (rel) => readCachedFile(ref, joinDocsPath(relPath, rel)),
  });
  const pageSlug = fm.slug ?? slug ?? slugFromPath(relPath);
  return {
    ref,
    path: relPath,
    slug: pageSlug,
    title: fm.title ?? path.basename(relPath, path.extname(relPath)),
    section: fm.section,
    url: docsUrlForSlug(pageSlug),
    markdown,
    sections: splitSections(markdown),
  };
}

/** Markdown for the requested anchor (with sub-sections), or the whole page. */
export function pageSectionMarkdown(page, anchor, { full = false } = {}) {
  if (full || !anchor) return { markdown: page.markdown, partial: false };
  const section = extractSection(page.sections, anchor);
  if (!section) return { markdown: page.markdown, partial: false };
  return { markdown: section, partial: true };
}
