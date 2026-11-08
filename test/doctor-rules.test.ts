import { test } from "node:test";
import assert from "node:assert/strict";
import { runDoctor } from "../src/doctor/run.ts";
import { withDoctorProject, ts } from "./doctor-helpers.ts";

/** Run doctor over the fixture plus `files`, return findings for one rule. */
async function findingsFor(files: Record<string, string>, rule: string | null) {
  return withDoctorProject(
    async ({ dir }) => {
      const result = await runDoctor(dir, { ts });
      return rule ? result.findings.filter((f) => f.rule === rule) : result.findings;
    },
    { files }
  );
}

test("the clean fixture has zero findings (Player is named and added)", async () => {
  assert.deepEqual(await findingsFor({}, null), []);
});

// --- actor-not-added -----------------------------------------------------

test("actor-not-added: orphan constructions flag, added ones don't", async () => {
  const findings = await findingsFor(
    {
      "src/lair.ts": `
import { Actor, Scene, vec } from "excalibur";
export class Monster extends Actor {
  constructor() { super({ name: "monster", pos: vec(0, 0) }); }
}
export class Lair extends Scene {
  onInitialize(): void {
    this.add(new Monster());            // direct arg — clean
    const kept = new Monster();
    this.add(kept);                     // local var traced — clean
    new Monster();                      // orphan — flags
  }
}
`,
    },
    "actor-not-added"
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].file, "src/lair.ts");
  assert.equal(findings[0].line, 11);
  assert.match(findings[0].message, /new Monster\(\.\.\.\) is created but never added/);
  assert.ok(findings[0].hint!.includes("scene.add"));
});

test("actor-not-added: transitive subclasses classify through the checker", async () => {
  const findings = await findingsFor(
    {
      "src/boss.ts": `
import { Actor } from "excalibur";
class Monster extends Actor { constructor() { super({ name: "m" }); } }
class Boss extends Monster {}
new Boss();
`,
    },
    "actor-not-added"
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /new Boss/);
});

test("actor-not-added: this.prop assigned in ctor and added in onInitialize is clean", async () => {
  const findings = await findingsFor(
    {
      "src/hq.ts": `
import { Actor, Scene } from "excalibur";
class Guard extends Actor { constructor() { super({ name: "g" }); } }
export class Hq extends Scene {
  guard: Guard;
  constructor() { super(); this.guard = new Guard(); }
  onInitialize(): void { this.add(this.guard); }
}
`,
    },
    "actor-not-added"
  );
  assert.deepEqual(findings, []);
});

test("actor-not-added: ownership transfers (return, add*/spawn*/push calls) are handled; plain helpers and array literals still flag", async () => {
  const findings = await findingsFor(
    {
      "src/escapes.ts": `
import { Actor } from "excalibur";
class Npc extends Actor { constructor() { super({ name: "npc" }); } }
class Grid { addUnit(a: Actor, x: number) {} }
function spawn(a: Actor) {}
function decorate(a: Actor) {}
spawn(new Npc());                              // spawn* call — handled
new Grid().addUnit(new Npc(), 1);              // add* method — handled
function make(): Npc { return new Npc(); }     // returned — handled
const factory = () => new Npc();               // arrow body returned — handled
const held = new Npc(); const list: Npc[] = []; list.push(held); // pushed — handled
decorate(new Npc());                           // plain helper — flags
const pool = [new Npc()];                      // array literal — flags
`,
    },
    "actor-not-added"
  );
  assert.deepEqual(findings.map((f) => f.line), [12, 13]);
});

test("actor-not-added: engine.add and addChild count as added", async () => {
  const findings = await findingsFor(
    {
      "src/adds.ts": `
import { Actor, Engine } from "excalibur";
class Pet extends Actor { constructor() { super({ name: "pet" }); } }
const engine = new Engine({});
engine.add(new Pet());
const parent = new Pet();
engine.add(parent);
parent.addChild(new Pet());
`,
    },
    "actor-not-added"
  );
  assert.deepEqual(findings, []);
});

test("actor-not-added: any-typed values and non-actor excalibur classes never flag", async () => {
  const findings = await findingsFor(
    {
      "src/other.ts": `
import { FadeInOut } from "excalibur";
const mystery: any = null;
new mystery();
new FadeInOut({ duration: 500 });       // Entity-derived, not Actor-derived
`,
    },
    "actor-not-added"
  );
  assert.deepEqual(findings, []);
});

test("actor-not-added: generic Actor subclass instantiations classify via the reference target", async () => {
  const findings = await findingsFor(
    {
      "src/pool.ts": `
import { Actor } from "excalibur";
class Spawner<T> extends Actor { constructor() { super({ name: "s" }); } }
new Spawner<number>();
`,
    },
    "actor-not-added"
  );
  assert.equal(findings.length, 1);
});

// --- unnamed-actor -------------------------------------------------------

test("unnamed-actor: super() without a name flags, escape hatches don't", async () => {
  const findings = await findingsFor(
    {
      "src/names.ts": `
import { Actor, ActorArgs, vec } from "excalibur";
class NoOpts extends Actor { constructor() { super(); } }                       // flags
class NoName extends Actor { constructor() { super({ pos: vec(1, 1) }); } }     // flags
class LateName extends Actor { constructor() { super(); this.name = "late"; } } // clean
class Forwards extends Actor { constructor(args: ActorArgs) { super(args); } }  // clean — can't prove
class Spreads extends Actor { constructor(a: ActorArgs) { super({ ...a }); } }  // clean — can't prove
class NoCtor extends Actor {}                                                   // clean — documented gap
`,
    },
    "unnamed-actor"
  );
  assert.deepEqual(
    findings.map((f) => [f.line, f.message]),
    [
      [3, "NoOpts extends an Actor but never sets a name"],
      [4, "NoName extends an Actor but never sets a name"],
    ]
  );
});

test("unnamed-actor: direct base instantiations without a name flag once", async () => {
  const findings = await findingsFor(
    {
      "src/direct.ts": `
import { Actor, Label, Scene } from "excalibur";
export class Hall extends Scene {
  onInitialize(): void {
    this.add(new Label());                        // unnamed AND added — only this rule fires
    this.add(new Actor({ name: "ok" }));          // clean
    this.add(new Actor({ x: 1 }));                // flags
  }
}
`,
    },
    null
  );
  assert.deepEqual(
    findings.map((f) => [f.rule, f.line]),
    [
      ["unnamed-actor", 5],
      ["unnamed-actor", 7],
    ]
  );
});

test("unnamed-actor: unnamed user subclass reports at the declaration, not per instantiation", async () => {
  const findings = await findingsFor(
    {
      "src/once.ts": `
import { Actor, Scene } from "excalibur";
class Ghost extends Actor { constructor() { super({}); } }
export class Crypt extends Scene {
  onInitialize(): void {
    this.add(new Ghost());
    this.add(new Ghost());
  }
}
`,
    },
    "unnamed-actor"
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 3);
});

// --- result shape --------------------------------------------------------

test("findings sort by file, then position", async () => {
  const files = {
    "src/a.ts": `import { Actor } from "excalibur";\nnew Actor({ name: "a" });\n`,
    "src/z.ts": `import { Actor } from "excalibur";\nnew Actor({ name: "z" });\n`,
  };
  const findings = await findingsFor(files, null);
  assert.equal(findings.length, 2);
  assert.deepEqual(
    findings.map((f) => f.file),
    ["src/a.ts", "src/z.ts"]
  );
  for (const f of findings) {
    assert.equal(typeof f.line, "number");
    assert.equal(typeof f.column, "number");
  }
});

// --- dont-shadow-excalibur-internals -------------------------------------

test("dont-shadow: fields shadowing excalibur members flag through user base chains", async () => {
  const findings = await findingsFor(
    {
      // Modeled on the real footgun: UITabButton -> UIPanel -> ScreenElement,
      // with `public isActive` shadowing Entity's liveness flag.
      "src/tabs.ts": `
import { ScreenElement } from "excalibur";
export interface TabConfig { isActive?: boolean }         // plain interface — never flags
class UIPanel extends ScreenElement {
  constructor() { super({ name: "panel" }); }
}
export class TabButton extends UIPanel {
  public isActive: boolean = false;                       // flags: Entity.isActive
  private isInitialized: boolean;                         // flags: TS-private still emits
  declare isAdded: boolean;                               // clean: declare is emit-free
  static scene = "menu";                                  // clean: static, base members are instance
  selected = false;                                       // clean: no such excalibur member
  onAdd(): void {}                                        // clean: method overrides are the API
}
`,
    },
    "dont-shadow-excalibur-internals"
  );
  assert.deepEqual(
    findings.map((f) => [f.line, f.message]),
    [
      [8, "TabButton.isActive shadows excalibur's Entity.isActive"],
      [9, "TabButton.isInitialized shadows excalibur's Entity.isInitialized"],
    ]
  );
});

test("dont-shadow: accessors and parameter properties flag, get/set pairs once", async () => {
  const findings = await findingsFor(
    {
      "src/shadow2.ts": `
import { Actor } from "excalibur";
class A extends Actor {
  constructor(public isAdded: boolean) { super({ name: "a" }); }  // flags: a field over the base accessor
}
class B extends Actor {
  constructor() { super({ name: "b" }); }
  get scene() { return super.scene; }                             // clean: accessor over accessor can call super
  get isActive() { return true; }                                 // flags once for the pair: base is an
  set isActive(v) {}                                              // instance field — super can't reach it
}
class Plain { isActive = true; }                                  // clean: not excalibur-derived
`,
      // GameEvent isn't engine-managed — narrowing target via a parameter
      // property is the idiomatic typed-event pattern and must not flag.
      "src/events.ts": `
import { GameEvent } from "excalibur";
class Widget {}
export class WidgetClick extends GameEvent<Widget> {
  constructor(public target: Widget) { super(); }
}
`,
    },
    "dont-shadow-excalibur-internals"
  );
  assert.deepEqual(
    findings.map((f) => f.message),
    ["A.isAdded shadows excalibur's Entity.isAdded", "B.isActive shadows excalibur's Entity.isActive"]
  );
});

test("dont-shadow: findings come with a noImplicitOverride tip unless tsconfig has it", async () => {
  const files = {
    "src/shadow4.ts": `
import { Actor } from "excalibur";
class D extends Actor {
  constructor() { super({ name: "d" }); }
  isActive = true;
}
`,
  };
  const tip = /noImplicitOverride/;
  await withDoctorProject(
    async ({ dir }) => {
      const result = await runDoctor(dir, { ts });
      assert.equal(result.findings.length, 1);
      assert.ok(result.warnings.some((w) => tip.test(w)), "expected the tsconfig tip");
    },
    { files }
  );
  await withDoctorProject(
    async ({ dir }) => {
      const result = await runDoctor(dir, { ts });
      assert.equal(result.findings.length, 1, "the rule still fires; only the tip goes away");
      assert.ok(!result.warnings.some((w) => tip.test(w)), "no tip when the option is on");
    },
    {
      files: {
        ...files,
        "tsconfig.json": JSON.stringify({
          compilerOptions: {
            target: "es2022",
            module: "esnext",
            moduleResolution: "bundler",
            noImplicitOverride: true,
          },
        }),
      },
    }
  );
});

test("dont-shadow: a field shadowing an excalibur method flags too", async () => {
  const findings = await findingsFor(
    {
      "src/shadow3.ts": `
import { Actor } from "excalibur";
class C extends Actor {
  constructor() { super({ name: "c" }); }
  kill = () => {};                                                // field, not a method override
}
`,
    },
    "dont-shadow-excalibur-internals"
  );
  assert.deepEqual(
    findings.map((f) => f.message),
    ["C.kill shadows excalibur's Entity.kill"]
  );
});

test("dont-shadow: an arrow-fn lifecycle-hook field (on[A-Z]...) is a functional method override, not a shadow", async () => {
  const findings = await findingsFor(
    {
      "src/shadow5.ts": `
import { Actor } from "excalibur";
export class Bird extends Actor {
  constructor() { super({ name: "bird" }); }
  onPostUpdate = (engine, elapsedMs) => {};                       // clean: arrow-fn lifecycle hook override
  onNotARealHook = () => {};                                      // clean: no such excalibur member
  kill = () => {};                                                // still flags: not an on[A-Z] hook name
}
`,
    },
    "dont-shadow-excalibur-internals"
  );
  assert.deepEqual(
    findings.map((f) => f.message),
    ["Bird.kill shadows excalibur's Entity.kill"]
  );
});

// --- calibration follow-ups (2026-11-07, 22 org repos) ---------------------

test("doctor scans .tsx files (React games keep their excalibur code there)", async () => {
  const findings = await findingsFor(
    {
      "src/app.tsx": `
import { Actor } from "excalibur";
export function App(): null { const a = new Actor({ pos: undefined }); console.log(a); return null; }
`,
    },
    "unnamed-actor"
  );
  assert.deepEqual(findings.map((f) => f.file), ["src/app.tsx"]);
});

test("dont-shadow-excalibur-internals: a bare field only shadows under define semantics (target >= ES2022 or useDefineForClassFields)", async () => {
  const source = `
import { Actor } from "excalibur";
export class Hero extends Actor {
  isActive!: boolean;        // bare: emits nothing below ES2022
  isAdded = false;           // initializer: always a shadow
}
`;
  const es2020 = await findingsFor(
    { "src/hero.ts": source, "tsconfig.json": JSON.stringify({ compilerOptions: { target: "ES2020", module: "esnext", moduleResolution: "bundler", strict: true } }) },
    "dont-shadow-excalibur-internals"
  );
  assert.deepEqual(es2020.map((f) => f.line), [5]);
  const es2022 = await findingsFor(
    { "src/hero.ts": source, "tsconfig.json": JSON.stringify({ compilerOptions: { target: "ES2022", module: "esnext", moduleResolution: "bundler", strict: true } }) },
    "dont-shadow-excalibur-internals"
  );
  assert.deepEqual(es2022.map((f) => f.line), [4, 5]);
});

test("leaked-subscription: once() removes itself and never flags", async () => {
  const findings = await findingsFor(
    {
      "src/once.ts": `
import { Actor, Engine } from "excalibur";
export class Hero extends Actor {
  onInitialize(engine: Engine): void {
    engine.input.keyboard.once("press", () => {});
    engine.input.keyboard.on("hold", () => {});
  }
}
`,
    },
    "leaked-subscription"
  );
  assert.deepEqual(findings.map((f) => f.line), [6]);
});
