// Search specs: one clear H1 per page, real H2 sections under it, no skipped heading levels, and a
// unique title and description per page of a sensible length.
import { test } from "node:test";
import assert from "node:assert/strict";
import { content, meta, headings, text } from "./helpers.mjs";

test("every indexable page has exactly one H1", () => {
  for (const p of content) {
    const h1s = headings(p.html).filter((h) => h.level === 1);
    assert.equal(h1s.length, 1, `${p.path}: ${h1s.length} H1s`);
    assert.ok(h1s[0].text.length >= 10, `${p.path}: H1 too short`);
  }
});

test("every indexable page has at least two H2 sections, and no heading skips a level", () => {
  for (const p of content) {
    const hs = headings(p.html);
    assert.ok(hs.filter((h) => h.level === 2).length >= 2, `${p.path}: fewer than two H2s`);
    let prev = 1;
    for (const h of hs.slice(1)) {
      assert.ok(h.level <= prev + 1, `${p.path}: "${h.text}" (h${h.level}) follows an h${prev}`);
      prev = h.level;
    }
    for (const h of hs) assert.ok(h.text.length > 0, `${p.path}: empty h${h.level}`);
  }
});

test("titles and H1s are unique across the site", () => {
  const seenTitle = new Map(), seenH1 = new Map();
  for (const p of content) {
    const title = /<title>([^<]*)<\/title>/.exec(p.html)[1];
    assert.ok(!seenTitle.has(title), `${p.path} and ${seenTitle.get(title)} share the title "${title}"`);
    seenTitle.set(title, p.path);
    const h1 = headings(p.html).find((h) => h.level === 1).text;
    assert.ok(!seenH1.has(h1), `${p.path} and ${seenH1.get(h1)} share the H1 "${h1}"`);
    seenH1.set(h1, p.path);
  }
});

test("every description is unique and between 50 and 320 characters", () => {
  const seen = new Map();
  for (const p of content) {
    const d = meta(p.html, "description");
    assert.ok(d && d.length >= 50 && d.length <= 320, `${p.path}: description is ${d ? d.length : 0} characters`);
    assert.ok(!seen.has(d), `${p.path} and ${seen.get(d)} share a description`);
    seen.set(d, p.path);
  }
});

test("no thin pages: every indexable page carries real content", () => {
  for (const p of content) {
    const main = text(p.html.slice(p.html.indexOf("<main"), p.html.indexOf('<aside class="wrap honesty"')));
    const words = main.split(" ").filter(Boolean).length;
    assert.ok(words >= 250, `${p.path}: only ${words} words`);
  }
});

test("hub pages link to every leaf below them", () => {
  const home = content.find((p) => p.path === "/");
  const hubs = { "/models/": /^\/(?:models|compare)\/[^/]+\/$/, "/breakdowns/": /^\/breakdowns\/[^/]+\/$/ };
  for (const [hub, re] of Object.entries(hubs)) {
    const page = content.find((p) => p.path === hub);
    for (const leaf of content.filter((p) => re.test(p.path))) assert.ok(page.html.includes(`href="${leaf.path}"`), `${hub} does not link ${leaf.path}`);
    assert.ok(home.html.includes(`href="${hub}"`), `home does not link ${hub}`);
  }
});
