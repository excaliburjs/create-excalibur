import { test } from "node:test";
import assert from "node:assert/strict";
import {
  apiLinkFor,
  docsUrlForSlug,
  extractSection,
  parseFrontmatter,
  slugFromPath,
  slugifyHeading,
  splitSections,
  toMarkdown,
} from "../src/docs/mdx.ts";
import { readFixture } from "./helpers.ts";

const actors = readFixture("docs/02-fundamentals/03-actors.mdx");
const example = readFixture("docs/02-fundamentals/examples/basic-actors.ts");

test("parseFrontmatter reads slug and falls back to the first heading for the title", () => {
  const fm = parseFrontmatter(actors);
  assert.equal(fm.slug, "/actors");
  assert.equal(fm.title, "Actors");
  assert.ok(fm.body.startsWith("import BasicActorExample"));
});

test("parseFrontmatter handles title/section and the root slug", () => {
  const fm = parseFrontmatter("---\ntitle: Engine Fundamentals\nslug: /engine\nsection: Fundamentals\n---\n\nbody");
  assert.deepEqual([fm.title, fm.slug, fm.section, fm.body.trim()], ["Engine Fundamentals", "/engine", "Fundamentals", "body"]);
  assert.equal(parseFrontmatter(readFixture("docs/00-welcome.mdx")).slug, "/");
  assert.equal(docsUrlForSlug("/"), "https://excaliburjs.com/docs/");
  assert.equal(docsUrlForSlug("/actors"), "https://excaliburjs.com/docs/actors");
});

test("slugFromPath strips Docusaurus number prefixes", () => {
  assert.equal(slugFromPath("02-fundamentals/03-actors.mdx"), "/fundamentals/actors");
  assert.equal(slugFromPath("101-style-guide.mdx"), "/style-guide");
});

test("toMarkdown rewrites MDX constructs into plain markdown", () => {
  const { body } = parseFrontmatter(actors);
  const md = toMarkdown(body, {
    docRelPath: "02-fundamentals/03-actors.mdx",
    resolveImport: (rel) => (rel === "./examples/basic-actors.ts" ? example : null),
  });

  // imports dropped, raw-loader example inlined in place of <PlaygroundEmbed>
  assert.doesNotMatch(md, /raw-loader/);
  assert.doesNotMatch(md, /^import BasicActorExample/m);
  assert.doesNotMatch(md, /<PlaygroundEmbed/);
  assert.match(md, /\*\*▶ Basic actors\*\*\n\n```ts\nimport \* as ex from 'excalibur';/);

  // wiki links → markdown links
  assert.match(md, /\[Actors\]\(https:\/\/excaliburjs\.com\/search\/\?q=Actor\)/);
  assert.match(md, /\[game\.add\]\(https:\/\/excaliburjs\.com\/search\/\?q=Engine\.add\)/);
  assert.doesNotMatch(md, /\[\[/);

  // admonitions → blockquotes with a label
  assert.match(md, /> \*\*⚠ Warning\*\*/);
  assert.match(md, /> \*\*ℹ Note\*\*\n>\n> Text inside a note/);
  assert.doesNotMatch(md, /^:::/m);

  // twoslash include fence removed, `ts twoslash` → `ts`, directives stripped
  assert.doesNotMatch(md, /twoslash/);
  assert.doesNotMatch(md, /@include/);
  assert.match(md, /```ts\nconst player = new ex\.Actor\(\);\n```/);

  // relative site links absolutized, iframe → note
  assert.match(md, /\[here\]\(https:\/\/excaliburjs\.com\/docs\/entities\)/);
  assert.match(md, /> ▶ Live example: https:\/\/excaliburjs\.com\/excalibur-snippets\/actor\//);
});

test("toMarkdown uses the symbol map for API links when available", () => {
  const symbols = { Actor: "https://excaliburjs.com/api/class/Actor/" };
  const md = toMarkdown("See [[Actor.pos|position]] and [[Actor]] and [[Unknown]].", { symbols });
  assert.match(md, /\[position\]\(https:\/\/excaliburjs\.com\/api\/class\/Actor\/#pos\)/);
  assert.match(md, /\[Actor\]\(https:\/\/excaliburjs\.com\/api\/class\/Actor\/\)/);
  assert.match(md, /\[Unknown\]\(https:\/\/excaliburjs\.com\/search\/\?q=Unknown\)/);
  assert.equal(apiLinkFor("Vector.distance", new Map([["Vector", "https://excaliburjs.com/api/class/Vector/"]])), "https://excaliburjs.com/api/class/Vector/#distance");
});

test("toMarkdown leaves code fences untouched (generics, imports inside code)", () => {
  const md = toMarkdown("```ts\nimport * as ex from 'excalibur';\nclass A<T> extends ex.Actor {}\n[[not a link]]\n```\n");
  assert.equal(md.trim(), "```ts\nimport * as ex from 'excalibur';\nclass A<T> extends ex.Actor {}\n[[not a link]]\n```");
});

test("toMarkdown flattens HTML lists and strips unknown JSX", () => {
  const md = toMarkdown('<ul style={{listStyle: "none"}}>\n    <li>📖 Docs <ul><li>[A](/a)</li></ul></li>\n    <li>📦 TS</li>\n</ul>\n<Highlight color="#f00">red</Highlight>\n');
  assert.match(md, /^- 📖 Docs • \[A\]\(https:\/\/excaliburjs\.com\/a\)/m);
  assert.match(md, /^- 📦 TS/m);
  assert.match(md, /^red$/m);
  assert.doesNotMatch(md, /<(ul|li|Highlight)/);
});

test("splitSections produces Docusaurus-style anchors and extractSection includes sub-headings", () => {
  const { body } = parseFrontmatter(actors);
  const sections = splitSections(toMarkdown(body, { docRelPath: "02-fundamentals/03-actors.mdx" }));
  const anchors = sections.map((s) => s.anchor);
  assert.deepEqual(anchors, ["actors", "basic-actors", "custom-actors", "update"]);
  const custom = extractSection(sections, "custom-actors")!;
  assert.match(custom, /^## Custom actors/);
  assert.match(custom, /### Update/);
  const update = extractSection(sections, "update")!;
  assert.doesNotMatch(update, /Custom actors/);
  assert.equal(extractSection(sections, "nope"), null);
});

test("slugifyHeading matches GitHub/Docusaurus slugger rules", () => {
  assert.equal(slugifyHeading("Linear interpolation (lerp) between vectors"), "linear-interpolation-lerp-between-vectors");
  assert.equal(slugifyHeading('Collision Start "collisionstart"'), "collision-start-collisionstart");
  const seen = new Set<string>();
  assert.equal(slugifyHeading("Update", seen), "update");
  assert.equal(slugifyHeading("Update", seen), "update-1");
});
