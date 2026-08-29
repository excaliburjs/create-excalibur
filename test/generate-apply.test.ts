import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { withViteProject, read, parsesCleanly } from "./generate-helpers.ts";
import {
  applyActor,
  applyLabel,
  applyScene,
  applyResource,
  applyEngine,
} from "../src/generate/apply.ts";
import { GenerateError } from "../src/generate/errors.ts";
import type { ActorModel, ResourceModel } from "../src/generate/models.ts";

const boss = (): ActorModel & { kind: string } => ({
  kind: "actor",
  className: "BigBoss",
  fileName: "big-boss.ts",
  collider: { type: "box", width: 64, height: 64 },
  graphic: { type: "color", color: "Red" },
  collisionType: "Active",
  advanced: {},
  targetScene: null,
});

test("applyActor creates the file and wires it into a scene's onInitialize", async () => {
  await withViteProject(async ({ dir, project }) => {
    const model = boss();
    model.targetScene = project.scenes[0];
    const report = await applyActor(model, project, {});
    assert.deepEqual(report.created, [path.join("src", "big-boss.ts")]);
    assert.equal(report.manual.length, 0);

    const actor = read(dir, "src/big-boss.ts");
    assert.match(actor, /export class BigBoss extends Actor/);
    assert.ok(parsesCleanly(actor));

    const level = read(dir, "src/level.ts");
    assert.match(level, /import { BigBoss } from "\.\/big-boss";/);
    assert.match(level, /this\.add\(player\); \/\/ Actors need to be added to a scene to be drawn\n        const bigBoss = new BigBoss\(\);\n        this\.add\(bigBoss\);\n    }/);
    assert.ok(parsesCleanly(level));
  });
});

test("applyActor sprite graphic imports Resources with the right specifier", async () => {
  await withViteProject(async ({ dir, project }) => {
    const model = boss();
    model.graphic = { type: "sprite", resourceKey: "Sword" };
    const report = await applyActor(model, project, {});
    const actor = read(dir, "src/big-boss.ts");
    assert.match(actor, /import { Resources } from "\.\/resources";/);
    assert.match(actor, /this\.graphics\.use\(Resources\.Sword\.toSprite\(\)\);/);
    assert.equal(report.hints.length, 1); // "add it to a scene" hint when no target scene
  });
});

test("applyActor refuses to overwrite without force, allows with force", async () => {
  await withViteProject(async ({ dir, project }) => {
    const model = boss();
    model.fileName = "player.ts"; // exists in the fixture
    model.className = "Player";
    await assert.rejects(applyActor(model, project, {}), GenerateError);
    const report = await applyActor(model, project, { force: true });
    assert.deepEqual(report.created, [path.join("src", "player.ts")]);
  });
});

test("applyActor dry-run writes nothing", async () => {
  await withViteProject(async ({ dir, project }) => {
    const model = boss();
    model.targetScene = project.scenes[0];
    const before = read(dir, "src/level.ts");
    await applyActor(model, project, { dryRun: true });
    assert.equal(fs.existsSync(path.join(dir, "src", "big-boss.ts")), false);
    assert.equal(read(dir, "src/level.ts"), before);
  });
});

test("applyLabel creates a label and wires it in", async () => {
  await withViteProject(async ({ dir, project }) => {
    const model = {
      kind: "label",
      className: "ScoreText",
      fileName: "score-text.ts",
      text: "Score: 0",
      font: { family: "monospace", size: 24, bold: false, color: "White" },
      pos: { x: 10, y: 10 },
      targetScene: project.scenes[0],
    };
    await applyLabel(model, project, {});
    const label = read(dir, "src/score-text.ts");
    assert.match(label, /extends Label/);
    assert.ok(parsesCleanly(label));
    assert.match(read(dir, "src/level.ts"), /const scoreText = new ScoreText\(\);\n        this\.add\(scoreText\);/);
  });
});

test("applyScene creates and registers the scene in main.ts", async () => {
  await withViteProject(async ({ dir, project }) => {
    const model = {
      kind: "scene",
      className: "Level2",
      fileName: "level2.ts",
      lifecycle: ["onInitialize", "onPreLoad"],
      register: true,
      key: "level2",
    };
    const report = await applyScene(model, project, {});
    const scene = read(dir, "src/level2.ts");
    assert.match(scene, /export class Level2 extends Scene/);
    assert.ok(parsesCleanly(scene));

    const main = read(dir, "src/main.ts");
    assert.match(main, /import { Level2 } from "\.\/level2";/);
    assert.match(main, /start: MyLevel,\n    level2: Level2\n  },/);
    assert.ok(parsesCleanly(main));
    assert.ok(report.hints.some((h) => h.includes('goToScene("level2")')));
  });
});

test("applyScene rejects a duplicate scenes-map key before writing anything", async () => {
  await withViteProject(async ({ dir, project }) => {
    const model = { kind: "scene", className: "Foo", fileName: "foo.ts", lifecycle: [], register: true, key: "start" };
    await assert.rejects(applyScene(model, project, {}), /already registered/);
    assert.equal(fs.existsSync(path.join(dir, "src", "foo.ts")), false);
  });
});

test("applyResource adds to the root Resources literal (comment preserved)", async () => {
  await withViteProject(async ({ dir, project }) => {
    const model: ResourceModel & { kind: string } = {
      kind: "resource",
      key: "Jump",
      resourceClass: "Sound",
      assetPath: "./sounds/jump.mp3",
      target: { root: true },
    };
    const report = await applyResource(model, project, {});
    const res = read(dir, "src/resources.ts");
    assert.match(res, /Sword: new ImageSource\("\.\/images\/sword\.png"\), \/\/ Vite public\/ directory serves the root images\n/);
    assert.match(res, /Jump: new Sound\("\.\/sounds\/jump\.mp3"\)\n} as const;/);
    assert.match(res, /import { ImageSource, Loader, Sound } from "excalibur";/);
    assert.ok(parsesCleanly(res));
    assert.ok(report.hints.some((h) => h.includes("Resources.Jump")));
  });
});

test("applyResource scene target declares the resource in the scene + onPreLoad", async () => {
  await withViteProject(async ({ dir, project }) => {
    const model: ResourceModel & { kind: string } = {
      kind: "resource",
      key: "BossMusic",
      resourceClass: "Sound",
      assetPath: "./music/boss.mp3",
      target: { scene: project.scenes[0] },
    };
    const report = await applyResource(model, project, {});
    assert.equal(report.manual.length, 0, JSON.stringify(report.manual));
    const level = read(dir, "src/level.ts");
    assert.match(level, /const bossMusic = new Sound\("\.\/music\/boss\.mp3"\);/);
    assert.match(level, /override onPreLoad\(loader: DefaultLoader\): void {\n        \/\/ Add any scene specific resources to load\n        loader\.addResource\(bossMusic\);\n    }/);
    assert.match(level, /import { DefaultLoader, Engine, ExcaliburGraphicsContext, Scene, SceneActivationContext, Sound } from "excalibur";/);
    assert.ok(parsesCleanly(level));
    // resources.ts untouched
    assert.doesNotMatch(read(dir, "src/resources.ts"), /BossMusic/);
  });
});

test("applyResource creates resources.ts when the project has none", async () => {
  await withViteProject(async ({ dir, project }) => {
    fs.rmSync(path.join(dir, "src", "resources.ts"));
    const fresh = { ...project, resourcesFile: null, resourceKeys: [] };
    const model = { kind: "resource", key: "Hero", resourceClass: "ImageSource", assetPath: "./images/hero.png", target: { root: true } };
    const report = await applyResource(model, fresh, {});
    assert.deepEqual(report.created, [path.join("src", "resources.ts")]);
    const res = read(dir, "src/resources.ts");
    assert.match(res, /Hero: new ImageSource\("\.\/images\/hero\.png"\)/);
    assert.ok(parsesCleanly(res));
  });
});

test("applyResource on a non-vite project degrades to manual instructions", async () => {
  await withViteProject(async ({ dir, project }) => {
    const nonVite = { ...project, viteShaped: false };
    const model = { kind: "resource", key: "A", resourceClass: "ImageSource", assetPath: "./a.png", target: { root: true } };
    const report = await applyResource(model, nonVite, {});
    assert.equal(report.created.length, 0);
    assert.equal(report.modified.length, 0);
    assert.equal(report.manual.length, 1);
    assert.equal(report.warnings.length, 1);
  });
});

test("applyEngine modifies options in place (replace, add, remove, imports)", async () => {
  await withViteProject(async ({ dir, project }) => {
    const model = {
      kind: "engine",
      options: {
        pixelArt: false,
        backgroundColor: "Black",
        displayMode: "FitScreen",
        physics: { solver: "Realistic", gravity: { x: 0, y: 800 } },
      },
      remove: [],
    };
    const report = await applyEngine(model, project, {});
    assert.equal(report.manual.length, 0, JSON.stringify(report.manual));
    const main = read(dir, "src/main.ts");
    assert.match(main, /pixelArt: false, \/\/ pixelArt will turn on/); // replaced in place, comment kept
    assert.match(main, /displayMode: DisplayMode\.FitScreen, \/\/ Display mode/);
    assert.match(main, /backgroundColor: Color\.Black,/);
    assert.match(main, /physics: { solver: SolverStrategy\.Realistic, gravity: vec\(0, 800\) },/);
    assert.match(main, /import { Color, DisplayMode, Engine, FadeInOut, vec, SolverStrategy } from "excalibur";/);
    assert.ok(parsesCleanly(main));
  });
});

test("applyEngine generates a fresh main.ts when no engine exists", async () => {
  await withViteProject(async ({ dir, project }) => {
    fs.rmSync(path.join(dir, "src", "main.ts"));
    const noEngine = { ...project, mainFile: null };
    const model = {
      kind: "engine",
      options: { width: 400, height: 300, pixelArt: true },
      remove: [],
      scenes: [{ className: "MyLevel", file: path.join(dir, "src", "level.ts"), key: "start" }],
    };
    const report = await applyEngine(model, noEngine, {});
    assert.deepEqual(report.created, [path.join("src", "main.ts")]);
    const main = read(dir, "src/main.ts");
    assert.match(main, /import { MyLevel } from "\.\/level";/);
    assert.match(main, /game\.start\("start", { loader }\);/);
    assert.ok(parsesCleanly(main));
  });
});
