/** Shared shapes for the docs search/sync feature. */

export type HitKind = "docs" | "api" | "plugin";
export type HitSource = "algolia" | "local";

/** One search result, shared between live (Algolia) and offline (MiniSearch) paths. */
export interface DocsHit {
  kind: HitKind;
  title: string;
  breadcrumb: string;
  url: string;
  slug: string | null;
  anchor: string | null;
  snippet: string;
  source: HitSource;
}

/** One entry of the GitHub tree listing we cache per ref. */
export interface TreeFile {
  path: string;
  sha: string;
  size?: number;
}

/** One docs page in the manifest (built from cached mdx frontmatter). */
export interface DocsPageEntry {
  path: string;
  slug: string;
  title: string;
  section: string;
}

export interface DocsManifest {
  ref: string;
  commitSha: string;
  syncedAt: string;
  files: TreeFile[];
  pages: DocsPageEntry[];
}
