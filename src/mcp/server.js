import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { setColorLevel } from "../console.js";
import { callTool, listTools } from "./registry.js";

function readPkgVersion() {
  try {
    const pkgPath = fileURLToPath(new URL("../../package.json", import.meta.url));
    return JSON.parse(fs.readFileSync(pkgPath, "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Run the MCP server over stdio until the client disconnects.
 *
 * stdout is protocol-only in this mode: belt-and-braces redirect of
 * console.log/info to stderr (all `terminal.*` helpers route through
 * console.log), and no ANSI in anything that lands in a tool result.
 */
export async function runMcpServer({ projectDir }) {
  console.log = console.error;
  console.info = console.error;
  setColorLevel(0);

  const server = new Server(
    { name: "create-excalibur", version: readPkgVersion() },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listTools() }));
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    callTool(request.params.name, request.params.arguments ?? {}, { defaultProjectDir: projectDir })
  );

  await server.connect(new StdioServerTransport());
  await new Promise((resolve) => {
    server.onclose = resolve;
  });
}
