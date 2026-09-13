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

// --- unmatched-options ----------------------------------------------------

test("unmatched-options: an options key no moveBy overload declares flags with a nearest-key hint", async () => {
  const findings = await findingsFor(
    {
      "src/dash.ts": `
import { Actor, vec } from "excalibur";
export class Hero extends Actor {
  constructor() { super({ name: "hero" }); }
  dash(): void {
    this.actions.moveBy({ offset: vec(1, 0), durationMs: 1000 }); // flags: the option is 'duration'
  }
}
`,
    },
    "unmatched-options"
  );
  assert.equal(findings.length, 1);
  const [finding] = findings;
  assert.equal(finding!.line, 6);
  assert.equal(finding!.message, "moveBy({ offset, durationMs }) has no option named 'durationMs' in any overload");
  assert.match(finding!.hint ?? "", /never queued/);
  assert.match(finding!.hint ?? "", /Did you mean 'duration'\?/);
});

test("unmatched-options: valid bags, positional overloads, spreads, any-typed and user-declared options stay quiet", async () => {
  const findings = await findingsFor(
    {
      "src/quiet.ts": `
import { Actor, ActorArgs, Engine, vec } from "excalibur";
interface EnemyArgs { speed: number }
export class Enemy extends Actor {
  constructor(a: EnemyArgs) { super({ name: "enemy", pos: vec(0, 0) }); }
  patrol(): void {
    this.actions.moveBy({ offset: vec(1, 0), duration: 1000 }); // the valid options form
    this.actions.moveBy(vec(1, 0), 10);                         // the positional form
  }
}
export class Boss extends Actor {
  constructor(a: Partial<ActorArgs>) { super({ ...a }); }      // spread — shape unknowable, skipped
}
export const engine = new Engine({ width: 800, nonsense: true }); // options?: any — skipped
export const spawn = () => [new Actor({ name: "a", pos: vec(1, 1) }), new Enemy({ speed: 1 })]; // user-declared args never flag
`,
    },
    "unmatched-options"
  );
  assert.deepEqual(findings, []);
});

test("unmatched-options: a constructor bag with an unknown key flags with the constructor wording", async () => {
  const findings = await findingsFor(
    {
      "src/ctor.ts": `
import { Actor, vec } from "excalibur";
export const a = new Actor({ name: "a", position: vec(1, 1) });
`,
    },
    "unmatched-options"
  );
  assert.deepEqual(
    findings.map((f) => [f.line, f.message]),
    [[3, "new Actor({ name, position }) has no option named 'position' in any overload"]]
  );
  assert.match(findings[0]!.hint ?? "", /Did you mean 'pos'\?/);
});

// --- multiline-text-no-lineheight -----------------------------------------

test("multiline-text-no-lineheight: newline text with an inline Font, and maxWidth with a same-file Font const, flag", async () => {
  const findings = await findingsFor(
    {
      "src/text.ts": `
import { Text, Font, Label } from "excalibur";
export const a = new Text({ text: "line one\\nline two", font: new Font({ size: 16 }) }); // flags: \\n + no lineHeight
const body = new Font({ size: 12, family: "sans-serif" });
export const b = new Text({ text: "wrapped by width", maxWidth: 200, font: body });          // flags: maxWidth + const Font
export const c = new Label({ name: "c", text: \`a
b\`, font: new Font() });                                                                    // flags: template newline, bare Font
`,
    },
    "multiline-text-no-lineheight"
  );
  assert.deepEqual(
    findings.map((f) => [f.line, f.message]),
    [
      [3, "multi-line Text without an explicit Font.lineHeight"],
      [5, "multi-line Text without an explicit Font.lineHeight"],
      [6, "multi-line Label without an explicit Font.lineHeight"],
    ]
  );
  assert.match(findings[0]!.hint ?? "", /lineHeight explicitly/);
});

test("multiline-text-no-lineheight: explicit lineHeight, single-line text, and unprovable fonts stay quiet", async () => {
  const findings = await findingsFor(
    {
      "src/text-ok.ts": `
import { Text, Font } from "excalibur";
import { theme } from "./theme";
export const a = new Text({ text: "one\\ntwo", font: new Font({ size: 16, lineHeight: 20 }) }); // lineHeight set inline
const body = new Font({ size: 12, lineHeight: 14 });
export const b = new Text({ text: "wrapped", maxWidth: 200, font: body });                     // lineHeight set on the const
export const c = new Text({ text: "single line", font: new Font({ size: 16 }) });              // single line, no maxWidth
export const d = new Text({ text: "one\\ntwo" });                                                // no font key
export const e = new Text({ text: "one\\ntwo", font: theme.font });                              // can't see the font
`,
      "src/theme.ts": `
import { Font } from "excalibur";
export const theme = { font: new Font({ size: 10 }) };
`,
    },
    "multiline-text-no-lineheight"
  );
  assert.deepEqual(findings, []);
});

// --- manifest tip: build without type-checking -----------------------------

const TIP = /add "typecheck": "tsc --noEmit"/;

function packageJson(scripts: Record<string, string>): string {
  return JSON.stringify({
    name: "fixture-vite-game",
    version: "1.0.0",
    private: true,
    scripts,
    dependencies: { excalibur: "0.32.0" },
    devDependencies: { typescript: "5.9.3", vite: "6.4.3" },
  });
}

test("manifest tip: a build script that never type-checks gets the typecheck tip", async () => {
  await withDoctorProject(
    async ({ dir }) => {
      const result = await runDoctor(dir, { ts });
      assert.ok(result.warnings.some((w) => TIP.test(w)), "expected the typecheck tip");
    },
    { files: { "package.json": packageJson({ build: "vite build" }) } }
  );
});

test("manifest tip: tsc in the build, a typecheck script, or no build script at all — no tip", async () => {
  const cases: Record<string, string>[] = [
    { build: "tsc && vite build" }, // the vite template's own build
    { build: "vite build", typecheck: "tsc --noEmit" },
    { dev: "vite" },
  ];
  for (const scripts of cases) {
    await withDoctorProject(
      async ({ dir }) => {
        const result = await runDoctor(dir, { ts });
        assert.ok(!result.warnings.some((w) => TIP.test(w)), `no tip expected for ${JSON.stringify(scripts)}`);
      },
      { files: { "package.json": packageJson(scripts) } }
    );
  }
});

// --- scope -----------------------------------------------------------------

test("scope: example dirs are scanned by default; --scope src leaves them out", async () => {
  const files = {
    "example/demo.ts": `
import { Actor } from "excalibur";
export const demo = new Actor({}); // unnamed-actor
`,
  };
  await withDoctorProject(
    async ({ dir }) => {
      const byDefault = await runDoctor(dir, { ts });
      assert.deepEqual(
        byDefault.findings.filter((f) => f.rule === "unnamed-actor").map((f) => f.file),
        ["example/demo.ts"]
      );
      const srcOnly = await runDoctor(dir, { ts, scope: ["src"] });
      assert.deepEqual(srcOnly.findings, []);
      assert.ok(srcOnly.filesScanned < byDefault.filesScanned, "scope narrows the program roots");
    },
    { files }
  );
});
