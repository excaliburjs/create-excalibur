import * as fsp from "node:fs/promises";
import * as path from "node:path";

const DEP_SECTIONS = ["dependencies", "devDependencies"];

/**
 * Index just past the closing quote of the JSON string starting at `text[i]`
 * (`text[i]` must be `"`), honoring `\"` escapes.
 */
function skipJsonString(text, i) {
  let j = i + 1;
  while (j < text.length) {
    if (text[j] === "\\") {
      j += 2;
      continue;
    }
    if (text[j] === '"') return j + 1;
    j++;
  }
  return j;
}

/**
 * Text span of the value object for a TOP-LEVEL `"key": { ... }` member —
 * a light brace-depth scan (not a full JSON parser) so we splice only the
 * real `dependencies`/`devDependencies` block, never a same-named field
 * nested under `overrides`/`resolutions`/`peerDependencies` etc. Returns
 * null if `key`'s top-level value isn't an object.
 */
function topLevelObjectSpan(text, key) {
  let depth = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      const start = i;
      const end = skipJsonString(text, i);
      if (depth === 1 && text.slice(start + 1, end - 1) === key) {
        let j = end;
        while (/\s/.test(text[j])) j++;
        if (text[j] !== ":") return null;
        j++;
        while (/\s/.test(text[j])) j++;
        if (text[j] !== "{") return null;
        const valueStart = j;
        let braceDepth = 0;
        while (j < text.length) {
          if (text[j] === '"') {
            j = skipJsonString(text, j);
            continue;
          }
          if (text[j] === "{") braceDepth++;
          else if (text[j] === "}") {
            braceDepth--;
            if (braceDepth === 0) return { start: valueStart, end: j + 1 };
          }
          j++;
        }
        return null;
      }
      i = end;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
    i++;
  }
  return null;
}

/**
 * Rewrite the excalibur dependency value in package.json with a
 * text-preserving splice (never JSON.parse + stringify — that destroys the
 * user's formatting). Scoped to the `dependencies`/`devDependencies` object
 * specifically — an unscoped regex can hit an `"excalibur"` entry under
 * `overrides`/`resolutions`/`peerDependencies` serialized earlier in the
 * file, bumping the wrong field while reporting success. Returns false when
 * no section actually declares excalibur, in which case the caller prints
 * manual instructions.
 */
export async function bumpExcaliburDep(projectDir, npmSpec) {
  const file = path.join(projectDir, "package.json");
  let text;
  try {
    text = await fsp.readFile(file, "utf8");
  } catch {
    return false;
  }
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch {
    return false;
  }
  const section = DEP_SECTIONS.find((k) => typeof pkg[k]?.excalibur === "string");
  if (!section) return false;
  const span = topLevelObjectSpan(text, section);
  if (!span) return false;
  const pattern = /("excalibur"\s*:\s*")([^"]+)(")/;
  const body = text.slice(span.start, span.end);
  if (!pattern.test(body)) return false;
  const nextBody = body.replace(pattern, `$1${npmSpec}$3`);
  if (nextBody === body) return true; // already at the target spec
  const next = text.slice(0, span.start) + nextBody + text.slice(span.end);
  await fsp.writeFile(file, next, "utf8");
  return true;
}
