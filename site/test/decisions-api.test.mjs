// The OpenAI Decisions API has its own comparison page and a benchmark page: they cite OpenAI's guide and
// announcement for OpenAI's claims, report our measured results, and keep the claims apart from the measurements.
import { test } from "node:test";
import assert from "node:assert/strict";
import { content, text, meta, DATA } from "./helpers.mjs";

const GUIDE = "https://developers.openai.com/api/docs/guides/decisions";
const ANNOUNCEMENT = "https://openai.com/index/decisions-api/";
const API = "openai-decisions-gpt-6-luna";
const pages = () => ["/compare/jev-vs-openai-decisions-api/", "/openai-decisions-api-preview/"].map((path) => content.find((p) => p.path === path));
const pct = (x, d = 1) => (100 * x).toFixed(d);

test("the Decisions API pages name the API, link OpenAI's guide and announcement, and are titled for it", () => {
  for (const p of pages()) {
    assert.ok(p, "missing Decisions API page");
    assert.match(text(p.html), /OpenAI Decisions API/, p.path);
    assert.ok(p.html.includes(`href="${GUIDE}"`), `${p.path}: guide not linked`);
    assert.ok(p.html.includes(`href="${ANNOUNCEMENT}"`), `${p.path}: announcement not linked`);
    assert.match(/<title>([^<]*)<\/title>/.exec(p.html)[1], /OpenAI Decisions API/, p.path);
    assert.match(meta(p.html, "description"), /Decisions API/, p.path);
  }
});

test("the Decisions API pages report the scored accuracy, and the confidence AUROC from the analysis", () => {
  for (const p of pages()) {
    const t = text(p.html);
    for (const slug of ["proofwriter-owa", "proofwriter-cwa"]) {
      const o = DATA.results[slug].studies.engines[API].overall;
      assert.ok(t.includes(`${pct(o.accuracy)}%`), `${p.path}: ${slug} accuracy`);
    }
  }
  const t = text(pages()[1].html);
  for (const [slug, task] of Object.entries(DATA.probe.tasks)) {
    const c = task.decisions_api_confidence;
    assert.ok(c, `${slug}: no confidence analysis`);
    assert.ok(t.includes(c.auroc.toFixed(3)), `${slug}: confidence AUROC`);
    assert.ok(t.includes(String(c.distinct_values)), `${slug}: distinct confidence values`);
  }
});

test("OpenAI's speed claim is attributed to OpenAI, never presented as our measurement", () => {
  for (const p of pages()) {
    const t = text(p.html);
    assert.match(t, /10x faster than the Responses API|tenfold speed-up over the Responses API/, p.path);
    assert.match(t, /we did not (?:time|compare)/i, p.path);
  }
});

test("no page says the Decisions API is untested, in preview, or undocumented", () => {
  for (const p of content) {
    assert.doesNotMatch(text(p.html), /(?:have not|haven't) tested the (?:OpenAI )?(?:Decisions API|API itself)|not a test of the (?:OpenAI )?(?:Decisions )?API itself|limited preview|published no Decisions API documentation|until we can get access/i, p.path);
  }
});
