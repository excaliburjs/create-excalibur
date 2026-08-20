import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { callTool, listTools } from "../src/mcp/registry.js";
import { scaffoldProject, ScaffoldError } from "../src/create/scaffold.js";
import { HIGHLIGHT_POST, HIGHLIGHT_PRE } from "../src/docs/algolia.js";
import { manifestPath, writeCachedFile, writeJsonAtomic } from "../src/docs/cache.js";
import { buildPageList } from "../src/docs/fetch-docs.js";
import { buildIndex, saveIndex } from "../src/docs/local-index.js";
import { withViteProject, ts, read, parsesCleanly } from "./generate-helpers.js";
import { FIXTURES, readFixture, withTempHome, withTempDirAsync } from "./helpers.js";

function payload(result) {
  assert.ok(!result.isError, `unexpected tool error: ${result.content?.[0]?.text}`);
  return JSON.parse(result.content[0].text);
}

function errorText(result) {
  assert.equal(result.isError, true, "expected an isError result");
  return result.content[0].text;
}

test("listTools exposes 12 well-formed tools", () => {
  const tools = listTools();
  assert.equal(tools.length, 12);
  for (const tool of tools) {
    assert.ok(tool.name && tool.description, tool.name);
    assert.equal(tool.inputSchema.type, "object");
    assert.ok(!("handler" in tool), "handler must not leak into tools/list");
  }
  assert.equal(new Set(tools.map((t) => t.name)).size, 12);
});

test("unknown tool name throws (protocol error, not isError)", async () => {
  await assert.rejects(() => callTool("nope", {}, { defaultProjectDir: "." }), /Unknown tool: nope/);
});

// --- generate tools ------------------------------------------------------

test("analyze_project reports scenes and resources without leaking ts", async () => {
  await withViteProject(async ({ dir }) => {
    const result = await callTool("analyze_project", {}, { defaultProjectDir: dir, ts });
    const info = payload(result);
    assert.equal(info.projectDir, dir);
    assert.equal(info.mainFile, "src/main.ts");
    assert.deepEqual(info.resourceKeys, ["Sword"]);
    assert.deepEqual(info.scenes.map((s) => [s.className, s.key]), [["MyLevel", "start"]]);
    assert.ok(!("ts" in info));
    assert.ok(!result.content[0].text.includes("createSourceFile"));
  });
});

test("generate_actor dryRun previews without writing", async () => {
  await withViteProject(async ({ dir }) => {
    const result = await callTool(
      "generate_actor",
      { name: "Big Boss", dryRun: true },
      { defaultProjectDir: dir, ts }
    );
    const report = payload(result);
    assert.equal(report.dryRun, true);
    assert.deepEqual(report.created, ["src/big-boss.ts"]);
    assert.ok(!fs.existsSync(path.join(dir, "src/big-boss.ts")));
  });
});

test("generate_actor writes a parsing actor wired into a scene", async () => {
  await withViteProject(async ({ dir }) => {
    const result = await callTool(
      "generate_actor",
      {
        name: "Goblin",
        scene: "MyLevel",
        collider: { type: "circle", radius: 12 },
        graphic: { type: "sprite", resourceKey: "Sword" },
        collisionType: "Fixed",
        pos: { x: 10, y: 20 },
      },
      { defaultProjectDir: dir, ts }
    );
    const report = payload(result);
    assert.deepEqual(report.created, ["src/goblin.ts"]);
    const text = read(dir, "src/goblin.ts");
    assert.ok(parsesCleanly(text));
    assert.match(text, /class Goblin extends Actor/);
    assert.match(text, /radius: 12/);
    assert.match(text, /Resources\.Sword/);
    assert.match(text, /CollisionType\.Fixed/);
    assert.ok(read(dir, "src/level.ts").includes("Goblin"), "scene wiring");
  });
});

test("generate_actor rejects an unknown sprite resource with available keys", async () => {
  await withViteProject(async ({ dir }) => {
    const result = await callTool(
      "generate_actor",
      { name: "Ghost", graphic: { type: "sprite", resourceKey: "Nope" } },
      { defaultProjectDir: dir, ts }
    );
    const text = errorText(result);
    assert.match(text, /"Nope" not found/);
    assert.match(text, /Sword/);
  });
});

test("generate_actor rejects an invalid name with the hint", async () => {
  await withViteProject(async ({ dir }) => {
    const text = errorText(await callTool("generate_actor", { name: "123" }, { defaultProjectDir: dir, ts }));
    assert.match(text, /invalid Actor name/i);
    assert.match(text, /Hint:/);
  });
});

test("generate tools reject an unknown scene listing the available ones", async () => {
  await withViteProject(async ({ dir }) => {
    const text = errorText(
      await callTool("generate_label", { name: "Score", scene: "Nope" }, { defaultProjectDir: dir, ts })
    );
    assert.match(text, /no scene matching "Nope"/);
    assert.match(text, /MyLevel/);
  });
});

test("generate_label writes with font and pos", async () => {
  await withViteProject(async ({ dir }) => {
    const report = payload(
      await callTool(
        "generate_label",
        { name: "Score", text: "Score: 0", font: { size: 32, bold: true }, pos: { x: 4, y: 8 } },
        { defaultProjectDir: dir, ts }
      )
    );
    assert.deepEqual(report.created, ["src/score.ts"]);
    const text = read(dir, "src/score.ts");
    assert.ok(parsesCleanly(text));
    assert.match(text, /Score: 0/);
    assert.match(text, /size: 32/);
  });
});

test("generate_scene registers with a derived key and rejects taken keys", async () => {
  await withViteProject(async ({ dir }) => {
    const report = payload(
      await callTool("generate_scene", { name: "Level Two" }, { defaultProjectDir: dir, ts })
    );
    assert.deepEqual(report.created, ["src/level-two.ts"]);
    assert.ok(read(dir, "src/main.ts").includes("levelTwo"), "registered in scenes map");

    const taken = errorText(
      await callTool("generate_scene", { name: "Other", key: "start" }, { defaultProjectDir: dir, ts })
    );
    assert.match(taken, /"start" is already registered/);
  });
});

test("generate_resource derives the key, warns on missing files, rejects duplicates", async () => {
  await withViteProject(async ({ dir }) => {
    const report = payload(
      await callTool(
        "generate_resource",
        { type: "image", assetPath: "./images/hero-sprite.png" },
        { defaultProjectDir: dir, ts }
      )
    );
    assert.ok(read(dir, "src/resources.ts").includes("HeroSprite"), "derived PascalCase key");
    assert.ok(report.warnings.some((w) => w.includes("not found under")), "missing-file warning");

    const dup = errorText(
      await callTool(
        "generate_resource",
        { type: "image", assetPath: "./images/sword.png" },
        { defaultProjectDir: dir, ts }
      )
    );
    assert.match(dup, /"Sword" already exists/);
  });
});

test("generate_resource scene target loads via onPreLoad, not Resources", async () => {
  await withViteProject(async ({ dir }) => {
    payload(
      await callTool(
        "generate_resource",
        { type: "sound", assetPath: "./sounds/hit.mp3", scene: "MyLevel" },
        { defaultProjectDir: dir, ts }
      )
    );
    const level = read(dir, "src/level.ts");
    assert.match(level, /const hit = new Sound\("\.\/sounds\/hit\.mp3"\)/);
    assert.match(level, /loader\.addResource\(hit\)/);
    assert.ok(!read(dir, "src/resources.ts").includes("hit.mp3"), "Resources untouched for scene-scoped");
  });
});

test("update_engine patches options and removes others", async () => {
  await withViteProject(async ({ dir }) => {
    const report = payload(
      await callTool(
        "update_engine",
        { options: { backgroundColor: "Black", antialiasing: false }, remove: ["pixelArt"], dryRun: false },
        { defaultProjectDir: dir, ts }
      )
    );
    assert.equal(report.modified.length > 0, true);
    const main = read(dir, "src/main.ts");
    assert.ok(parsesCleanly(main));
    assert.match(main, /backgroundColor: Color\.Black/);
    assert.match(main, /antialiasing: false/);
    assert.ok(!/pixelArt:\s*(true|false)/.test(main), "pixelArt option removed (its comment may remain)");
  });
});

test("update_engine with nothing to change is an isError", async () => {
  await withViteProject(async ({ dir }) => {
    const text = errorText(await callTool("update_engine", {}, { defaultProjectDir: dir, ts }));
    assert.match(text, /nothing to change/);
  });
});

test("generate tools surface analyzeProject failures as isError with hints", async () => {
  await withTempDirAsync(async (dir) => {
    const text = errorText(await callTool("analyze_project", {}, { defaultProjectDir: dir }));
    assert.match(text, /no package\.json/);
  });
});

// --- docs tools -----------------------------------------------------------

async function seedDocsCache(ref) {
  const files = [
    { path: "02-fundamentals/03-actors.mdx", sha: "1", size: 1 },
    { path: "02-fundamentals/examples/basic-actors.ts", sha: "2", size: 1 },
    { path: "00-welcome.mdx", sha: "3", size: 1 },
  ];
  for (const f of files) await writeCachedFile(ref, f.path, readFixture(`docs/${f.path}`));
  const pages = buildPageList(ref, files);
  await saveIndex(ref, buildIndex(ref, pages));
  await writeJsonAtomic(manifestPath(ref), { ref, syncedAt: 0, files: files.length });
}

test("docs_search offline returns plain-snippet hits from the local index", async () => {
  await withTempHome(async () => {
    const ref = "test-ref";
    await seedDocsCache(ref);
    const result = payload(
      await callTool("docs_search", { query: "custom actors", offline: true, ref }, { defaultProjectDir: "." })
    );
    assert.equal(result.source, "local");
    assert.equal(result.ref, ref);
    assert.ok(result.hits.length > 0);
    assert.equal(result.hits[0].slug, "/actors");
    assert.ok(!result.hits[0].snippet.includes(HIGHLIGHT_PRE) && !result.hits[0].snippet.includes(HIGHLIGHT_POST), "no highlight sentinels");
  });
});

test("docs_search offline without a cache points at docs_sync", async () => {
  await withTempHome(async () => {
    const text = errorText(
      await callTool("docs_search", { query: "actors", offline: true, ref: "v9.9.9" }, { defaultProjectDir: "." })
    );
    assert.match(text, /No offline docs/);
    assert.match(text, /docs_sync/);
  });
});

test("docs_get_page returns markdown with a metadata preamble", async () => {
  await withTempHome(async () => {
    const ref = "test-ref";
    await seedDocsCache(ref);
    const result = await callTool(
      "docs_get_page",
      { path: "02-fundamentals/03-actors.mdx", ref },
      { defaultProjectDir: "." }
    );
    assert.ok(!result.isError, result.content[0].text);
    const text = result.content[0].text;
    assert.match(text, /^Title: Actors\n/);
    assert.match(text, /URL: https:\/\/excaliburjs\.com\/docs\/actors/);
    assert.match(text, /Section: full page/);
    assert.match(text, /# /);
  });
});

test("docs_get_page needs exactly one of slug or path", async () => {
  const text = errorText(await callTool("docs_get_page", { ref: "main" }, { defaultProjectDir: "." }));
  assert.match(text, /exactly one of slug or path/);
});

// --- create tools ---------------------------------------------------------

test("list_templates returns unique deduped ids", async () => {
  const result = payload(await callTool("list_templates", {}, { defaultProjectDir: "." }));
  const ids = [...result.templates, ...result.samples].map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate template/sample ids");
  assert.ok(ids.includes("typescript_vite"));
  assert.ok(result.templates.every((t) => t.repo?.startsWith("https://")));
});

test("create_project rejects an unknown template id via the enum", async () => {
  const text = errorText(
    await callTool("create_project", { name: "game", template: "nope" }, { defaultProjectDir: "." })
  );
  assert.match(text, /Invalid arguments for create_project/);
  assert.match(text, /template must be one of/);
});

test("scaffoldProject clones, cleans, and reports (injected clone)", async () => {
  await withTempDirAsync(async (dir) => {
    const template = { value: "typescript_vite", repo: "https://example.invalid/tpl.git", startCommand: "npm run dev" };
    const clone = async (_repo, target) => {
      fs.cpSync(path.join(FIXTURES, "generate", "vite-project"), target, { recursive: true });
      fs.mkdirSync(path.join(target, ".git"), { recursive: true });
    };
    const result = await scaffoldProject({ name: "My Cool Game!", template, cwd: dir, clone });
    assert.equal(result.projectName, "my-cool-game");
    assert.equal(result.projectDir, path.join(dir, "my-cool-game"));
    assert.equal(result.installed, false);
    assert.equal(result.gitInitialized, false);
    assert.equal(result.startCommand, "npm run dev");
    assert.ok(!fs.existsSync(path.join(result.projectDir, ".git")), "template .git removed");
    const pkg = JSON.parse(read(dir, "my-cool-game/package.json"));
    assert.equal(pkg.name, "my-cool-game");

    await assert.rejects(
      () => scaffoldProject({ name: "My Cool Game!", template, cwd: dir, clone }),
      (e) => e instanceof ScaffoldError && /already exists/.test(e.message)
    );
  });
});

test("scaffoldProject rejects unusable names and failed clones", async () => {
  await withTempDirAsync(async (dir) => {
    const template = { value: "t", repo: "https://example.invalid/tpl.git" };
    await assert.rejects(
      () => scaffoldProject({ name: "!!!", template, cwd: dir }),
      (e) => e instanceof ScaffoldError && /does not slugify/.test(e.message)
    );
    await assert.rejects(
      () => scaffoldProject({ name: "ok", template, cwd: dir, clone: async () => { throw new Error("boom"); } }),
      (e) => e instanceof ScaffoldError && /cloning .* failed: boom/.test(e.message)
    );
  });
});
