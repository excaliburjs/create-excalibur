import * as fs from "node:fs";
import * as path from "node:path";
import { DEFAULT_REF } from "./constants.ts";

export interface PackageJsonLike {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  [key: string]: unknown;
}

function readJson(file: string): PackageJsonLike | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** Walk up from `cwd` to find the nearest package.json. */
export function findProjectPackage(cwd: string = process.cwd()): { dir: string; pkg: PackageJsonLike } | null {
  let dir = path.resolve(cwd);
  for (;;) {
    const file = path.join(dir, "package.json");
    const pkg = readJson(file);
    if (pkg) return { dir, pkg };
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const EXACT_SEMVER = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

export interface ExcaliburVersion {
  version: string | null;
  source: "node_modules" | "package.json" | null;
  range?: string;
}

/**
 * Detect the Excalibur version used by the current project.
 * Prefers the installed node_modules/excalibur, then the declared dependency.
 */
export function detectExcaliburVersion(cwd: string = process.cwd()): ExcaliburVersion {
  const project = findProjectPackage(cwd);
  if (!project) return { version: null, source: null };

  const installed = readJson(
    path.join(project.dir, "node_modules", "excalibur", "package.json")
  );
  if (installed?.version) {
    return { version: installed.version, source: "node_modules" };
  }

  const { pkg } = project;
  const range =
    pkg.dependencies?.excalibur ??
    pkg.devDependencies?.excalibur ??
    pkg.peerDependencies?.excalibur;
  if (!range) return { version: null, source: null };

  const cleaned = String(range).trim().replace(/^[\^~=]/, "");
  const match = cleaned.match(EXACT_SEMVER);
  if (match) return { version: match[1], source: "package.json", range };
  // A range / tag like "next" or ">=0.30" — we can't map it to a tag.
  return { version: null, source: "package.json", range };
}

/**
 * Map a detected version to a git ref in the Excalibur repo (tags are `v<semver>`).
 */
export function refForVersion(version: string | null | undefined): string {
  return version ? `v${version}` : DEFAULT_REF;
}
