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
  assert.ok(findings[0].hint.includes("scene.add"));
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

test("actor-not-added: strict posture — helper calls, returns, and arrays flag", async () => {
  const findings = await findingsFor(
    {
      "src/escapes.ts": `
import { Actor } from "excalibur";
class Npc extends Actor { constructor() { super({ name: "npc" }); } }
function spawn(a: Actor) {}
spawn(new Npc());                       // helper escape — flags
function make(): Npc { return new Npc(); }  // returned — flags
const pool = [new Npc()];               // array element — flags
`,
    },
    "actor-not-added"
  );
  assert.equal(findings.length, 3);
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
