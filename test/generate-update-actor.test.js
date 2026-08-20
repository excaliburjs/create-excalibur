import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { applyUpdateActor } from "../src/generate/apply.js";
import { parsesCleanly, read, ts, withViteProject } from "./generate-helpers.js";
import { callTool } from "../src/mcp/registry.js";

test("applyUpdateActor replaces existing options and inserts new ones", async () => {
  await withViteProject(async ({ dir, project }) => {
    const actor = project.actors[0];
    const report = await applyUpdateActor(
      {
        kind: "update-actor",
        actor,
        options: { pos: { x: 10, y: 20 }, color: "Red", collisionType: "Fixed" },
        remove: [],
      },
      project,
      {}
    );
    assert.equal(report.manual.length, 0);
    assert.equal(report.modified[0].path, "src/player.ts");
    const player = read(dir, "src/player.ts");
    assert.ok(player.includes("pos: vec(10, 20),"), "existing pos replaced");
    assert.ok(!player.includes("vec(150, 150)"));
    assert.ok(player.includes("color: Color.Red,"), "new option inserted");
    assert.ok(player.includes("collisionType: CollisionType.Fixed,"));
    assert.match(player, /import \{ [^}]*CollisionType[^}]*\} from "excalibur";/);
    assert.match(player, /import \{ [^}]*Color[^}]*\} from "excalibur";/);
    assert.ok(parsesCleanly(player, "player.ts"));
  });
});

test("applyUpdateActor removes options (switching box → circle)", async () => {
  await withViteProject(async ({ dir, project }) => {
    const actor = project.actors[0];
    const report = await applyUpdateActor(
      { kind: "update-actor", actor, options: { radius: 42 }, remove: ["width", "height"] },
      project,
      {}
    );
    assert.equal(report.manual.length, 0);
    const player = read(dir, "src/player.ts");
    assert.ok(player.includes("radius: 42,"));
    assert.ok(!player.includes("width: 100"));
    assert.ok(!player.includes("height: 100"));
    assert.ok(parsesCleanly(player, "player.ts"));
  });
});

test("applyUpdateActor degrades to a manual snippet when super() has no literal", async () => {
  await withViteProject(async ({ dir, project }) => {
    const enemyFile = path.join(dir, "src", "enemy.ts");
    const original = `import { Actor } from "excalibur";

export class Enemy extends Actor {
  constructor() {
    super();
  }
}
`;
    fs.writeFileSync(enemyFile, original);
    const report = await applyUpdateActor(
      { kind: "update-actor", actor: { className: "Enemy", file: enemyFile }, options: { z: 5 }, remove: [] },
      project,
      {}
    );
    assert.equal(report.modified.length, 0);
    assert.equal(report.manual.length, 1);
    assert.ok(report.manual[0].snippet.includes("z: 5,"));
    assert.equal(read(dir, "src/enemy.ts"), original, "file untouched");
  });
});

test("update_actor MCP tool edits ActorArgs and validates its input", async () => {
  await withViteProject(async ({ dir }) => {
    const result = await callTool(
      "update_actor",
      { actor: "player", options: { anchor: "topLeft", z: 3 } },
      { defaultProjectDir: dir, ts }
    );
    assert.ok(!result.isError, result.content?.[0]?.text);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.modified[0].snippet, "anchor, z");
    const player = read(dir, "src/player.ts");
    assert.ok(player.includes("anchor: vec(0, 0),"));
    assert.ok(player.includes("z: 3,"));
    assert.ok(parsesCleanly(player, "player.ts"));

    const empty = await callTool("update_actor", { actor: "player" }, { defaultProjectDir: dir, ts });
    assert.equal(empty.isError, true);
    assert.match(empty.content[0].text, /nothing to change/);

    const miss = await callTool(
      "update_actor",
      { actor: "Ghost", options: { z: 1 } },
      { defaultProjectDir: dir, ts }
    );
    assert.equal(miss.isError, true);
    assert.match(miss.content[0].text, /available actors: Player/);
  });
});
