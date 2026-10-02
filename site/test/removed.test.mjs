// The pages merged away in the restructure: none may be built, and no page, card, sitemap entry or
// data file may link to one. (The site is unpublished, so there are no redirects to keep.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DIST, files, pages } from "./helpers.mjs";

const REMOVED = ["/compare/", "/compare/kev-sizes/", "/models/gpt-6-luna/", "/models/kev-0-8b/", "/models/kev-4b/", "/models/kev-9b/", "/models/laya/",
  "/methodology/", "/preregistration/", "/latency/", "/model-sizes/",
  "/breakdowns/negated-statements/", "/breakdowns/theory-length/", "/breakdowns/rule-count/", "/breakdowns/fact-count/", "/breakdowns/proof-size/",
  "/breakdowns/theory-depth/", "/breakdowns/theory-kind/", "/breakdowns/question-strategy/"];

test("no removed page is built", () => {
  for (const r of REMOVED) assert.ok(!existsSync(join(DIST, r, "index.html")), `${r} is still built`);
});

test("no internal link, sitemap entry or card points to a removed page", () => {
  const bad = [];
  const sources = [...pages.map((p) => ({ name: p.path, text: p.html })),
    ...files.filter((f) => /sitemap\.xml$|robots\.txt$|results\.json$/.test(f)).map((f) => ({ name: f.slice(DIST.length), text: readFileSync(f, "utf8") }))];
  for (const { name, text } of sources) {
    for (const m of text.matchAll(/(?:href|src)="(\/[^"#?]*)|<loc>https?:\/\/[^/]+(\/[^<]*)<\/loc>/g)) {
      const path = m[1] || m[2];
      if (REMOVED.includes(path)) bad.push(`${name} -> ${path}`);
    }
    for (const r of REMOVED.filter((x) => x !== "/compare/")) if (text.includes(`hard-decisions.anth.us${r}`)) bad.push(`${name} -> ${r}`);
  }
  assert.deepEqual(bad, []);
});

test("no social card is drawn for a removed page", () => {
  for (const r of REMOVED) {
    const stem = r.replace(/^\/|\/$/g, "");
    assert.ok(!files.some((f) => f.includes(`/og/${stem}.`)), `a card for ${r} is still drawn`);
  }
});
