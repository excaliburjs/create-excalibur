import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emitActorFile,
  emitLabelFile,
  emitSceneFile,
  emitResourcesFile,
  emitResourceExpr,
  emitMainFile,
} from "../src/generate/emit.ts";
import { parsesCleanly } from "./generate-helpers.ts";

test("emitActorFile: box + color + collision type", () => {
  const out = emitActorFile({
    className: "BigBoss",
    fileName: "big-boss.ts",
    collider: { type: "box", width: 100, height: 100 },
    graphic: { type: "color", color: "Red" },
    collisionType: "Active",
    advanced: {},
  });
  assert.equal(
    out,
    `import { Actor, CollisionType, Color, Engine } from "excalibur";

export class BigBoss extends Actor {
  constructor() {
    super({
      name: "BigBoss",
      width: 100,
      height: 100,
      color: Color.Red,
      collisionType: CollisionType.Active,
    });
  }

  override onInitialize(engine: Engine): void {
    // Recommended place to set up your actor (runs before the first update)
  }
}
`
  );
  assert.ok(parsesCleanly(out));
});

test("emitActorFile: sprite graphic, circle, advanced options", () => {
  const out = emitActorFile(
    {
      className: "Coin",
      fileName: "coin.ts",
      collider: { type: "circle", radius: 16 },
      graphic: { type: "sprite", resourceKey: "CoinImg" },
      collisionType: "Passive",
      advanced: { pos: { x: 10, y: 20 }, z: 5, coordPlane: "Screen", collisionGroupName: "pickups" },
    },
    { resourcesSpecifier: "./resources" }
  );
  assert.match(out, /import { Resources } from "\.\/resources";/);
  assert.match(out, /const group = CollisionGroupManager\.create\("pickups"\);/);
  assert.match(out, /pos: vec\(10, 20\),/);
  assert.match(out, /radius: 16,/);
  assert.match(out, /coordPlane: CoordPlane\.Screen,/);
  assert.match(out, /z: 5,/);
  assert.match(out, /collisionGroup: group,/);
  assert.doesNotMatch(out, /collisionType/); // Passive is the default — omitted
  assert.match(out, /this\.graphics\.use\(Resources\.CoinImg\.toSprite\(\)\);/);
  assert.ok(parsesCleanly(out));
});

test("emitLabelFile", () => {
  const out = emitLabelFile({
    className: "ScoreText",
    fileName: "score-text.ts",
    text: "Score: 0",
    pos: { x: 10, y: 10 },
    font: { family: "monospace", size: 24, bold: true, color: "White" },
  });
  assert.match(out, /export class ScoreText extends Label {/);
  assert.match(out, /text: "Score: 0",/);
  assert.match(out, /font: new Font\({ family: "monospace", size: 24, bold: true, color: Color\.White }\),/);
  assert.match(out, /import { Color, Font, Label, vec } from "excalibur";/);
  assert.ok(parsesCleanly(out));
});

test("emitSceneFile imports only what the chosen stubs need", () => {
  const out = emitSceneFile({ className: "Level2", fileName: "level2.ts", key: "level2", lifecycle: ["onInitialize", "onPreLoad", "onActivate"] });
  assert.match(out, /import { DefaultLoader, Engine, Scene, SceneActivationContext } from "excalibur";/);
  assert.match(out, /override onInitialize\(engine: Engine\): void {/);
  assert.match(out, /override onPreLoad\(loader: DefaultLoader\): void {/);
  assert.match(out, /override onActivate\(context: SceneActivationContext\): void {/);
  assert.ok(parsesCleanly(out));

  const minimal = emitSceneFile({ className: "A", fileName: "a.ts", key: "a", lifecycle: [] });
  assert.match(minimal, /import { Engine, Scene } from "excalibur";/);
  assert.ok(parsesCleanly(minimal));
});

test("emitResourceExpr shapes", () => {
  assert.deepEqual(emitResourceExpr({ resourceClass: "ImageSource", assetPath: "./images/a.png" }), {
    expr: `new ImageSource("./images/a.png")`,
    excaliburImports: ["ImageSource"],
  });
  assert.deepEqual(
    emitResourceExpr({ resourceClass: "ImageSource", assetPath: "./a.png", pixelFiltering: true }),
    {
      expr: `new ImageSource("./a.png", { filtering: ImageFiltering.Pixel })`,
      excaliburImports: ["ImageSource", "ImageFiltering"],
    }
  );
  assert.equal(emitResourceExpr({ resourceClass: "Sound", assetPath: "./jump.mp3" }).expr, `new Sound("./jump.mp3")`);
  assert.equal(
    emitResourceExpr({ resourceClass: "FontSource", assetPath: "./f.ttf", family: "MyFont" }).expr,
    `new FontSource("./f.ttf", "MyFont")`
  );
  assert.equal(
    emitResourceExpr({ resourceClass: "Resource", assetPath: "./d.json", responseType: "json" }).expr,
    `new Resource("./d.json", "json")`
  );
});

test("emitResourcesFile + emitMainFile parse cleanly", () => {
  assert.ok(parsesCleanly(emitResourcesFile()));
  const main = emitMainFile(
    {
      options: { width: 800, height: 600, displayMode: "FitScreenAndFill", pixelArt: true },
      scenes: [{ key: "start", className: "MyLevel", specifier: "./level" }],
    },
    { hasResources: true }
  );
  assert.match(main, /import { DisplayMode, Engine } from "excalibur";/);
  assert.match(main, /import { loader } from "\.\/resources";/);
  assert.match(main, /scenes: {\n    start: MyLevel,\n  },/);
  assert.match(main, /game\.start\("start", { loader }\);/);
  assert.ok(parsesCleanly(main));

  const bare = emitMainFile({ options: {}, scenes: [] }, { hasResources: false });
  assert.match(bare, /game\.start\(\);/);
  assert.ok(parsesCleanly(bare));
});
