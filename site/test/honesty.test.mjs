// Specs for the caveats the write-up keeps, and for missing data never being shown as a result.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA, content, pages, text, pct } from "./helpers.mjs";

const LUNA = "openai-gpt-6-luna-effort-none";

test("every page that names GPT-6 Luna says it ran with reasoning off", () => {
  const bad = [];
  for (const p of content) {
    // Links to other pages (a comparison's title, a nav chip) only name it; the page they lead to says the rest.
    const main = p.html.slice(p.html.indexOf("<main"), p.html.indexOf('<aside class="wrap honesty"')).replace(/<a\b[^>]*>[\s\S]*?<\/a>/g, " ");
    const t = text(main);
    if (/GPT-6 Luna/.test(t) && !/reasoning off|reasoning effort set to none|reasoning effort/i.test(t)) bad.push(p.path);
  }
  assert.deepEqual(bad, [], "pages naming Luna without its setting");
});

test("Luna's setting is stated neutrally: no handicap language and no excuses", () => {
  for (const p of pages) assert.doesNotMatch(text(p.html), /handicap|unfair to (?:GPT|Luna)|crippled|hobbled|would have won|to be fair to/i, p.path);
});

test("every page that shows a latency figure says hosted and laptop times are not like for like", () => {
  for (const p of content) {
    const main = p.html.slice(p.html.indexOf("<main"), p.html.indexOf('<aside class="wrap honesty"'));
    if (/\d+ ms\b/.test(text(main))) assert.match(text(main), /not like for like|over the network|on a laptop/i, `${p.path}: latency without its caveat`);
  }
});

test("every breakdown other than depth says it is descriptive", () => {
  for (const p of content.filter((x) => /^\/breakdowns\/[^/]+\/$/.test(x.path) && x.path !== "/breakdowns/proof-depth/")) {
    assert.match(text(p.html), /Descriptive, not causal/, p.path);
  }
});

test("How we measured reports every prediction with a verdict, word for word", () => {
  const page = content.find((p) => p.path === "/how-we-measured/");
  const t = text(page.html);
  for (const sec of DATA.prereg.sections) for (const pr of sec.predictions) {
    const words = pr.text.replace(/`/g, "").slice(0, 60);
    assert.ok(t.includes(words), `prediction not quoted: "${words}"`);
  }
  const verdicts = (page.html.match(/class="verdict v-/g) || []).length;
  const n = DATA.prereg.sections.reduce((a, s) => a + s.predictions.length, 0);
  assert.ok(verdicts >= n, `${verdicts} verdicts for ${n} predictions`);
});

test("a model with no scored results never gets a page or a number", () => {
  const ids = new Set(Object.values(DATA.results).flatMap((r) => Object.keys(r.status)));
  for (const id of ids) {
    if (Object.values(DATA.results).some((r) => r.status[id].scored)) continue;
    const slug = id.replace(/\./g, "-");
    assert.ok(!pages.some((p) => p.path === `/models/${slug}/`), `${id} has a page without results`);
  }
});

test("each model's page (Jev's, or its comparison with Jev) shows its scored overall accuracy on each task, as the scored rows give it", () => {
  for (const [slug, r] of Object.entries(DATA.results)) for (const [id, s] of Object.entries(r.studies.engines)) {
    const page = content.find((p) => (p.path === "/models/jev/" || p.path.startsWith("/compare/")) && text(p.html).includes(`${pct(s.overall.accuracy)}%`) && p.html.includes(`--eng-`));
    assert.ok(page, `${id} ${slug}: ${pct(s.overall.accuracy)}% is on no model page`);
  }
});

test("no page contains an email address", () => {
  const EMAIL = /[a-zA-Z0-9][a-zA-Z0-9._%+-]*@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  assert.deepEqual(JSON.stringify(DATA).match(EMAIL) || [], []);
  for (const p of pages) assert.deepEqual(p.html.match(EMAIL) || [], [], p.path);
});

test("the Anthus call to action is the one Biased-Decisions uses, and no client, testimonial or price is invented", () => {
  for (const p of content) {
    const t = text(p.html);
    assert.match(t, /For general contact, visit the contact page on anth\.us/, `${p.path}: no contact line`);
    assert.doesNotMatch(t, /testimonial|case stud|our clients|trusted by|\$\d[\d,]* (?:per|\/) (?:month|project|hour)/i, p.path);
  }
});
