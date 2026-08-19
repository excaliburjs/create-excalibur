import { test } from "node:test";
import assert from "node:assert/strict";
import { filterDocsTree, rawUrl } from "../src/docs/fetch-docs.js";

test("filterDocsTree keeps text docs files under site/docs and drops media", () => {
  const tree = [
    { path: "site/docs/02-fundamentals/03-actors.mdx", type: "blob", sha: "a", size: 10 },
    { path: "site/docs/02-fundamentals/examples/basic-actors.ts", type: "blob", sha: "b", size: 10 },
    { path: "site/docs/00-tutorials/_category_.json", type: "blob", sha: "c", size: 10 },
    { path: "site/docs/isometric/axis.png", type: "blob", sha: "d", size: 10 },
    { path: "site/docs/00-tutorials/Excalibird/sounds/flap.wav", type: "blob", sha: "e", size: 10 },
    { path: "site/docs/02-fundamentals", type: "tree", sha: "f" },
    { path: "site/src/pages/index.tsx", type: "blob", sha: "g", size: 10 },
    { path: "src/engine/Actor.ts", type: "blob", sha: "h", size: 10 },
  ];
  const files = filterDocsTree(tree).map((f) => f.path);
  assert.deepEqual(files, ["02-fundamentals/03-actors.mdx", "02-fundamentals/examples/basic-actors.ts", "00-tutorials/_category_.json"]);
});

test("rawUrl encodes path segments with spaces and apostrophes", () => {
  assert.equal(
    rawUrl("abc123", "00-tutorials/How-to's/03-Colliders Primer/01-colliders-and-shapes.mdx"),
    "https://raw.githubusercontent.com/excaliburjs/Excalibur/abc123/site/docs/00-tutorials/How-to's/03-Colliders%20Primer/01-colliders-and-shapes.mdx"
  );
});
