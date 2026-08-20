/**
 * Minimal JSON Schema subset validator for MCP tool inputs.
 *
 * Supports: type (string|number|integer|boolean|object|array), required,
 * properties (unknown keys rejected), enum, items, minimum/maximum, nested
 * objects/arrays. Light coercion for agent sloppiness: "true"/"false" →
 * boolean, numeric strings → number/integer.
 *
 * Coercion mutates the args object in place so handlers see clean values.
 *
 * @param {object} args tool arguments (mutated by coercion)
 * @param {object} schema JSON Schema (type: "object" at the root)
 * @returns {string[]} human-readable issues; empty means valid
 */
export function validateArgs(args, schema) {
  const issues = [];
  validateValue(args, schema, "", issues, null, null);
  return issues;
}

function validateValue(value, schema, path, issues, parent, key) {
  if (!schema || typeof schema !== "object") return;
  const label = path || "arguments";

  if (schema.enum) {
    if (!schema.enum.includes(value)) {
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
        value.forEach((item, i) => validateValue(item, schema.items, `${label}[${i}]`, issues, value, i));
      }
      return;
    }
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        issues.push(`${label} must be an object (got ${typeName(value)})`);
        return;
      }
      const props = schema.properties ?? {};
      for (const req of schema.required ?? []) {
        if (value[req] === undefined) issues.push(`${joinPath(path, req)} is required`);
      }
      for (const [k, v] of Object.entries(value)) {
        if (v === undefined) continue;
        if (!(k in props)) {
          issues.push(`unknown argument ${joinPath(path, k)} (allowed: ${Object.keys(props).join(", ") || "none"})`);
          continue;
        }
        validateValue(v, props[k], joinPath(path, k), issues, value, k);
      }
      return;
    }
    default:
      return; // no type constraint
  }
}

function joinPath(path, key) {
  return path ? `${path}.${key}` : key;
}

function setParent(parent, key, value) {
  if (parent != null && key != null) parent[key] = value;
}

function typeName(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
