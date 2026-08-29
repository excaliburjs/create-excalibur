import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";
import { FIXTURES, withTempDirAsync } from "./helpers.ts";

export { ts };

/**
 * Copy the vite-project fixture into a temp dir with the typed excalibur stub
 * (fixtures/doctor/excalibur-types) installed as node_modules/excalibur, so a
 * ts.Program can resolve excalibur's declarations. `files` is a map of
 * projectDir-relative path → contents written on top (negative-case files).
 *
 * Separate from generate-helpers' withViteProject on purpose: its typeless
 * node_modules/excalibur is doctor's "run npm install" error-path fixture.
 */
export async function withDoctorProject<T>(
  fn: (ctx: { dir: string }) => T | Promise<T>,
  { files = {} }: { files?: Record<string, string> } = {}
): Promise<T> {
  let result!: T;
  await withTempDirAsync(async (dir: string) => {
    fs.cpSync(path.join(FIXTURES, "generate", "vite-project"), dir, { recursive: true });
    fs.cpSync(
      path.join(FIXTURES, "doctor", "excalibur-types"),
      path.join(dir, "node_modules", "excalibur"),
      { recursive: true }
    );
    for (const [relPath, text] of Object.entries(files)) {
      const full = path.join(dir, relPath);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, text);
    }
    result = await fn({ dir });
  });
  return result;
}
