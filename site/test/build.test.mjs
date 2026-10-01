// Specs for the built site, ported from Biased-Decisions' build specs: the page set, social cards,
// canonical URLs, the colophon, internal links, the caveats panel, analytics and titles.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DIST, DATA, SITE, files, pages, content, noindex, meta, text, strip } from "./helpers.mjs";

function pngSize(buf) {
  assert.equal(buf.toString("ascii", 1, 4), "PNG", "not a PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
const localPath = (url) => decodeURIComponent(new URL(url, SITE).pathname);
const scored = new Set(Object.values(DATA.results).flatMap((r) => Object.keys(r.studies.engines)));

test("the build produced the pages the data implies", () => {
  const axes = DATA.axes.length;
  // home, models hub, compare hub, breakdowns hub, 9 topic pages (methodology, preregistration,
  // repeatability, latency, model sizes, evaluating, fine-tuning, aligning, about)
  const fixed = 4 + 9;
  const comparisons = content.filter((p) => /^\/compare\/[^/]+\/$/.test(p.path)).length;
  assert.ok(comparisons >= 1, "no comparison pages");
  assert.equal(content.length, fixed + scored.size + axes + comparisons);
  for (const want of ["/", "/models/", "/models/jev/", "/compare/", "/compare/jev-vs-gpt-6-luna/", "/breakdowns/", "/breakdowns/proof-depth/",
    "/methodology/", "/preregistration/", "/repeatability/", "/latency/", "/model-sizes/", "/evaluating-decision-models/",
    "/fine-tuning-decision-models/", "/aligning-decision-models/", "/about/"]) assert.ok(content.some((p) => p.path === want), want);
});

test("every page has a social card: a 1200 x 630 PNG under 300 KB, fingerprinted by content", () => {
  const seen = new Map();
  for (const p of content) {
    const img = meta(p.html, "og:image");
    assert.ok(img, `${p.path}: no og:image`);
    assert.ok(img.startsWith(`${SITE}/og/`), `${p.path}: og:image ${img} is not on ${SITE}`);
    assert.match(img, /\.[0-9a-f]{10}\.png$/, `${p.path}: card URL not fingerprinted`);
    assert.equal(meta(p.html, "twitter:image"), img);
    assert.equal(meta(p.html, "twitter:card"), "summary_large_image");
    const file = join(DIST, localPath(img));
    assert.ok(existsSync(file), `${p.path}: ${img} is not in dist/`);
    const buf = readFileSync(file);
    assert.deepEqual(pngSize(buf), { width: 1200, height: 630 });
    assert.ok(buf.length < 300 * 1024, `${p.path}: card is ${Math.round(buf.length / 1024)} KB`);
    assert.ok(!seen.has(img), `${p.path} and ${seen.get(img)} share a card`);
    seen.set(img, p.path);
  }
});

test("card alt text is data-driven and every number in it is on the page", () => {
  const num = /[+−-]?\d[\d,]*(?:\.\d+)?/g;
  for (const p of content) {
    const alt = meta(p.html, "og:image:alt");
    assert.ok(alt && alt.length > 40, `${p.path}: no alt text`);
    assert.equal(meta(p.html, "twitter:image:alt"), alt);
    const page = text(p.html).replace(/−/g, "-");
    const body = alt.replace(/Hard-Decisions benchmark, v[\d.]+, \d{4}-\d{2}-\d{2}\.$/, "");
    for (const n of body.replace(/−/g, "-").match(num) || []) {
      const bare = n.replace(/^\+/, "").replace(/,$/, "");
      assert.ok(page.includes(bare), `${p.path}: alt text number ${n} is not on the page ("${alt}")`);
    }
    assert.doesNotMatch(alt, /→|->/, `${p.path}: alt text uses an arrow`);
  }
});

test("canonical and og:url name the public origin and the page's own path", () => {
  for (const p of content) {
    const canon = /<link rel="canonical" href="([^"]+)"/.exec(p.html)[1];
    assert.equal(canon, `${SITE}${p.path}`);
    assert.equal(meta(p.html, "og:url"), canon);
  }
});

test("the sitemap lists every indexable page and nothing else, and robots.txt names it", () => {
  const xml = readFileSync(join(DIST, "sitemap.xml"), "utf8");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
  assert.deepEqual(locs, content.map((p) => `${SITE}${p.path}`).sort());
  const robots = readFileSync(join(DIST, "robots.txt"), "utf8");
  assert.match(robots, new RegExp(`Sitemap: ${SITE}/sitemap.xml`));
  assert.match(robots, /Disallow: \/og-gallery\//);
});

test("the colophon names the version and the data's commit on every page", () => {
  for (const p of pages) {
    const colo = p.html.slice(p.html.indexOf('<footer class="colophon">'));
    assert.ok(colo.includes(`v${DATA.provenance.version}`), `${p.path}: no version`);
    if (DATA.provenance.record_commit_short) assert.ok(colo.includes(DATA.provenance.record_commit_short), `${p.path}: no commit`);
  }
});

test("public pages never describe how the site or its charts were built", () => {
  const trivia = /hand-drawn|charting library|no charting|built with|\bastro\b|satori|resvg|webassembly|static site generator|drawn in the browser/i;
  for (const p of pages) assert.doesNotMatch(text(p.html), trivia, p.path);
});

test("every internal link resolves to a built page or file", () => {
  const missing = new Set();
  for (const p of pages) {
    for (const m of p.html.matchAll(/(?:href|src)="(\/[^"#?]*)(?:[#?][^"]*)?"/g)) {
      const path = decodeURIComponent(m[1]);
      const f = path.endsWith("/") ? join(DIST, path, "index.html") : join(DIST, path);
      if (!existsSync(f)) missing.add(`${p.path} -> ${path}`);
    }
  }
  assert.deepEqual([...missing], []);
});

test("every in-page #fragment link has a target", () => {
  const missing = [];
  for (const p of pages) {
    const ids = new Set([...p.html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    for (const m of p.html.matchAll(/href="#([^"]+)"/g)) if (!ids.has(m[1])) missing.push(`${p.path}#${m[1]}`);
    for (const m of p.html.matchAll(/href="(\/[^"#]*)#([^"]+)"/g)) {
      const target = pages.find((x) => x.path === m[1]);
      if (target && !new RegExp(`\\bid="${m[2]}"`).test(target.html)) missing.push(`${p.path} -> ${m[1]}#${m[2]}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("the review gallery is noindex and shows every card", () => {
  const gallery = pages.find((p) => p.path === "/og-gallery/");
  assert.ok(gallery && noindex(gallery));
  const cards = [...gallery.html.matchAll(/<img src="([^"]+\.png)"/g)].map((m) => m[1]);
  assert.equal(new Set(cards).size, content.length);
});

test("every page carries the caveats panel: six cards, open on the home page, folded elsewhere", () => {
  for (const p of content) {
    const m = /<details[^>]*id="read-first"[^>]*>([\s\S]*?)<\/details>/.exec(p.html);
    assert.ok(m, `${p.path}: no #read-first panel`);
    const cards = m[1].match(/<li class="caveat"/g) || [];
    assert.ok(cards.length === 4 || cards.length === 6, `${p.path}: ${cards.length} cards`);
    const open = /<details[^>]*id="read-first"[^>]*\bopen\b/.test(p.html);
    assert.equal(open, p.path === "/", `${p.path}: panel ${open ? "open" : "folded"}`);
    const panel = strip(m[1]);
    for (const t of ["ProofWriter is synthetic", "Latency is not like for like", "Only depth is controlled", "reasoning off"]) assert.ok(panel.includes(t), `${p.path}: caveat "${t}" missing`);
  }
});

test("Google Analytics 4 and its opt-out are on every page, once, opt-out first", () => {
  const ID = "G-31SC26SDGX";
  for (const p of pages) {
    const head = p.html.slice(0, p.html.indexOf("</head>"));
    assert.equal(head.split(`googletagmanager.com/gtag/js?id=${ID}`).length - 1, 1, `${p.path}: gtag.js`);
    assert.equal(head.split(`gtag('config', '${ID}')`).length - 1, 1, `${p.path}: gtag config`);
    const optOut = head.indexOf("anthus-no-analytics");
    assert.ok(optOut > 0 && optOut < head.indexOf("gtag('config'"), `${p.path}: opt-out must come before gtag config`);
  }
});

test("social preview titles match page headings", () => {
  for (const p of content) {
    const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(p.html);
    assert.ok(h1, `${p.path}: no heading`);
    const heading = strip(h1[1]);
    assert.equal(meta(p.html, "og:title"), heading, `${p.path}: social title differs from the heading`);
    assert.equal(meta(p.html, "twitter:title"), heading);
    assert.ok(meta(p.html, "og:image:alt").startsWith(heading), `${p.path}: card uses a different introduction`);
  }
});

test("the data file is published beside the pages", () => {
  const f = files.find((x) => x.endsWith("data/results.json"));
  assert.ok(f, "no data/results.json in dist");
  const d = JSON.parse(readFileSync(f, "utf8"));
  assert.ok(Array.isArray(d.predictions) && d.predictions.length > 0);
});
