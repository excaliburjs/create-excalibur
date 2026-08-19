import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { CACHE_DIR_NAME } from "./constants.js";

export function cacheRoot() {
  return process.env.EXCALIBUR_HOME || path.join(os.homedir(), CACHE_DIR_NAME);
}

export function docsCacheRoot() {
  return path.join(cacheRoot(), "docs");
}

/** Refs may contain `/` (branches) — keep them filesystem-safe. */
export function refDirName(ref) {
  return ref.replace(/[\/\\:]/g, "_");
}

export function refDir(ref) {
  return path.join(docsCacheRoot(), refDirName(ref));
}
export function filesDir(ref) {
  return path.join(refDir(ref), "files");
}
export function manifestPath(ref) {
  return path.join(refDir(ref), "manifest.json");
}
export function indexPath(ref) {
  return path.join(refDir(ref), "index.json");
}
export function treePath(ref) {
  return path.join(refDir(ref), "tree.json");
}
export function slugMapPath(ref) {
  return path.join(refDir(ref), "slugs.json");
}

/** slug → site/docs-relative path, learned from pages fetched on demand. */
export function readSlugMap(ref) {
  return readJsonSync(slugMapPath(ref)) ?? {};
}
export async function recordSlugs(ref, entries) {
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

export function readJsonSync(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export async function writeJsonAtomic(file, data) {
  await writeFileAtomic(file, JSON.stringify(data, null, 2));
}

export async function writeFileAtomic(file, contents) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, contents, "utf8");
  await fsp.rename(tmp, file);
}

export function readManifest(ref) {
  return readJsonSync(manifestPath(ref));
}

export function hasIndex(ref) {
  return fs.existsSync(indexPath(ref)) && fs.existsSync(manifestPath(ref));
}

/** List refs that have a usable offline index. */
export function cachedRefs() {
  const root = docsCacheRoot();
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const manifest = readJsonSync(path.join(root, d.name, "manifest.json"));
      return {
        dir: path.join(root, d.name),
        ref: manifest?.ref ?? d.name,
        manifest,
        hasIndex: fs.existsSync(path.join(root, d.name, "index.json")),
      };
    });
}

export async function clearCache() {
  await fsp.rm(docsCacheRoot(), { recursive: true, force: true });
}

/** Read a cached docs file by its site/docs-relative path. */
export function readCachedFile(ref, relPath) {
  try {
    return fs.readFileSync(path.join(filesDir(ref), relPath), "utf8");
  } catch {
    return null;
  }
}

export async function writeCachedFile(ref, relPath, contents) {
  await writeFileAtomic(path.join(filesDir(ref), relPath), contents);
}
