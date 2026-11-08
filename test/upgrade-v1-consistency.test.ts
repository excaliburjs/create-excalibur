import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { withUpgradeProject, ts, runUpgradeOffline } from "./upgrade-helpers.ts";

/**
 * The API-consistency pass (core b930f2b7 / 6f19e7d2 / 1a1c8331): the auto
 * records are byte-exact fixtures under test/fixtures/upgrade/<id>; these are
 * the breadcrumb/notification-shaped ones, each driven alone via `include`.
 */
async function sitesFor(id: string, files: Record<string, string>, version = "0.32.0") {
  return withUpgradeProject(
    async ({ dir }) => {
      const result = await runUpgradeOffline(dir, { ts, to: "next", allowDirty: true, migrateOnly: true, include: [id], confirm: async () => true });
      const manual = result.manual.find((m) => m.id === id)?.sites ?? [];
      const notes = result.notifications.find((n) => n.id === id)?.notes ?? [];
      const texts = Object.fromEntries(Object.keys(files).map((rel) => [rel, fs.readFileSync(path.join(dir, rel), "utf8")]));
      const read = (rel: string) => texts[rel]!;
      return { result, manual, notes, read };
    },
    { files, version }
  );
}

test("sound-time-units breadcrumbs every seconds-valued Sound/SoundTrack site with the converted literal, never a user class", async () => {
  const { manual, read } = await sitesFor("sound-time-units", {
    "src/audio.ts": `
import { Sound, SoundTrack, PlayOptions } from "excalibur";
export function cue(sound: Sound, track: SoundTrack, offset: number): number {
  sound.seek(2.5);
  sound.seek(offset, 1);
  sound.duration = 1.1;
  sound.position = offset;
  sound.play({ position: 0.25, duration: 2, volume: 1 });
  const opts: PlayOptions = { duration: offset };
  sound.start(opts);
  track.scheduledStartTime = 3;
  track.seek(1);
  return sound.getPlaybackPosition() + track.getTotalPlaybackDuration() + sound.duration!;
}
export class Jukebox {
  duration = 2;
  seek(position: number): void { this.duration = position; }
}
export const box = new Jukebox();
box.seek(3);
`,
  });
  assert.deepEqual(
    manual.map((m) => m.line),
    [4, 5, 6, 7, 8, 8, 9, 11, 12, 13, 13, 13]
  );
  const text = read("src/audio.ts");
  assert.match(text, /seek\(\) takes milliseconds in v1 \(was seconds\) — seek\(2500\) keeps the old timing[^\n]*\n\s*sound\.seek\(2\.5\)/);
  assert.match(text, /seek\(\) takes milliseconds in v1 \(was seconds\) — multiply the seconds value by 1000[^\n]*\n\s*sound\.seek\(offset, 1\)/);
  assert.match(text, /duration is milliseconds in v1 \(was seconds\) — sound\.duration = 1100 keeps the old timing/);
  assert.match(text, /position: 250 keeps the old timing/);
  assert.match(text, /scheduledStartTime is milliseconds in v1 \(was seconds\) — track\.scheduledStartTime = 3000 keeps/);
  assert.match(text, /getPlaybackPosition\(\) returns milliseconds in v1/);
  assert.ok(!/ex-upgrade\(sound-time-units\)[^\n]*\n\s*box\.seek/.test(text), "user Jukebox.seek is untouched");
  // one breadcrumb per site (a line with three sites gets three distinct messages)
  assert.equal((text.match(/ex-upgrade\(sound-time-units\)/g) ?? []).length, 12);
});

test("v1-legacy-removals flags the deleted exports once per line, including Util/Flags/Particle statics", async () => {
  const { manual } = await sitesFor("v1-legacy-removals", {
    "src/legacy.ts": `
import { TagsComponent, isAddedComponent, ScreenShader, Util, Flags, Particle, ExcaliburGraphicsContextWebGL, CapturePointerConfig } from "excalibur";
Flags.useLegacyImageRenderer();
export const tags = new TagsComponent();
export const shader = new ScreenShader("#version 300 es");
export const added = isAddedComponent({ type: "x", data: null as any });
export function renderer(ctx: ExcaliburGraphicsContextWebGL): string { return ctx.imageRenderer; }
export const life = Particle.DefaultConfig.life;
export const list: number[] = [];
Util.addItemToArray(1, list);
Util.removeItemFromArray(1, list);
export const cfg: CapturePointerConfig = { captureMoveEvents: true, captureDragEvents: false };
export class Mine { static DefaultConfig = {}; imageRenderer = "x"; }
export const mine = Mine.DefaultConfig;
`,
  });
  assert.deepEqual(manual.map((m) => m.line), [2, 3, 4, 5, 6, 7, 8, 10, 12]);
  assert.match(manual.find((m) => m.line === 3)!.message, /useLegacyImageRenderer \(Flags\) was removed/);
  assert.match(manual.find((m) => m.line === 8)!.message, /Particle\.DefaultConfig/);
  assert.match(manual.find((m) => m.line === 10)!.message, /array\.includes\(item\)/);
});

test("color-invert-alpha is a notification gated on Color.invert()/screen() calls", async () => {
  const quiet = await sitesFor("color-invert-alpha", { "src/c.ts": `import { Color } from "excalibur";\nexport const c = Color.Red.clone();\n` });
  assert.deepEqual(quiet.notes, []);
  const { notes } = await sitesFor("color-invert-alpha", {
    "src/c.ts": `
import { Color } from "excalibur";
export const a = Color.Red.invert();
export const b = Color.Red.screen(Color.White);
export const c = Color.White.invert().invert();
export class Img { invert(): Img { return this; } }
export const d = new Img().invert();
`,
  });
  assert.equal(notes.length, 1);
  assert.match(notes[0]!, /^3 Color\.invert\(\) call\(s\).*; 1 Color\.screen\(\) call\(s\)/);
});

test("material-screenuv-origin flags Material fragment sources that read v_screenuv (literal, tagged, const, passes), nothing else", async () => {
  const { manual } = await sitesFor("material-screenuv-origin", {
    "src/m.ts": `
import { Engine, Material } from "excalibur";
const glsl = (s: TemplateStringsArray) => s.raw.join("");
const reflect = \`#version 300 es
in vec2 v_screenuv;
uniform sampler2D u_screen_texture;
out vec4 fragColor;
void main() { fragColor = texture(u_screen_texture, vec2(v_screenuv.x, 1.0 - v_screenuv.y)); }\`;
export function materials(engine: Engine): void {
  engine.graphicsContext.createMaterial({ name: "a", fragmentSource: reflect });
  engine.graphicsContext.createMaterial({ name: "b", fragmentSource: glsl\`in vec2 v_screenuv; void main() { vec2 p = v_screenuv; }\` });
  engine.graphicsContext.createMaterial({ name: "c", fragmentSource: "in vec2 v_uv; void main() {}" });
  engine.graphicsContext.createMaterial({ name: "d", passes: ["in vec2 v_uv;", "in vec2 v_screenuv; void main() { vec2 p = v_screenuv; }"] });
  new Material({ name: "e", fragmentSource: reflect });
}
export class Fake { createMaterial(o: { fragmentSource: string }): void {} }
new Fake().createMaterial({ fragmentSource: reflect });
`,
  });
  assert.deepEqual(manual.map((m) => m.line), [10, 11, 13, 14]);
  assert.match(manual[0]!.message, /bottom-left origin/);
});

test("postprocessor-process flags a PostProcessor implementer with no process() even without the legacy pair", async () => {
  const { manual } = await sitesFor("postprocessor-process", {
    "src/pp.ts": `
import { PostProcessor } from "excalibur";
export class NoProcess implements PostProcessor {
  initialize(gl: any): void {}
}
export class HasProcess implements PostProcessor {
  initialize(gl: any): void {}
  process(source: any, destination: any): void {}
}
`,
  });
  assert.deepEqual(manual.map((m) => m.line), [3]);
  assert.match(manual[0]!.message, /were removed in v1 — implement process\(source, destination\)/);
});

// --- adversarial-review follow-ups ------------------------------------------

test("sound-time-units keeps a multi-line receiver on one breadcrumb line and stays idempotent", async () => {
  const files = { "src/t.ts": `import { SoundTrack } from "excalibur";\nexport function cue(track: SoundTrack): void {\n  track\n    .scheduledStartTime = 3;\n}\n` };
  const first = await sitesFor("sound-time-units", files);
  const text = first.read("src/t.ts");
  assert.equal(first.manual.length, 1);
  assert.match(text, /\/\/ ex-upgrade\(sound-time-units\): scheduledStartTime is milliseconds in v1 \(was seconds\) — track\.scheduledStartTime = 3000 keeps the old timing[^\n]*\n\s*track\n\s*\.scheduledStartTime = 3;/);
  const second = await sitesFor("sound-time-units", { "src/t.ts": text });
  assert.equal(second.manual.length, 0, "re-run reports nothing");
  assert.equal(second.read("src/t.ts"), text, "re-run writes nothing");
});

test("re-exports of removed names get a breadcrumb (event-types-to-strings and v1-legacy-removals)", async () => {
  const events = await sitesFor("event-types-to-strings", { "src/re.ts": `export { EventTypes } from "excalibur";\nexport type { kill } from "excalibur";\n` });
  assert.deepEqual(events.manual.map((m) => m.line), [1, 2]);
  assert.equal((events.read("src/re.ts").match(/^export/gm) ?? []).length, 2, "re-exports are kept, not dropped");
  const legacy = await sitesFor("v1-legacy-removals", { "src/re.ts": `export { TagsComponent, ScreenShader as Screen } from "excalibur";\n` });
  assert.deepEqual(legacy.manual.map((m) => m.line), [1]);
});

test("postprocessor-process accepts an inherited or arrow-function process()", async () => {
  const { manual } = await sitesFor("postprocessor-process", {
    "src/pp.ts": `
import { PostProcessor } from "excalibur";
class Base { process(source: any, destination: any): void {} }
export class Inherits extends Base implements PostProcessor { initialize(gl: any): void {} }
export class Arrow implements PostProcessor { initialize(gl: any): void {} process = (s: any, d: any): void => {}; }
export class Missing implements PostProcessor { initialize(gl: any): void {} }
`,
  });
  assert.deepEqual(manual.map((m) => m.line), [6]);
});

test("slide-easing-option breadcrumbs instead of producing a duplicate easing key", async () => {
  const { manual, read } = await sitesFor("slide-easing-option", {
    "src/s.ts": `import { Slide, linear, easeInOutCubic } from "excalibur";\nexport const slide = new Slide({ duration: 500, slideDirection: "up", easing: linear, easingFunction: easeInOutCubic });\n`,
  });
  assert.equal(manual.length, 1);
  assert.match(manual[0]!.message, /already has a easing key/);
  assert.ok(!/easing: linear, easing:/.test(read("src/s.ts")), "no duplicate key written");
});

test("material-screenuv-origin follows shader consts imported from another file", async () => {
  const { manual } = await sitesFor("material-screenuv-origin", {
    "src/shaders.ts": `export const reflect = "in vec2 v_screenuv; void main() { vec2 p = v_screenuv; }";\nexport const plain = "in vec2 v_uv; void main() {}";\n`,
    "src/m.ts": `
import { Engine } from "excalibur";
import * as Shaders from "./shaders";
import { reflect } from "./shaders";
export function materials(engine: Engine): void {
  engine.graphicsContext.createMaterial({ name: "a", fragmentSource: reflect });
  engine.graphicsContext.createMaterial({ name: "b", fragmentSource: Shaders.reflect });
  engine.graphicsContext.createMaterial({ name: "c", fragmentSource: Shaders.plain });
}
`,
  });
  assert.deepEqual(manual.map((m) => `${m.file}:${m.line}`), ["src/m.ts:6", "src/m.ts:7"]);
});
