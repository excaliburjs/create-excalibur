import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { GenerateError } from "../generate/errors.ts";
import { detectExcaliburVersion } from "../docs/version.ts";
import { createUpgradeContext } from "./context.ts";
import { resolveTarget, migrationPath, migrationBacklog, fromForBacklog, parseVersion, compareVersions } from "./versions.ts";
import { MIGRATIONS } from "./registry.ts";
import { insertBreadcrumbs } from "./breadcrumbs.ts";
import { bumpExcaliburDep, bumpExcaliburPeerDep } from "./package-json.ts";
import { pluginPeerWarnings } from "./plugins.ts";
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
  /** explicit scan roots (projectDir-relative); default is src/ plus any example dirs */
  scope?: string[];
  /** skip the read-only backlog pass over migrations the version window already excludes */
  noBacklog?: boolean;
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
  /**
   * Migrations from BEFORE the detected version whose old API the code still
   * uses — skipped by the window as "already done", never applied. Reported
   * (not run) so the summary can't claim success over unmigrated code; the
   * warning names the `--from` that would pick them up.
   */
  backlog: Array<{ id: string; version: string; title: string; editCount: number; manualCount: number; rerunFrom: string }>;
  files: { changed: string[]; skipped: Array<{ file: string; reason: string }> };
  packageJson: {
    bumped: boolean;
    spec: string;
    installHint: string;
    /** peerDependencies.excalibur was rewritten (libraries/plugins declare excalibur there) */
    peerBumped: boolean;
    /** the range written to peerDependencies, when one was */
    peerSpec: string | null;
  };
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
  // Hoisted so target-resolution caveats (offline `next` fallback) survive the up-to-date early return.
  const warnings: string[] = [];
  const target = await resolveTarget(opts.to, { fetchDistTags: opts.fetchDistTags, warn: (m) => warnings.push(m) });
  // Plugins are not bumped by this tool; one whose installed peer range rejects the target is a silent half-upgrade.
  warnings.push(...pluginPeerWarnings(projectDir, target.version));
  // Migrations are selected against the BUCKET (a prerelease runs its release's bucket; 0.33.x runs 1.0.0), never the display version.
  let path = migrationPath(MIGRATIONS, from, target.migrationVersion ?? target.version);
  // Ids the version window selected, BEFORE any --include narrowing: the backlog is "outside the window", not "outside --include".
  const windowIds = new Set(path.map((m) => m.id));
  const include = opts.include;
  if (include) path = path.filter((m) => include.includes(m.id));
  if (path.length === 0) {
    // A newer target with no codemods in the hop (1.0.0 → 1.1.0-alpha.N,
    // alpha.310 → alpha.313, a minor with no breaking changes) is still an
    // upgrade: the package.json bump is the whole job. Only a target at or
    // below the installed version — or an --include that matched nothing —
    // is "up to date".
    const newerTarget = safeCompare(target.version, from) > 0;
    if (!newerTarget || include || opts.migrateOnly || !target.npmSpec) {
      return emptyResult(projectDir, from, target, "already up to date — no migrations in path", warnings);
    }
    const summary = emptyResult(projectDir, from, target, "no code migrations in path — bumping package.json only", warnings);
    summary.upToDate = false;
    summary.dryRun = Boolean(opts.dryRun);
    if (opts.dryRun) return summary;
    await bumpPackageJson(projectDir, target, summary, warnings);
    return summary;
  }

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

  // Backlog: migrations at or below `from` that the window skipped as "already
  // done" but whose old API this code still uses (a project that jumped
  // versions without running the intermediate codemods). check() only
  // computes — collectors never write — so this is a read-only report.
  // Skipped under --include (fixture-driven single-id runs) and for
  // notifications (they'd nag forever). Records `removedIn` already pulled
  // into the window are not backlog — they are in the plan.
  const backlog: UpgradeSummary["backlog"] = [];
  if (!include && !opts.noBacklog) {
    const registryVersions = new Set(MIGRATIONS.map((m) => m.version));
    for (const migration of migrationBacklog(MIGRATIONS, from)) {
      if (windowIds.has(migration.id) || migration.promptType === "notification") continue;
      const result = migration.check(ctx);
      if (!result) continue;
      backlog.push({
        id: migration.id,
        version: migration.version,
        title: migration.title,
        editCount: result.edits.length,
        manualCount: result.manual.length,
        rerunFrom: fromForBacklog(migration.version, registryVersions),
      });
    }
    if (backlog.length > 0) {
      const oldest = backlog[0]!; // registry order is ascending, so the first entry is the oldest bucket
      warnings.push(
        `your code still matches ${backlog.length} migration(s) from before the detected version ${from} (${backlog.map((b) => b.id).join(", ")}) — the target may have removed those APIs. Re-run with --from ${oldest.rerunFrom} to migrate them.`
      );
    }
  }

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
    backlog,
    files: { changed: [], skipped: [] },
    packageJson: { bumped: false, spec: target.npmSpec, installHint: installHintFor(target.npmSpec), peerBumped: false, peerSpec: null },
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
      // Site lines were computed on the pre-edit tree; edits that added or
      // removed lines above a site (an inserted import, a `use();` line) shift
      // it. Re-anchor against the edits that actually landed in that file.
      const sites = result.manual.map((m) => ({
        ...m,
        line: applied.changedFiles.includes(m.file) ? shiftedLine(ctx, result, m.file, m.line) : m.line,
        id: migration.id,
        link: m.link ?? migration.link,
      }));
      const modified = insertBreadcrumbs(projectDir, sites);
      for (const f of modified) changedFiles.add(f);
      summary.manual.push({ id: migration.id, title: migration.title, sites: result.manual, link: migration.link });
    }
    if (applied.changedFiles.length > 0 || result.manual.length > 0) stale = true;
    summary.applied.push({ id: migration.id, version: migration.version, editCount: result.edits.length, files: applied.changedFiles });
    // An auto migration that explains itself (e.g. the library gate on the
    // tilemap pin) would otherwise show its note in the plan and lose it here.
    if (result.notes.length > 0) summary.notifications.push({ id: migration.id, notes: result.notes });
  }
  summary.files.changed = [...changedFiles].sort();

  if (!opts.migrateOnly && target.npmSpec) await bumpPackageJson(projectDir, target, summary, warnings);
  return summary;
}

/** compareVersions that treats an unparseable `from` (a dist-tag like "next") as "not newer". */
function safeCompare(a: string, b: string): number {
  try {
    return compareVersions(a, b);
  } catch {
    return 0;
  }
}

/**
 * The last step: rewrite the dependency pin, then the peer range. Libraries/
 * plugins declare excalibur in peerDependencies too — a bumped devDependency
 * next to a stale peer range is a silent half-upgrade (every plugin in the v1
 * migration pass needed this by hand). Only possible when the target resolved
 * to a real version — the offline `next` fallback is a dist-tag, and a range
 * can't be built from one.
 */
async function bumpPackageJson(projectDir: string, target: UpgradeTarget, summary: UpgradeSummary, warnings: string[]): Promise<void> {
  summary.packageJson.bumped = await bumpExcaliburDep(projectDir, target.npmSpec);
  if (!summary.packageJson.bumped) {
    warnings.push(`could not rewrite the excalibur dependency automatically — set "excalibur": "${target.npmSpec}" in package.json and run npm install.`);
  }
  const peerRange = pkgHasPeer(projectDir) ? peerRangeFor(target) : null;
  if (pkgHasPeer(projectDir) && !peerRange) {
    warnings.push(`peerDependencies.excalibur was left as-is — the target resolved to the dist-tag "${target.npmSpec}", not a version; set the peer range by hand.`);
  } else if (peerRange) {
    summary.packageJson.peerBumped = await bumpExcaliburPeerDep(projectDir, peerRange);
    summary.packageJson.peerSpec = summary.packageJson.peerBumped ? peerRange : null;
    if (!summary.packageJson.peerBumped) {
      warnings.push(`this package declares excalibur as a peerDependency but the range could not be rewritten — set it to "${peerRange}" (or append "|| ${peerRange}") by hand.`);
    }
  }
}

/**
 * `line` (1-based, pre-edit) after the planned edits for `file` were applied:
 * every edit that ends before the line's start moves it by the newlines it
 * added minus the newlines it removed.
 */
function shiftedLine(ctx: Awaited<ReturnType<typeof createUpgradeContext>>, result: CheckResult, file: string, line: number): number {
  const original = ctx.files.find((f) => f.file === file)?.text;
  if (!original) return line;
  let lineStart = 0;
  for (let i = 1; i < line; i++) {
    const nl = original.indexOf("\n", lineStart);
    if (nl === -1) break;
    lineStart = nl + 1;
  }
  const newlines = (s: string) => (s.match(/\n/g) ?? []).length;
  let delta = 0;
  for (const edit of result.edits) {
    if (edit.file !== file || edit.end > lineStart) continue;
    delta += newlines(edit.replacement) - newlines(original.slice(edit.start, edit.end));
  }
  return line + delta;
}

function pkgHasPeer(projectDir: string): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8")) as { peerDependencies?: Record<string, unknown> };
    return typeof pkg.peerDependencies?.excalibur === "string";
  } catch {
    return false;
  }
}

/**
 * The peer RANGE for a resolved target; null when the spec is a dist-tag
 * (offline fallback). Semver prerelease rules shape this: a comparator only
 * admits prereleases of its own major.minor.patch, so a bare `>=1.1.0-alpha.313`
 * would REJECT stable 1.0.0 consumers and `>=1.0.0` would reject every
 * 1.1.0-alpha. On major >= 1 the range is the major's caret, plus the
 * prerelease line itself when the target is one (`^1.0.0 || ^1.1.0-alpha.313`).
 * On major 0 (the 0.33 alpha line, pre-v1 releases) a caret is too narrow
 * (`^0.33.0` = 0.33.x only), so `>=<version>` stays — it admits 1.0.0.
 */
export function peerRangeFor(target: UpgradeTarget): string | null {
  if (!(parseVersion(target.npmSpec) || parseVersion(target.npmSpec.replace(/^[~^]/, "")))) return null;
  const parsed = parseVersion(target.version);
  if (!parsed || parsed.major === 0) return `>=${target.version}`;
  const major = `^${parsed.major}.0.0`;
  return parsed.pre.length ? `${major} || ^${target.version}` : major;
}

/**
 * Dist-tag specs need the explicit form: a plain `npm install` can be
 * satisfied by the existing lockfile and silently keep the old version
 * (observed live with "next").
 */
function installHintFor(npmSpec: string): string {
  return npmSpec && !/^[~^]?\d/.test(npmSpec) ? `npm install excalibur@${npmSpec}` : "npm install";
}

function emptyResult(projectDir: string, from: string, target: UpgradeTarget, reason: string, warnings: string[] = []): UpgradeSummary {
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
    backlog: [],
    files: { changed: [], skipped: [] },
    packageJson: { bumped: false, spec: target.npmSpec, installHint: installHintFor(target.npmSpec), peerBumped: false, peerSpec: null },
    warnings,
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
