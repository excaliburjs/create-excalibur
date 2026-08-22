import { FLOWS } from "./constants.js";

/**
 * Pure argv → action resolver for the three published bins (all → index.js).
 *
 * Persona-aware: the `ex`/`excalibur` bins are strict multi-command CLIs, so an
 * unknown positional is an error; every other invocation (`create-excalibur`,
 * `npm create excalibur <name>`, direct `node index.js`) follows the create-*
 * convention and treats positionals as the project name.
 *
 * @param {{ binName: string, argv: string[] }} opts
 * @returns {{ kind: "help" }
 *         | { kind: "flow", flow: string, rest: string[] }
 *         | { kind: "create", name: string }
 *         | { kind: "unknown", command: string }
 *         | { kind: "menu" }}
 */
export function resolveInvocation({ binName, argv }) {
  const [command, ...rest] = argv;
  if (command === "--help" || command === "-h" || command === "help") {
    return { kind: "help" };
  }
  // Object.hasOwn, not truthiness: `toString` etc. must not dispatch to Object.prototype.
  if (command && Object.hasOwn(FLOWS, command)) {
    return { kind: "flow", flow: command, rest };
  }
  if (command && !command.startsWith("-")) {
    if (binName === "ex" || binName === "excalibur") {
      return { kind: "unknown", command };
    }
    return { kind: "create", name: argv.filter((a) => !a.startsWith("-")).join(" ") };
  }
  return { kind: "menu" };
}
