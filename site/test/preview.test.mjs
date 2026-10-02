// The OpenAI Decisions API preview page: its numbers come from the probe's analysis.json, it carries a
// verbatim request and response, and it never claims the API itself was tested.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { content, text, meta, unescape } from "./helpers.mjs";

const A = JSON.parse(readFileSync(new URL("../../probes/luna-logprobs/analysis.json", import.meta.url), "utf8"));
const page = () => content.find((p) => p.path === "/openai-decisions-api-preview/");
const pct = (x, d = 1) => (100 * x).toFixed(d);
const top = (bands) => bands.find((b) => b.from >= 0.99);

test("the preview page exists, is in the sitemap set, and names the OpenAI Decisions API", () => {
  const p = page();
  assert.ok(p, "no preview page");
  assert.match(text(p.html), /OpenAI Decisions API/);
  assert.match(meta(p.html, "description"), /^When GPT-6 Luna[^.]*99% or more[^.]*right \d+\.\d%/);
});

test("the preview page reads its numbers from the probe's analysis.json", () => {
  const t = text(page().html);
  for (const [slug, s] of Object.entries(A.tasks)) {
    assert.ok(t.includes(`${pct(top(s.bands).accuracy)}%`), `${slug}: Luna's 99% band accuracy`);
    assert.ok(t.includes(s.ece.toFixed(3)), `${slug}: Luna ECE ${s.ece.toFixed(3)}`);
    assert.ok(t.includes(s.auroc.toFixed(3)), `${slug}: Luna AUROC`);
    assert.ok(t.includes(`${pct(s.wrong_at_95)}%`), `${slug}: wrong at 95%`);
    assert.ok(t.includes(s.by_depth["5"].auroc.toFixed(3)), `${slug}: depth-5 AUROC`);
    assert.ok(t.includes(String(s.returned_not_most_probable)), `${slug}: returned-not-most-probable count`);
    const jev = s.other_engines_same_items.jev;
    assert.ok(t.includes(`${pct(top(jev.bands).accuracy)}%`), `${slug}: Jev's 99% band accuracy`);
    assert.ok(t.includes(jev.ece.toFixed(3)) && t.includes(jev.auroc.toFixed(3)), `${slug}: Jev ECE and AUROC`);
  }
});

test("the preview page carries a verbatim request and response from the probe", () => {
  const html = page().html;
  const codes = [...html.matchAll(/<pre class="code verbatim"><code>([\s\S]*?)<\/code><\/pre>/g)].map((m) => JSON.parse(unescape(m[1])));
  assert.ok(codes.length >= 2, "no verbatim request and response");
  const shown = A.examples.find((e) => JSON.stringify(e.request) === JSON.stringify(codes[0]));
  assert.ok(shown, "the request shown is not one of the probe's examples, verbatim");
  assert.deepEqual(codes[1], shown.response, "the response shown is not the example's response, verbatim");
  assert.equal(shown.correct, false, "the main example should be a wrong answer");
});

test("the preview page never claims the Decisions API itself was tested", () => {
  const t = text(page().html);
  assert.doesNotMatch(t, /we (?:have )?(?:tested|benchmarked|measured|ran|probed) the (?:OpenAI )?Decisions API/i);
  assert.match(t, /We have not tested the Decisions API/);
  assert.match(t, /untested/);
  assert.doesNotMatch(t, /\bhid(?:e|es|den|ing)\b/i, "the page must not say Luna hides its probabilities");
});
