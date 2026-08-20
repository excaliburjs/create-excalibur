/** MCP tool-result helpers. Results are `{ content: [{type:"text", ...}], isError? }`. */

/** Pretty-printed JSON payload as a single text block. */
export function jsonResult(obj) {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

/** Plain text payload. */
export function textResult(text) {
  return { content: [{ type: "text", text }] };
}

/**
 * Tool execution failure the calling agent should see (and can self-correct
 * from) — not a protocol error.
 */
export function errorResult(message, hint) {
  return {
    content: [{ type: "text", text: hint ? `${message}\nHint: ${hint}` : message }],
    isError: true,
  };
}
