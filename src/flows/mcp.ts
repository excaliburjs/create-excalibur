import path from "node:path";
import { parseArgs } from "node:util";

export const MCP_USAGE = `
Usage: ex mcp [options]

Start an MCP (Model Context Protocol) server over stdio exposing Excalibur
docs search, project scaffolding, and code generation tools to AI agents.

Register it with an MCP client, e.g.:
  claude mcp add excalibur -- npx -y create-excalibur mcp

Options:
  --project <dir>  project the tools operate on by default (default: cwd)
  -h, --help       show this help
`.trimStart();

/** `ex mcp` entry point. `argv` is everything after `mcp`. */
export async function mcpFlow(argv: string[] = []): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      help: { type: "boolean", short: "h" },
      project: { type: "string" },
    },
  });
  if (values.help) {
    process.stdout.write(MCP_USAGE);
    return;
  }
  // Dynamic import: constants.js loads every flow at CLI startup — keep the
  // MCP SDK (and the tool registry) out of ordinary `ex` invocations.
  const { runMcpServer } = await import("../mcp/server.ts");
  await runMcpServer({ projectDir: path.resolve(values.project ?? process.cwd()) });
}
