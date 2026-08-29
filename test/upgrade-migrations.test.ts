import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { runUpgrade } from "../src/upgrade/run.ts";
import { withUpgradeProject, ts } from "./upgrade-helpers.ts";
import { FIXTURES } from "./helpers.ts";

const ROOT = path.join(FIXTURES, "upgrade");
const FIXTURE_IDS = fs
  .readdirSync(ROOT)
  .filter((d) => fs.existsSync(path.join(ROOT, d, "input.ts")))
  .sort();

// Byte-exact fixture equality — the only honest regression test for a
// formatting-preserving codemod.
for (const id of FIXTURE_IDS) {
  test(`migration fixture: ${id}`, async () => {
    const input = fs.readFileSync(path.join(ROOT, id, "input.ts"), "utf8");
    const expected = fs.readFileSync(path.join(ROOT, id, "expected.ts"), "utf8");
    await withUpgradeProject(
      async ({ dir }) => {
        const result = await runUpgrade(dir, {
          ts,
          to: "next",
          allowDirty: true,
          migrateOnly: true,
          include: [id],
          confirm: async () => true,
        });
        assert.equal(fs.readFileSync(path.join(dir, "src", "game.ts"), "utf8"), expected);
        assert.ok(
          result.applied.some((a) => a.id === id) || result.manual.some((m) => m.id === id),
          `${id} reported as applied or manual`
        );
      },
      { files: { "src/game.ts": input } }
    );
  });
}

test("ease-actions-to-moveto handles the Vector overload distinctly from the positional overload", async () => {
  await withUpgradeProject(
    async ({ dir }) => {
      await runUpgrade(dir, {
        ts,
        to: "next",
        allowDirty: true,
        migrateOnly: true,
        include: ["ease-actions-to-moveto"],
        confirm: async () => true,
      });
      const out = fs.readFileSync(path.join(dir, "src", "game.ts"), "utf8");
      assert.match(out, /moveTo\(\{ pos: vec\(100, 200\), duration: 500, easing: EasingFunctions\.EaseInOutCubic \}\)/);
      assert.match(out, /moveBy\(\{ offset: vec\(10, 0\), duration: 250 \}\)/);
      assert.ok(!out.includes("vec(vec("), "Vector-overload arg must not be re-wrapped in vec(...)");
    },
    {
      files: {
        "src/game.ts": `
import { Actor, EasingFunctions, vec } from "excalibur";
export function glide(actor: Actor): void {
  actor.actions.easeTo(vec(100, 200), 500, EasingFunctions.EaseInOutCubic);
  actor.actions.easeBy(vec(10, 0), 250);
}
`,
      },
    }
  );
});

test("input-namespace-flatten handles namespace imports (ex.Input.Keys)", async () => {
  await withUpgradeProject(
    async ({ dir }) => {
      await runUpgrade(dir, {
        ts,
        to: "next",
        allowDirty: true,
        migrateOnly: true,
        include: ["input-namespace-flatten"],
        confirm: async () => true,
      });
      const out = fs.readFileSync(path.join(dir, "src", "ns.ts"), "utf8");
      assert.match(out, /ex\.Keys\.Space/);
      assert.match(out, /kb: ex\.Keyboard/);
      assert.ok(!out.includes("ex.Input"), "Input qualifier removed");
    },
    {
      files: {
        "src/ns.ts": `
import * as ex from "excalibur";
export function poll(engine: ex.Engine, kb: ex.Input.Keyboard): boolean {
  return engine.input.keyboard.wasPressed(ex.Input.Keys.Space);
}
`,
      },
    }
  );
});

test("manual migrations insert id-scoped breadcrumbs above each site", async () => {
  await withUpgradeProject(
    async ({ dir }) => {
      const result = await runUpgrade(dir, {
        ts,
        to: "next",
        allowDirty: true,
        migrateOnly: true,
        include: ["screen-coordinates-rooting"],
        confirm: async () => true,
      });
      assert.equal(result.manual.length, 1);
      const out = fs.readFileSync(path.join(dir, "src", "hud.ts"), "utf8");
      assert.match(out, /\/\/ ex-upgrade\(screen-coordinates-rooting\): worldToScreenCoordinates is now content-area-rooted/);
      // Second run: no duplicate breadcrumbs, no reported sites.
      const again = await runUpgrade(dir, {
        ts,
        to: "next",
        allowDirty: true,
        migrateOnly: true,
        include: ["screen-coordinates-rooting"],
        confirm: async () => true,
      });
      assert.equal(again.manual.length, 0, "idempotent report");
      assert.equal(
        (fs.readFileSync(path.join(dir, "src", "hud.ts"), "utf8").match(/ex-upgrade\(/g) ?? []).length,
        1,
        "no duplicate comment"
      );
    },
    {
      files: {
        "src/hud.ts": `
import { Engine, vec } from "excalibur";
export function place(engine: Engine) {
  return engine.screen.worldToScreenCoordinates(vec(0, 0));
}
`,
      },
    }
  );
});

test("screen-coordinates-rooting stays quiet for non-clipping display modes", async () => {
  await withUpgradeProject(
    async ({ dir }) => {
      const result = await runUpgrade(dir, {
        ts,
        to: "next",
        allowDirty: true,
        migrateOnly: true,
        include: ["screen-coordinates-rooting"],
        dryRun: true,
      });
      assert.deepEqual(result.plan, []);
    },
    {
      files: {
        // Replace the template main.ts (it uses clipping FitScreenAndFill)
        // with a non-clipping mode, plus a would-be site.
        "src/main.ts": `
import { Engine, DisplayMode, vec } from "excalibur";
import { MyLevel } from "./level";
export const game = new Engine({ displayMode: DisplayMode.FitScreen, scenes: { start: MyLevel } });
export const p = game.screen.worldToScreenCoordinates(vec(1, 2));
`,
      },
    }
  );
});
