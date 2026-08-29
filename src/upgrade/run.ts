import { execFileSync } from "node:child_process";
import { GenerateError } from "../generate/errors.ts";
import { detectExcaliburVersion } from "../docs/version.ts";
import { createUpgradeContext } from "./context.ts";
import { resolveTarget, migrationPath } from "./versions.ts";
import { MIGRATIONS } from "./registry.ts";
import { insertBreadcrumbs } from "./breadcrumbs.ts";
import { bumpExcaliburDep } from "./package-json.ts";
import type { TsModule } from "../generate/ts-loader.ts";
import type { FetchDistTags, UpgradeTarget } from "./versions.ts";
import type { AutoMigration, CheckResult, ManualSite, Migration, PlannedEdit } from "./types.ts";

export interface UpgradeOptions {
  ts?: TsModule;
  to?: string | null;
  from?: string | null;
  dryRun?: boolean;
  migrateOnly?: boolean;
  allowDirty?: boolean;
  include?: string[];
  confirm?: (plan: UpgradeSummary) => Promise<boolean> | boolean;
  fetchDistTags?: FetchDistTags;
}

export interface UpgradePlanItem {
  id: string;
  version: string;
  promptType: string;
  title: string;
  link?: string | null;
  prompt: string;
  editCount: number;
  manualCount: number;
  notes: string[];
  edits: PlannedEdit[];
  manual: ManualSite[];
}

export interface UpgradeSummary {
  projectDir: string;
  from: string;
  to: string;
  dryRun: boolean;
  upToDate?: boolean;
  reason?: string;
  plan: UpgradePlanItem[];
  applied: Array<{ id: string; version: string; editCount: number; files: string[] }>;
  manual: Array<{ id: string; title: string; sites: ManualSite[]; link?: string | null }>;
  notifications: Array<{ id: string; notes: string[] }>;
  skipped: Array<{ id: string; reason: string }>;
  files: { changed: string[]; skipped: Array<{ file: string; reason: string }> };
  packageJson: { bumped: boolean; spec: string; installHint: string };
  warnings: string[];
}

/**
 * Promptless upgrade core (the runDoctor analogue), two-phase:
 *  - phase 1 (preview): every applicable migration's check runs against the
 *    untouched tree — that's the plan the flow shows (and all of --dry-run);
 *  - phase 2 (apply, after the flow's single confirm): each migration's
 *    check is RE-RUN against the current tree immediately before its run, so
 *    offsets never go stale as earlier migrations edit shared files. The
 *    ts.Program is rebuilt only after a migration actually wrote.
 *
 * Invariant: code migrations run against the OLD installed excalibur — the
 * package.json bump is the last step and `npm install` is never executed.
 *
 */
export async function runUpgrade(projectDir: string, opts: UpgradeOptions = {}): Promise<UpgradeSummary> {
  if (!opts.dryRun && !opts.allowDirty) assertCleanGitTree(projectDir);

  const detected = detectExcaliburVersion(projectDir);
  const from = opts.from ?? detected.version;
  if (!from) {
    throw new GenerateError("could not detect the installed excalibur version", {
      hint: "run `npm install` first, or pass --from <version> (e.g. --from 0.29.3).",
    });
  }
  const target = await resolveTarget(opts.to, { fetchDistTags: opts.fetchDistTags });
  let path = migrationPath(MIGRATIONS, from, target.version);
  const include = opts.include;
  if (include) path = path.filter((m) => include.includes(m.id));
  if (path.length === 0) {
    return emptyResult(projectDir, from, target, "already up to date — no migrations in path");
  }

  const warnings = [];
  let ctx = await createUpgradeContext(projectDir, opts);
  if (ctx.degraded) {
    warnings.push(
      "excalibur's type declarations did not resolve — automated rewrites are disabled (they need the installed types); showing notifications only. Run `npm install` and re-run."
    );
  }

  // Phase 1: preview against the untouched tree.
  const plan: Array<{ migration: Migration; effectiveType: string; result: CheckResult | null }> = [];
  for (const migration of path) {
    const effectiveType = ctx.degraded && migration.promptType === "auto" ? "notification" : migration.promptType;
    const result = migration.check(ctx);
    plan.push({ migration, effectiveType, result });
  }

  const applicable = plan.filter((p) => p.result !== null) as Array<{
    migration: Migration;
    effectiveType: string;
    result: CheckResult;
  }>;
  const summary: UpgradeSummary = {
    projectDir,
    from,
    to: target.version,
    dryRun: Boolean(opts.dryRun),
    plan: applicable.map(({ migration, effectiveType, result }) => ({
      id: migration.id,
      version: migration.version,
      promptType: effectiveType,
      title: migration.title,
      link: migration.link,
      prompt: migration.prompt(result),
      editCount: result.edits.length,
      manualCount: result.manual.length,
      notes: result.notes,
      edits: result.edits,
      manual: result.manual,
    })),
    applied: [],
    manual: [],
    notifications: applicable
      .filter((p) => p.effectiveType === "notification")
      .map((p) => ({ id: p.migration.id, notes: p.result.notes })),
    skipped: plan.filter((p) => p.result === null).map((p) => ({ id: p.migration.id, reason: "not applicable" })),
    files: { changed: [], skipped: [] },
    packageJson: { bumped: false, spec: target.npmSpec, installHint: installHintFor(target.npmSpec) },
    warnings,
  };

  if (opts.dryRun) return summary;

  const confirm = opts.confirm ?? (async () => true);
  if (applicable.length > 0) {
    const accepted = await confirm(summary);
    if (!accepted) {
      summary.skipped.push(
        ...applicable.filter((p) => p.effectiveType !== "notification").map((p) => ({ id: p.migration.id, reason: "declined" }))
      );
      return summary;
    }
  }

  // Phase 2: apply in order, re-checking against the current tree. Only
  // migrations the user actually saw in the confirmed plan (`applicable`) —
  // NOT the full `path` — get a phase-2 chance; otherwise a migration whose
  // phase-1 check was null could newly match after an earlier migration's
  // rewrite and silently write edits the user never approved.
  let stale = false;
  const changedFiles = new Set<string>();
  for (const { migration, effectiveType } of applicable) {
    if (effectiveType === "notification") continue;
    if (stale) {
      ctx = await createUpgradeContext(projectDir, opts);
      stale = false;
    }
    const result = migration.check(ctx);
    if (result === null) continue;
    if (effectiveType === "manual") {
      const sites = result.manual.map((m) => ({ ...m, id: migration.id, message: m.message, link: m.link ?? migration.link }));
      const modified = insertBreadcrumbs(projectDir, sites);
      if (modified.length > 0) stale = true;
      for (const f of modified) changedFiles.add(f);
      summary.manual.push({ id: migration.id, title: migration.title, sites: result.manual, link: migration.link });
      continue;
    }
    const applied = await (migration as AutoMigration).run!({ ctx, result });
    for (const f of applied.changedFiles) changedFiles.add(f);
    summary.files.skipped.push(...applied.skippedFiles);
    // auto migrations can also carry manual side-flags — breadcrumb those too.
    if (result.manual.length > 0) {
      const sites = result.manual.map((m) => ({ ...m, id: migration.id, link: m.link ?? migration.link }));
      const modified = insertBreadcrumbs(projectDir, sites);
      for (const f of modified) changedFiles.add(f);
      summary.manual.push({ id: migration.id, title: migration.title, sites: result.manual, link: migration.link });
    }
    if (applied.changedFiles.length > 0 || result.manual.length > 0) stale = true;
    summary.applied.push({ id: migration.id, version: migration.version, editCount: result.edits.length, files: applied.changedFiles });
  }
  summary.files.changed = [...changedFiles].sort();

  if (!opts.migrateOnly && target.npmSpec) {
    summary.packageJson.bumped = await bumpExcaliburDep(projectDir, target.npmSpec);
    if (!summary.packageJson.bumped) {
      warnings.push(`could not rewrite the excalibur dependency automatically — set "excalibur": "${target.npmSpec}" in package.json and run npm install.`);
    }
  }
  return summary;
}

/**
 * Dist-tag specs need the explicit form: a plain `npm install` can be
 * satisfied by the existing lockfile and silently keep the old version
 * (observed live with "next").
 */
function installHintFor(npmSpec: string): string {
  return npmSpec && !/^[~^]?\d/.test(npmSpec) ? `npm install excalibur@${npmSpec}` : "npm install";
}

function emptyResult(projectDir: string, from: string, target: UpgradeTarget, reason: string): UpgradeSummary {
  return {
    projectDir,
    from,
    to: target.version,
    dryRun: false,
    upToDate: true,
    reason,
    plan: [],
    applied: [],
    manual: [],
    notifications: [],
    skipped: [],
    files: { changed: [], skipped: [] },
    packageJson: { bumped: false, spec: target.npmSpec, installHint: installHintFor(target.npmSpec) },
    warnings: [],
  };
}

/** Refuse to codemod without an undo story. NOT utils.js runCommand (documented broken). */
function assertCleanGitTree(projectDir: string): void {
  let out: string;
  try {
    out = execFileSync("git", ["status", "--porcelain"], { cwd: projectDir, encoding: "utf8" });
  } catch {
    throw new GenerateError("not a git repository — ex upgrade rewrites source files", {
      hint: "git init && git add -A && git commit first (your undo safety net), or pass --allow-dirty to proceed anyway.",
    });
  }
  if (out.trim().length > 0) {
    throw new GenerateError("working tree has uncommitted changes", {
      hint: "commit or stash first so `git diff`/`git checkout` can undo the migration, or pass --allow-dirty.",
    });
  }
}
