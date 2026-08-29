import { HintedError } from "../errors.ts";
import { errorResult } from "./result.ts";
import { validateArgs } from "./validate.ts";
import { docsTools } from "./tools/docs.ts";
import { generateTools } from "./tools/generate.ts";
import { createTools } from "./tools/create.ts";
import { doctorTools } from "./tools/doctor.ts";
import { upgradeTools } from "./tools/upgrade.ts";
import type { Tool, ToolContext, ToolResult } from "./types.ts";

// Tool<never> erases each tool's Args at the registry boundary (any Tool<X>
// is assignable); the validate-then-cast below is the single trust point.
const TOOLS: Array<Tool<never>> = [...docsTools, ...generateTools, ...createTools, ...doctorTools, ...upgradeTools];

/** tools/list payload. */
export function listTools(): Array<Pick<Tool<never>, "name" | "description" | "inputSchema">> {
  return TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

/**
 * tools/call dispatch. Execution failures come back as `isError` results so
 * the calling agent can read the message/hint and self-correct; only an
 * unknown tool name throws (→ JSON-RPC protocol error, per spec).
 */
export async function callTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);

  const issues = validateArgs(args, tool.inputSchema);
  if (issues.length > 0) {
    return errorResult(`Invalid arguments for ${name}: ${issues.join("; ")}`);
  }

  try {
    return await tool.handler(args as never, ctx);
  } catch (error) {
    // Every user-facing error class (DocsError, GenerateError, ScaffoldError,
    // and their subclasses) carries its hint via the shared HintedError base.
    if (error instanceof HintedError) {
      return errorResult(error.message, error.hint);
    }
    console.error(error instanceof Error ? error.stack : error);
    return errorResult(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  }
}
