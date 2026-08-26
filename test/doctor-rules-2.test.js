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
