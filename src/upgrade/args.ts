import { parseArgs } from "node:util";

export const UPGRADE_OPTIONS = {
  help: { type: "boolean", short: "h" },
  to: { type: "string" },
  from: { type: "string" },
  "dry-run": { type: "boolean" },
  yes: { type: "boolean", short: "y" },
  "allow-dirty": { type: "boolean" },
  "migrate-only": { type: "boolean" },
  "no-backlog": { type: "boolean" },
  include: { type: "string", multiple: true },
  scope: { type: "string", multiple: true },
  json: { type: "boolean" },
} as const;

/** Repeatable string flag → non-empty string[] or null (parseArgs yields undefined when absent). */
function stringList(values: unknown): string[] | null {
  const list = Array.isArray(values) ? values.map(String).filter((v) => v.length > 0) : [];
  return list.length > 0 ? list : null;
}

/** Parse the arguments that follow `ex upgrade`. */
export function parseUpgradeArgs(argv: string[]) {
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
    noBacklog: Boolean(values["no-backlog"]),
    include: stringList(values.include),
    scope: stringList(values.scope),
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
  --no-backlog     skip the read-only check for older migrations your code still matches
  --include <id>   run only this migration id (repeatable; skips the backlog pass)
  --scope <dir>    directory to scan (repeatable; default: src/ plus any example/, examples/, demo/, sample/, sandbox/)
  --json           machine-readable plan/result (implies --yes)
  -h, --help       show this help

"--to next" resolves the live dist-tag to an exact version and pins it in
package.json (a floating tag makes installs non-reproducible); the 1.0.0
migrations run for that prerelease line. Libraries that declare excalibur in
peerDependencies get that range bumped too (">=<version>", appended to an
existing multi-range).

Backlog: migrations from BEFORE your installed version are normally skipped
as already done. If your code still matches one, it is reported (never run)
with the --from that would pick it up — v1 removes several APIs that earlier
releases only deprecated, so this is how "upgrade complete" stays honest.

After it runs: review with git diff, then npm install, then ex doctor.
`;
