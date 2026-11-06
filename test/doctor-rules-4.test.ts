import { test } from "node:test";
import assert from "node:assert/strict";
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

// --- no-reserved-uniforms: the v1 surface ----------------------------------

test("no-reserved-uniforms: ShaderPass fragments and Material passes: strings are checked against the pass conventions", async () => {
  const findings = await findingsFor(
    {
      "src/passes.ts": `
import { Material, ShaderPass, ShaderPipelinePostProcessor } from "excalibur";
export const blur = new ShaderPass({
  fragmentSource: \`#version 300 es
precision mediump float;
uniform sampler2D u_image;
uniform float u_texelSize; // wrong: vec2
in vec2 v_texcoord;        // wrong: the quad vertex shader only outputs v_uv (not a built-in → quiet)
out vec4 fragColor;
void main() { fragColor = texture(u_image, v_texcoord); }\`,
});
export const material = new Material({
  passes: [\`#version 300 es
precision mediump float;
uniform vec2 u_resolution;
uniform int u_time_ms; // wrong: float
out vec4 c; void main() { c = vec4(1.0); }\`],
  fragmentSource: \`#version 300 es
precision mediump float;
uniform vec4 u_image; // wrong: sampler2D (v1 built-in on the composite too)
out vec4 c; void main() { c = u_image; }\`,
});
export const post = new ShaderPipelinePostProcessor({ passes: [\`#version 300 es
precision mediump float;
uniform vec3 u_original; // wrong: sampler2D
out vec4 c; void main() { c = vec4(u_original, 1.0); }\`] });
`,
    },
    "no-reserved-uniforms"
  );
  assert.deepEqual(
    findings.map((f) => [f.line, f.message.split(" — ")[0]]),
    [
      [7, "u_texelSize is a built-in excalibur ShaderPass uniform"],
      [16, "u_time_ms is a built-in excalibur Material pass uniform"],
      [20, "u_image is a built-in excalibur Material uniform"],
      [25, "u_original is a built-in excalibur ShaderPipelinePostProcessor pass uniform"],
    ]
  );
});

test("no-reserved-uniforms: images/uniforms keys named u_image or u_original flag (u_image overrides the graphic in v1)", async () => {
  const findings = await findingsFor(
    {
      "src/keys.ts": `
import { ImageSource, Material } from "excalibur";
const noise = new ImageSource("./noise.png");
export const material = new Material({
  fragmentSource: "#version 300 es\\nprecision mediump float;\\nout vec4 c; void main() { c = vec4(1.0); }",
  images: { u_image: noise, u_noise: noise },
  uniforms: { u_original: 1, u_strength: 2 },
});
`,
    },
    "no-reserved-uniforms"
  );
  assert.deepEqual(
    findings.map((f) => [f.line, f.message.split(" — ")[0]]),
    [
      [6, "u_image is a built-in excalibur Material sampler"],
      [7, "u_original is a built-in excalibur Material sampler"],
    ]
  );
  assert.match(findings[0]!.hint ?? "", /overrides the material's graphic/);
});

// --- glsl-tag-misuse --------------------------------------------------------

test("glsl-tag-misuse: #version after a comment, pixel_texture redefinition, qualified u_graphic_resolution, non-2D texture(), manual premultiply", async () => {
  const findings = await findingsFor(
    {
      "src/tagged.ts": `
import { glsl } from "excalibur";
import * as ex from "excalibur";
export const late = glsl\`
  // my shader
  #version 300 es
  out vec4 c; void main() { c = vec4(1.0); }\`;
export const pixel = ex.glsl\`
  uniform highp vec2 u_graphic_resolution;
  vec4 pixel_texture(sampler2D tex, vec2 uv) { return texture(tex, uv); }
  in vec2 v_uv; uniform sampler2D u_graphic; out vec4 c;
  void main() { c = pixel_texture(u_graphic, v_uv); }\`;
export const cube = glsl\`
  uniform samplerCube u_env; in vec3 v_dir; out vec4 c;
  void main() { c = texture(u_env, v_dir); c.rgb *= c.a; }\`;
export const fine = glsl\`#version 300 es
  uniform samplerCube u_env; in vec3 v_dir; out vec4 c;
  #pragma excalibur premultiply(off)
  void main() { c = texture(u_env, v_dir); c.rgb *= c.a; }\`;
const notTheTag = (s: TemplateStringsArray) => s.join("");
export const other = notTheTag\`// c\\n#version 300 es\`;
`,
    },
    "glsl-tag-misuse"
  );
  assert.deepEqual(
    findings.map((f) => [f.line, f.message.split(" ").slice(0, 2).join(" ")]),
    [
      [6, "#version is"],
      [9, "u_graphic_resolution is"],
      [10, "pixel_texture is"],
      [15, "texture(u_env, …)"],
      [15, "manual premultiplication"],
    ]
  );
});

// --- shader-missing-version ------------------------------------------------

test("shader-missing-version: untagged Material/ShaderPass/ScreenShader/passes sources must start with #version; tagged and versioned ones are quiet", async () => {
  const findings = await findingsFor(
    {
      "src/sources.ts": `
import { glsl, Material, ScreenShader, ShaderPass, ShaderPipeline, ExcaliburGraphicsContext } from "excalibur";
const viaConst = \`
precision mediump float;
out vec4 c; void main() { c = vec4(1.0); }\`;
export const m = new Material({ fragmentSource: viaConst });
export const p = new ShaderPass({ fragmentSource: "precision mediump float; out vec4 c; void main() { c = vec4(1.0); }" });
export const pipe = new ShaderPipeline({ passes: ["out vec4 c; void main() { c = vec4(1.0); }", "#version 300 es\\nout vec4 c; void main() { c = vec4(1.0); }"] });
export const ok = new Material({ fragmentSource: "#version 300 es\\nprecision mediump float;\\nout vec4 c; void main() { c = vec4(1.0); }" });
export const tagged = new Material({ fragmentSource: glsl\`out vec4 c; void main() { c = vec4(1.0); }\` });
export function screen(ctx: ExcaliburGraphicsContext, dynamic: string): ScreenShader[] {
  return [new ScreenShader(ctx, "uniform sampler2D u_image; void main() {}"), new ScreenShader(ctx, dynamic)];
}
`,
    },
    "shader-missing-version"
  );
  assert.deepEqual(
    findings.map((f) => [f.line, f.message.split(" shader source")[0]]),
    [
      [3, "Material"],
      [7, "ShaderPass"],
      [8, "ShaderPipeline pass"],
      [12, "ScreenShader"],
    ]
  );
});

// --- dead-system-hooks ------------------------------------------------------

test("dead-system-hooks: pre-v1 hook names on a System subclass flag when the installed excalibur declares onUpdate", async () => {
  const findings = await findingsFor(
    {
      "src/systems.ts": `
import { System, Scene, World } from "excalibur";
export class Movement extends System {
  systemType = "update";
  initialize(world: World, scene: Scene): void {}
  update(elapsed: number): void {}
  preupdate(scene: Scene, elapsed: number): void {}
  onUpdate(elapsed: number): void {}
  static update(): void {} // static: not a hook
}
export class Ticker { update(elapsed: number): void {} } // not a System
`,
    },
    "dead-system-hooks"
  );
  assert.deepEqual(
    findings.map((f) => [f.line, f.message]),
    [
      [5, "initialize() is never called by excalibur v1 — the System hook is onInitialize()"],
      [6, "update() is never called by excalibur v1 — the System hook is onUpdate()"],
      [7, "preupdate() is never called by excalibur v1 — the System hook is onPreUpdate()"],
    ]
  );
  assert.match(findings[1]!.hint ?? "", /fails to compile/);
});

// --- loadable-isloaded-method ------------------------------------------------

test("loadable-isloaded-method flags a custom Loadable (implements or extends) that still declares the method, not a getter or a structural lookalike", async () => {
  const findings = await findingsFor(
    {
      "src/resources.ts": `
import { Loadable, Resource } from "excalibur";
export class MapResource implements Loadable<string> {
  data = "";
  async load(): Promise<string> { return this.data; }
  isLoaded(): boolean { return this.data !== ""; }
}
export class Derived extends Resource<string> {
  override isLoaded(): boolean { return true; }
}
export class Fine implements Loadable<string> {
  data = "";
  async load(): Promise<string> { return this.data; }
  get isLoaded(): boolean { return true; }
}
export class Lookalike {
  isLoaded(): boolean { return true; } // not a Loadable: a user method of that name
}
`,
    },
    "loadable-isloaded-method"
  );
  assert.deepEqual(
    findings.map((f) => [f.line, f.message.split(" is a method")[0]]),
    [
      [6, "MapResource.isLoaded()"],
      [9, "Derived.isLoaded()"],
    ]
  );
  assert.match(findings[0]!.hint ?? "", /get isLoaded\(\)/);
});
