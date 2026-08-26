import * as fsp from "node:fs/promises";
import * as path from "node:path";

/**
 * Rewrite the excalibur dependency value in package.json with a
 * text-preserving splice (never JSON.parse + stringify — that destroys the
 * user's formatting). Returns false when the pattern doesn't match, in which
 * case the caller prints manual instructions.
 */
export async function bumpExcaliburDep(projectDir, npmSpec) {
  const file = path.join(projectDir, "package.json");
  let text;
  try {
    text = await fsp.readFile(file, "utf8");
  } catch {
    return false;
  }
  const pattern = /("excalibur"\s*:\s*")([^"]+)(")/;
  if (!pattern.test(text)) return false;
  const next = text.replace(pattern, `$1${npmSpec}$3`);
  if (next === text) return true; // already at the target spec
  await fsp.writeFile(file, next, "utf8");
  return true;
}
