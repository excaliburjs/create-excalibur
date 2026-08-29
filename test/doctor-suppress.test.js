import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { collectIgnores, isIgnored, insertIgnoreComments } from "../src/doctor/suppress.js";
import { runDoctor } from "../src/doctor/run.js";
import { withDoctorProject, ts } from "./doctor-helpers.js";

// --- directive parsing (pure) --------------------------------------------

test("collectIgnores reads next-line, same-line, rule lists, and block comments", () => {
  const ignores = collectIgnores(
    [
      "// ex-doctor-ignore-next-line actor-not-added",
      "new A();",
      "new B(); // ex-doctor-ignore-line unnamed-actor",
      "/* ex-doctor-ignore-next-line */",
      "new C();",
      "// ex-doctor-ignore-next-line actor-not-added, unnamed-actor",
      "new D();",
      "new E(); // just a comment",
    ].join("\n")
  );
  assert.equal(isIgnored(ignores, 2, "actor-not-added"), true);
  assert.equal(isIgnored(ignores, 2, "unnamed-actor"), false, "unlisted rule stays live");
  assert.equal(isIgnored(ignores, 3, "unnamed-actor"), true, "same-line directive");
  assert.equal(isIgnored(ignores, 5, "anything"), true, "bare directive ignores all rules");
  assert.equal(isIgnored(ignores, 7, "unnamed-actor"), true, "comma-separated list");
  assert.equal(isIgnored(ignores, 8, "actor-not-added"), false, "ordinary comments don't suppress");
});

// --- end-to-end through runDoctor ----------------------------------------

const STRAY = `
import { Actor } from "excalibur";
class Stray extends Actor { constructor() { super({}); } }
new Stray();
`;

test("ignore comments suppress findings and are counted in result.ignored", async () => {
  const suppressed = STRAY.replace(
    "new Stray();",
    "// ex-doctor-ignore-next-line actor-not-added\nnew Stray();"
  ).replace("class Stray", "// ex-doctor-ignore-next-line unnamed-actor\nclass Stray");
  await withDoctorProject(
    async ({ dir }) => {
      const result = await runDoctor(dir, { ts });
      assert.deepEqual(result.findings, []);
      assert.equal(result.ignored, 2);
    },
    { files: { "src/stray.ts": suppressed } }
  );
});

test("a directive for the wrong rule leaves the finding live", async () => {
  const wrong = STRAY.replace("new Stray();", "new Stray(); // ex-doctor-ignore-line unnamed-actor");
  await withDoctorProject(
    async ({ dir }) => {
      const result = await runDoctor(dir, { ts });
      assert.deepEqual(
        result.findings.map((f) => f.rule),
        ["unnamed-actor", "actor-not-added"]
      );
      assert.equal(result.ignored, 0);
    },
    { files: { "src/stray.ts": wrong } }
  );
});

// --- interactive insert helper -------------------------------------------

test("insertIgnoreComments inserts indented directives, merging same-line rules", async () => {
  await withDoctorProject(
    async ({ dir }) => {
      const before = await runDoctor(dir, { ts });
      assert.equal(before.findings.length, 3);
      const { modified, skipped } = insertIgnoreComments(dir, before.findings);
      assert.deepEqual(modified, ["src/stray.ts"]);
      assert.deepEqual(skipped, []);

      const text = fs.readFileSync(path.join(dir, "src", "stray.ts"), "utf8");
      assert.match(text, /\n\/\/ ex-doctor-ignore-next-line unnamed-actor\nclass Stray/);
      // Label finding + Stray finding on the same line merge into one sorted directive
      assert.match(
        text,
        /\n {4}\/\/ ex-doctor-ignore-next-line actor-not-added, unnamed-actor\n {4}new Label\(\)/
      );

      const after = await runDoctor(dir, { ts });
      assert.deepEqual(after.findings, []);
      assert.equal(after.ignored, 3);
    },
    {
      files: {
        "src/stray.ts": `
import { Actor, Label } from "excalibur";
class Stray extends Actor { constructor() { super({}); } }
function f() {
    new Label();
}
`,
      },
    }
  );
});

test("insertIgnoreComments refuses to splice into a template literal (e.g. shader source)", () => {
  const before = `const glsl = String.raw;
export const frag = glsl\`
#version 300 es
precision mediump float;
uniform int u_time_ms;
out vec4 color;
void main() { color = vec4(1.0); }
\`;
`;
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "ex-doctor-suppress-"));
  try {
    fs.mkdirSync(path.join(dir, "src"));
    fs.writeFileSync(path.join(dir, "src", "material.ts"), before);
    const { modified, skipped } = insertIgnoreComments(dir, [
      { file: "src/material.ts", line: 5, rule: "no-reserved-uniforms" },
    ]);
    assert.deepEqual(modified, []);
    assert.deepEqual(skipped, [{ file: "src/material.ts", line: 5, rule: "no-reserved-uniforms" }]);
    assert.equal(fs.readFileSync(path.join(dir, "src", "material.ts"), "utf8"), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
