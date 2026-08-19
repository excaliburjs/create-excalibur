import { test } from "node:test";
import assert from "node:assert/strict";
import { HIGHLIGHT_POST, HIGHLIGHT_PRE, normalizeHit, plainSnippet } from "../src/docs/algolia.js";
import { readFixture } from "./helpers.js";

const response = JSON.parse(readFixture("algolia-actor-collision.json"));

test("normalizeHit maps docs records to slug/anchor/title/breadcrumb", () => {
  const hit = normalizeHit(response.hits[0]);
  assert.equal(hit.kind, "docs");
  assert.equal(hit.slug, "/colliders-and-shapes");
  assert.equal(hit.anchor, "the-collider-component");
  assert.equal(hit.title, "The Collider Component");
  assert.equal(hit.breadcrumb, "Colliders Primer › Colliders And Shapes");
  assert.equal(hit.url, "https://excaliburjs.com/docs/colliders-and-shapes/#the-collider-component");
  assert.ok(hit.snippet.includes(`${HIGHLIGHT_PRE}actor${HIGHLIGHT_POST}`));
  assert.doesNotMatch(hit.snippet, /\n/);
  assert.equal(plainSnippet(hit.snippet).includes(HIGHLIGHT_PRE), false);
});

test("normalizeHit uses the symbol name as the title for API records", () => {
  const api = response.hits.find((h) => h.url.includes("/api/"));
  const hit = normalizeHit(api);
  assert.equal(hit.kind, "api");
  assert.equal(hit.slug, null);
  assert.equal(hit.title, "PreCollisionEvent <T>"); // HTML entities unescaped
  assert.equal(hit.breadcrumb, "API");
});

test("normalizeHit strips zero-width spaces and handles the docs root", () => {
  const hit = normalizeHit({
    url: "https://excaliburjs.com/docs/",
    hierarchy: { lvl0: "Welcome", lvl1: "What is Excalibur?​" },
    type: "lvl1",
  });
  assert.equal(hit.slug, "/");
  assert.equal(hit.title, "What is Excalibur?");
});
