import * as fs from "node:fs";
import * as path from "node:path";
import { writeFileAtomic } from "../docs/cache.js";

/**
 * The default `run` for 'auto' migrations: apply a check's planned edits.
 * Per file — drift-check against the hash recorded at check time, splice via
 * ts-edit applyEdits (its overlap check throws), re-parse gate via
 * editor.validate (any syntax diagnostic → file untouched), atomic write.
 * Never partial within a file: a file either takes all its edits or none.
 *
 * @returns {{changedFiles: string[], skippedFiles: Array<{file: string, reason: string}>}}
 */
export async function applyPlannedEdits(ctx, result) {
  const byFile = new Map();
  for (const edit of result.edits) {
    if (!byFile.has(edit.file)) byFile.set(edit.file, []);
    byFile.get(edit.file).push(edit);
  }
  const changedFiles = [];
  const skippedFiles = [];
  for (const [file, edits] of byFile) {
    const full = path.join(ctx.projectDir, file);
    let text;
    try {
      text = fs.readFileSync(full, "utf8");
    } catch {
      skippedFiles.push({ file, reason: "file disappeared since analysis" });
      continue;
    }
    const expected = result.fileHashes?.[file];
    if (expected && ctx.hashText(text) !== expected) {
      skippedFiles.push({ file, reason: "file changed since analysis — re-run ex upgrade" });
      continue;
    }
    let next;
    try {
      next = ctx.editor.applyEdits(
        text,
        edits.map((e) => ({ start: e.start, end: e.end, text: e.replacement }))
      );
    } catch (error) {
      skippedFiles.push({ file, reason: `could not apply edits (${error.message}) — left untouched` });
      continue;
    }
    const diagnostics = ctx.editor.validate(file, next);
    if (diagnostics.length > 0) {
      skippedFiles.push({ file, reason: "edited file did not parse cleanly — left untouched" });
      continue;
    }
    await writeFileAtomic(full, next);
    changedFiles.push(file);
  }
  return { changedFiles: changedFiles.sort(), skippedFiles };
}
