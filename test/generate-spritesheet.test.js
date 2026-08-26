import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { applyAnimation, applySpriteSheet } from "../src/generate/apply.js";
import { emitAnimationConst, emitSpriteSheetConst } from "../src/generate/emit.js";
import { GenerateError } from "../src/generate/errors.js";
import { analyzeProject } from "../src/generate/project.js";
import { createTsEditor } from "../src/generate/ts-edit.js";
import { resolveGrid } from "../src/generate/wizards-sprite.js";
import { callTool } from "../src/mcp/registry.js";
import { parsesCleanly, read, ts, withViteProject } from "./generate-helpers.js";
import { withTempDirAsync } from "./helpers.js";

const sheetModel = (over = {}) => ({
  kind: "spritesheet",
  name: "Run",
  image: { key: "Run", reuseExisting: false, assetPath: "./images/run.png", pixelFiltering: true },
  dimensions: { width: 32, height: 16 },
  grid: { rows: 2, columns: 4, spriteWidth: 8, spriteHeight: 8 },
  spacing: { margin: { x: 0, y: 0 }, originOffset: { x: 0, y: 0 } },
  animations: [],
  wire: null,
  ...over,
});

const runAnim = () => ({
  name: "Run",
  frames: [
    { x: 0, y: 0, duration: 100 },
    { x: 1, y: 0, duration: 100 },
    { x: 2, y: 0, duration: 250 },
  ],
  strategy: "Loop",
});

// --- emit ----------------------------------------------------------------

test("emitSpriteSheetConst: with and without spacing", () => {
  const model = sheetModel({ spacing: { margin: { x: 1, y: 2 }, originOffset: { x: 3, y: 4 } } });
  assert.equal(
    emitSpriteSheetConst(model).text,
    `export const RunSpriteSheet = SpriteSheet.fromImageSource({
  image: Resources.Run,
  grid: { rows: 2, columns: 4, spriteWidth: 8, spriteHeight: 8 },
  spacing: { originOffset: { x: 3, y: 4 }, margin: { x: 1, y: 2 } },
});`
  );
  assert.deepEqual(emitSpriteSheetConst(model).excaliburImports, ["SpriteSheet"]);
  // all-zero spacing is omitted; a zero half is omitted
  assert.ok(!emitSpriteSheetConst(sheetModel()).text.includes("spacing"));
  const onlyMargin = emitSpriteSheetConst(
    sheetModel({ spacing: { margin: { x: 1, y: 0 }, originOffset: { x: 0, y: 0 } } })
  ).text;
  assert.ok(onlyMargin.includes("spacing: { margin: { x: 1, y: 0 } },"));
  assert.ok(!onlyMargin.includes("originOffset"));
});

test("emitAnimationConst: frames, strategy, imports", () => {
  const out = emitAnimationConst({ ...runAnim(), name: "Idle", sheetName: "RunSpriteSheet", strategy: "PingPong" });
  assert.equal(
    out.text,
    `export const IdleAnimation = Animation.fromSpriteSheetCoordinates({
  spriteSheet: RunSpriteSheet,
  frameCoordinates: [
    { x: 0, y: 0, duration: 100 },
    { x: 1, y: 0, duration: 100 },
    { x: 2, y: 0, duration: 250 },
  ],
  strategy: AnimationStrategy.PingPong,
});`
  );
  assert.deepEqual(out.excaliburImports, ["Animation", "AnimationStrategy"]);
});

// --- resolveGrid ---------------------------------------------------------

test("resolveGrid derives sprite size from counts (and warns on remainders)", () => {
  const clean = resolveGrid({ dimensions: { width: 32, height: 16 }, rows: 2, columns: 4 });
  assert.deepEqual(clean.grid, { rows: 2, columns: 4, spriteWidth: 8, spriteHeight: 8 });
  assert.deepEqual(clean.warnings, []);

  const uneven = resolveGrid({ dimensions: { width: 33, height: 16 }, rows: 2, columns: 4 });
  assert.equal(uneven.grid.spriteWidth, 8);
  assert.equal(uneven.warnings.length, 1);
  assert.match(uneven.warnings[0], /does not divide evenly/);
});

test("resolveGrid derives counts from sprite size, honoring margin and offset", () => {
  // 32px wide, 2px offset, 8px sprites with 2px gaps: 8+2+8+2+8 = 28 + offset 2 → 3 columns, 2px unused
  const out = resolveGrid({
    dimensions: { width: 32, height: 16 },
    spriteWidth: 8,
    spriteHeight: 8,
    margin: { x: 2, y: 0 },
    originOffset: { x: 2, y: 0 },
  });
  assert.deepEqual(out.grid, { rows: 2, columns: 3, spriteWidth: 8, spriteHeight: 8 });
  assert.ok(out.warnings.some((w) => w.includes("unused")));
});

test("resolveGrid returns null when underspecified or impossible", () => {
  assert.equal(resolveGrid({ dimensions: null, rows: 2, columns: 4 }).grid, null);
  assert.equal(resolveGrid({ dimensions: { width: 32, height: 16 }, rows: 2 }).grid, null);
  // sprites bigger than the sheet → 0 columns
  assert.equal(
    resolveGrid({ dimensions: { width: 32, height: 16 }, spriteWidth: 64, spriteHeight: 8 }).grid,
    null
  );
});

// --- ts-edit helpers -----------------------------------------------------

function editorFor(text, name = "resources.ts") {
  const editor = createTsEditor(ts);
  return { editor, sf: editor.parse(name, text) };
}

test("findSpriteSheetConsts: named import, grid + spacing + imageKey extraction", () => {
  const text = `import { ImageSource, SpriteSheet } from "excalibur";
export const Resources = { Run: new ImageSource("./images/run.png") } as const;
export const RunSpriteSheet = SpriteSheet.fromImageSource({
  image: Resources.Run,
  grid: { rows: 2, columns: 4, spriteWidth: 8, spriteHeight: 8 },
  spacing: { margin: { x: 1, y: 1 } },
});
`;
  const { editor, sf } = editorFor(text);
  const sheets = editor.findSpriteSheetConsts(sf);
  assert.equal(sheets.length, 1);
  assert.equal(sheets[0].name, "RunSpriteSheet");
  assert.deepEqual(sheets[0].grid, { rows: 2, columns: 4, spriteWidth: 8, spriteHeight: 8 });
  assert.deepEqual(sheets[0].spacing, { margin: { x: 1, y: 1 }, originOffset: null });
  assert.equal(sheets[0].imageKey, "Run");
});

test("findSpriteSheetConsts: namespace import and non-literal grid", () => {
  const text = `import * as ex from "excalibur";
const cols = 4;
export const A = ex.SpriteSheet.fromImageSource({
  image: ex.Resources,
  grid: { rows: 2, columns: cols, spriteWidth: 8, spriteHeight: 8 },
});
export const NotASheet = ex.Animation.fromSpriteSheetCoordinates({ spriteSheet: A, frameCoordinates: [] });
`;
  const { editor, sf } = editorFor(text);
  const sheets = editor.findSpriteSheetConsts(sf);
  assert.equal(sheets.length, 1);
  assert.equal(sheets[0].name, "A");
  assert.equal(sheets[0].grid, null); // `cols` is not a numeric literal
  assert.equal(sheets[0].imageKey, null);
});

test("insertStatementAfter keeps a trailing comment attached and handles CRLF", () => {
  const text = `const a = 1; // keep me\r\nconst b = 2;\r\n`;
  const { editor, sf } = editorFor(text, "x.ts");
  const stmt = editor.findVariableStatement(sf, "a");
  const edit = editor.insertStatementAfter(sf, text, stmt, "const c = 3;");
  const out = editor.applyEdits(text, [edit]);
  assert.equal(out, `const a = 1; // keep me\r\n\r\nconst c = 3;\r\nconst b = 2;\r\n`);
  assert.ok(parsesCleanly(out));
});

// --- applySpriteSheet ----------------------------------------------------

test("applySpriteSheet adds the Resources entry + sheet const in the right place", async () => {
  await withViteProject(async ({ dir, project }) => {
    const report = await applySpriteSheet(sheetModel(), project, {});
    assert.equal(report.manual.length, 0);
    assert.equal(report.modified.length, 1);
    assert.equal(report.modified[0].path, path.join("src", "resources.ts"));

    const out = read(dir, "src/resources.ts");
    assert.ok(parsesCleanly(out));
    assert.match(out, /Run: new ImageSource\("\.\/images\/run\.png", \{ filtering: ImageFiltering\.Pixel \}\)/);
    // the fixture's trailing comments survive
    assert.match(out, /\/\/ Vite public\/ directory serves the root images/);
    assert.match(out, /\} as const; \/\/ the 'as const' is a neat typescript trick/);
    // the const lands after the Resources literal but before the loader block
    const sheetPos = out.indexOf("export const RunSpriteSheet = SpriteSheet.fromImageSource({");
    assert.ok(sheetPos > out.indexOf("} as const;"));
    assert.ok(sheetPos < out.indexOf("export const loader"));
    assert.match(out, /import \{ ImageSource, Loader, ImageFiltering, SpriteSheet \} from "excalibur";/);
    assert.ok(report.hints.some((h) => h.includes("RunSpriteSheet.getSprite(0, 0)")));
  });
});

test("applySpriteSheet chains animations and wires one into an actor", async () => {
  await withViteProject(async ({ dir, project }) => {
    const model = sheetModel({
      animations: [runAnim(), { name: "Idle", frames: [{ x: 3, y: 1, duration: 400 }], strategy: "Freeze" }],
      wire: { animationName: "Run", actor: project.actors.find((a) => a.className === "Player") },
    });
    const report = await applySpriteSheet(model, project, {});
    assert.equal(report.manual.length, 0);

    const out = read(dir, "src/resources.ts");
    assert.ok(parsesCleanly(out));
    const sheetPos = out.indexOf("export const RunSpriteSheet");
    const runPos = out.indexOf("export const RunAnimation");
    const idlePos = out.indexOf("export const IdleAnimation");
    assert.ok(sheetPos < runPos && runPos < idlePos, "consts appear in order");
    assert.ok(idlePos < out.indexOf("export const loader"));
    assert.match(out, /strategy: AnimationStrategy\.Freeze/);
    const importLine = out.split("\n")[0];
    assert.ok(importLine.includes("Animation") && importLine.includes("AnimationStrategy"), importLine);

    const player = read(dir, "src/player.ts");
    assert.ok(parsesCleanly(player));
    assert.match(player, /import \{ Resources, RunAnimation \} from "\.\/resources";/);
    assert.match(player, /this\.graphics\.use\(RunAnimation\);/);
    assert.ok(report.modified.some((m) => m.path === path.join("src", "player.ts")));
  });
});

test("applySpriteSheet reuses an existing Resources key without adding one", async () => {
  await withViteProject(async ({ dir, project }) => {
    const model = sheetModel({
      name: "Sword",
      image: { key: "Sword", reuseExisting: true, assetPath: "./images/sword.png", pixelFiltering: false },
    });
    await applySpriteSheet(model, project, {});
    const out = read(dir, "src/resources.ts");
    assert.ok(parsesCleanly(out));
    assert.equal(out.match(/new ImageSource\(/g).length, 1); // still just Sword
    assert.match(out, /export const SwordSpriteSheet = SpriteSheet\.fromImageSource\(\{\n  image: Resources\.Sword,/);
  });
});

test("applySpriteSheet rejects duplicate const and resource names", async () => {
  await withViteProject(async ({ dir, project }) => {
    await applySpriteSheet(sheetModel(), project, {});
    const again = await analyzeProject(dir, { ts });
    await assert.rejects(
      () => applySpriteSheet(sheetModel({ image: { key: "Run2", reuseExisting: false, assetPath: "./x.png" } }), again, {}),
      (err) => err instanceof GenerateError && /RunSpriteSheet already exists/.test(err.message)
    );
    await assert.rejects(
      () => applySpriteSheet(sheetModel({ name: "Other" }), again, {}),
      (err) => err instanceof GenerateError && /resource key "Run" already exists/.test(err.message)
    );
  });
});

test("applySpriteSheet creates resources.ts when missing", async () => {
  await withViteProject(async ({ dir, project }) => {
    fs.rmSync(path.join(dir, "src", "resources.ts"));
    const fresh = await analyzeProject(dir, { ts });
    const report = await applySpriteSheet(sheetModel(), fresh, {});
    assert.deepEqual(report.created, [path.join("src", "resources.ts")]);
    const out = read(dir, "src/resources.ts");
    assert.ok(parsesCleanly(out));
    assert.match(out, /Resources = \{ Run: new ImageSource/);
    assert.match(out, /export const RunSpriteSheet/);
  });
});

test("applySpriteSheet dryRun writes nothing", async () => {
  await withViteProject(async ({ dir, project }) => {
    const before = read(dir, "src/resources.ts");
    const report = await applySpriteSheet(sheetModel(), project, { dryRun: true });
    assert.equal(report.modified.length, 1);
    assert.equal(read(dir, "src/resources.ts"), before);
  });
});

test("applySpriteSheet degrades to manual instructions outside vite-shaped projects", async () => {
  await withTempDirAsync(async (dir) => {
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ dependencies: { excalibur: "0.32.0" } }));
    fs.mkdirSync(path.join(dir, "src"));
    fs.writeFileSync(path.join(dir, "src", "main.ts"), `console.log("hi");\n`);
    fs.mkdirSync(path.join(dir, "node_modules", "excalibur"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "node_modules", "excalibur", "package.json"),
      JSON.stringify({ name: "excalibur", version: "0.32.0" })
    );
    const project = await analyzeProject(dir, { ts });
    const report = await applySpriteSheet(sheetModel({ animations: [runAnim()] }), project, {});
    assert.equal(report.warnings.length, 1);
    assert.equal(report.manual.length, 1);
    assert.match(report.manual[0].snippet, /Run: new ImageSource/);
    assert.match(report.manual[0].snippet, /RunSpriteSheet = SpriteSheet\.fromImageSource/);
    assert.match(report.manual[0].snippet, /RunAnimation = Animation\.fromSpriteSheetCoordinates/);
    assert.equal(fs.existsSync(path.join(dir, "src", "resources.ts")), false);
  });
});

// --- applyAnimation ------------------------------------------------------

test("applyAnimation appends after the sheet const and wires an actor", async () => {
  await withViteProject(async ({ dir, project }) => {
    await applySpriteSheet(sheetModel(), project, {});
    const again = await analyzeProject(dir, { ts });
    const sheet = again.spriteSheets.find((s) => s.name === "RunSpriteSheet");
    assert.ok(sheet, "analyzeProject discovers the new sheet");
    assert.deepEqual(sheet.grid, { rows: 2, columns: 4, spriteWidth: 8, spriteHeight: 8 });
    assert.equal(sheet.assetPath, "./images/run.png");

    const report = await applyAnimation(
      {
        kind: "animation",
        name: "Walk",
        sheet: { name: sheet.name, file: sheet.file, grid: sheet.grid },
        frames: [{ x: 0, y: 1, duration: 120 }, { x: 1, y: 1, duration: 120 }],
        strategy: "PingPong",
        targetActor: again.actors.find((a) => a.className === "Player"),
      },
      again,
      {}
    );
    assert.equal(report.manual.length, 0);

    const out = read(dir, "src/resources.ts");
    assert.ok(parsesCleanly(out));
    const sheetPos = out.indexOf("export const RunSpriteSheet");
    const animPos = out.indexOf("export const WalkAnimation");
    assert.ok(sheetPos < animPos && animPos < out.indexOf("export const loader"));

    const player = read(dir, "src/player.ts");
    assert.match(player, /this\.graphics\.use\(WalkAnimation\);/);
    assert.ok(report.modified.some((m) => m.snippet.includes("2 frames, PingPong")));
  });
});

test("applyAnimation rejects a missing sheet and duplicate names", async () => {
  await withViteProject(async ({ dir, project }) => {
    await assert.rejects(
      () =>
        applyAnimation(
          {
            kind: "animation",
            name: "Walk",
            sheet: { name: "NopeSpriteSheet", file: project.resourcesFile, grid: null },
            frames: [{ x: 0, y: 0, duration: 100 }],
            strategy: "Loop",
            targetActor: null,
          },
          project,
          {}
        ),
      (err) => err instanceof GenerateError && /NopeSpriteSheet not found/.test(err.message)
    );

    await applySpriteSheet(sheetModel({ animations: [runAnim()] }), project, {});
    const again = await analyzeProject(dir, { ts });
    const sheet = again.spriteSheets[0];
    await assert.rejects(
      () =>
        applyAnimation(
          {
            kind: "animation",
            name: "Run",
            sheet: { name: sheet.name, file: sheet.file, grid: sheet.grid },
            frames: [{ x: 0, y: 0, duration: 100 }],
            strategy: "Loop",
            targetActor: null,
          },
          again,
          {}
        ),
      (err) => err instanceof GenerateError && /RunAnimation already exists/.test(err.message)
    );
  });
});

// --- MCP tools -----------------------------------------------------------

function payload(result) {
  assert.ok(!result.isError, `unexpected tool error: ${result.content?.[0]?.text}`);
  return JSON.parse(result.content[0].text);
}

function errorText(result) {
  assert.equal(result.isError, true, "expected an isError result");
  return result.content[0].text;
}

test("generate_spritesheet derives the grid from the image and writes resources.ts", async () => {
  await withViteProject(async ({ dir }) => {
    const result = await callTool(
      "generate_spritesheet",
      { name: "Run", assetPath: "./images/run.png", rows: 2, columns: 4 },
      { defaultProjectDir: dir, ts }
    );
    const info = payload(result);
    assert.equal(info.dryRun, false);
    const out = read(dir, "src/resources.ts");
    assert.match(out, /grid: \{ rows: 2, columns: 4, spriteWidth: 8, spriteHeight: 8 \}/);
    assert.ok(parsesCleanly(out));

    // and analyze_project reports it for follow-up generate_animation calls
    const analyzed = payload(await callTool("analyze_project", {}, { defaultProjectDir: dir, ts }));
    assert.deepEqual(analyzed.spriteSheets, [
      { name: "RunSpriteSheet", file: "src/resources.ts", grid: { rows: 2, columns: 4, spriteWidth: 8, spriteHeight: 8 } },
    ]);
  });
});

test("generate_spritesheet validates assetPath/resourceKey and grid resolvability", async () => {
  await withViteProject(async ({ dir }) => {
    const ctx = { defaultProjectDir: dir, ts };
    assert.match(errorText(await callTool("generate_spritesheet", { name: "A" }, ctx)), /exactly one of/);
    assert.match(
      errorText(await callTool("generate_spritesheet", { name: "A", assetPath: "./x.png", resourceKey: "Sword" }, ctx)),
      /exactly one of/
    );
    assert.match(
      errorText(await callTool("generate_spritesheet", { name: "A", resourceKey: "Nope" }, ctx)),
      /not found in Resources/
    );
    // sword.png is not a readable image, so counts alone can't resolve a grid
    assert.match(
      errorText(await callTool("generate_spritesheet", { name: "A", resourceKey: "Sword", rows: 2, columns: 4 }, ctx)),
      /could not resolve the sprite grid/
    );
  });
});

test("generate_animation builds frames, checks bounds, and wires an actor", async () => {
  await withViteProject(async ({ dir }) => {
    const ctx = { defaultProjectDir: dir, ts };
    assert.match(errorText(await callTool("generate_animation", { name: "A", frames: [{ x: 0, y: 0 }] }, ctx)), /no SpriteSheet consts/);

    payload(
      await callTool(
        "generate_spritesheet",
        { name: "Run", assetPath: "./images/run.png", spriteWidth: 8, spriteHeight: 8 },
        ctx
      )
    );
    assert.match(
      errorText(await callTool("generate_animation", { name: "A", frames: [{ x: 4, y: 0 }] }, ctx)),
      /outside the sheet's grid/
    );

    const result = payload(
      await callTool(
        "generate_animation",
        {
          name: "Run",
          frames: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0, duration: 300 }],
          duration: 90,
          strategy: "PingPong",
          actor: "Player",
        },
        ctx
      )
    );
    assert.ok(result.modified.some((m) => m.path === "src/player.ts" || m.path === path.join("src", "player.ts")));
    const out = read(dir, "src/resources.ts");
    assert.match(out, /\{ x: 0, y: 0, duration: 90 \}/);
    assert.match(out, /\{ x: 2, y: 0, duration: 300 \}/);
    assert.match(out, /strategy: AnimationStrategy\.PingPong/);
    assert.match(read(dir, "src/player.ts"), /this\.graphics\.use\(RunAnimation\);/);
  });
});
