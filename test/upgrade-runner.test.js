import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { runUpgrade } from "../src/upgrade/run.js";
import { GenerateError } from "../src/generate/errors.js";
import { withUpgradeProject, ts } from "./upgrade-helpers.js";
import { withViteProject, ts as viteTs } from "./generate-helpers.js";

const OLD = `
import { Engine } from "excalibur";
export function next(engine: Engine): void { engine.goto("level2"); }
`;

test("git gate: non-repo refuses, clean repo passes, dirty repo refuses", async () => {
  await withUpgradeProject(async ({ dir }) => {
    await assert.rejects(
      () => runUpgrade(dir, { ts, to: "next" }),
      (e) => e instanceof GenerateError && /not a git repository/.test(e.message)
    );
  });
  await withUpgradeProject(
    async ({ dir }) => {
      const ok = await runUpgrade(dir, { ts, to: "next", include: ["goto-to-gotoscene"], confirm: async () => true });
      assert.equal(ok.applied.length, 1);
      // tree is now dirty from the migration itself
      await assert.rejects(
        () => runUpgrade(dir, { ts, to: "next" }),
        (e) => e instanceof GenerateError && /uncommitted changes/.test(e.message)
      );
    },
    { files: { "src/game.ts": OLD }, git: true }
  );
});

test("dry-run plans without writing and skips the git gate", async () => {
  await withUpgradeProject(
    async ({ dir }) => {
      const before = fs.readFileSync(path.join(dir, "src", "game.ts"), "utf8");
      const result = await runUpgrade(dir, { ts, to: "next", dryRun: true });
      assert.ok(result.plan.some((p) => p.id === "goto-to-gotoscene"));
      assert.equal(fs.readFileSync(path.join(dir, "src", "game.ts"), "utf8"), before);
      assert.equal(fs.readFileSync(path.join(dir, "package.json"), "utf8").includes('"excalibur": "0.29.3"'), true);
    },
    { files: { "src/game.ts": OLD } }
  );
});

test("declined confirm applies nothing", async () => {
  await withUpgradeProject(
    async ({ dir }) => {
      const before = fs.readFileSync(path.join(dir, "src", "game.ts"), "utf8");
      const result = await runUpgrade(dir, { ts, to: "next", allowDirty: true, confirm: async () => false });
      assert.equal(result.applied.length, 0);
      assert.ok(result.skipped.some((s) => s.reason === "declined"));
      assert.equal(fs.readFileSync(path.join(dir, "src", "game.ts"), "utf8"), before);
    },
    { files: { "src/game.ts": OLD } }
  );
});

test("migrate-only rewrites code but leaves package.json alone", async () => {
  await withUpgradeProject(
    async ({ dir }) => {
      const result = await runUpgrade(dir, { ts, to: "next", allowDirty: true, migrateOnly: true, confirm: async () => true });
      assert.ok(result.applied.length > 0);
      assert.equal(result.packageJson.bumped, false);
      assert.match(fs.readFileSync(path.join(dir, "package.json"), "utf8"), /"excalibur": "0\.29\.3"/);
    },
    { files: { "src/game.ts": OLD } }
  );
});

test("bump preserves package.json formatting and targets the dist-tag", async () => {
  await withUpgradeProject(
    async ({ dir }) => {
      const before = fs.readFileSync(path.join(dir, "package.json"), "utf8");
      await runUpgrade(dir, { ts, to: "next", allowDirty: true, confirm: async () => true });
      const after = fs.readFileSync(path.join(dir, "package.json"), "utf8");
      assert.equal(after, before.replace('"excalibur": "0.29.3"', '"excalibur": "next"'));
    },
    { files: { "src/game.ts": OLD } }
  );
});

test("already up to date returns upToDate without touching anything", async () => {
  await withUpgradeProject(
    async ({ dir }) => {
      const result = await runUpgrade(dir, { ts, to: "0.30.0", from: "0.31.0", allowDirty: true });
      assert.equal(result.upToDate, true);
    },
    {}
  );
});

test("typeless node_modules degrades autos to notifications with a loud warning", async () => {
  // generate-helpers' withViteProject fabricates excalibur with no types.
  await withViteProject(async ({ dir }) => {
    const result = await runUpgrade(dir, { ts: viteTs, to: "next", from: "0.29.3", dryRun: true });
    assert.ok(result.warnings.some((w) => /type declarations did not resolve/.test(w)));
    assert.ok(result.plan.every((p) => p.promptType !== "auto"), "no auto migrations in degraded mode");
  });
});

test("full-run idempotency: second run has nothing to do", async () => {
  await withUpgradeProject(
    async ({ dir }) => {
      await runUpgrade(dir, { ts, to: "next", allowDirty: true, confirm: async () => true });
      const again = await runUpgrade(dir, { ts, to: "next", from: "0.29.3", allowDirty: true, confirm: async () => true });
      assert.equal(again.applied.reduce((n, a) => n + a.editCount, 0), 0);
      assert.equal(again.manual.length, 0);
    },
    { files: { "src/game.ts": OLD } }
  );
});
