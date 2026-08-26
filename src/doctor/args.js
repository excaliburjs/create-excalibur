import { parseArgs } from "node:util";

export const DOCTOR_OPTIONS = {
  help: { type: "boolean", short: "h" },
  json: { type: "boolean" },
};

/**
 * Parse the arguments that follow `ex doctor`.
 * @param {string[]} argv
 */
export function parseDoctorArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: DOCTOR_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  return {
    help: Boolean(values.help),
    json: Boolean(values.json),
  };
}

export const DOCTOR_USAGE = `
Usage: ex doctor [options]

Run diagnostics against the Excalibur project in the current directory.
Type-aware — uses your project's own TypeScript and installed excalibur types
(run \`npm install\` first). Only .ts files under src/ are checked.

Rules:
  actor-not-added   an Actor is constructed but never added to a scene
  unnamed-actor     an Actor is constructed without a name

Ignore a finding case-by-case with eslint-style comments (after a report, the
interactive prompt can insert these for you):

  // ex-doctor-ignore-next-line actor-not-added
  new OffscreenHelper();
  new Cursor(); // ex-doctor-ignore-line unnamed-actor

Omit the rule list to ignore every rule on that line.

Options:
  --json       print findings as JSON (for tooling/CI)
  -h, --help   show this help

Exits with code 1 when any finding is reported.
`;
