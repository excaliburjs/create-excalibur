import { test } from "node:test";
import assert from "node:assert/strict";
import { toPascalCase, toCamelCase, toKebabCase, isValidIdentifier } from "../src/generate/names.ts";

test("toPascalCase handles common shapes", () => {
  assert.equal(toPascalCase("big boss"), "BigBoss");
  assert.equal(toPascalCase("big-boss"), "BigBoss");
  assert.equal(toPascalCase("big_boss"), "BigBoss");
  assert.equal(toPascalCase("bigBoss"), "BigBoss");
  assert.equal(toPascalCase("BigBoss"), "BigBoss");
  assert.equal(toPascalCase("HTTPServer"), "HttpServer");
  assert.equal(toPascalCase("level2"), "Level2");
  assert.equal(toPascalCase("player"), "Player");
});

test("toKebabCase handles common shapes", () => {
  assert.equal(toKebabCase("BigBoss"), "big-boss");
  assert.equal(toKebabCase("bigBoss"), "big-boss");
  assert.equal(toKebabCase("big boss"), "big-boss");
  assert.equal(toKebabCase("already-kebab"), "already-kebab");
  assert.equal(toKebabCase("snake_case"), "snake-case");
  assert.equal(toKebabCase("Player"), "player");
  assert.equal(toKebabCase("Level2"), "level2");
});

test("toCamelCase", () => {
  assert.equal(toCamelCase("BigBoss"), "bigBoss");
  assert.equal(toCamelCase("my level"), "myLevel");
});

test("isValidIdentifier", () => {
  assert.equal(isValidIdentifier("BigBoss"), true);
  assert.equal(isValidIdentifier("_x1"), true);
  assert.equal(isValidIdentifier("2fast"), false);
  assert.equal(isValidIdentifier("class"), false);
  assert.equal(isValidIdentifier("has space"), false);
  assert.equal(isValidIdentifier(""), false);
});
