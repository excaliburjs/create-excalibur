import * as path from "node:path";
import { readCachedFile } from "./cache.ts";
import { getPageSource, readApiSymbols, resolvePagePath } from "./fetch-docs.ts";
import { DocsNotFoundError } from "./errors.ts";
import { docsUrlForSlug, extractSection, parseFrontmatter, slugFromPath, splitSections, toMarkdown, type MdxSection } from "./mdx.ts";

const RAW_IMPORT_RE = /^import\s+\w+\s+from\s+['"]!!raw-loader!(.+?)['"];?\s*$/gm;

/**
 * A loaded, markdown-converted page. Docs pages always have ref/path; plugin
 * README pages (loadPluginPage) share this shape with ref/path null.
 */
export interface DocsPage {
  ref: string | null;
  path: string | null;
  slug: string;
  title: string;
  section: string | null;
  url: string;
  version?: string | null;
  markdown: string;
  sections: MdxSection[];
}

export function joinDocsPath(fromFile: string, rel: string): string {
  const dir = fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/")) : "";
  return path.posix.normalize(path.posix.join(dir, rel));
}

/**
 * Load a docs page (by slug or path) at `ref`, converting it to markdown.
 * Fetches the page (and its example snippets) on demand when not cached.
 */
export async function loadPage(
  ref: string,
  { slug = null, path: relPath = null }: { slug?: string | null; path?: string | null }
): Promise<DocsPage> {
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
  const imports = [...fm.body.matchAll(RAW_IMPORT_RE)].map((m) => joinDocsPath(relPath!, m[1]));
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
    resolveImport: (rel) => readCachedFile(ref, joinDocsPath(relPath!, rel)),
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
export function pageSectionMarkdown(
  page: DocsPage,
  anchor: string | null | undefined,
  { full = false }: { full?: boolean } = {}
): { markdown: string; partial: boolean } {
  if (full || !anchor) return { markdown: page.markdown, partial: false };
  const section = extractSection(page.sections, anchor);
  if (!section) return { markdown: page.markdown, partial: false };
  return { markdown: section, partial: true };
}
