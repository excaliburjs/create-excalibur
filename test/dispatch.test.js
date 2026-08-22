import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveInvocation } from "../src/dispatch.js";

const asCreate = (argv) => resolveInvocation({ binName: "create-excalibur", argv });
const asEx = (argv) => resolveInvocation({ binName: "ex", argv });

test("npm-create persona treats a positional as the project name", () => {
  assert.deepEqual(asCreate(["my-game"]), { kind: "create", name: "my-game" });
  // npm splits unquoted words into separate argv entries
  assert.deepEqual(asCreate(["My", "Game"]), { kind: "create", name: "My Game" });
  // flags mixed in are not part of the name
  assert.deepEqual(asCreate(["my-game", "--yes"]), { kind: "create", name: "my-game" });
  // direct `node index.js my-game` (dev) gets the same forgiving behavior
  assert.equal(resolveInvocation({ binName: "index.js", argv: ["my-game"] }).kind, "create");
});

test("ex/excalibur personas keep the strict unknown-command error", () => {
  assert.deepEqual(asEx(["my-game"]), { kind: "unknown", command: "my-game" });
  assert.deepEqual(resolveInvocation({ binName: "excalibur", argv: ["generte"] }), {
    kind: "unknown",
    command: "generte",
  });
});

test("known commands win over the create-name fallback in every persona", () => {
  assert.deepEqual(asCreate(["docs", "--help"]), { kind: "flow", flow: "docs", rest: ["--help"] });
  assert.deepEqual(asEx(["g", "actor", "Player"]), { kind: "flow", flow: "g", rest: ["actor", "Player"] });
  assert.deepEqual(asEx(["mcp"]), { kind: "flow", flow: "mcp", rest: [] });
});

test("prototype members are not commands (Object.hasOwn guard)", () => {
  for (const name of ["toString", "constructor", "hasOwnProperty", "__proto__"]) {
    assert.deepEqual(asEx([name]), { kind: "unknown", command: name }, name);
    assert.equal(asCreate([name]).kind, "create", name);
  }
});

test("help flags and bare/flag-only invocations", () => {
  for (const argv of [["--help"], ["-h"], ["help"]]) {
    assert.deepEqual(asEx(argv), { kind: "help" });
    assert.deepEqual(asCreate(argv), { kind: "help" });
  }
  assert.deepEqual(asEx([]), { kind: "menu" });
  // leading flag → menu; leftover argv must NOT leak into the chosen flow
  assert.deepEqual(asEx(["-q", "something"]), { kind: "menu" });
});
