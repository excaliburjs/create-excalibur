import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export interface OwnPackageJson {
  name?: string;
  version?: string;
  [key: string]: unknown;
}

let cached: OwnPackageJson | null | undefined; // undefined = not looked up yet; null = not found

/**
 * This package's own parsed package.json, or null if it can't be found.
 *
 * Walks UP from this file until it finds the package.json whose name is
 * "create-excalibur" — robust to layout: works from src/ (dev, running
 * source), dist/src/ (compiled), and node_modules/create-excalibur/dist/src/
 * (installed). A fixed "../../package.json" hop breaks silently the moment
 * an outDir adds a directory level; don't reintroduce one.
 */
export function ownPackageJson(): OwnPackageJson | null {
  if (cached !== undefined) return cached;
  cached = null;
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (true) {
    try {
      const pkg: OwnPackageJson = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
      if (pkg?.name === "create-excalibur") {
        cached = pkg;
        break;
      }
    } catch {
      // no/unreadable package.json at this level — keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return cached;
}
