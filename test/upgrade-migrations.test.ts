import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

import { withUpgradeProject, ts, runUpgradeOffline } from "./upgrade-helpers.ts";
import { FIXTURES } from "./helpers.ts";

const ROOT = path.join(FIXTURES, "upgrade");
// A fixture dir is `<migration-id>` or `<migration-id>__<variant>` (several
// fixtures for one id, e.g. easing-functions__namespace).
const FIXTURE_DIRS = fs
  .readdirSync(ROOT)
  .filter((d) => fs.existsSync(path.join(ROOT, d, "input.ts")))
  .sort();

// Byte-exact fixture equality — the only honest regression test for a
// formatting-preserving codemod.
for (const dir of FIXTURE_DIRS) {
  const id = dir.split("__")[0]!;
  test(`migration fixture: ${dir}`, async () => {
    const input = fs.readFileSync(path.join(ROOT, dir, "input.ts"), "utf8");
    const expected = fs.readFileSync(path.join(ROOT, dir, "expected.ts"), "utf8");
    await withUpgradeProject(
      async ({ dir }) => {
        const result = await runUpgradeOffline(dir, {
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
      await runUpgradeOffline(dir, {
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
      await runUpgradeOffline(dir, {
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
      const result = await runUpgradeOffline(dir, {
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
      const again = await runUpgradeOffline(dir, {
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
      const result = await runUpgradeOffline(dir, {
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

// --- tilemap-composite-strategy library gate --------------------------------

const LIBRARY_PKG = `{
  "name": "@excaliburjs/plugin-tiles",
  "version": "0.32.0",
  "devDependencies": { "excalibur": "0.29.3" },
  "peerDependencies": { "excalibur": "~0.32.0" }
}
`;

test("tilemap-composite-strategy: a package with an excalibur peerDependency gets the library note, never the pin", async () => {
  const input = fs.readFileSync(path.join(ROOT, "tilemap-composite-strategy", "input.ts"), "utf8");
  await withUpgradeProject(
    async ({ dir }) => {
      const result = await runUpgradeOffline(dir, {
        ts,
        to: "next",
        allowDirty: true,
        migrateOnly: true,
        include: ["tilemap-composite-strategy"],
        confirm: async () => true,
      });
      const item = result.plan.find((p) => p.id === "tilemap-composite-strategy");
      assert.ok(item, "planned");
      assert.equal(item.editCount, 0);
      assert.equal(item.notes.length, 1);
      assert.match(item.notes[0]!, /peerDependency.*library code.*not pinning/);
      assert.equal(fs.readFileSync(path.join(dir, "src", "game.ts"), "utf8"), input, "TileMap literal untouched");
      assert.ok(
        result.notifications.some((n) => n.id === "tilemap-composite-strategy"),
        "the auto record's note survives into the result notifications"
      );
    },
    { files: { "src/game.ts": input, "package.json": LIBRARY_PKG } }
  );
});

test("tilemap-composite-strategy: a library that never touches TileMap gets no note at all", async () => {
  await withUpgradeProject(
    async ({ dir }) => {
      const result = await runUpgradeOffline(dir, {
        ts,
        to: "next",
        allowDirty: true,
        migrateOnly: true,
        include: ["tilemap-composite-strategy"],
        dryRun: true,
      });
      assert.deepEqual(result.plan, []);
    },
    { files: { "src/game.ts": `export const level = 1;\n`, "package.json": LIBRARY_PKG } }
  );
});
