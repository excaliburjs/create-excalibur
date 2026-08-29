import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveInvocation } from "../src/dispatch.ts";
import { QUIET_FLOWS } from "../src/constants.ts";

const asCreate = (argv: string[]) => resolveInvocation({ binName: "create-excalibur", argv });
const asEx = (argv: string[]) => resolveInvocation({ binName: "ex", argv });

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

test("doctor dispatches as a flow with its argv", () => {
  assert.deepEqual(asEx(["doctor", "--json"]), { kind: "flow", flow: "doctor", rest: ["--json"] });
  assert.deepEqual(asCreate(["doctor"]), { kind: "flow", flow: "doctor", rest: [] });
});

test("upgrade dispatches as a flow with its argv (and the up alias)", () => {
  assert.deepEqual(asEx(["upgrade", "--dry-run"]), { kind: "flow", flow: "upgrade", rest: ["--dry-run"] });
  assert.deepEqual(asEx(["up", "--to", "next"]), { kind: "flow", flow: "up", rest: ["--to", "next"] });
});

test("the intro-banner carve-out (QUIET_FLOWS) covers every alias, not just canonical names", () => {
  // index.js does `if (!QUIET_FLOWS.has(flow))` against resolveInvocation's raw
  // flow token — an alias missing from QUIET_FLOWS (e.g. "up") would print the
  // banner before --json output, breaking the clean-stdout contract.
  for (const command of ["docs", "mcp", "doctor", "upgrade", "up"]) {
    const invocation = asEx([command]);
    assert.equal(invocation.kind, "flow");
    const flow = (invocation as { kind: "flow"; flow: string }).flow;
    assert.ok(QUIET_FLOWS.has(flow as never), `QUIET_FLOWS must contain "${flow}" (dispatched from "${command}")`);
  }
});
