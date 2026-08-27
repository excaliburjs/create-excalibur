import { test } from "node:test";
import assert from "node:assert/strict";
import { runDoctor } from "../src/doctor/run.js";
import { withDoctorProject, ts } from "./doctor-helpers.js";

/** Run doctor over the fixture plus `files`, return findings for one rule. */
async function findingsFor(files, rule) {
  return withDoctorProject(
    async ({ dir }) => {
      const result = await runDoctor(dir, { ts });
      return rule ? result.findings.filter((f) => f.rule === rule) : result.findings;
    },
    { files }
  );
}

// --- leaked-subscription --------------------------------------------------

test("leaked-subscription: engine-lifetime emitters flag; scene input, captures, and offs don't", async () => {
  const findings = await findingsFor(
    {
      "src/leaky.ts": `
import { Actor, Scene, Engine, Subscription } from "excalibur";
export class Hero extends Actor {
  sub!: Subscription;
  constructor() { super({ name: "hero" }); }
  onInitialize(engine: Engine): void {
    engine.input.keyboard.on("hold", () => {});            // flags: engine-lifetime, uncaptured
    this.sub = engine.input.pointers.on("down", () => {}); // clean: captured Subscription
    this.on("pointerdown", () => {});                      // clean: self-scoped
  }
}
export class Menu extends Scene {
  onInitialize(engine: Engine): void {
    this.input.pointers.on("down", () => {});              // clean: scene-scoped input host
    engine.screen.events.on("resize", () => {});           // flags
  }
}
export class Tidy extends Scene {
  onInitialize(engine: Engine): void {
    engine.screen.events.on("resize", () => {});           // clean: matching off below
  }
  onDeactivate(): void {
    this.engine.screen.events.off("resize");
  }
}
`,
    },
    "leaked-subscription"
  );
  assert.deepEqual(
    findings.map((f) => [f.line, f.message]),
    [
      [7, 'subscription to "hold" on an engine-lifetime emitter is never removed'],
      [15, 'subscription to "resize" on an engine-lifetime emitter is never removed'],
    ]
  );
});

// --- dead-collision-hooks -------------------------------------------------

const PHYSICS_OFF_ENGINE = `
import { Engine } from "excalibur";
import { MyLevel } from "./level";
export const game2 = new Engine({ physics: false, scenes: { start: MyLevel } });
`;

test("dead-collision-hooks: non-empty hooks and subscriptions flag only when physics is off", async () => {
  const collider = `
import { Actor } from "excalibur";
export class Crasher extends Actor {
  constructor() { super({ name: "c" }); }
  override onCollisionStart(): void { this.kill(); }   // real handler
  override onCollisionEnd(): void {}                   // empty stub — never flags
}
export function wire(c: Crasher) {
  c.events.on("collisionstart", () => {});
}
`;
  const off = await findingsFor(
    { "src/collide.ts": collider, "src/engine2.ts": PHYSICS_OFF_ENGINE },
    "dead-collision-hooks"
  );
  assert.deepEqual(
    off.map((f) => f.message),
    [
      "onCollisionStart can never fire — engine physics is disabled",
      'subscription to "collisionstart" can never fire — engine physics is disabled',
    ]
  );
  // Same code with physics on (the fixture's default engine): silent.
  const on = await findingsFor({ "src/collide.ts": collider }, "dead-collision-hooks");
  assert.deepEqual(on, []);
});

// --- dont-mutate-shared-graphics -------------------------------------------

test("dont-mutate-shared-graphics: cache taint flows through properties, clone() breaks it", async () => {
  const findings = await findingsFor(
    {
      "src/gfx.ts": `
import { Animation } from "excalibur";
declare const sheet: { getAnimation(name: string): Animation };
const anim = sheet.getAnimation("default");
anim.strategy = "loop";                       // flags
const g = anim.frames[0].graphic;
g.sourceView.width *= 5;                      // flags: taint through frames[0].graphic
anim.reset();                                 // flags
const own = anim.clone();
own.strategy = "freeze";                      // clean: clone() broke the taint
`,
    },
    "dont-mutate-shared-graphics"
  );
  assert.deepEqual(
    findings.map((f) => f.line),
    [5, 7, 8]
  );
});

// --- unknown-scene-key ------------------------------------------------------

test("unknown-scene-key: typos flag against the scenes map; addScene silences the rule", async () => {
  const nav = `
import { Engine } from "excalibur";
export function nav(engine: Engine) {
  engine.goToScene("start");   // in the fixture's scenes map
  engine.goToScene("levl");    // typo
}
`;
  const findings = await findingsFor({ "src/keys.ts": nav }, "unknown-scene-key");
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /"levl" is not in the Engine's scenes map/);
  assert.match(findings[0].hint, /known scene keys: start/);

  // Runtime-minted keys → the static key set is unreliable → silent.
  const dynamic = await findingsFor(
    {
      "src/keys.ts": nav,
      "src/mint.ts": `
import { Engine, Scene } from "excalibur";
export function mint(engine: Engine) { engine.addScene("puzzle-9", new Scene()); }
`,
    },
    "unknown-scene-key"
  );
  assert.deepEqual(dynamic, []);
});

// --- dont-call-lifecycle-hooks ----------------------------------------------

test("dont-call-lifecycle-hooks: direct calls flag, super calls don't", async () => {
  const findings = await findingsFor(
    {
      "src/lifecycle.ts": `
import { Scene, Engine } from "excalibur";
export class L extends Scene {
  restart(): void {
    this.clear(false);
    this.onInitialize(this.engine);            // flags
  }
  override onInitialize(engine: Engine): void {
    super.onInitialize(engine);                // clean
  }
}
`,
    },
    "dont-call-lifecycle-hooks"
  );
  assert.deepEqual(
    findings.map((f) => [f.line, f.message]),
    [[6, "onInitialize is a lifecycle hook — the engine calls it, you shouldn't"]]
  );
});

// --- camera-pos-aliasing ----------------------------------------------------

test("camera-pos-aliasing: bare .pos reads flag; clone(), vec(), and screen.center don't", async () => {
  const findings = await findingsFor(
    {
      "src/cam.ts": `
import { Scene, Actor, vec } from "excalibur";
export class C extends Scene {
  hero = new Actor({ name: "h" });
  onInitialize(): void {
    this.add(this.hero);
    this.camera.pos = this.hero.pos;           // flags
    this.camera.pos = this.hero.pos.clone();   // clean
    this.camera.pos = vec(0, 0);               // clean
    this.camera.pos = this.engine.screen.center; // clean: fresh vector per read
  }
}
`,
    },
    null
  );
  // Also guards the actor-not-added fix: a field-initialized actor added via
  // this.add(this.hero) must not flag.
  assert.deepEqual(
    findings.map((f) => [f.rule, f.line]),
    [["camera-pos-aliasing", 7]]
  );
  assert.match(findings[0].hint, /clone\(\)/);
});

// --- no-reserved-tags ---------------------------------------------------------

test("no-reserved-tags: writes to ex.* tags flag; own tags and reads don't", async () => {
  const findings = await findingsFor(
    {
      "src/tags.ts": `
import { Actor, Scene } from "excalibur";
export class T extends Scene {
  onInitialize(): void {
    const a = new Actor({ name: "a" });
    this.add(a);
    a.addTag("ex.offscreen");     // flags
    a.removeTag("ex.offscreen");  // flags
    a.addTag("enemy");            // clean
    a.hasTag("ex.offscreen");     // clean: read
  }
}
`,
    },
    "no-reserved-tags"
  );
  assert.deepEqual(
    findings.map((f) => f.message),
    [
      'addTag("ex.offscreen") writes an engine-reserved tag',
      'removeTag("ex.offscreen") writes an engine-reserved tag',
    ]
  );
});

// --- prefer-seeded-random ------------------------------------------------------

test("prefer-seeded-random: Math.random, unseeded Random, and duplicate seeds across files", async () => {
  const findings = await findingsFor(
    {
      "src/rand.ts": `
import { Random } from "excalibur";
export const cosmetic = new Random();      // unseeded
export const a = new Random(1337);         // duplicated in rand2.ts
export const roll = Math.random();
`,
      "src/rand2.ts": `
import { Random } from "excalibur";
export const b = new Random(1337);         // duplicated in rand.ts
export const c = new Random(42);           // unique — clean
`,
    },
    "prefer-seeded-random"
  );
  assert.deepEqual(
    findings.map((f) => [f.file, f.line, f.message]),
    [
      ["src/rand.ts", 3, "new Random() without a seed is non-deterministic"],
      ["src/rand.ts", 4, "seed 1337 is reused (also at src/rand2.ts:3) — the streams are identical"],
      ["src/rand.ts", 5, "Math.random() is invisible to seeding and replay"],
      ["src/rand2.ts", 3, "seed 1337 is reused (also at src/rand.ts:4) — the streams are identical"],
    ]
  );
});

// --- no-reserved-uniforms -------------------------------------------------
//
// Verified against excalibur 0.32.0 and 0.33.0-alpha.174: nothing is injected
// into user shader source — declaring the built-ins (with the right types) is
// *required* usage and must stay clean; only conflicting type/qualifier/array
// declarations flag.

test("no-reserved-uniforms: conflicting built-in declarations flag; correct redeclarations and own uniforms don't", async () => {
  const findings = await findingsFor(
    {
      "src/shady.ts": `
import { Engine, Material, ScreenShader } from "excalibur";

const glsl = (x: any) => x[0]; // tagged-template highlighting idiom (real usage)
const fragmentSource = glsl\`#version 300 es
precision mediump float;
uniform vec3 u_color;        // flags: engine sets u_color as vec4
uniform float u_wobble;      // clean: the user's own uniform
in vec2 v_uv;                // clean: correct redeclaration (required usage)
out vec4 fragColor;
void main() { fragColor = vec4(u_color, 1.0) * u_wobble * v_uv.x; }
\`;

export function wire(engine: Engine) {
  const oneHop = engine.graphicsContext.createMaterial({ name: "hop", fragmentSource });
  const direct = new Material({
    graphicsContext: engine.graphicsContext,
    fragmentSource: \`#version 300 es
precision mediump float;
uniform vec2 u_time_ms;      // flags: engine sets u_time_ms as float
uniform sampler2D u_graphic; // clean: correct redeclaration
uniform vec2 v_uv;           // flags: built-in varying declared as a uniform
out vec4 fragColor;
void main() { fragColor = texture(u_graphic, v_uv); }
\`,
  });
  const screen = new ScreenShader(engine.graphicsContext, \`#version 300 es
precision mediump float;
in vec3 v_uv;                // flags: ScreenShader's varying is vec2
uniform sampler2D u_image;   // clean: correct redeclaration
out vec4 fragColor;
void main() { fragColor = texture(u_image, v_uv.xy); }
\`);
  return [oneHop, direct, screen];
}
`,
    },
    "no-reserved-uniforms"
  );
  assert.deepEqual(
    findings.map((f) => [f.line, f.message]),
    [
      [7, "u_color is a built-in excalibur Material uniform — declaring it `uniform vec3` conflicts with the engine's `uniform vec4`"],
      [20, "u_time_ms is a built-in excalibur Material uniform — declaring it `uniform vec2` conflicts with the engine's `uniform float`"],
      [22, "v_uv is a built-in excalibur Material varying — declaring it `uniform vec2` conflicts with the engine's `in vec2`"],
      [29, "v_uv is a built-in excalibur ScreenShader varying — declaring it `in vec3` conflicts with the engine's `in vec2`"],
    ]
  );
});

test("no-reserved-uniforms: ${} templates scan static chunks; a custom vertexSource owns the varyings", async () => {
  const findings = await findingsFor(
    {
      "src/subst.ts": `
import { Engine } from "excalibur";

export function make(engine: Engine, speed: number) {
  return engine.graphicsContext.createMaterial({
    name: "subst",
    vertexSource: \`#version 300 es
in vec3 a_position;          // flags: the material vertex layout binds a_position as vec2
in vec2 a_uv;                // clean
out vec2 v_uv;
uniform mat4 u_matrix;       // clean
uniform mat4 u_transform;    // clean
void main() { v_uv = a_uv; gl_Position = u_matrix * u_transform * vec4(a_position.xy, 0.0, 1.0); }
\`,
    fragmentSource: \`#version 300 es
precision mediump float;
uniform sampler2D u_graphic; // clean
in vec3 v_uv;                // clean: custom vertexSource above owns the varyings
uniform vec2 u_opacity;      // flags: engine sets u_opacity as float (static chunk before the substitution)
out vec4 fragColor;
void main() { fragColor = texture(u_graphic, v_uv.xy / \${speed}); }
\`,
  });
}
`,
    },
    "no-reserved-uniforms"
  );
  assert.deepEqual(
    findings.map((f) => [f.line, f.message]),
    [
      [8, "a_position is a built-in excalibur Material attribute — declaring it `in vec3` conflicts with the engine's `in vec2`"],
      [19, "u_opacity is a built-in excalibur Material uniform — declaring it `uniform vec2` conflicts with the engine's `uniform float`"],
    ]
  );
});
