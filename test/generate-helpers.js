import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";
import { FIXTURES, withTempDirAsync } from "./helpers.js";
import { analyzeProject } from "../src/generate/project.js";

export { ts };

/**
 * Copy the vite-project fixture into a temp dir (adding a fake installed
 * excalibur, since node_modules can't be committed) and analyze it with the
 * devDependency TypeScript injected.
 */
export async function withViteProject(fn) {
  let result;
  await withTempDirAsync(async (dir) => {
    fs.cpSync(path.join(FIXTURES, "generate", "vite-project"), dir, { recursive: true });
    fs.mkdirSync(path.join(dir, "node_modules", "excalibur"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "node_modules", "excalibur", "package.json"),
      JSON.stringify({ name: "excalibur", version: "0.32.0" })
    );
    const project = await analyzeProject(dir, { ts });
    result = await fn({ dir, project });
  });
  return result;
}

export function read(dir, relPath) {
  return fs.readFileSync(path.join(dir, relPath), "utf8");
}

/** Assert a TS file parses with zero syntax errors. */
export function parsesCleanly(text, name = "file.ts") {
  const sf = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return (sf.parseDiagnostics ?? []).length === 0;
}
