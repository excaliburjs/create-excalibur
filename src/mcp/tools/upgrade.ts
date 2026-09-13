import { runUpgrade } from "../../upgrade/run.ts";
import { runPreflight } from "../../upgrade/preflight.ts";
import { jsonResult } from "../result.ts";
import { PROJECT_DIR_PROP } from "./generate.ts";
import { resolveProjectDir } from "./docs.ts";
import type { JsonSchema, Tool } from "../types.ts";

interface UpgradeToolArgs {
  projectDir?: string;
  to?: string;
  from?: string;
  dryRun?: boolean;
  migrateOnly?: boolean;
  allowDirty?: boolean;
  noBacklog?: boolean;
  include?: string[];
  scope?: string[];
}

interface PreflightToolArgs {
  projectDir?: string;
  to?: string;
}

const TO_PROP: Record<string, JsonSchema> = {
  to: {
    type: "string",
    description:
      'Target: "latest" (default), "next" (the v1 prerelease line — resolved to an exact pinned version, never the floating tag), or an exact version like "0.32.0".',
  },
};

const upgradeTool: Tool<UpgradeToolArgs> = {
  name: "upgrade",
  description:
    "Upgrade the project's Excalibur version with chained codemod migrations (v0.29.3 onward). Rewrites source (formatting-preserving), inserts // ex-upgrade(<id>) comments where a human must act, then bumps the package.json dependency — `to: \"next\"` resolves the dist-tag to an exact pinned version, and libraries that declare excalibur in peerDependencies get that range bumped too (`>=<version>`). Scans src/ plus any example/, examples/, demo/, sample/, sandbox/ dirs (or `scope`). Run BEFORE installing the new version — rewrites classify against the currently installed excalibur types. Refuses a dirty git tree unless allowDirty. Use dryRun to preview the full plan without writing. The result's `backlog` lists older migrations the code still matches (skipped as already done by the version window) — re-run with `from` set to the listed `rerunFrom` to migrate them. Call `preflight` first to check readiness.",
  inputSchema: {
    type: "object",
    properties: {
      ...PROJECT_DIR_PROP,
      ...TO_PROP,
      from: { type: "string", description: "Override the detected installed version (e.g. when already bumped, or to re-open the window for a `backlog` entry)." },
      dryRun: { type: "boolean", description: "Preview the migration plan without writing. Default false." },
      migrateOnly: { type: "boolean", description: "Rewrite code but leave package.json alone. Default false." },
      allowDirty: { type: "boolean", description: "Skip the clean-git-tree requirement. Default false." },
      noBacklog: { type: "boolean", description: "Skip the read-only check for older migrations the code still matches. Default false." },
      include: {
        type: "array",
        items: { type: "string" },
        description: "Run only these migration ids (from the plan / dryRun output), still limited to the version window; skips the backlog pass. Omit to run every migration in the path.",
      },
      scope: {
        type: "array",
        items: { type: "string" },
        description: 'Directories to scan relative to the project root (e.g. ["src", "example"]). Omit for the default: src/ plus any example/, examples/, demo/, sample/, sandbox/ that exist (the package root when there is no src/).',
      },
    },
  },
  async handler(args, ctx) {
    const projectDir = resolveProjectDir(args, ctx);
    return jsonResult(
      await runUpgrade(projectDir, {
        ts: ctx.ts,
        to: args.to ?? null,
        from: args.from ?? null,
        dryRun: args.dryRun ?? false,
        migrateOnly: args.migrateOnly ?? false,
        allowDirty: args.allowDirty ?? false,
        noBacklog: args.noBacklog ?? false,
        include: args.include,
        scope: args.scope,
        fetchDistTags: ctx.fetchDistTags,
        confirm: async () => true,
      })
    );
  },
};

const preflightTool: Tool<PreflightToolArgs> = {
  name: "preflight",
  description:
    "Check whether a project is ready for `upgrade` before running it: git state, installed/declared excalibur (dependencies, devDependencies, peerDependencies), whether the types resolve, whether it is a library (peer), which directories will be scanned, what `to` resolves to, and how many migrations are in the path. Read-only.",
  inputSchema: {
    type: "object",
    properties: {
      ...PROJECT_DIR_PROP,
      ...TO_PROP,
    },
  },
  async handler(args, ctx) {
    const projectDir = resolveProjectDir(args, ctx);
    return jsonResult(await runPreflight(projectDir, { ts: ctx.ts, to: args.to ?? null, fetchDistTags: ctx.fetchDistTags }));
  },
};

export const upgradeTools: [Tool<UpgradeToolArgs>, Tool<PreflightToolArgs>] = [upgradeTool, preflightTool];
