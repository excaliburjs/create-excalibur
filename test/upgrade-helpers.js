import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { FIXTURES, withTempDirAsync } from "./helpers.js";

export { ts };

/**
 * Copy the vite-project fixture into a temp dir with the v0.29-era excalibur
 * stub (fixtures/upgrade/excalibur-types-v0.29) installed as
 * node_modules/excalibur, its package.json version rewritten to `version`.
 * `files` writes on top; `git: true` makes a clean committed repo so the
 * runner's git gate passes without --allow-dirty.
 */
export async function withUpgradeProject(fn, { files = {}, version = "0.29.3", git = false } = {}) {
  let result;
  await withTempDirAsync(async (dir) => {
    fs.cpSync(path.join(FIXTURES, "generate", "vite-project"), dir, { recursive: true });
    const exDir = path.join(dir, "node_modules", "excalibur");
    fs.cpSync(path.join(FIXTURES, "upgrade", "excalibur-types-v0.29"), exDir, { recursive: true });
    const pkgFile = path.join(exDir, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
    pkg.version = version;
    fs.writeFileSync(pkgFile, JSON.stringify(pkg));
    // The vite fixture pins excalibur 0.32.0; align the dep with the stub.
    const projectPkgFile = path.join(dir, "package.json");
    fs.writeFileSync(
      projectPkgFile,
      fs.readFileSync(projectPkgFile, "utf8").replace('"excalibur": "0.32.0"', `"excalibur": "${version}"`)
    );
    for (const [relPath, text] of Object.entries(files)) {
      const full = path.join(dir, relPath);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, text);
    }
    if (git) {
      const run = (...args) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
      run("init", "-q");
      run("-c", "user.email=t@t", "-c", "user.name=t", "add", "-A");
      run("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init");
    }
    result = await fn({ dir });
  });
  return result;
}
