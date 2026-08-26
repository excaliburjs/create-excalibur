import { runUpgrade } from "../../upgrade/run.js";
import { jsonResult } from "../result.js";
import { PROJECT_DIR_PROP } from "./generate.js";
import { resolveProjectDir } from "./docs.js";

export const upgradeTools = [
  {
    name: "upgrade",
    description:
      "Upgrade the project's Excalibur version with chained codemod migrations (v0.29.3 onward). Rewrites source (formatting-preserving), inserts // ex-upgrade(<id>) comments where a human must act, then bumps the package.json dependency. Run BEFORE installing the new version — rewrites classify against the currently installed excalibur types. Refuses a dirty git tree unless allowDirty. Use dryRun to preview the full plan without writing.",
    inputSchema: {
      type: "object",
      properties: {
        ...PROJECT_DIR_PROP,
        to: {
          type: "string",
          description: 'Target: "latest" (default), "next" (v1 prerelease), or an exact version like "0.32.0".',
        },
        from: { type: "string", description: "Override the detected installed version (e.g. when already bumped)." },
        dryRun: { type: "boolean", description: "Preview the migration plan without writing. Default false." },
        migrateOnly: { type: "boolean", description: "Rewrite code but leave package.json alone. Default false." },
        allowDirty: { type: "boolean", description: "Skip the clean-git-tree requirement. Default false." },
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
          confirm: async () => true,
        })
      );
    },
  },
];
