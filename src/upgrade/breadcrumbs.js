import * as fs from "node:fs";
import * as path from "node:path";

/**
 * In-source breadcrumbs for unautomatable migration sites (the Next.js
 * codemod pattern: a loud, greppable marker that survives the terminal).
 * Insertion-only — the safest operation for a formatting-preserving tool.
 *
 *   // ex-upgrade(collision-event-target): collision events now yield a Collider — <link>
 *
 * The migration id inside the marker is the idempotency key: re-runs skip
 * lines already annotated for the same id (checked both at insert time here
 * and at check time via hasMarker, so repeat runs also *report* zero sites).
 */

export function marker(id) {
  return `ex-upgrade(${id})`;
}

/** Is the line above `line` (1-based) already annotated for this migration id? */
export function hasMarker(text, line, id) {
  const lines = text.split("\n");
  const above = lines[line - 2];
  return Boolean(above && above.includes(marker(id)));
}

/**
 * Insert breadcrumb comments above the given sites. Same mechanics as
 * doctor's insertIgnoreComments: group per file, splice bottom-up with the
 * target line's indentation.
 *
 * @param {string} projectDir
 * @param {Array<{file: string, line: number, id: string, message: string, link?: string}>} sites
 * @returns {string[]} projectDir-relative files modified
 */
export function insertBreadcrumbs(projectDir, sites) {
  const byFile = new Map();
  for (const site of sites) {
    if (!byFile.has(site.file)) byFile.set(site.file, []);
    byFile.get(site.file).push(site);
  }
  const modified = [];
  for (const [file, fileSites] of byFile) {
    const full = path.join(projectDir, file);
    const lines = fs.readFileSync(full, "utf8").split("\n");
    const sorted = [...fileSites].sort((a, b) => b.line - a.line);
    let wrote = false;
    for (const site of sorted) {
      const index = Math.min(Math.max(site.line - 1, 0), lines.length - 1);
      if (lines[index - 1]?.includes(marker(site.id))) continue; // already annotated
      const indent = lines[index].match(/^\s*/)[0];
      const tail = site.link ? ` — ${site.link}` : "";
      lines.splice(index, 0, `${indent}// ${marker(site.id)}: ${site.message}${tail}`);
      wrote = true;
    }
    if (wrote) {
      fs.writeFileSync(full, lines.join("\n"));
      modified.push(file);
    }
  }
  return modified.sort();
}
