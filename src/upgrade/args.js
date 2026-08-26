import { parseArgs } from "node:util";

export const UPGRADE_OPTIONS = {
  help: { type: "boolean", short: "h" },
  to: { type: "string" },
  from: { type: "string" },
  "dry-run": { type: "boolean" },
  yes: { type: "boolean", short: "y" },
  "allow-dirty": { type: "boolean" },
  "migrate-only": { type: "boolean" },
  json: { type: "boolean" },
};

/**
 * Parse the arguments that follow `ex upgrade`.
 * @param {string[]} argv
 */
export function parseUpgradeArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: UPGRADE_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  return {
    help: Boolean(values.help),
    to: values.to ? String(values.to) : null,
    from: values.from ? String(values.from) : null,
    dryRun: Boolean(values["dry-run"]),
    yes: Boolean(values.yes),
    allowDirty: Boolean(values["allow-dirty"]),
    migrateOnly: Boolean(values["migrate-only"]),
    json: Boolean(values.json),
  };
}

export const UPGRADE_USAGE = `
Usage: ex upgrade [options]
       ex up [options]

Upgrade the Excalibur project in the current directory: chained codemod
migrations (v0.29.3 onward) rewrite your source for the target version, then
the package.json dependency is bumped. Automated rewrites use your project's
own TypeScript + the currently installed excalibur types, so run BEFORE
"npm install"-ing the new version. Requires a clean git tree (your undo).

What it does per migration:
  auto          rewrites call sites (formatting-preserving splices)
  manual        inserts // ex-upgrade(<id>): comments where a human must act
  notification  behavioral changes to be aware of (no code change)

Options:
  --to <target>    "latest" (default), "next" (v1 prerelease), or an exact version
  --from <ver>     override the detected installed version (e.g. already bumped)
  --dry-run        show the full plan, write nothing
  -y, --yes        apply without the confirmation prompt
  --migrate-only   rewrite code but leave package.json alone
  --allow-dirty    skip the clean-git-tree requirement
  --json           machine-readable plan/result (implies --yes)
  -h, --help       show this help

After it runs: review with git diff, then npm install, then ex doctor.
`;
