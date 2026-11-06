import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { withUpgradeProject, ts, runUpgradeOffline } from "./upgrade-helpers.ts";

/**
 * The 2026-11 v1 coverage review records that are breadcrumb/notification
 * shaped (the auto records are byte-exact fixtures under
 * test/fixtures/upgrade/<id>). Each test drives ONE record via `include` and
 * asserts on the sites it reports, including the no-false-positive cases.
 */
async function sitesFor(id: string, files: Record<string, string>, version = "0.32.0") {
  return withUpgradeProject(
    async ({ dir }) => {
      const result = await runUpgradeOffline(dir, { ts, to: "next", allowDirty: true, migrateOnly: true, include: [id], confirm: async () => true });
      const manual = result.manual.find((m) => m.id === id)?.sites ?? [];
      const notes = result.notifications.find((n) => n.id === id)?.notes ?? [];
      // Read inside the callback — the temp dir is gone once it returns.
      const texts = Object.fromEntries(Object.keys(files).map((rel) => [rel, fs.readFileSync(path.join(dir, rel), "utf8")]));
      const read = (rel: string) => texts[rel]!;
      return { result, manual, notes, read };
    },
    { files, version }
  );
}

test("sound-removed-exports flags each removed audio type once per line and never the DOM Audio global", async () => {
  const { manual, read } = await sitesFor("sound-removed-exports", {
    "src/audio.ts": `
import { Sound, Audio, AudioImplementation, ExResponseType } from "excalibur";
import * as ex from "excalibur";
export function first(sound: Sound): Audio | undefined { return sound.instances[0]; }
export const kind: ExResponseType = "blob";
export function impl(x: ex.AudioImplementation): void {}
export const element = new Audio("x.mp3"); // an interface import has no value meaning: this IS the DOM constructor
`,
    "src/dom.ts": `
export const element = new Audio("x.mp3");
export const tag: HTMLAudioElement = element;
`,
  });
  const files = manual.map((m) => m.file);
  assert.ok(files.every((f) => f === "src/audio.ts"), `DOM Audio never flags: ${JSON.stringify(manual)}`);
  // import line (one site), Audio return type, ExResponseType annotation, ex.AudioImplementation — never the DOM `new Audio()`
  assert.deepEqual(manual.map((m) => m.line).sort((a, b) => a - b), [2, 4, 5, 6]);
  assert.match(manual.find((m) => m.line === 4)!.message, /type tracks as SoundTrack/);
  assert.match(read("src/audio.ts"), /\/\/ ex-upgrade\(sound-removed-exports\): ExResponseType was removed/);
});

test("soundmanager-options bails to a breadcrumb when a sound lists several channels, and ignores a user SoundManager class", async () => {
  const { manual, result, read } = await sitesFor("soundmanager-options", {
    "src/sm.ts": `
import { SoundManager, Sound } from "excalibur";
const a = new Sound("./a.wav");
export const manager = new SoundManager({
  channels: ["fx", "music"],
  sounds: {
    a: { sound: a, channels: ["fx", "music"] },
  },
});
`,
    "src/own.ts": `
import { Sound } from "excalibur";
export class SoundManager {
  constructor(public options: { sounds: Record<string, Sound> }) {}
}
export const mine = new SoundManager({ sounds: { a: new Sound("./a.wav") } });
`,
  });
  assert.equal(manual.length, 1);
  assert.equal(manual[0]!.file, "src/sm.ts");
  assert.match(manual[0]!.message, /ONE channel/);
  assert.ok(!result.applied.some((a) => a.id === "soundmanager-options" && a.editCount > 0), "no partial rewrite of the bailed literal");
  assert.ok(!read("src/own.ts").includes("ex-upgrade"), "a user class named SoundManager is not excalibur's");
});

test("sound-play-options breadcrumbs play() in a file that also pauses the sound", async () => {
  const { manual, read } = await sitesFor("sound-play-options", {
    "src/music.ts": `
import { Sound } from "excalibur";
const music = new Sound("./m.ogg");
export function toggle(playing: boolean): void {
  if (playing) music.pause();
  else music.play();
}
`,
  });
  assert.equal(manual.length, 1);
  assert.equal(manual[0]!.line, 6);
  assert.match(read("src/music.ts"), /ex-upgrade\(sound-play-options\): play\(\) no longer resumes a paused track/);
});

test("soundmanager-members breadcrumbs the removed quasi-internals and SoundManagerApi implementers", async () => {
  const { manual } = await sitesFor("soundmanager-members", {
    "src/api.ts": `
import { SoundManager, SoundManagerApi, Sound } from "excalibur";
export class Facade implements SoundManagerApi<"a"> {
  async play(name: "a", volume?: number): Promise<void> {}
}
export function inspect(m: SoundManager, s: Sound): number {
  if (m._muted) return 0;
  return m._getEffectiveVolume(s);
}
`,
  });
  assert.deepEqual(
    manual.map((m) => [m.line, m.message.split(" ")[0]]),
    [[3, "SoundManagerApi"], [7, "_muted"], [8, "_getEffectiveVolume"]]
  );
});

test("sound-mute-semantics is a single notification gated on mute/unmute/toggle calls", async () => {
  const { notes } = await sitesFor("sound-mute-semantics", {
    "src/m.ts": `
import { SoundManager } from "excalibur";
export function hush(m: SoundManager): void { m.mute(); m.channel.toggle("fx"); }
`,
  });
  assert.equal(notes.length, 1);
  assert.match(notes[0]!, /^2 mute\/unmute\/toggle call\(s\)/);
  const quiet = await sitesFor("sound-mute-semantics", { "src/q.ts": `export const m = { mute() {} }; m.mute();` });
  assert.deepEqual(quiet.notes, []);
});

test("system-lifecycle-hooks: a class defining BOTH generations gets a breadcrumb instead of a clash", async () => {
  const { manual, read } = await sitesFor("system-lifecycle-hooks", {
    "src/sys.ts": `
import { System } from "excalibur";
export class Both extends System {
  update(elapsed: number): void {}
  onUpdate(elapsed: number): void {}
}
`,
  });
  assert.equal(manual.length, 1);
  assert.match(manual[0]!.message, /update\(\) is never called by v1/);
  assert.match(read("src/sys.ts"), /\n  \/\/ ex-upgrade\(system-lifecycle-hooks\)[^\n]*\n  update\(elapsed/);
});

test("postprocessor-process flags getShader/getLayout implementers and ColorBlindnessPostProcessor callers", async () => {
  const { manual } = await sitesFor("postprocessor-process", {
    "src/pp.ts": `
import { PostProcessor, Shader, ColorBlindnessPostProcessor } from "excalibur";
export class Grain implements PostProcessor {
  initialize(gl: any): void {}
  getShader(): Shader { return null as any; }
  getLayout(): any { return null; }
}
export function peek(cb: ColorBlindnessPostProcessor): Shader { return cb.getShader(); }
export class NotAPostProcessor { getShader(): number { return 1; } }
`,
  });
  assert.deepEqual(manual.map((m) => m.line), [5, 8]);
  assert.match(manual[0]!.message, /implement process\(source, destination\)/);
  assert.match(manual[1]!.message, /ColorBlindnessPostProcessor\.getShader\(\) was removed/);
});

test("material-options-union flags interfaces extending MaterialOptions", async () => {
  const { manual } = await sitesFor("material-options-union", {
    "src/mo.ts": `
import { MaterialOptions } from "excalibur";
export interface GlowOptions extends MaterialOptions { strength: number }
interface Own { fragmentSource: string }
export interface Fine extends Own { x: number }
`,
  });
  assert.deepEqual(manual.map((m) => m.line), [3]);
  assert.match(manual[0]!.message, /type X = MaterialOptions & \{ … \}/);
});

test("obsolete-decorator-removed flags the decorator's import and uses", async () => {
  const { manual } = await sitesFor("obsolete-decorator-removed", {
    "src/old.ts": `
import { obsolete } from "excalibur";
export class Legacy {
  @obsolete({ message: "use b" })
  a(): void {}
}
`,
  });
  assert.deepEqual(manual.map((m) => m.line), [2, 4]);
});

test("null-for-empty flags strict undefined checks on the null-returning members (onTransition returns Transition | void on v1: never flagged)", async () => {
  const { manual } = await sitesFor("null-for-empty", {
    "src/n.ts": `
import { Component, Engine, Scene, SoundManager, Actor } from "excalibur";
export function check(c: Component, e: Engine, m: SoundManager, a: Actor, plain: { owner?: string }): boolean {
  if (c.owner === undefined) return true;
  if (typeof e.director.getSceneInstance("x") === "undefined") return true;
  if (m.getSound("a") !== undefined) return true;
  if (a.collider.get() === undefined) return true;
  if (plain.owner === undefined) return true; // not excalibur
  if (c.owner == null) return true;           // already loose
  return a.name === undefined;                // Entity.name is not in the set
}
export class Level extends Scene {
  onTransition(direction: "in" | "out") {
    if (direction === "in") return;
    return undefined;
  }
}
`,
  });
  assert.deepEqual(manual.map((m) => m.line), [4, 5, 6, 7]);
  assert.match(manual[0]!.message, /owner yields null/);
});

test("new-base-members flags subclass members that collide with v1's new Actor/Scene/Engine members", async () => {
  const { manual } = await sitesFor("new-base-members", {
    "src/nb.ts": `
import { Actor, Scene, Engine } from "excalibur";
export class Enemy extends Actor {
  canPause = false;
  get isPaused(): boolean { return this.canPause; }
  static plugins = [];
}
export class Level extends Scene {
  pause(): void {}
  resume(): void {}
  lighting = true; // only an Engine member
}
export class Game extends Engine {
  addPlugin(p: unknown): void {}
}
export class Plain { pause(): void {} }
`,
  });
  assert.deepEqual(manual.map((m) => [m.line, m.message.split(" ")[0]]), [[4, "Actor.canPause"], [5, "Actor.isPaused"], [9, "Scene.pause"], [10, "Scene.resume"], [14, "Engine.addPlugin"]]);
});

test("easing-legacy-surface flags user-written 4-argument easings handed to the narrowed Easing slots", async () => {
  const { manual } = await sitesFor("easing-legacy-surface", {
    "src/e.ts": `
import { Actor, Camera, vec } from "excalibur";
const legacy = (t: number, b: number, c: number, d: number) => b + (c * t) / d;
const modern = (t: number) => t * t;
export function go(actor: Actor, camera: Camera): void {
  actor.actions.moveTo({ pos: vec(1, 1), duration: 100, easing: legacy });
  actor.actions.moveTo({ pos: vec(1, 1), duration: 100, easing: modern });
  actor.actions.moveBy({ offset: vec(1, 1), duration: 100, easing: (t, b, c, d) => b });
  camera.move(vec(0, 0), 100, legacy);
  camera.move(vec(0, 0), 100, modern);
}
`,
  });
  assert.deepEqual(manual.map((m) => m.line), [6, 8, 9]);
  assert.match(manual[0]!.message, /legacy 4 arguments/);
});

test("rotateby-exact-offset / esm-only-package / scene-deactivate-flush are gated notifications", async () => {
  const rotate = await sitesFor("rotateby-exact-offset", {
    "src/r.ts": `
import { Actor } from "excalibur";
export function spin(a: Actor): void {
  a.actions.rotateBy({ angleRadiansOffset: Math.PI * 2, duration: 500 });
  a.actions.rotateBy({ angleRadiansOffset: 1, duration: 500, rotationType: "x" });
  a.actions.rotateBy(1, 2);
}
`,
  });
  assert.equal(rotate.notes.length, 1);
  assert.match(rotate.notes[0]!, /^1 rotateBy/);

  const esm = await sitesFor("esm-only-package", { "src/cjs.ts": `const ex = require("excalibur");\nexport const v = ex.vec(1, 1);\n` });
  assert.equal(esm.notes.length, 1);
  assert.match(esm.notes[0]!, /1 require\("excalibur"\) site\(s\)/);
  const esmQuiet = await sitesFor("esm-only-package", { "src/esm.ts": `import { vec } from "excalibur";\nexport const v = vec(1, 1);\n` });
  assert.deepEqual(esmQuiet.notes, []);

  // The vite fixture's own scene overrides onDeactivate too — count relative to that baseline.
  const baseline = await sitesFor("scene-deactivate-flush", { "src/none.ts": `export const x = 1;\n` });
  const base = Number((baseline.notes[0] ?? "0").split(" ")[0]);
  const flush = await sitesFor("scene-deactivate-flush", {
    "src/s.ts": `
import { Scene } from "excalibur";
export class Level extends Scene { onDeactivate(): void {} }
export class Plain { onDeactivate(): void {} }
`,
  });
  assert.equal(flush.notes.length, 1);
  assert.match(flush.notes[0]!, new RegExp(`^${base + 1} Scene\\.onDeactivate override\\(s\\)`));
});

test("the v1 review records run for a project already on an early 0.33 alpha (from is never bucketed)", async () => {
  await withUpgradeProject(
    async ({ dir }) => {
      const result = await runUpgradeOffline(dir, { ts, to: "next", dryRun: true });
      assert.ok(result.plan.some((p) => p.id === "system-lifecycle-hooks"), JSON.stringify(result.plan.map((p) => p.id)));
      assert.equal(result.to, "1.1.0-alpha.313");
    },
    {
      files: { "src/sys.ts": `import { System } from "excalibur";\nexport class S extends System { update(e: number): void {} }\n` },
      version: "0.33.0-alpha.224",
    }
  );
});

// --- API-shape normalization (core de02d9ff / bd9d912b / 64d44e2d) ---------

test("actor-draggable-removed flags Actor.draggable reads and writes, never a user draggable", async () => {
  const { manual, read } = await sitesFor("actor-draggable-removed", {
    "src/drag.ts": `
import { Actor } from "excalibur";
export class Card extends Actor {
  override onInitialize(): void {
    this.draggable = true;
    if (this.draggable) this.kill();
  }
}
export class Panel { draggable = false; }
export const p = new Panel();
p.draggable = true;
`,
  });
  assert.deepEqual(manual.map((m) => m.line), [5, 6]);
  assert.match(manual[0]!.message, /pointerdragmove/);
  assert.equal((read("src/drag.ts").match(/ex-upgrade\(actor-draggable-removed\)/g) ?? []).length, 2);
});

test("methods-to-getters breadcrumbs a getter override that takes parameters and a function-valued field, never a bare property read, and is idempotent", async () => {
  const files = {
    "src/res.ts": `
import { Loadable, Sound } from "excalibur";
export class Odd implements Loadable<number> {
  data = 1;
  async load(): Promise<number> { return 1; }
  isLoaded(flag?: boolean): boolean { return !!flag; }
}
export class Field implements Loadable<number> {
  data = 1;
  async load(): Promise<number> { return 1; }
  isLoaded = () => true;
}
export function stopped(s: Sound): boolean { return s.isStopped(); }
export const probe = (s: Sound) => s.isPaused; // a bare read: on the old types it looks exactly like migrated output
`,
  };
  const { manual, read } = await sitesFor("methods-to-getters", files);
  assert.deepEqual(manual.map((m) => m.line), [6, 11]);
  assert.match(manual[0]!.message, /takes parameters/);
  assert.match(manual[1]!.message, /always truthy/);
  assert.match(read("src/res.ts"), /return s\.isStopped; \}/);
  // Second pass over the migrated source: nothing left to do (the dropped parens never re-flag).
  const again = await sitesFor("methods-to-getters", { "src/res.ts": read("src/res.ts") });
  assert.equal(again.manual.length, 0);
  assert.ok(!again.result.applied.some((a) => a.id === "methods-to-getters" && a.editCount > 0), `idempotent: ${JSON.stringify(again.result.applied)}`);
});

test("v1-member-renames leaves ImageSource.ready (a Promise) and user members alone", async () => {
  const { result, read } = await sitesFor("v1-member-renames", {
    "src/img.ts": `
import { ImageSource, Engine } from "excalibur";
export const img = new ImageSource("./a.png");
void img.ready.then(() => {});
export function wait(engine: Engine): boolean { return engine.ready; }
export const mine = { ready: true, isOffScreen: false };
export const r = mine.ready && mine.isOffScreen;
`,
  });
  const out = read("src/img.ts");
  assert.match(out, /img\.ready\.then/);
  assert.match(out, /return engine\.isReady; \}/);
  assert.match(out, /mine\.ready && mine\.isOffScreen/);
  assert.equal(result.applied.find((a) => a.id === "v1-member-renames")?.editCount, 1);
});
