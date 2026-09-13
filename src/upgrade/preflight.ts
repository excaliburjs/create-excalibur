import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { detectExcaliburVersion, findProjectPackage } from "../docs/version.ts";
import { analyzeProject } from "../generate/project.ts";
import { createProgramContext } from "../doctor/program.ts";
import { resolveTarget, migrationPath } from "./versions.ts";
import { MIGRATIONS } from "./registry.ts";
import type { TsModule } from "../generate/ts-loader.ts";
import type { FetchDistTags } from "./versions.ts";

export interface PreflightOptions {
  ts?: TsModule;
  /** the `--to` value; null/undefined means "latest" (same default as runUpgrade) */
  to?: string | null;
  fetchDistTags?: FetchDistTags;
}

export interface PreflightReport {
  projectDir: string;
  git: { repo: boolean; clean: boolean };
  excalibur: {
    /** version runUpgrade would detect (node_modules first, then an exact package.json pin) */
    installed: string | null;
    /** excalibur's .d.ts resolve from the project root — false means automated rewrites would be disabled */
    resolvable: boolean;
    declaredIn: { dependencies: string | null; devDependencies: string | null; peerDependencies: string | null };
  };
  /** declares excalibur as a peerDependency (a plugin/library — peer range gets bumped, tilemap pin is skipped) */
  isLibrary: boolean;
  /** projectDir-relative POSIX paths the upgrade would scan (`.` = the package root) */
  sourceRoots: string[];
  target: { version: string; npmSpec: string; migrationVersion: string; resolvedLive: boolean } | null;
  /** migrations the (installed, target] window selects — 0 when `installed` is unknown */
  migrationsInPath: number;
  warnings: string[];
}

/**
 * Readiness check for `ex upgrade` — everything the runner would gate on or
 * silently degrade over, gathered without throwing so an agent can read the
 * reason instead of a stack: git state, what excalibur is installed/declared
 * and whether its types resolve, library-vs-game, the scan roots, what the
 * target resolves to, and how many migrations sit in the path. No AST work —
 * the backlog (code that still matches older migrations) lives in
 * `upgrade --dry-run`, which is the honest place for it.
 */
export async function runPreflight(projectDir: string, opts: PreflightOptions = {}): Promise<PreflightReport> {
  const warnings: string[] = [];
  const root = path.resolve(projectDir);

  const git = probeGit(root);
  if (!git.repo) warnings.push("not a git repository — `upgrade` refuses to rewrite without one (pass allowDirty to proceed anyway).");
  else if (!git.clean) warnings.push("working tree has uncommitted changes — commit or stash first, or pass allowDirty.");

  const found = findProjectPackage(root);
  const pkg = found?.pkg ?? null;
  if (!found) warnings.push("no package.json found — is this a project directory?");
  const declaredIn = {
    dependencies: depString(pkg?.dependencies?.excalibur),
    devDependencies: depString(pkg?.devDependencies?.excalibur),
    peerDependencies: depString(pkg?.peerDependencies?.excalibur),
  };
  const isLibrary = declaredIn.peerDependencies !== null;
  if (found && !declaredIn.dependencies && !declaredIn.devDependencies && !declaredIn.peerDependencies) {
    warnings.push("package.json does not declare excalibur in dependencies, devDependencies, or peerDependencies.");
  }

  const detected = found ? detectExcaliburVersion(found.dir) : { version: null, source: null };
  const installed = detected.version;
  if (!installed) {
    warnings.push(
      found && detected.range
        ? `could not detect the installed excalibur version — the declared range "${detected.range}" is not an exact version and node_modules/excalibur is missing; run \`npm install\` or pass \`from\`.`
        : "could not detect the installed excalibur version — run `npm install` first, or pass `from`."
    );
  }

  // Scan roots + type resolvability. analyzeProject throws for no
  // package.json / no excalibur dep; those are already reported above, so
  // degrade to "nothing scannable" instead of propagating.
  let sourceRoots: string[] = [];
  let resolvable = false;
  if (found) {
    try {
      const project = await analyzeProject(found.dir, {
        ...(opts.ts ? { ts: opts.ts } : {}),
        requireSrc: false,
        includeExampleDirs: true,
      });
      sourceRoots = project.sourceRoots.map((r) => relPosix(project.projectDir, r));
      try {
        resolvable = createProgramContext(project, { requireExcalibur: false }).excaliburResolved;
      } catch (error) {
        warnings.push(`could not build the TypeScript program: ${errorMessage(error)}`);
      }
    } catch (error) {
      warnings.push(`could not analyze the project: ${errorMessage(error)}`);
    }
  }
  if (found && !resolvable) {
    warnings.push("excalibur's type declarations do not resolve — automated rewrites would be disabled (notifications only); run `npm install`.");
  }

  // Target resolution. `resolvedLive` = the version came from the registry
  // dist-tags rather than the offline pin; resolveTarget signals the fallback
  // only through `warn`, so derive it from that callback firing.
  let target: PreflightReport["target"] = null;
  let fellBack = false;
  try {
    const resolved = await resolveTarget(opts.to ?? null, {
      fetchDistTags: opts.fetchDistTags,
      warn: (m) => {
        fellBack = true;
        warnings.push(m);
      },
    });
    target = {
      version: resolved.version,
      npmSpec: resolved.npmSpec,
      migrationVersion: resolved.migrationVersion ?? resolved.version,
      resolvedLive: !fellBack,
    };
  } catch (error) {
    warnings.push(errorMessage(error));
  }

  let migrationsInPath = 0;
  if (installed && target) {
    try {
      migrationsInPath = migrationPath(MIGRATIONS, installed, target.migrationVersion).length;
    } catch (error) {
      warnings.push(errorMessage(error));
    }
  }

  return {
    projectDir: found?.dir ?? root,
    git,
    excalibur: { installed, resolvable, declaredIn },
    isLibrary,
    sourceRoots,
    target,
    migrationsInPath,
    warnings,
  };
}

/** Same probe as the runner's git gate: a throw means "not a repository". */
function probeGit(projectDir: string): { repo: boolean; clean: boolean } {
  if (!fs.existsSync(projectDir)) return { repo: false, clean: false };
  try {
    const out = execFileSync("git", ["status", "--porcelain"], { cwd: projectDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return { repo: true, clean: out.trim().length === 0 };
  } catch {
    return { repo: false, clean: false };
  }
}

function depString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function relPosix(from: string, to: string): string {
  const rel = path.relative(from, to);
  return rel === "" ? "." : rel.split(path.sep).join("/");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
