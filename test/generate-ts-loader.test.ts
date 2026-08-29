import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { withTempDirAsync } from "./helpers.ts";
import { loadTypescript } from "../src/generate/ts-loader.ts";
import { GenerateError } from "../src/generate/errors.ts";

test("resolves typescript from the project's node_modules", async () => {
  await withTempDirAsync(async (dir: string) => {
    fs.writeFileSync(path.join(dir, "package.json"), "{}");
    const tsDir = path.join(dir, "node_modules", "typescript");
    fs.mkdirSync(tsDir, { recursive: true });
    fs.writeFileSync(path.join(tsDir, "package.json"), JSON.stringify({ name: "typescript", version: "0.0.0-stub", main: "index.js" }));
    fs.writeFileSync(
      path.join(tsDir, "index.js"),
      "module.exports = { version: 'stub', createSourceFile: function () {} };"
    );
    const ts = await loadTypescript(dir);
    assert.equal(ts.version, "stub");
  });
});

test("throws a friendly error when typescript is missing", async () => {
  await withTempDirAsync(async (dir: string) => {
    fs.writeFileSync(path.join(dir, "package.json"), "{}");
    await assert.rejects(loadTypescript(dir), (e: unknown) => {
      assert.ok(e instanceof GenerateError);
      assert.match(e.hint!, /npm install/);
      return true;
    });
  });
});

test("rejects a typescript without the compiler API (v7+)", async () => {
  await withTempDirAsync(async (dir: string) => {
    fs.writeFileSync(path.join(dir, "package.json"), "{}");
    const tsDir = path.join(dir, "node_modules", "typescript");
    fs.mkdirSync(tsDir, { recursive: true });
    fs.writeFileSync(path.join(tsDir, "package.json"), JSON.stringify({ name: "typescript", version: "7.0.0", main: "index.js" }));
    fs.writeFileSync(path.join(tsDir, "index.js"), "module.exports = { version: '7.0.0' };");
    await assert.rejects(loadTypescript(dir), (e: unknown) => {
      assert.ok(e instanceof GenerateError);
      assert.match(e.hint!, /typescript@6/);
      return true;
    });
  });
});
