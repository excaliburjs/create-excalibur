import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { detectExcaliburVersion, refForVersion } from "../src/docs/version.ts";
import { withTempDir } from "./helpers.ts";

test("detects the installed excalibur version from node_modules first", () => {
  withTempDir((dir: string) => {
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ dependencies: { excalibur: "^0.32.0" } }));
    fs.mkdirSync(path.join(dir, "node_modules", "excalibur"), { recursive: true });
    fs.writeFileSync(path.join(dir, "node_modules", "excalibur", "package.json"), JSON.stringify({ version: "0.32.1" }));
    fs.mkdirSync(path.join(dir, "src", "deep"), { recursive: true });
    const v = detectExcaliburVersion(path.join(dir, "src", "deep"));
    assert.deepEqual(v, { version: "0.32.1", source: "node_modules" });
    assert.equal(refForVersion(v.version), "v0.32.1");
  });
});

test("falls back to the declared dependency when it is an exact version", () => {
  withTempDir((dir: string) => {
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ devDependencies: { excalibur: "~0.33.0-alpha.195" } }));
    const v = detectExcaliburVersion(dir);
    assert.equal(v.version, "0.33.0-alpha.195");
    assert.equal(v.source, "package.json");
  });
});

test("unresolvable ranges and missing projects map to main", () => {
  withTempDir((dir: string) => {
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ dependencies: { excalibur: "next" } }));
    const v = detectExcaliburVersion(dir);
    assert.equal(v.version, null);
    assert.equal(v.range, "next");
    assert.equal(refForVersion(v.version), "main");
  });
  withTempDir((dir: string) => {
    assert.equal(detectExcaliburVersion(dir).source, null);
  });
});
