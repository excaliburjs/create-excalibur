import { DocsError } from "../docs/errors.js";
import { GenerateError } from "../generate/errors.js";
import { ScaffoldError } from "../create/scaffold.js";
import { errorResult } from "./result.js";
import { validateArgs } from "./validate.js";
import { docsTools } from "./tools/docs.js";
import { generateTools } from "./tools/generate.js";
import { createTools } from "./tools/create.js";

/** @type {Array<{name: string, description: string, inputSchema: object, handler: (args: object, ctx: object) => Promise<object>}>} */
const TOOLS = [...docsTools, ...generateTools, ...createTools];

/** tools/list payload. */
export function listTools() {
  return TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

/**
 * tools/call dispatch. Execution failures come back as `isError` results so
 * the calling agent can read the message/hint and self-correct; only an
 * unknown tool name throws (→ JSON-RPC protocol error, per spec).
 *
 * @param {string} name
 * @param {object} args
 * @param {{defaultProjectDir: string, ts?: object}} ctx `ts` is a test-only
 *   TypeScript injection seam (mirrors `analyzeProject(dir, {ts})`).
 */
export async function callTool(name, args, ctx) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);

  const issues = validateArgs(args, tool.inputSchema);
  if (issues.length > 0) {
    return errorResult(`Invalid arguments for ${name}: ${issues.join("; ")}`);
  }

  try {
    return await tool.handler(args, ctx);
  } catch (error) {
    if (error instanceof DocsError || error instanceof GenerateError || error instanceof ScaffoldError) {
      return errorResult(error.message, error.hint);
    }
    console.error(error?.stack ?? error);
    return errorResult(`Unexpected error: ${error?.message ?? error}`);
  }
}
