// The proof-depth explainer: six worked examples, each with as many proof steps as its depth, the
// "shortest, easier than typical" caveat, and a place in the sitemap.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DIST, SITE, content, text, headings } from "./helpers.mjs";

const EX = JSON.parse(readFileSync(new URL("../../studies/depth-examples.json", import.meta.url), "utf8"));
const page = () => content.find((p) => p.path === "/what-proof-depth-means/");

test("the explainer exists, with one clear H1", () => {
  const p = page();
  assert.ok(p, "no /what-proof-depth-means/ page");
  assert.match(headings(p.html).find((h) => h.level === 1).text, /What proof depth means/);
});

test("it shows six open-world depths, each with a step count equal to its depth", () => {
  const html = page().html;
  const main = html.slice(0, html.indexOf('id="closed-world"'));
  const cards = [...main.matchAll(/class="depth-ex-card" data-depth="(\d+)" data-steps="(\d+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(cards.map((c) => c[0]), [0, 1, 2, 3, 4, 5]);
  for (const [d, s] of cards) assert.equal(s, d, `depth ${d} shows ${s} steps`);
  for (let d = 0; d <= 5; d++) {
    const h2 = headings(html).find((h) => h.level === 2 && h.text.startsWith(`Depth ${d}:`));
    assert.ok(h2, `no H2 for depth ${d}`);
  }
  // Each example is the data's, verbatim: its statement and every proof step's conclusion.
  const t = text(html);
  for (const ex of EX.tasks["proofwriter-owa"]) {
    assert.ok(t.includes(ex.statement), `depth ${ex.depth}: statement`);
    for (const s of ex.steps) assert.ok(t.includes(s.rule_text) && t.includes(s.conclusion_text), `depth ${ex.depth}: step ${s.conclusion_text}`);
  }
});

test("it carries the caveat that these are the shortest problems, easier than typical, and links the accuracy", () => {
  const p = page();
  const t = text(p.html);
  assert.match(t, /shortest problems at each depth, so they are easier than typical problems at their depth/);
  assert.match(t, /blind to the answers/);
  assert.ok(p.html.includes('href="/breakdowns/proof-depth/"'));
});

test("it is in the sitemap and linked from the home page and the proof-depth page", () => {
  const xml = readFileSync(join(DIST, "sitemap.xml"), "utf8");
  assert.ok(xml.includes(`<loc>${SITE}/what-proof-depth-means/</loc>`));
  for (const path of ["/", "/breakdowns/proof-depth/"]) assert.ok(content.find((p) => p.path === path).html.includes('href="/what-proof-depth-means/"'), path);
});
