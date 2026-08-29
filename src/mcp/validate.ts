/**
 * Minimal JSON Schema subset validator for MCP tool inputs.
 *
 * Supports: type (string|number|integer|boolean|object|array), required,
 * properties (unknown keys rejected), enum, items, minimum/maximum, nested
 * objects/arrays. Light coercion for agent sloppiness: "true"/"false" →
 * boolean, numeric strings → number/integer.
 *
 * Coercion mutates the args object in place so handlers see clean values.
 * Returns human-readable issues; empty means valid.
 */
import type { JsonSchema } from "./types.ts";

type Parent = Record<string, unknown> | unknown[] | null;

export function validateArgs(args: Record<string, unknown>, schema: JsonSchema): string[] {
  const issues: string[] = [];
  validateValue(args, schema, "", issues, null, null);
  return issues;
}

function validateValue(
  value: unknown,
  schema: JsonSchema,
  path: string,
  issues: string[],
  parent: Parent,
  key: string | number | null
): void {
  if (!schema || typeof schema !== "object") return;
  const label = path || "arguments";

  if (schema.enum) {
    if (!schema.enum.includes(value as string)) {
      issues.push(`${label} must be one of: ${schema.enum.join(", ")} (got ${JSON.stringify(value)})`);
    }
    return;
  }

  switch (schema.type) {
    case "string": {
      if (typeof value !== "string") issues.push(`${label} must be a string (got ${typeName(value)})`);
      return;
    }
    case "boolean": {
      if (typeof value === "string" && (value === "true" || value === "false")) {
        value = value === "true";
        setParent(parent, key, value);
      }
      if (typeof value !== "boolean") issues.push(`${label} must be a boolean (got ${typeName(value)})`);
      return;
    }
    case "number":
    case "integer": {
      if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
        value = Number(value);
        setParent(parent, key, value);
      }
      if (typeof value !== "number" || !Number.isFinite(value)) {
        issues.push(`${label} must be a ${schema.type} (got ${typeName(value)})`);
        return;
      }
      if (schema.type === "integer" && !Number.isInteger(value)) {
        issues.push(`${label} must be an integer (got ${value})`);
        return;
      }
      if (schema.minimum != null && value < schema.minimum) issues.push(`${label} must be >= ${schema.minimum}`);
      if (schema.maximum != null && value > schema.maximum) issues.push(`${label} must be <= ${schema.maximum}`);
      return;
    }
    case "array": {
      if (!Array.isArray(value)) {
        issues.push(`${label} must be an array (got ${typeName(value)})`);
        return;
      }
      if (schema.items) {
        const items = schema.items;
        const arr = value; // rebind: `value` is reassigned above, which drops narrowing in closures
        arr.forEach((item, i) => validateValue(item, items, `${label}[${i}]`, issues, arr, i));
      }
      return;
    }
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        issues.push(`${label} must be an object (got ${typeName(value)})`);
        return;
      }
      const obj = value as Record<string, unknown>;
      const props = schema.properties ?? {};
      for (const req of schema.required ?? []) {
        if (obj[req] === undefined) issues.push(`${joinPath(path, req)} is required`);
      }
      for (const [k, v] of Object.entries(obj)) {
        if (v === undefined) continue;
        if (!(k in props)) {
          issues.push(`unknown argument ${joinPath(path, k)} (allowed: ${Object.keys(props).join(", ") || "none"})`);
          continue;
        }
        validateValue(v, props[k]!, joinPath(path, k), issues, obj, k);
      }
      return;
    }
    default:
      return; // no type constraint
  }
}

function joinPath(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

function setParent(parent: Parent, key: string | number | null, value: unknown): void {
  if (parent != null && key != null) (parent as Record<string | number, unknown>)[key] = value;
}

function typeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
