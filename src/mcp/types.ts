import type { TsModule } from "../generate/ts-loader.ts";
import type { FetchDistTags } from "../upgrade/versions.ts";

/** The JSON Schema subset validate.ts understands. */
export interface JsonSchema {
  type?: "string" | "number" | "integer" | "boolean" | "object" | "array";
  description?: string;
  enum?: ReadonlyArray<string | number | boolean | null>;
  properties?: Record<string, JsonSchema>;
  required?: readonly string[];
  items?: JsonSchema;
  minimum?: number;
  maximum?: number;
}

export interface ToolContext {
  defaultProjectDir: string;
  /** test-only TypeScript injection seam (mirrors analyzeProject(dir, {ts})) */
  ts?: TsModule;
  /** test-only npm dist-tags seam (mirrors runUpgrade's fetchDistTags) — keeps tests network-free */
  fetchDistTags?: FetchDistTags;
}

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

/**
 * One MCP tool. `Args` is the tool's declared argument type, asserted at the
 * validate boundary (registry.ts validates against inputSchema before the
 * handler runs, so the handler sees clean values). handler is declared with
 * method syntax on purpose: method-position bivariance lets Tool<Specific>
 * arrays flow into the registry's Tool[] without a cast.
 */
export interface Tool<Args = Record<string, unknown>> {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  handler(args: Args, ctx: ToolContext): Promise<ToolResult> | ToolResult;
}
