import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { runPreflight } from "../src/upgrade/preflight.ts";
import { withUpgradeProject, ts, OFFLINE_TAGS } from "./upgrade-helpers.ts";
import { withTempDirAsync } from "./helpers.ts";

const OLD = 'import { Engine } from "excalibur";\nexport function n(e: Engine) { e.goto("x"); }\n';

const PLUGIN_PKG = `{
  "name": "@excaliburjs/plugin-thing",
  "version": "0.32.0",
  "devDependencies": {
    "excalibur": "0.29.3"
  },
  "peerDependencies": {
    "excalibur": "~0.32.0"
  }
}
`;

test("preflight on a clean git repo reports ready, the live next pin, and a non-empty path", async () => {
  await withUpgradeProject(
    async ({ dir }) => {
      const report = await runPreflight(dir, { ts, to: "next", fetchDistTags: OFFLINE_TAGS });
      assert.equal(report.projectDir, dir);
      assert.deepEqual(report.git, { repo: true, clean: true });
      assert.equal(report.excalibur.installed, "0.29.3");
      assert.equal(report.excalibur.resolvable, true);
      assert.deepEqual(report.excalibur.declaredIn, { dependencies: "0.29.3", devDependencies: null, peerDependencies: null });
      assert.equal(report.isLibrary, false);
      assert.deepEqual(report.sourceRoots, ["src"]);
      assert.deepEqual(report.target, { version: "0.33.0-alpha.224", npmSpec: "0.33.0-alpha.224", migrationVersion: "1.0.0", resolvedLive: true });
      assert.ok(report.migrationsInPath > 0, "0.29.3 → 1.0.0 selects migrations");
      assert.deepEqual(report.warnings, []);
    },
    { files: { "src/game.ts": OLD }, git: true }
  );
});

test("preflight reports a non-repo and a dirty tree without throwing", async () => {
  await withUpgradeProject(
    async ({ dir }) => {
      const report = await runPreflight(dir, { ts, to: "0.32.0", fetchDistTags: OFFLINE_TAGS });
      assert.deepEqual(report.git, { repo: false, clean: false });
      assert.ok(report.warnings.some((w) => /not a git repository/.test(w)));
      // an exact target never touches the registry and is "live" by construction
      assert.deepEqual(report.target, { version: "0.32.0", npmSpec: "^0.32.0", migrationVersion: "0.32.0", resolvedLive: true });
    },
    { files: { "src/game.ts": OLD }, git: false }
  );
  await withUpgradeProject(
    async ({ dir }) => {
      fs.writeFileSync(path.join(dir, "src", "dirty.ts"), "export const x = 1;\n");
      const report = await runPreflight(dir, { ts, to: "latest", fetchDistTags: OFFLINE_TAGS });
      assert.deepEqual(report.git, { repo: true, clean: false });
      assert.ok(report.warnings.some((w) => /uncommitted changes/.test(w)));
      assert.equal(report.target?.version, "0.32.0");
    },
    { files: { "src/game.ts": OLD }, git: true }
  );
});

test("preflight flags a library (peerDependencies) and the example dirs it will scan", async () => {
  await withUpgradeProject(
    async ({ dir }) => {
      const report = await runPreflight(dir, { ts, to: "next", fetchDistTags: OFFLINE_TAGS });
      assert.equal(report.isLibrary, true);
      assert.deepEqual(report.excalibur.declaredIn, { dependencies: null, devDependencies: "0.29.3", peerDependencies: "~0.32.0" });
      assert.equal(report.excalibur.installed, "0.29.3");
      assert.deepEqual(report.sourceRoots, ["src", "example"]);
    },
    { files: { "src/game.ts": OLD, "example/main.ts": OLD, "package.json": PLUGIN_PKG }, git: true }
  );
});

test("preflight marks the offline next fallback as not resolved live, with the warning", async () => {
  await withUpgradeProject(
    async ({ dir }) => {
      const report = await runPreflight(dir, { ts, to: "next", fetchDistTags: async () => ({}) });
      assert.equal(report.target?.resolvedLive, false);
      assert.equal(report.target?.npmSpec, "next");
      assert.equal(report.target?.migrationVersion, "1.0.0");
      assert.ok(report.warnings.some((w) => /could not resolve the `next` dist-tag/.test(w)));
      assert.ok(report.migrationsInPath > 0, "the path is computed against the 1.0.0 bucket even offline");
    },
    { files: { "src/game.ts": OLD }, git: true }
  );
});

test("preflight never throws: no package.json, and a project without excalibur", async () => {
  await withTempDirAsync(async (dir: string) => {
    const report = await runPreflight(dir, { ts, to: "latest", fetchDistTags: OFFLINE_TAGS });
    assert.equal(report.excalibur.installed, null);
    assert.equal(report.excalibur.resolvable, false);
    assert.deepEqual(report.excalibur.declaredIn, { dependencies: null, devDependencies: null, peerDependencies: null });
    assert.deepEqual(report.sourceRoots, []);
    assert.equal(report.migrationsInPath, 0);
    assert.ok(report.warnings.some((w) => /no package.json/.test(w)));
    assert.ok(report.warnings.some((w) => /could not detect the installed excalibur version/.test(w)));
  });
  await withTempDirAsync(async (dir: string) => {
    fs.writeFileSync(path.join(dir, "package.json"), '{ "name": "plain", "version": "1.0.0" }\n');
    const report = await runPreflight(dir, { ts, to: "latest", fetchDistTags: OFFLINE_TAGS });
    assert.equal(report.projectDir, dir);
    assert.equal(report.excalibur.installed, null);
    assert.equal(report.excalibur.resolvable, false);
    assert.equal(report.isLibrary, false);
    assert.ok(report.warnings.some((w) => /does not declare excalibur/.test(w)));
    assert.equal(report.target?.version, "0.32.0");
    assert.equal(report.migrationsInPath, 0);
  });
});

test("preflight reports an unrecognized target as a warning, not a throw", async () => {
  await withUpgradeProject(
    async ({ dir }) => {
      const report = await runPreflight(dir, { ts, to: "bogus", fetchDistTags: OFFLINE_TAGS });
      assert.equal(report.target, null);
      assert.equal(report.migrationsInPath, 0);
      assert.ok(report.warnings.some((w) => /unrecognized --to target/.test(w)));
    },
    { files: { "src/game.ts": OLD }, git: true }
  );
});
