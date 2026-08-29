import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { bumpExcaliburDep } from "../src/upgrade/package-json.js";
import { withTempDirAsync } from "./helpers.js";

test("bumpExcaliburDep rewrites dependencies.excalibur, preserving formatting", async () => {
  await withTempDirAsync(async (dir) => {
    const before = `{
  "name": "game",
  "dependencies": {
    "excalibur": "0.29.3"
  }
}
`;
    fs.writeFileSync(path.join(dir, "package.json"), before);
    const bumped = await bumpExcaliburDep(dir, "next");
    assert.equal(bumped, true);
    assert.equal(
      fs.readFileSync(path.join(dir, "package.json"), "utf8"),
      before.replace('"excalibur": "0.29.3"', '"excalibur": "next"')
    );
  });
});

test("bumpExcaliburDep does not touch an `overrides` block, even when it's serialized before `dependencies`", async () => {
  await withTempDirAsync(async (dir) => {
    const before = `{
  "name": "game",
  "overrides": {
    "excalibur": "0.29.3"
  },
  "dependencies": {
    "excalibur": "0.29.3",
    "lodash": "^4.0.0"
  }
}
`;
    fs.writeFileSync(path.join(dir, "package.json"), before);
    const bumped = await bumpExcaliburDep(dir, "next");
    assert.equal(bumped, true);
    const after = fs.readFileSync(path.join(dir, "package.json"), "utf8");
    const pkg = JSON.parse(after);
    assert.equal(pkg.overrides.excalibur, "0.29.3", "overrides pin must be left alone");
    assert.equal(pkg.dependencies.excalibur, "next", "dependencies must be the one bumped");
  });
});

test("bumpExcaliburDep returns false when excalibur isn't in dependencies/devDependencies at all", async () => {
  await withTempDirAsync(async (dir) => {
    const before = `{
  "name": "game",
  "peerDependencies": {
    "excalibur": "0.29.3"
  }
}
`;
    fs.writeFileSync(path.join(dir, "package.json"), before);
    const bumped = await bumpExcaliburDep(dir, "next");
    assert.equal(bumped, false);
    assert.equal(fs.readFileSync(path.join(dir, "package.json"), "utf8"), before, "file left untouched");
  });
});

test("bumpExcaliburDep prefers devDependencies when excalibur only lives there", async () => {
  await withTempDirAsync(async (dir) => {
    const before = `{
  "name": "game",
  "devDependencies": {
    "excalibur": "0.29.3"
  }
}
`;
    fs.writeFileSync(path.join(dir, "package.json"), before);
    const bumped = await bumpExcaliburDep(dir, "next");
    assert.equal(bumped, true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).devDependencies.excalibur, "next");
  });
});
