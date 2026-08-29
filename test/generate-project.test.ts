import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { withTempDirAsync } from "./helpers.ts";
import { withViteProject, ts } from "./generate-helpers.ts";
import { analyzeProject, relativeSpecifier } from "../src/generate/project.ts";
import { GenerateError } from "../src/generate/errors.ts";

test("analyzeProject maps the vite fixture", async () => {
  await withViteProject(async ({ dir, project }) => {
    assert.equal(project.projectDir, dir);
    assert.equal(project.srcDir, path.join(dir, "src"));
    assert.equal(project.viteShaped, true);
    assert.equal(path.basename(project.mainFile!), "main.ts");
    assert.equal(path.basename(project.resourcesFile!), "resources.ts");
    assert.deepEqual(project.resourceKeys, ["Sword"]);
    assert.equal(project.scenes.length, 1);
    assert.equal(project.scenes[0].className, "MyLevel");
    assert.equal(project.scenes[0].key, "start"); // matched against the scenes map
    assert.equal(project.excalibur.version, "0.32.0");
  });
});

test("analyzeProject rejects non-projects and non-excalibur projects", async () => {
  await withTempDirAsync(async (dir: string) => {
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "not-a-game" }));
    await assert.rejects(analyzeProject(dir, { ts }), GenerateError);
  });
});

test("relativeSpecifier produces extensionless POSIX specifiers", () => {
  assert.equal(relativeSpecifier("/p/src/main.ts", "/p/src/level2.ts"), "./level2");
  assert.equal(relativeSpecifier("/p/src/scenes/a.ts", "/p/src/boss.ts"), "../boss");
});
