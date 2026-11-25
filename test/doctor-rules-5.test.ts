import { test } from "node:test";
import assert from "node:assert/strict";
import { coroutineArrowWrapperAffects } from "../src/doctor/rules/coroutine-arrow-wrapper.ts";
import { runDoctor } from "../src/doctor/run.ts";
import { withDoctorProject, ts } from "./doctor-helpers.ts";

/** Run doctor over the fixture plus `files`, return findings for one rule. */
async function findingsFor(files: Record<string, string>, rule: string) {
  return withDoctorProject(
    async ({ dir }) => {
      const result = await runDoctor(dir, { ts });
      return result.findings.filter((f) => f.rule === rule);
    },
    { files }
  );
}

// --- coroutine-arrow-wrapper ------------------------------------------------

test("coroutine-arrow-wrapper: arrow and plain-function wrappers in the provably-crashing shapes flag", async () => {
  const findings = await findingsFor(
    {
      "src/co.ts": `
import * as ex from "excalibur";
type G = Generator<number | undefined, void, number>;
function* gen(): G { yield 100; }
const opts: ex.CoroutineOptions = { autostart: false };
export const engine = new ex.Engine();
export const a = ex.coroutine(() => gen());
export const b = ex.coroutine(() => gen(), { timing: "preframe" });
export const c = ex.coroutine(function () { return gen(); });
export const n = ex.coroutine(null, () => gen());
export const o = ex.coroutine({ count: 1 }, () => gen());
export const p = ex.coroutine(() => gen(), opts);
export const inv = ex.coroutine(() => gen(), engine); // inverted: args[1] is an Engine, so the dispatch reads a MISSING args[2]
export class Level extends ex.Scene {
  begin(): void { ex.coroutine(this, () => gen()); }
  tail(): void { ex.coroutine(this, () => gen(), function* () { yield 1; }); } // a function* past position 1 is never probed
}
`,
    },
    "coroutine-arrow-wrapper"
  );
  const arrow =
    "ex.coroutine's generator argument is an arrow function, not a function* — this call crashes at runtime on the installed excalibur";
  const plain =
    "ex.coroutine's generator argument is a plain function, not a function* — this call crashes at runtime on the installed excalibur";
  assert.deepEqual(
    findings.map((f) => [f.line, f.message]),
    [
      [7, arrow],
      [8, arrow],
      [9, plain],
      [10, arrow],
      [11, arrow],
      [12, arrow],
      [13, arrow],
      [15, arrow],
      [16, arrow],
    ]
  );
  const [first] = findings;
  assert.match(first!.hint ?? "", /ex\.coroutine\(function\* \(\) \{ \.\.\. \}\)/);
  assert.match(first!.hint ?? "", /1\.1\.0-alpha\.323/);
});

test("coroutine-arrow-wrapper: function* arguments, Engine shapes, references, and unprovable values stay quiet", async () => {
  const findings = await findingsFor(
    {
      "src/co-ok.ts": `
import * as ex from "excalibur";
type G = Generator<number | undefined, void, number>;
function* gen(): G { yield 100; }
function* sceneGen(this: ex.Scene): G { yield 1; }
export const engine = new ex.Engine();
export const a = ex.coroutine(function* () { yield 100; });
export const b = ex.coroutine(gen);
export const c = ex.coroutine(() => gen(), function* () { yield 1; });
export const e = ex.coroutine(engine, () => gen()); // the Engine branch assigns the slot unvalidated: works by accident pre-fix
export const f = ex.coroutine(engine, engine, () => gen());
export class Level extends ex.Scene {
  begin(engine: ex.Engine): void {
    ex.coroutine(this, engine, () => gen());
    ex.coroutine(this, function* () { yield 1; });
    ex.coroutine(this, sceneGen);
  }
}
export class MyGame extends ex.Engine {
  boot(): void { ex.coroutine(this, () => gen()); } // this IS an Engine: the unvalidated slot works by accident
}
export function spawnCo(deps: any): unknown {
  return ex.coroutine(deps, () => gen()); // any-typed thisArg — unprovable
}
`,
      "src/co-spread.ts": `
import * as ex from "excalibur";
function* gen(): Generator<number | undefined, void, number> { yield 1; }
export const s = ex.coroutine(...[gen]); // a spread can expand into any shape — unprovable
`,
    },
    "coroutine-arrow-wrapper"
  );
  assert.deepEqual(findings, []);
});

test("coroutine-arrow-wrapper: only fires while the installed excalibur predates the wrapper fix", async () => {
  const files = (version: string) => ({
    "node_modules/excalibur/package.json": JSON.stringify({ name: "excalibur", version, types: "index.d.ts" }),
    "src/co.ts": `import * as ex from "excalibur";\nfunction* myGen(): Generator<number | undefined, void, number> { yield 1; }\nexport const a = ex.coroutine(() => myGen());\n`,
  });
  for (const [version, count] of [
    ["0.28.3", 0], // no coroutine export at all
    ["0.29.0", 0], // old (engine, gen) executor shape — a wrapper rejects the promise, not the .bind throw
    ["0.29.1", 0], // same
    ["0.29.2", 1], // first stable with the modern dispatch
    ["0.30.0", 1],
    ["0.32.0", 1],
    ["0.33.0-alpha.224", 1],
    ["1.0.0", 1],
    ["1.0.1", 1], // npm latest — still crashes
    ["1.0.2", 0], // above the stable ceiling: a patch release is assumed to carry the fix
    ["1.1.0-alpha.323", 1], // npm next — still crashes
    ["1.1.0-alpha.324", 0], // above the alpha ceiling
    ["1.1.0", 0],
  ] as const) {
    const findings = await findingsFor(files(version), "coroutine-arrow-wrapper");
    assert.equal(findings.length, count, version);
  }
  for (const [version, expected] of [
    ["0.28.3", false],
    ["0.29.0", false], // carries the export, but only the (engine, gen) executor signature — different failure mode
    ["0.29.1", false], // same
    ["0.29.2", true], // the modern dispatch lands here (core faa4a37f)
    ["0.29.0-alpha.921", false], // below the stable floor
    ["0.30.0", true],
    ["0.32.0", true],
    ["0.33.0-alpha.224", true],
    ["1.0.0", true],
    ["1.0.1", true],
    ["1.0.2", false],
    ["1.1.0-alpha.0", true],
    ["1.1.0-alpha.323", true],
    ["1.1.0-alpha.324", false],
    ["1.1.0", false],
    ["2.0.0", false],
    [null, false],
    [undefined, false],
    ["not-a-version", false],
  ] as const) {
    assert.equal(coroutineArrowWrapperAffects(version), expected, String(version));
  }
});
