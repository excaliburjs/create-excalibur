import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { createTsEditor } from "../src/generate/ts-edit.js";
import { GenerateError, SeamNotFoundError } from "../src/generate/errors.js";

const ed = createTsEditor(ts);

function edit(name, text, fn) {
  const sf = ed.parse(name, text);
  const { edits } = fn(sf, text);
  const out = ed.applyEdits(text, edits);
  assert.equal(ed.validate(name, out).length, 0, `edited ${name} must re-parse cleanly:\n${out}`);
  return out;
}

test("addSceneToEngine inserts into a multiline scenes map and adds the import", () => {
  const text = `import { Engine } from "excalibur";
import { MyLevel } from "./level";

const game = new Engine({
  width: 800,
  scenes: {
    start: MyLevel
  },
});
`;
  const out = edit("main.ts", text, (sf, t) =>
    ed.addSceneToEngine(sf, t, { key: "level2", className: "Level2", specifier: "./level2" })
  );
  assert.match(out, /start: MyLevel,\n    level2: Level2\n/);
  assert.match(out, /import { Level2 } from "\.\/level2";/);
});

test("addSceneToEngine handles trailing comma and single-line maps", () => {
  const trailing = `import { Engine } from "excalibur";
const game = new Engine({
  scenes: {
    start: A,
  },
});
`;
  let out = edit("main.ts", trailing, (sf, t) =>
    ed.addSceneToEngine(sf, t, { key: "b", className: "B", specifier: "./b" })
  );
  assert.match(out, /start: A,\n    b: B,\n/);

  const single = `import { Engine } from "excalibur";
const game = new Engine({ scenes: { start: A } });
`;
  out = edit("main.ts", single, (sf, t) =>
    ed.addSceneToEngine(sf, t, { key: "b", className: "B", specifier: "./b" })
  );
  assert.match(out, /scenes: { start: A, b: B }/);
});

test("addSceneToEngine creates the scenes property when missing", () => {
  const text = `import { Engine } from "excalibur";
const game = new Engine({
  width: 800,
});
`;
  const out = edit("main.ts", text, (sf, t) =>
    ed.addSceneToEngine(sf, t, { key: "start", className: "MyLevel", specifier: "./level" })
  );
  assert.match(out, /width: 800,\n  scenes: { start: MyLevel },\n/);
});

test("addSceneToEngine works on an empty options literal", () => {
  const text = `import { Engine } from "excalibur";
const game = new Engine({});
`;
  const out = edit("main.ts", text, (sf, t) =>
    ed.addSceneToEngine(sf, t, { key: "start", className: "A", specifier: "./a" })
  );
  assert.match(out, /new Engine\({ scenes: { start: A } }\)/);
});

test("addSceneToEngine supports namespace imports without adding excalibur imports", () => {
  const text = `import * as ex from "excalibur";
const game = new ex.Engine({ scenes: {} });
`;
  const out = edit("main.ts", text, (sf, t) =>
    ed.addSceneToEngine(sf, t, { key: "start", className: "A", specifier: "./a" })
  );
  assert.match(out, /scenes: { start: A }/);
  assert.match(out, /import { A } from "\.\/a";/);
});

test("addSceneToEngine rejects duplicates and non-literal seams", () => {
  const dup = `import { Engine } from "excalibur";
const game = new Engine({ scenes: { start: A } });
`;
  const sf1 = ed.parse("main.ts", dup);
  assert.throws(
    () => ed.addSceneToEngine(sf1, dup, { key: "start", className: "B", specifier: "./b" }),
    GenerateError
  );

  const noEngine = `const x = 1;`;
  const sf2 = ed.parse("main.ts", noEngine);
  assert.throws(() => ed.addSceneToEngine(sf2, noEngine, { key: "a", className: "A" }), SeamNotFoundError);

  const optsVar = `import { Engine } from "excalibur";
const opts = { scenes: {} };
const game = new Engine(opts);
`;
  const sf3 = ed.parse("main.ts", optsVar);
  assert.throws(() => ed.addSceneToEngine(sf3, optsVar, { key: "a", className: "A" }), SeamNotFoundError);

  const scenesVar = `import { Engine } from "excalibur";
const map = {};
const game = new Engine({ scenes: map });
`;
  const sf4 = ed.parse("main.ts", scenesVar);
  assert.throws(() => ed.addSceneToEngine(sf4, scenesVar, { key: "a", className: "A" }), SeamNotFoundError);
});

test("addResource inserts into an `as const` Resources literal", () => {
  const text = `import { ImageSource, Loader } from "excalibur";

export const Resources = {
  Sword: new ImageSource("./images/sword.png") // comment survives
} as const;

export const loader = new Loader();
`;
  const out = edit("resources.ts", text, (sf, t) =>
    ed.addResource(sf, t, {
      key: "Jump",
      expr: `new Sound("./sounds/jump.mp3")`,
      excaliburImports: ["Sound"],
    })
  );
  assert.match(out, /Sword: new ImageSource\("\.\/images\/sword\.png"\), \/\/ comment survives\n/);
  assert.match(out, /Jump: new Sound\("\.\/sounds\/jump\.mp3"\)\n} as const;/);
  assert.match(out, /import { ImageSource, Loader, Sound } from "excalibur";/);
});

test("addResource inserts into an empty literal and rejects duplicates", () => {
  const text = `import { Loader } from "excalibur";
export const Resources = {} as const;
export const loader = new Loader();
`;
  const out = edit("resources.ts", text, (sf, t) =>
    ed.addResource(sf, t, { key: "Hero", expr: `new ImageSource("./hero.png")`, excaliburImports: ["ImageSource"] })
  );
  assert.match(out, /export const Resources = { Hero: new ImageSource\("\.\/hero\.png"\) } as const;/);

  const sf = ed.parse("resources.ts", out);
  assert.throws(
    () => ed.addResource(sf, out, { key: "Hero", expr: "x", excaliburImports: [] }),
    GenerateError
  );
});

test("addResource throws SeamNotFoundError without a Resources literal", () => {
  const text = `export const notResources = {};`;
  const sf = ed.parse("resources.ts", text);
  assert.throws(() => ed.addResource(sf, text, { key: "A", expr: "x" }), SeamNotFoundError);
});

test("ensureNamedImport merges, creates, and skips correctly", () => {
  const base = `import { Actor } from "excalibur";\nconst a = 1;\n`;
  const sf = ed.parse("a.ts", base);
  // merge
  let e = ed.ensureNamedImport(sf, base, "excalibur", "Color");
  assert.match(ed.applyEdits(base, [e]), /import { Actor, Color } from "excalibur";/);
  // already there
  assert.equal(ed.ensureNamedImport(sf, base, "excalibur", "Actor"), null);
  // new module → new line after last import
  e = ed.ensureNamedImport(sf, base, "./player", "Player");
  assert.match(ed.applyEdits(base, [e]), /import { Actor } from "excalibur";\nimport { Player } from "\.\/player";\n/);

  // no imports at all
  const bare = `const a = 1;\n`;
  const sfBare = ed.parse("b.ts", bare);
  e = ed.ensureNamedImport(sfBare, bare, "excalibur", "Engine");
  assert.match(ed.applyEdits(bare, [e]), /^import { Engine } from "excalibur";\n\nconst a = 1;/);

  // namespace import covers everything
  const ns = `import * as ex from "excalibur";\n`;
  const sfNs = ed.parse("c.ts", ns);
  assert.equal(ed.ensureNamedImport(sfNs, ns, "excalibur", "Engine"), null);

  // type-only import satisfies
  const typeOnly = `import type { Engine } from "excalibur";\n`;
  const sfT = ed.parse("d.ts", typeOnly);
  assert.equal(ed.ensureNamedImport(sfT, typeOnly, "excalibur", "Engine"), null);

  // multiline import list
  const multi = `import {\n  Actor,\n  Color,\n} from "excalibur";\n`;
  const sfM = ed.parse("e.ts", multi);
  e = ed.ensureNamedImport(sfM, multi, "excalibur", "Engine");
  const outM = ed.applyEdits(multi, [e]);
  assert.match(outM, /Color,\n  Engine,\n} from "excalibur";/);
  assert.equal(ed.validate("e.ts", outM).length, 0);

  // single quotes preserved
  const sq = `import { Actor } from 'excalibur';\n`;
  const sfQ = ed.parse("f.ts", sq);
  e = ed.ensureNamedImport(sfQ, sq, "./level", "MyLevel");
  assert.match(ed.applyEdits(sq, [e]), /import { MyLevel } from '\.\/level';/);
});

test("addToClassMethod appends to a populated onInitialize body", () => {
  const text = `import { Engine, Scene } from "excalibur";
import { Player } from "./player";

export class MyLevel extends Scene {
    override onInitialize(engine: Engine): void {
        const player = new Player();
        this.add(player);
    }
}
`;
  const out = edit("level.ts", text, (sf, t) =>
    ed.addToClassMethod(sf, t, {
      className: "MyLevel",
      methodName: "onInitialize",
      methodSignature: "override onInitialize(engine: Engine): void",
      statements: ["const boss = new Boss();", "this.add(boss);"],
      imports: [{ specifier: "./boss", name: "Boss" }],
      methodImports: [{ specifier: "excalibur", name: "Engine" }],
    })
  );
  assert.match(out, /this\.add\(player\);\n        const boss = new Boss\(\);\n        this\.add\(boss\);\n    }/);
  assert.match(out, /import { Boss } from "\.\/boss";/);
});

test("addToClassMethod expands a single-line empty body", () => {
  const text = `import { Engine, Scene } from "excalibur";

export class MyLevel extends Scene {
  override onInitialize(engine: Engine): void {}
}
`;
  const out = edit("level.ts", text, (sf, t) =>
    ed.addToClassMethod(sf, t, {
      className: "MyLevel",
      methodName: "onInitialize",
      methodSignature: "override onInitialize(engine: Engine): void",
      statements: ["this.add(new Boss());"],
      imports: [{ specifier: "./boss", name: "Boss" }],
    })
  );
  assert.match(out, /override onInitialize\(engine: Engine\): void {\n    this\.add\(new Boss\(\)\);\n  }/);
});

test("addToClassMethod creates the method (and its imports) when missing", () => {
  const text = `import { Scene } from "excalibur";

export class MyLevel extends Scene {
  something = 1;
}
`;
  const out = edit("level.ts", text, (sf, t) =>
    ed.addToClassMethod(sf, t, {
      className: "MyLevel",
      methodName: "onInitialize",
      methodSignature: "override onInitialize(engine: Engine): void",
      statements: ["this.add(new Boss());"],
      imports: [{ specifier: "./boss", name: "Boss" }],
      methodImports: [{ specifier: "excalibur", name: "Engine" }],
    })
  );
  assert.match(out, /override onInitialize\(engine: Engine\): void {\n    this\.add\(new Boss\(\)\);\n  }\n}/);
  assert.match(out, /import { Scene, Engine } from "excalibur";|import { Engine } from "excalibur";/);
  assert.match(out, /import { Boss } from "\.\/boss";/);
});

test("addToClassMethod throws for a missing class", () => {
  const text = `export class Other {}`;
  const sf = ed.parse("x.ts", text);
  assert.throws(
    () =>
      ed.addToClassMethod(sf, text, {
        className: "Nope",
        methodName: "onInitialize",
        methodSignature: "x",
        statements: [],
      }),
    SeamNotFoundError
  );
});

test("replaceInitializer and removeObjectProperty (engine modify-in-place)", () => {
  const text = `import { Engine } from "excalibur";
const game = new Engine({
  width: 800,
  height: 600,
  pixelArt: false,
});
`;
  const sf = ed.parse("main.ts", text);
  const engine = ed.findEngineNews(sf)[0];
  const lit = ed.engineOptionsLiteral(sf, engine);
  const edits = [
    ed.replaceInitializer(sf, text, lit, "pixelArt", "true"),
    ed.removeObjectProperty(sf, text, lit, "height"),
    ...ed.insertObjectProperty(sf, text, lit, "suppressPlayButton: true"),
  ];
  const out = ed.applyEdits(text, edits);
  assert.equal(ed.validate("main.ts", out).length, 0, out);
  assert.match(out, /pixelArt: true,\n  suppressPlayButton: true,\n/);
  assert.doesNotMatch(out, /height/);
});

test("findSceneClasses finds named and namespace-extended scenes", () => {
  const named = `import { Scene } from "excalibur";
export class A extends Scene {}
export class NotAScene {}
`;
  assert.deepEqual(
    ed.findSceneClasses(ed.parse("a.ts", named)).map((s) => s.className),
    ["A"]
  );
  const ns = `import * as ex from "excalibur";
export class B extends ex.Scene {}
`;
  assert.deepEqual(
    ed.findSceneClasses(ed.parse("b.ts", ns)).map((s) => s.className),
    ["B"]
  );
});

test("applyEdits rejects overlapping edits", () => {
  assert.throws(() => ed.applyEdits("abcdef", [
    { start: 1, end: 4, text: "x" },
    { start: 2, end: 5, text: "y" },
  ]));
});
