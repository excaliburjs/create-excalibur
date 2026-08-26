import * as fs from "node:fs";
import * as path from "node:path";

/**
 * eslint-style ignore comments for doctor findings:
 *
 *   // ex-doctor-ignore-next-line                    (all rules, line below)
 *   // ex-doctor-ignore-next-line actor-not-added    (listed rules only)
 *   new Monster(); // ex-doctor-ignore-line          (same line)
 *
 * Rule lists are comma/space separated; block comments work too. Directives
 * are matched per line of source text (same pragmatic scope as the rules:
 * a directive inside a string on its own line would count — acceptable).
 */

const DIRECTIVE = /(?:\/\/|\/\*)\s*ex-doctor-ignore-(next-line|line)\b([^*\n]*?)(?:\*\/)?\s*$/;

/**
 * Scan source text for ignore directives.
 * @returns {Map<number, Set<string>|"all">} 1-based suppressed line → rules ("all" = every rule)
 */
export function collectIgnores(text) {
  const ignores = new Map();
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(DIRECTIVE);
    if (!match) continue;
    const target = match[1] === "next-line" ? i + 2 : i + 1; // 1-based
    const rules = match[2]
      .split(/[,\s]+/)
      .map((r) => r.trim())
      .filter(Boolean);
    const existing = ignores.get(target);
    if (rules.length === 0 || existing === "all") {
      ignores.set(target, "all");
    } else {
      const set = existing instanceof Set ? existing : new Set();
      for (const rule of rules) set.add(rule);
      ignores.set(target, set);
    }
  }
  return ignores;
}

/** Is a finding at (line, rule) suppressed by this file's ignores map? */
export function isIgnored(ignores, line, rule) {
  const entry = ignores?.get(line);
  if (!entry) return false;
  return entry === "all" || entry.has(rule);
}

/**
 * Insert `// ex-doctor-ignore-next-line <rules>` comments above the given
 * findings (the interactive "quick ignore" in the CLI flow). Findings on the
 * same file+line merge into one comma-separated directive; insertion order is
 * bottom-up so earlier line numbers stay valid. Returns projectDir-relative
 * paths of the files modified.
 *
 * @param {string} projectDir
 * @param {Array<{file: string, line: number, rule: string}>} findings
 */
export function insertIgnoreComments(projectDir, findings) {
  const byFile = new Map();
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, new Map());
    const byLine = byFile.get(f.file);
    if (!byLine.has(f.line)) byLine.set(f.line, new Set());
    byLine.get(f.line).add(f.rule);
  }
  const modified = [];
  for (const [file, byLine] of byFile) {
    const full = path.join(projectDir, file);
    const lines = fs.readFileSync(full, "utf8").split("\n");
    const targets = [...byLine.keys()].sort((a, b) => b - a);
    for (const line of targets) {
      const index = Math.min(Math.max(line - 1, 0), lines.length - 1);
      const indent = lines[index].match(/^\s*/)[0];
      const rules = [...byLine.get(line)].sort().join(", ");
      lines.splice(index, 0, `${indent}// ex-doctor-ignore-next-line ${rules}`);
    }
    fs.writeFileSync(full, lines.join("\n"));
    modified.push(file);
  }
  return modified.sort();
}
