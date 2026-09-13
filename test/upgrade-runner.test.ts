import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

import { GenerateError } from "../src/generate/errors.ts";
import { withUpgradeProject, ts, runUpgradeOffline } from "./upgrade-helpers.ts";
import { withViteProject, ts as viteTs } from "./generate-helpers.ts";

const OLD = `
import { Engine } from "excalibur";
export function next(engine: Engine): void { engine.goto("level2"); }
`;

test("git gate: non-repo refuses, clean repo passes, dirty repo refuses", async () => {
  await withUpgradeProject(async ({ dir }) => {
    await assert.rejects(
      () => runUpgradeOffline(dir, { ts, to: "next" }),
      (e) => e instanceof GenerateError && /not a git repository/.test(e.message)
    );
  });
  await withUpgradeProject(
    async ({ dir }) => {
      const ok = await runUpgradeOffline(dir, { ts, to: "next", include: ["goto-to-gotoscene"], confirm: async () => true });
      assert.equal(ok.applied.length, 1);
      // tree is now dirty from the migration itself
      await assert.rejects(
        () => runUpgradeOffline(dir, { ts, to: "next" }),
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
      const result = await runUpgradeOffline(dir, { ts, to: "next", dryRun: true });
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
      const result = await runUpgradeOffline(dir, { ts, to: "next", allowDirty: true, confirm: async () => false });
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
      const result = await runUpgradeOffline(dir, { ts, to: "next", allowDirty: true, migrateOnly: true, confirm: async () => true });
      assert.ok(result.applied.length > 0);
      assert.equal(result.packageJson.bumped, false);
      assert.match(fs.readFileSync(path.join(dir, "package.json"), "utf8"), /"excalibur": "0\.29\.3"/);
    },
    { files: { "src/game.ts": OLD } }
  );
});

test("bump preserves package.json formatting and writes the exact resolved next version", async () => {
  await withUpgradeProject(
    async ({ dir }) => {
      const before = fs.readFileSync(path.join(dir, "package.json"), "utf8");
      await runUpgradeOffline(dir, { ts, to: "next", allowDirty: true, confirm: async () => true });
      const after = fs.readFileSync(path.join(dir, "package.json"), "utf8");
      assert.equal(after, before.replace('"excalibur": "0.29.3"', '"excalibur": "0.33.0-alpha.224"'));
    },
    { files: { "src/game.ts": OLD } }
  );
});

test("already up to date returns upToDate without touching anything", async () => {
  await withUpgradeProject(
    async ({ dir }) => {
      const result = await runUpgradeOffline(dir, { ts, to: "0.30.0", from: "0.31.0", allowDirty: true });
      assert.equal(result.upToDate, true);
    },
    {}
  );
});

test("typeless node_modules degrades autos to notifications with a loud warning", async () => {
  // generate-helpers' withViteProject fabricates excalibur with no types.
  await withViteProject(async ({ dir }) => {
    const result = await runUpgradeOffline(dir, { ts: viteTs, to: "next", from: "0.29.3", dryRun: true });
    assert.ok(result.warnings.some((w) => /type declarations did not resolve/.test(w)));
    assert.ok(result.plan.every((p) => p.promptType !== "auto"), "no auto migrations in degraded mode");
  });
});

const REALISTIC_PHYSICS = `
import { Engine, SolverStrategy } from "excalibur";
export const game = new Engine({ physics: { solver: SolverStrategy.Realistic } });
`;

test("all-notification plan still confirms and a decline skips the package.json bump", async () => {
  await withUpgradeProject(
    async ({ dir }) => {
      let confirmCalls = 0;
      const declined = await runUpgradeOffline(dir, {
        ts,
        to: "next",
        allowDirty: true,
        include: ["physics-sleep-defaults"],
        confirm: async (summary) => {
          confirmCalls++;
          assert.ok(summary.plan.every((p) => p.promptType === "notification"), "plan is all-notification");
          return false;
        },
      });
      assert.equal(confirmCalls, 1, "confirm must be shown even for an all-notification plan");
      assert.equal(declined.packageJson.bumped, false, "declining must not bump package.json");
      assert.match(fs.readFileSync(path.join(dir, "package.json"), "utf8"), /"excalibur": "0\.29\.3"/);

      confirmCalls = 0;
      const accepted = await runUpgradeOffline(dir, {
        ts,
        to: "next",
        allowDirty: true,
        include: ["physics-sleep-defaults"],
        confirm: async () => {
          confirmCalls++;
          return true;
        },
      });
      assert.equal(confirmCalls, 1);
      assert.equal(accepted.packageJson.bumped, true, "accepting still bumps once confirmed");
    },
    { files: { "src/physics.ts": REALISTIC_PHYSICS } }
  );
});

test("full-run idempotency: second run has nothing to do", async () => {
  await withUpgradeProject(
    async ({ dir }) => {
      await runUpgradeOffline(dir, { ts, to: "next", allowDirty: true, confirm: async () => true });
      const again = await runUpgradeOffline(dir, { ts, to: "next", from: "0.29.3", allowDirty: true, confirm: async () => true });
      assert.equal(again.applied.reduce((n, a) => n + a.editCount, 0), 0);
      assert.equal(again.manual.length, 0);
    },
    { files: { "src/game.ts": OLD } }
  );
});

// --- version gating: removedIn + backlog ---------------------------------

const USES_VECTOR_SIZE = `
import { vec } from "excalibur";
export const speed = vec(3, 4).size;
`;

test("removedIn: a 0.30-era codemod is re-selected for a project already on 0.32 when v1 removes the API", async () => {
  await withUpgradeProject(
    async ({ dir }) => {
      const result = await runUpgradeOffline(dir, { ts, to: "next", dryRun: true });
      // The window is (0.32.0, 1.0.0]; vector-size-to-magnitude is tagged 0.30.0 but removedIn 1.0.0.
      assert.ok(result.plan.some((p) => p.id === "vector-size-to-magnitude"), "removed-in-v1 rename is back in the path");
      assert.equal(result.to, "0.33.0-alpha.224", "summary.to is the version that will be installed, not the bucket");
      assert.deepEqual(result.backlog, [], "a re-selected migration is in the plan, not the backlog");
      // Same project, same hop stopping before the removal: nothing to do.
      const stop = await runUpgradeOffline(dir, { ts, to: "0.32.0", dryRun: true });
      assert.equal(stop.upToDate, true);
    },
    { files: { "src/game.ts": USES_VECTOR_SIZE }, version: "0.32.0" }
  );
});

test("backlog: an older migration the code still matches is reported (never run) with the --from that picks it up", async () => {
  await withUpgradeProject(
    async ({ dir }) => {
      // goto-to-gotoscene is 0.30.0 with no removedIn — outside the (0.32.0, 1.0.0] window.
      const result = await runUpgradeOffline(dir, { ts, to: "next", dryRun: true });
      assert.ok(!result.plan.some((p) => p.id === "goto-to-gotoscene"), "not in the plan");
      assert.deepEqual(
        result.backlog.map((b) => [b.id, b.version, b.editCount, b.rerunFrom]),
        [["goto-to-gotoscene", "0.30.0", 1, "0.29.3"]]
      );
      assert.ok(result.warnings.some((w) => /still matches 1 migration\(s\) from before the detected version 0\.32\.0[\s\S]*--from 0\.29\.3/.test(w)), result.warnings.join("\n"));
      // The file is untouched by a dry run, and a real run never applies backlog items either.
      assert.match(fs.readFileSync(path.join(dir, "src", "game.ts"), "utf8"), /engine\.goto\("level2"\)/);
      // Opt-out.
      const quiet = await runUpgradeOffline(dir, { ts, to: "next", dryRun: true, noBacklog: true });
      assert.deepEqual(quiet.backlog, []);
      assert.ok(!quiet.warnings.some((w) => /still matches/.test(w)));
      // Re-running from the suggested version puts it in the plan.
      const reopened = await runUpgradeOffline(dir, { ts, to: "next", dryRun: true, from: "0.29.3" });
      assert.ok(reopened.plan.some((p) => p.id === "goto-to-gotoscene"));
      assert.deepEqual(reopened.backlog, []);
    },
    { files: { "src/game.ts": OLD }, version: "0.32.0" }
  );
});

// --- peerDependencies -----------------------------------------------------

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

test("a library that declares excalibur as a peer gets the peer range bumped alongside the devDependency", async () => {
  await withUpgradeProject(
    async ({ dir }) => {
      const result = await runUpgradeOffline(dir, { ts, to: "next", allowDirty: true, confirm: async () => true });
      assert.equal(result.packageJson.bumped, true);
      assert.equal(result.packageJson.peerBumped, true);
      assert.equal(result.packageJson.peerSpec, ">=0.33.0-alpha.224");
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
      assert.equal(pkg.devDependencies.excalibur, "0.33.0-alpha.224", "exact pin, not the dist-tag");
      assert.equal(pkg.peerDependencies.excalibur, ">=0.33.0-alpha.224", "a range, not a pin");
      assert.ok(!result.warnings.some((w) => /peerDependencies/.test(w)));
    },
    { files: { "src/game.ts": OLD, "package.json": PLUGIN_PKG } }
  );
});

test("offline `next` fallback writes the dist-tag, leaves the peer range alone, and says so", async () => {
  await withUpgradeProject(
    async ({ dir }) => {
      const result = await runUpgradeOffline(dir, {
        ts,
        to: "next",
        allowDirty: true,
        confirm: async () => true,
        fetchDistTags: async () => ({}), // registry unreachable
      });
      assert.equal(result.packageJson.spec, "next");
      assert.equal(result.packageJson.peerBumped, false);
      assert.equal(result.packageJson.peerSpec, null);
      assert.ok(result.warnings.some((w) => /could not resolve the `next` dist-tag/.test(w)), "fallback caveat surfaced");
      assert.ok(result.warnings.some((w) => /peerDependencies\.excalibur was left as-is/.test(w)), "peer caveat surfaced");
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
      assert.equal(pkg.devDependencies.excalibur, "next");
      assert.equal(pkg.peerDependencies.excalibur, "~0.32.0", "never guessed a range from a dist-tag");
    },
    { files: { "src/game.ts": OLD, "package.json": PLUGIN_PKG } }
  );
});
