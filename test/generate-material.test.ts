import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { applyMaterial } from "../src/generate/apply.ts";
import { MATERIAL_TEMPLATES, emitMaterialFile, materialNames } from "../src/generate/emit.ts";
import { GenerateError } from "../src/generate/errors.ts";
import { pickActor } from "../src/generate/wizards.ts";
import { parsesCleanly, read, withViteProject } from "./generate-helpers.ts";

function model(overrides = {}) {
  return {
    kind: "material",
    className: "Ripple",
    fileName: "ripple.ts",
    template: "tint",
    pixelArt: false,
    targetActor: null,
    ...overrides,
  };
}

test("materialNames strips a trailing Material and derives factory/const/name", () => {
  assert.deepEqual(materialNames("GlowMaterial"), {
    factoryName: "createGlowMaterial",
    sourceConst: "glowFragmentSource",
    materialName: "glow",
  });
  assert.equal(materialNames("Water").factoryName, "createWaterMaterial");
});

test("emitMaterialFile emits the tint template exactly", () => {
  const text = emitMaterialFile(model());
  assert.equal(
    text,
    `import { Color, Engine, Material } from "excalibur";

export const rippleFragmentSource = /* glsl */ \`#version 300 es
precision mediump float;

uniform sampler2D u_graphic;
uniform vec4 u_color;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec2 uv = v_uv;
  vec4 color = texture(u_graphic, uv);
  // color is premultiplied-alpha — scaling rgb by the tint keeps it premultiplied
  fragColor = vec4(color.rgb * u_color.rgb, color.a);
}\`;

// Materials need a live graphics context, so create one once the engine
// exists (e.g. in onInitialize): this.graphics.material = createRippleMaterial(engine);
export function createRippleMaterial(engine: Engine): Material {
  return engine.graphicsContext.createMaterial({
    name: "ripple",
    fragmentSource: rippleFragmentSource,
    // the tint color — exposed to the shader as u_color
    color: Color.Red,
  });
}
`
  );
});

test("every template emits parseable TS whose GLSL starts with #version 300 es", () => {
  for (const template of Object.keys(MATERIAL_TEMPLATES)) {
    for (const pixelArt of [false, true]) {
      const text = emitMaterialFile(model({ template, pixelArt }));
      assert.ok(parsesCleanly(text, `${template}.ts`), `${template} pixelArt=${pixelArt} parses`);
      assert.match(text, /= \/\* glsl \*\/ `#version 300 es\n/, "#version must be the literal first characters");
    }
  }
  // pixel-art variants of graphic-sampling templates include the IQ sampler
  assert.ok(emitMaterialFile(model({ pixelArt: true })).includes("uv_iq"));
  assert.ok(emitMaterialFile(model({ template: "outline", pixelArt: true })).includes("uv_iq"));
  assert.ok(!emitMaterialFile(model({ template: "water", pixelArt: true })).includes("uv_iq"));
  // water uses the screen texture, not the graphic
  assert.ok(emitMaterialFile(model({ template: "water" })).includes("u_screen_texture"));
});

test("custom fragmentSource overrides the template and is escaped safely", () => {
  const text = emitMaterialFile(model({ fragmentSource: "#version 300 es\nvoid main() { /* ` ${x} */ }" }));
  assert.ok(parsesCleanly(text, "custom.ts"));
  assert.ok(text.includes("\\`"), "backticks escaped");
  assert.ok(text.includes("\\${"), "interpolations escaped");
  assert.ok(!text.includes("color: Color."), "template color options are not applied to custom GLSL");
});

test("custom fragmentSource with leading/trailing whitespace still starts literally with #version", () => {
  const text = emitMaterialFile(model({ fragmentSource: "\n\n  #version 300 es\nvoid main() {}\n\n" }));
  assert.match(text, /= \/\* glsl \*\/ `#version 300 es\n/, "#version must be the literal first characters");
});

test("applyMaterial creates the file and wires an actor whose onInitialize has no engine param", async () => {
  await withViteProject(async ({ dir, project }) => {
    assert.deepEqual(project.actors, [{ className: "Player", file: path.join(dir, "src", "player.ts") }]);
    const actor = project.actors[0];
    const report = await applyMaterial(model({ template: "outline", targetActor: actor }), project, {});
    assert.deepEqual(report.created, ["src/ripple.ts"]);
    assert.equal(report.manual.length, 0);
    assert.equal(report.modified[0].path, "src/player.ts");

    const player = read(dir, "src/player.ts");
    // the fixture's onInitialize() had no parameter — one gets added
    assert.match(player, /override onInitialize\(engine: Engine\) \{\n    this\.graphics\.add\(Resources\.Sword\.toSprite\(\)\);\n    this\.graphics\.material = createRippleMaterial\(engine\);\n  \}/);
    assert.match(player, /import \{ createRippleMaterial \} from "\.\/ripple";/);
    assert.ok(parsesCleanly(player, "player.ts"));
    assert.ok(parsesCleanly(read(dir, "src/ripple.ts"), "ripple.ts"));
  });
});

test("applyMaterial reuses an existing onInitialize parameter name", async () => {
  await withViteProject(async ({ dir, project }) => {
    const enemyFile = path.join(dir, "src", "enemy.ts");
    fs.writeFileSync(
      enemyFile,
      `import { Actor, Engine } from "excalibur";

export class Enemy extends Actor {
  override onInitialize(_game: Engine): void {
    // setup
  }
}
`
    );
    const report = await applyMaterial(
      model({ targetActor: { className: "Enemy", file: enemyFile } }),
      project,
      {}
    );
    assert.equal(report.manual.length, 0);
    const enemy = read(dir, "src/enemy.ts");
    assert.ok(enemy.includes("this.graphics.material = createRippleMaterial(_game);"));
    assert.ok(parsesCleanly(enemy, "enemy.ts"));
  });
});

test("applyMaterial creates onInitialize when the actor has none", async () => {
  await withViteProject(async ({ dir, project }) => {
    const enemyFile = path.join(dir, "src", "enemy.ts");
    fs.writeFileSync(
      enemyFile,
      `import { Actor } from "excalibur";

export class Enemy extends Actor {
  constructor() {
    super({ width: 10, height: 10 });
  }
}
`
    );
    const report = await applyMaterial(
      model({ targetActor: { className: "Enemy", file: enemyFile } }),
      project,
      {}
    );
    assert.equal(report.manual.length, 0);
    const enemy = read(dir, "src/enemy.ts");
    assert.ok(enemy.includes("override onInitialize(engine: Engine): void {"));
    assert.ok(enemy.includes("this.graphics.material = createRippleMaterial(engine);"));
    assert.match(enemy, /import \{ Actor, Engine \} from "excalibur";/);
    assert.ok(parsesCleanly(enemy, "enemy.ts"));
  });
});

test("applyMaterial dry run writes nothing; existing target needs --force", async () => {
  await withViteProject(async ({ dir, project }) => {
    const before = read(dir, "src/player.ts");
    const report = await applyMaterial(
      model({ targetActor: project.actors[0] }),
      project,
      { dryRun: true }
    );
    assert.deepEqual(report.created, ["src/ripple.ts"]);
    assert.ok(!fs.existsSync(path.join(dir, "src", "ripple.ts")));
    assert.equal(read(dir, "src/player.ts"), before);

    fs.writeFileSync(path.join(dir, "src", "ripple.ts"), "// taken\n");
    await assert.rejects(applyMaterial(model(), project, {}), GenerateError);
    const forced = await applyMaterial(model(), project, { force: true });
    assert.deepEqual(forced.created, ["src/ripple.ts"]);
    assert.ok(forced.hints.some((h) => h.includes("createRippleMaterial(engine)")));
  });
});

test("pickActor resolves --actor prompt-free and errors helpfully on a miss", async () => {
  await withViteProject(async ({ project }) => {
    const match = await pickActor({ project, actorArg: "player" });
    assert.equal(match!.className, "Player");
    await assert.rejects(
      pickActor({ project, actorArg: "Ghost" }),
      (err: unknown) => err instanceof GenerateError && /available actors: Player/.test(err.hint ?? "")
    );
  });
});
