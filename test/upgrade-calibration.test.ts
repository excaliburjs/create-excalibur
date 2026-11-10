import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { withUpgradeProject, ts, runUpgradeOffline, OFFLINE_TAGS } from "./upgrade-helpers.ts";
import { rangeAdmits } from "../src/upgrade/versions.ts";
import { runPreflight } from "../src/upgrade/preflight.ts";

/**
 * Fixes from the 2026-11-07 calibration over 22 excaliburjs org repos
 * (sample-*, template-*, ludum-55): gaps and false positives the real
 * projects exposed, each pinned here. Auto records are fixtures under
 * test/fixtures/upgrade/<id>; these are the breadcrumb/notification shapes.
 */
async function sitesFor(id: string, files: Record<string, string>, version = "0.29.3") {
  return withUpgradeProject(
    async ({ dir }) => {
      const result = await runUpgradeOffline(dir, { ts, to: "next", allowDirty: true, migrateOnly: true, include: [id], confirm: async () => true });
      const manual = result.manual.find((m) => m.id === id)?.sites ?? [];
      const notes = result.notifications.find((n) => n.id === id)?.notes ?? [];
      const texts = Object.fromEntries(Object.keys(files).map((rel) => [rel, fs.readFileSync(path.join(dir, rel), "utf8")]));
      return { result, manual, notes, read: (rel: string) => texts[rel]! };
    },
    { files, version }
  );
}

test("sound-play-options rewrites play(volume) when volume is number | undefined (destructured with a default)", async () => {
  const { read } = await sitesFor("sound-play-options", {
    "src/a.ts": `import { Sound } from "excalibur";\nexport function cue(sfx: Sound, opts: { volume?: number }): void {\n  const { volume } = opts;\n  sfx.play(volume);\n  sfx.play(opts.volume);\n}\n`,
  });
  const text = read("src/a.ts");
  assert.match(text, /sfx\.play\(\{ volume \}\);/);
  assert.match(text, /sfx\.play\(\{ volume: opts\.volume \}\);/);
});

test("collision-event-target skips hooks with Collider-typed params and handlers that already read .owner", async () => {
  const { manual } = await sitesFor("collision-event-target", {
    "src/c.ts": `
import { Actor, Collider } from "excalibur";
export class Ball extends Actor {
  onCollisionStart(self: Collider, other: Collider): void { console.log(other); }   // Collider-typed: skip
  onCollisionEnd(self: any, other: any): void { console.log(other.owner); }           // reads .owner: skip
  onPreCollisionResolve(self: any, other: any): void { console.log(other.pos); }      // flags
  wire(): void {
    this.on("collisionstart", (ev: any) => ev.other.owner.kill());                   // reads .owner: skip
    this.on("collisionend", (ev: any) => ev.other.kill());                           // flags
    this.on("collisionend", () => { console.log("separated"); });                    // ignores the event: skip
  }
}
`,
  });
  assert.deepEqual(manual.map((m) => m.line), [6, 9]);
});

test("trigger-api only flags a Trigger literal that still uses `target` (the key whose meaning changed)", async () => {
  const { manual } = await sitesFor("trigger-api", {
    "src/t.ts": `
import { Trigger, Actor } from "excalibur";
export const modern = new Trigger({ pos: undefined, filter: (e: Actor) => true, action: (e: Actor) => {} } as any);
export const legacy = new Trigger({ pos: undefined, target: new Actor(), action: () => {} } as any);
`,
  });
  assert.deepEqual(manual.map((m) => m.line), [4]);
});

test("scene-deactivate-flush ignores the template's comment-only onDeactivate stub", async () => {
  const baseline = await sitesFor("scene-deactivate-flush", { "src/none.ts": `export const x = 1;\n` }, "0.32.0");
  const base = Number((baseline.notes[0] ?? "0").split(" ")[0]);
  const { notes } = await sitesFor(
    "scene-deactivate-flush",
    { "src/s.ts": `import { Scene } from "excalibur";\nexport class Stub extends Scene { onDeactivate(): void { /* Called when scene is deactivated */ } }\nexport class Real extends Scene { onDeactivate(): void { this.world.query([]); } }\n` },
    "0.32.0"
  );
  assert.match(notes[0]!, new RegExp(`^${base + 1} Scene\\.onDeactivate`));
});

test("material-screenuv-origin ignores a shader that only declares the v_screenuv varying", async () => {
  const { manual } = await sitesFor(
    "material-screenuv-origin",
    {
      "src/m.ts": `
import { Engine } from "excalibur";
export function materials(engine: Engine): void {
  engine.graphicsContext.createMaterial({ name: "a", fragmentSource: "#version 300 es\\nin vec2 v_uv;\\nin vec2 v_screenuv;\\n// v_screenuv unused\\nvoid main() {}" });
  engine.graphicsContext.createMaterial({ name: "b", fragmentSource: "in vec2 v_screenuv; void main() { vec2 p = v_screenuv; }" });
}
`,
    },
    "0.32.0"
  );
  assert.deepEqual(manual.map((m) => m.line), [5]);
});

test("actor-options-union flags interfaces extending ActorArgs and spreads next to collider keys", async () => {
  const { manual } = await sitesFor("actor-options-union", {
    "src/u.ts": `
import { Actor, ActorArgs } from "excalibur";
export interface BirdArgs extends ActorArgs { speed: number }                          // flags
export class Saw extends Actor {
  constructor(args: ActorArgs) { super({ ...args, width: 16, height: 16 }); }           // flags
}
export class Coin extends Actor {
  constructor(args: ActorArgs) { super({ ...args, name: "coin" }); }                    // no collider key: fine
}
interface Mine { x: number }
export const spread = (m: Mine) => ({ ...m, width: 1 });                               // not excalibur's type
`,
  });
  assert.deepEqual(manual.map((m) => m.line), [3, 5]);
});

test("collider-owner-nullable counts dereferences of a Collider's .owner, not guarded or bare reads", async () => {
  const { notes } = await sitesFor(
    "collider-owner-nullable",
    {
      "src/o.ts": `
import { Collider } from "excalibur";
export function hit(other: Collider, mine: { owner: { kill(): void } }): void {
  (other as any).owner.kill();      // dereference via any: not Collider-typed, skip
  other.owner.kill();               // counts
  other.owner?.kill();              // guarded
  const o = other.owner;            // bare read
  mine.owner.kill();                // user type
  console.log(o);
}
`,
    },
    "0.32.0"
  );
  assert.equal(notes.length, 1);
  assert.match(notes[0]!, /^1 dereference\(s\)/);
});

test("rangeAdmits understands the ranges plugins publish", () => {
  const cases: Array<[string, string, boolean | null]> = [
    ["~0.30.1", "0.30.5", true],
    ["~0.30.1", "0.31.0", false],
    ["~0.30.1", "1.1.0-alpha.320", false],
    ["^0.32.0", "0.32.9", true],
    ["^0.32.0", "0.33.0", false],
    ["^1.0.0", "1.4.2", true],
    ["^1.0.0", "1.1.0-alpha.320", false],
    ["^1.0.0 || ^1.1.0-alpha.313", "1.1.0-alpha.320", true],
    ["^1.1.0-alpha.313", "1.1.0-alpha.312", false],
    [">=0.32.0", "1.0.0", true],
    [">=0.32.0", "1.1.0-alpha.320", false],
    [">=1.1.0-alpha.1", "1.1.0-alpha.320", true],
    ["~0.30 || ~0.31 || ~0.32", "0.31.4", true],
    ["0.29.x", "0.29.7", true],
    ["0.29", "0.30.0", false],
    ["*", "9.9.9", true],
    ["workspace:*", "1.0.0", null],
    ["", "1.0.0", null],
  ];
  for (const [range, version, expected] of cases) assert.equal(rangeAdmits(range, version), expected, `${range} vs ${version}`);
});

test("an installed @excaliburjs plugin whose excalibur peer range rejects the target is warned about by upgrade and preflight", async () => {
  const pluginPkg = JSON.stringify({ name: "@excaliburjs/plugin-tiled", version: "0.30.1", peerDependencies: { excalibur: "~0.30.1" } });
  const okPluginPkg = JSON.stringify({ name: "@excaliburjs/plugin-jsfxr", version: "1.0.0", peerDependencies: { excalibur: "^1.0.0 || ^1.1.0-alpha.1" } });
  const files = {
    "package.json": JSON.stringify({ name: "t", version: "1.0.0", dependencies: { excalibur: "0.29.3", "@excaliburjs/plugin-tiled": "0.30.1" }, devDependencies: { "@excaliburjs/plugin-jsfxr": "^1.0.0" } }),
    "node_modules/@excaliburjs/plugin-tiled/package.json": pluginPkg,
    "node_modules/@excaliburjs/plugin-jsfxr/package.json": okPluginPkg,
  };
  await withUpgradeProject(
    async ({ dir }) => {
      const result = await runUpgradeOffline(dir, { ts, to: "next", dryRun: true });
      const warning = result.warnings.find((w) => w.includes("@excaliburjs/plugin-tiled@0.30.1"));
      assert.ok(warning, JSON.stringify(result.warnings));
      assert.match(warning!, /"~0\.30\.1", which does not admit 1\.1\.0-alpha\.313/);
      assert.ok(!result.warnings.some((w) => w.includes("plugin-jsfxr")), "a peer range admitting the target is quiet");

      const report = await runPreflight(dir, { ts, to: "next", fetchDistTags: OFFLINE_TAGS });
      assert.deepEqual(
        report.plugins.map((p) => [p.name, p.installed, p.peerRange, p.admitsTarget]),
        [
          ["@excaliburjs/plugin-jsfxr", "1.0.0", "^1.0.0 || ^1.1.0-alpha.1", true],
          ["@excaliburjs/plugin-tiled", "0.30.1", "~0.30.1", false],
        ]
      );
      assert.ok(report.warnings.some((w) => w.includes("@excaliburjs/plugin-tiled@0.30.1")));
    },
    { files, git: true }
  );
});

test("engine.isReady() -> ready is never re-renamed to the boolean isReady (same run, or a second run before npm install)", async () => {
  const src = `import { Engine } from "excalibur";\nexport async function boot(engine: Engine): Promise<boolean> {\n  await engine.isReady();\n  engine.isReady().then(() => {});\n  return engine.ready;\n}\n`;
  await withUpgradeProject(
    async ({ dir }) => {
      const run = () =>
        runUpgradeOffline(dir, { ts, to: "next", allowDirty: true, migrateOnly: true, include: ["methods-to-getters", "v1-member-renames"], confirm: async () => true });
      const expected = /await engine\.ready;\n  engine\.ready\.then\(\(\) => \{\}\);\n  return engine\.isReady;/;
      await run();
      assert.match(fs.readFileSync(path.join(dir, "src/boot.ts"), "utf8"), expected);
      await run();
      assert.match(fs.readFileSync(path.join(dir, "src/boot.ts"), "utf8"), expected);
    },
    { files: { "src/boot.ts": src }, version: "0.32.0" }
  );
});
