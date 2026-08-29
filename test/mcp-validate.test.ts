import { test } from "node:test";
import assert from "node:assert/strict";
import { validateArgs } from "../src/mcp/validate.ts";
import type { JsonSchema } from "../src/mcp/types.ts";

const SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    limit: { type: "integer", minimum: 1, maximum: 25 },
    ratio: { type: "number" },
    dryRun: { type: "boolean" },
    kind: { type: "string", enum: ["docs", "api"] },
    tags: { type: "array", items: { type: "string" } },
    pos: {
      type: "object",
      properties: { x: { type: "number" }, y: { type: "number" } },
      required: ["x", "y"],
    },
  },
  required: ["name"],
};

test("valid args pass", () => {
  assert.deepEqual(
    validateArgs({ name: "a", limit: 5, dryRun: true, kind: "docs", tags: ["x"], pos: { x: 1, y: 2 } }, SCHEMA),
    []
  );
});

test("missing required field is reported", () => {
  const issues = validateArgs({}, SCHEMA);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /name is required/);
});

test("unknown keys are rejected with the allowed list", () => {
  const issues = validateArgs({ name: "a", nope: 1 }, SCHEMA);
  assert.match(issues[0], /unknown argument nope/);
  assert.match(issues[0], /allowed: name, limit/);
});

test("type mismatches are reported with paths", () => {
  const issues = validateArgs({ name: 5, pos: { x: "a", y: 2 } }, SCHEMA);
  assert.ok(issues.some((i) => i.includes("name must be a string")));
  assert.ok(issues.some((i) => i.includes("pos.x must be a number")));
});

test("enum violations name the options", () => {
  const issues = validateArgs({ name: "a", kind: "nope" }, SCHEMA);
  assert.match(issues[0], /kind must be one of: docs, api/);
});

test("integer bounds and integrality", () => {
  assert.match(validateArgs({ name: "a", limit: 0 }, SCHEMA)[0], /limit must be >= 1/);
  assert.match(validateArgs({ name: "a", limit: 26 }, SCHEMA)[0], /limit must be <= 25/);
  assert.match(validateArgs({ name: "a", limit: 1.5 }, SCHEMA)[0], /limit must be an integer/);
});

test("array items are validated", () => {
  const issues = validateArgs({ name: "a", tags: ["ok", 3] }, SCHEMA);
  assert.match(issues[0], /tags\[1\] must be a string/);
});

test("nested required fields", () => {
  const issues = validateArgs({ name: "a", pos: { x: 1 } }, SCHEMA);
  assert.match(issues[0], /pos\.y is required/);
});

test("string booleans and numbers are coerced in place", () => {
  const args = { name: "a", dryRun: "true", limit: "10", ratio: "1.5" };
  assert.deepEqual(validateArgs(args, SCHEMA), []);
  assert.equal(args.dryRun, true);
  assert.equal(args.limit, 10);
  assert.equal(args.ratio, 1.5);
});

test("undefined optional values are ignored", () => {
  assert.deepEqual(validateArgs({ name: "a", limit: undefined }, SCHEMA), []);
});
