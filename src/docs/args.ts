import { parseArgs } from "node:util";
import { DEFAULT_LIMIT } from "./constants.ts";
import type { HitKind } from "./types.ts";

export const DOCS_OPTIONS = {
  help: { type: "boolean", short: "h" },
  list: { type: "boolean", short: "l" },
  json: { type: "boolean" },
  offline: { type: "boolean", short: "o" },
  full: { type: "boolean", short: "f" },
  first: { type: "boolean" },
  status: { type: "boolean" },
  clear: { type: "boolean" },
  force: { type: "boolean" },
  "no-color": { type: "boolean" },
  "no-pager": { type: "boolean" },
  limit: { type: "string", short: "n" },
  kind: { type: "string", short: "k" },
  ref: { type: "string", short: "r" },
  width: { type: "string", short: "w" },
} as const;

export interface DocsArgs {
  help: boolean;
  list: boolean;
  json: boolean;
  offline: boolean;
  full: boolean;
  first: boolean;
  status: boolean;
  clear: boolean;
  force: boolean;
  noColor: boolean;
  noPager: boolean;
  limit: number;
  width: number | null;
  kind: HitKind | null;
  ref: string | null;
  subcommand: "offline" | null;
  query: string;
}

/** Parse the arguments that follow `ex docs`. */
export function parseDocsArgs(argv: string[]): DocsArgs {
  const { values, positionals } = parseArgs({
    args: argv.map((a) => (a === "-1" ? "--first" : a)),
    options: DOCS_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const limit = Number.parseInt(typeof values.limit === "string" ? values.limit : "", 10);
  const width = Number.parseInt(typeof values.width === "string" ? values.width : "", 10);
  const kind =
    values.kind === "docs" || values.kind === "api" || values.kind === "plugin" ? values.kind : null;
  const subcommand = positionals[0] === "offline" ? ("offline" as const) : null;
  const query = (subcommand ? positionals.slice(1) : positionals).join(" ").trim();
  return {
    help: Boolean(values.help),
    list: Boolean(values.list),
    json: Boolean(values.json),
    offline: Boolean(values.offline),
    full: Boolean(values.full),
    first: Boolean(values.first),
    status: Boolean(values.status),
    clear: Boolean(values.clear),
    force: Boolean(values.force),
    noColor: Boolean(values["no-color"]),
    noPager: Boolean(values["no-pager"]),
    limit: Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_LIMIT,
    width: Number.isFinite(width) && width > 0 ? width : null,
    kind,
    ref: values.ref ? String(values.ref) : null,
    subcommand,
    query,
  };
}

export const DOCS_USAGE = `
Usage: ex docs [query...] [options]
       ex docs offline [--status | --clear | --force] [--ref <ref>]

Search the Excalibur docs & API from your terminal.

  ex docs                      interactive search (type to search)
  ex docs actor collision      search, pick a result, read it in the terminal
  ex docs offline              download docs + plugin READMEs for offline use (+ local search)

Options:
  -l, --list                   print matching results and exit (no prompt)
      --json                   print results as JSON
  -o, --offline                search the local (downloaded) docs only
  -f, --full                   render the whole page, not just the matched section
  -1, --first                  skip the picker and open the top result
  -n, --limit <n>              number of results (default ${DEFAULT_LIMIT})
  -k, --kind <docs|api|plugin> only docs pages, API reference, or @excaliburjs plugin READMEs
  -r, --ref <tag|branch>       docs version (default: v<installed excalibur>, else main)
  -w, --width <cols>           wrap width
      --no-color               disable colors (also honours NO_COLOR)
      --no-pager               never pipe long pages through $PAGER / less
  -h, --help                   show this help

Offline:
      --status                 show what is downloaded and where
      --clear                  delete the offline cache
      --force                  re-download everything
`.trimStart();
