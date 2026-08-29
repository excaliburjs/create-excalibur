import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { CACHE_DIR_NAME } from "./constants.ts";
import type { DocsManifest } from "./types.ts";

export function cacheRoot(): string {
  return process.env.EXCALIBUR_HOME || path.join(os.homedir(), CACHE_DIR_NAME);
}

export function docsCacheRoot(): string {
  return path.join(cacheRoot(), "docs");
}

/** Plugin README cache — a sibling of docs/ so cachedRefs() never sees it. */
export function pluginsCacheRoot(): string {
  return path.join(cacheRoot(), "plugins");
}

/** Refs may contain `/` (branches) — keep them filesystem-safe. */
export function refDirName(ref: string): string {
  return ref.replace(/[\/\\:]/g, "_");
}

export function refDir(ref: string): string {
  return path.join(docsCacheRoot(), refDirName(ref));
}
export function filesDir(ref: string): string {
  return path.join(refDir(ref), "files");
}
export function manifestPath(ref: string): string {
  return path.join(refDir(ref), "manifest.json");
}
export function indexPath(ref: string): string {
  return path.join(refDir(ref), "index.json");
}
export function treePath(ref: string): string {
  return path.join(refDir(ref), "tree.json");
}
export function slugMapPath(ref: string): string {
  return path.join(refDir(ref), "slugs.json");
}

/** slug → site/docs-relative path, learned from pages fetched on demand. */
export function readSlugMap(ref: string): Record<string, string> {
  return readJsonSync<Record<string, string>>(slugMapPath(ref)) ?? {};
}
export async function recordSlugs(ref: string, entries: Iterable<readonly [string, string]>): Promise<void> {
  const map = readSlugMap(ref);
  let changed = false;
  for (const [slug, relPath] of entries) {
    if (slug && map[slug] !== relPath) {
      map[slug] = relPath;
      changed = true;
    }
  }
  if (changed) await writeJsonAtomic(slugMapPath(ref), map);
}

export function readJsonSync<T = unknown>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await writeFileAtomic(file, JSON.stringify(data, null, 2));
}

export async function writeFileAtomic(file: string, contents: string): Promise<void> {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, contents, "utf8");
  await fsp.rename(tmp, file);
}

export function readManifest(ref: string): DocsManifest | null {
  return readJsonSync<DocsManifest>(manifestPath(ref));
}

export function hasIndex(ref: string): boolean {
  return fs.existsSync(indexPath(ref)) && fs.existsSync(manifestPath(ref));
}

export interface CachedRef {
  dir: string;
  ref: string;
  manifest: DocsManifest | null;
  hasIndex: boolean;
}

/** List refs that have a usable offline index. */
export function cachedRefs(): CachedRef[] {
  const root = docsCacheRoot();
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const manifest = readJsonSync<DocsManifest>(path.join(root, d.name, "manifest.json"));
      return {
        dir: path.join(root, d.name),
        ref: manifest?.ref ?? d.name,
        manifest,
        hasIndex: fs.existsSync(path.join(root, d.name, "index.json")),
      };
    });
}

export async function clearCache(): Promise<void> {
  await fsp.rm(docsCacheRoot(), { recursive: true, force: true });
  await fsp.rm(pluginsCacheRoot(), { recursive: true, force: true });
}

/** Read a cached docs file by its site/docs-relative path. */
export function readCachedFile(ref: string, relPath: string): string | null {
  try {
    return fs.readFileSync(path.join(filesDir(ref), relPath), "utf8");
  } catch {
    return null;
  }
}

export async function writeCachedFile(ref: string, relPath: string, contents: string): Promise<void> {
  await writeFileAtomic(path.join(filesDir(ref), relPath), contents);
}
