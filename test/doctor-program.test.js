import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { createProgramContext } from "../src/doctor/program.js";
import { runDoctor } from "../src/doctor/run.js";
import { GenerateError } from "../src/generate/errors.js";
import { withViteProject } from "./generate-helpers.js";
import { withDoctorProject, ts } from "./doctor-helpers.js";

test("builds a program with fallback options when no tsconfig exists", async () => {
  await withDoctorProject(async ({ dir }) => {
    const result = await runDoctor(dir, { ts });
    assert.equal(result.projectDir, dir);
    assert.ok(result.filesScanned >= 4, `expected >=4 files, got ${result.filesScanned}`);
    assert.deepEqual(result.findings, []);
  });
});

test("reads tsconfig.json including extends chains", async () => {
  await withDoctorProject(async ({ dir }) => {
    fs.writeFileSync(
      path.join(dir, "base.json"),
      JSON.stringify({ compilerOptions: { strict: true, module: "esnext", moduleResolution: "bundler" } })
    );
    fs.writeFileSync(
      path.join(dir, "tsconfig.json"),
      JSON.stringify({ extends: "./base.json", compilerOptions: { target: "es2022" } })
    );
    const result = await runDoctor(dir, { ts });
    assert.deepEqual(result.findings, []);
  });
});

test("unreadable tsconfig.json fails with a tsconfig hint", async () => {
  await withDoctorProject(async ({ dir }) => {
    // A directory named tsconfig.json is unreadable on every platform — the
    // portable way to hit onUnRecoverableConfigFileDiagnostic.
    fs.mkdirSync(path.join(dir, "tsconfig.json"));
    await assert.rejects(
      () => runDoctor(dir, { ts }),
      (error) => {
        assert.ok(error instanceof GenerateError);
        assert.match(error.message, /tsconfig\.json/);
        assert.match(error.hint, /tsconfig/);
        return true;
      }
    );
  });
});

test("invalid-JSON tsconfig is tolerated (TS recovers; we never read diagnostics)", async () => {
  await withDoctorProject(async ({ dir }) => {
    fs.writeFileSync(path.join(dir, "tsconfig.json"), "{ not json !!!");
    const result = await runDoctor(dir, { ts });
    assert.deepEqual(result.findings, []);
  });
});

test("typeless node_modules/excalibur fails fast with an npm-install hint", async () => {
  // withViteProject fabricates excalibur with only a package.json (no types) —
  // exactly the state after a broken/skipped install.
  await withViteProject(async ({ dir }) => {
    await assert.rejects(
      () => runDoctor(dir, { ts }),
      (error) => {
        assert.ok(error instanceof GenerateError);
        assert.match(error.message, /excalibur's type declarations/);
        assert.match(error.hint, /npm install/);
        return true;
      }
    );
  });
});

test("a ts module without the full compiler API is rejected with a typescript@6 hint", () => {
  const fakeTs = { version: "9.9.9", createSourceFile() {} };
  assert.throws(
    () => createProgramContext({ projectDir: "/nowhere", srcDir: "/nowhere/src", ts: fakeTs }),
    (error) => {
      assert.ok(error instanceof GenerateError);
      assert.match(error.message, /9\.9\.9/);
      assert.match(error.hint, /typescript@6/);
      return true;
    }
  );
});
