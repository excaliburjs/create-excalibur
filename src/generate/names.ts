/**
 * Name formatting for generated code.
 *
 * Do NOT use `slugify` from src/utils.js for these — it lowercases and strips,
 * destroying PascalCase class names.
 */

/** Split an arbitrary name into lowercase words: "bigBoss-2x" → ["big","boss","2x"] */
function words(name: string): string[] {
  return String(name)
    .replace(/[^a-zA-Z0-9]+/g, " ")
    // split camelCase / PascalCase boundaries and letter↔digit boundaries
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

export function toPascalCase(name: string): string {
  return words(name)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

export function toCamelCase(name: string): string {
  const pascal = toPascalCase(name);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export function toKebabCase(name: string): string {
  return words(name).join("-");
}

// Reserved words that cannot be used as class names / identifiers.
const RESERVED = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger", "default",
  "delete", "do", "else", "enum", "export", "extends", "false", "finally", "for",
  "function", "if", "import", "in", "instanceof", "new", "null", "return", "super",
  "switch", "this", "throw", "true", "try", "typeof", "var", "void", "while",
  "with", "yield", "let", "static", "await", "implements", "interface", "package",
  "private", "protected", "public",
]);

/** Is `name` usable as a TypeScript identifier (class name, object key)? */
export function isValidIdentifier(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) && !RESERVED.has(name);
}
