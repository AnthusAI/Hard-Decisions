// Visual confusion matrices: counts match the data (overall, and at depths 0 and 5), rows sum to each
// answer's item count, they appear where they should, and every text/fill pairing has contrast.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DATA, content } from "./helpers.mjs";

const tables = (html) => [...html.matchAll(/<table class="cm[^"]*" data-engine="([^"]+)" data-task="([^"]+)" data-depth="([^"]+)">([\s\S]*?)<\/table>/g)]
  .map((m) => ({ engine: m[1], task: m[2], depth: m[3], html: m[4] }));
const rowsOf = (t) => [...t.html.matchAll(/<tr data-gold="([^"]+)" data-n="(\d+)">([\s\S]*?)<\/tr>/g)]
  .map((m) => ({ gold: m[1], n: Number(m[2]), cells: Object.fromEntries([...m[3].matchAll(/data-said="([^"]+)" data-count="(\d+)"/g)].map((c) => [c[1], Number(c[2])])) }));

function expected(engine, task, depth) {
  if (depth === "all") return DATA.results[task].studies.engines[engine].overall.confusion;
  const out = {};
  for (const c of DATA.results[task].derived[engine].cross.filter((x) => x.depth === depth)) out[c.label] = c.said;
  return out;
}
const goldCount = (task, depth, gold) => {
  const t = DATA.tasks.find((x) => x.slug === task);
  if (depth === "all") return t.selected.reference_label[gold];
  return t.strata.filter((s) => String(s.depth) === depth && s.label === gold).reduce((a, s) => a + s.selected, 0);
};

test("every confusion cell's count matches the data, and each row sums to that answer's item count", () => {
  let checked = 0;
  for (const p of content) for (const t of tables(p.html)) {
    const want = expected(t.engine, t.task, t.depth);
    for (const r of rowsOf(t)) {
      for (const [said, n] of Object.entries(r.cells)) assert.equal(n, (want[r.gold] || {})[said] || 0, `${p.path} ${t.engine} ${t.task} depth ${t.depth}: ${r.gold}->${said}`);
      const sum = Object.values(r.cells).reduce((a, b) => a + b, 0);
      assert.equal(sum, r.n, `${p.path} ${t.engine} ${t.task} ${t.depth} ${r.gold}: row sums to ${sum}, not ${r.n}`);
      assert.equal(r.n, goldCount(t.task, t.depth, r.gold), `${p.path} ${t.engine} ${t.task} ${t.depth} ${r.gold}: ${r.n} items`);
      checked++;
    }
  }
  assert.ok(checked > 100, `only ${checked} rows checked`);
});

const ON_PAGE = { "/models/jev/": ["jev"], "/compare/jev-vs-gpt-6-luna/": ["jev", "openai-gpt-6-luna-effort-none"], "/compare/jev-vs-laya/": ["jev", "laya"],
  "/compare/jev-vs-kev/": ["jev", "kev-9b", "kev-4b", "kev-0.8b"] };

test("comparison pages show Jev's matrix beside each rival's, for each task, on the same problems", () => {
  for (const [path, ids] of Object.entries(ON_PAGE)) {
    if (path === "/models/jev/") continue;
    const page = content.find((p) => p.path === path);
    const at = page.html.indexOf('id="side-by-side"');
    assert.ok(at > 0, `${path}: no side-by-side section`);
    const sec = page.html.slice(at, page.html.indexOf("</section>", at));
    for (const task of ["proofwriter-owa", "proofwriter-cwa"]) {
      const shown = tables(sec).filter((t) => t.task === task && t.depth === "all").map((t) => t.engine);
      assert.deepEqual(shown, ids.filter((id) => DATA.results[task].studies.engines[id]), `${path} ${task}`);
    }
  }
});

test("each model page shows depth 0 and depth 5 matrices for each model, open world and closed world", () => {
  for (const [path, ids] of Object.entries(ON_PAGE)) {
    const page = content.find((p) => p.path === path);
    const all = tables(page.html);
    for (const id of ids.filter((x) => path === "/models/jev/" || x !== "jev")) {
      for (const task of ["proofwriter-owa", "proofwriter-cwa"]) for (const d of ["0", "5"]) {
        assert.ok(all.some((t) => t.engine === id && t.task === task && t.depth === d), `${path}: ${id} ${task} depth ${d}`);
      }
    }
  }
});

test("the true/false/unknown page has every fully scored model's matrix, ordered by accuracy, near the top", () => {
  const page = content.find((p) => p.path === "/breakdowns/true-false-unknown/");
  const at = page.html.indexOf('id="confusion"');
  assert.ok(at > 0 && at < page.html.indexOf("proofwriter-owa-h"), "the grid is missing or not near the top");
  const sec = page.html.slice(at, page.html.indexOf("</section>", at));
  for (const task of ["proofwriter-owa", "proofwriter-cwa"]) {
    const engines = Object.entries(DATA.results[task].status).filter(([, s]) => s.status === "complete").map(([id]) => id);
    const shown = tables(sec).filter((t) => t.task === task).map((t) => t.engine);
    const acc = (id) => DATA.results[task].studies.engines[id].overall.accuracy;
    assert.deepEqual([...shown].sort(), [...engines].sort(), task);
    assert.deepEqual(shown, [...shown].sort((a, b) => acc(b) - acc(a)), `${task}: not ordered by accuracy`);
  }
});

test("every matrix's text and fill contrast passes in both modes (4.5:1)", () => {
  const css = readFileSync(new URL("../src/styles/site.css", import.meta.url), "utf8");
  const hex = (h) => h.match(/\w\w/g).map((x) => parseInt(x, 16));
  const lum = (rgb) => { const c = rgb.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const mix = (a, b, p) => a.map((v, i) => Math.round(v * p + b[i] * (1 - p)));
  const blocks = [/:root \{[^}]*\}/.exec(css)[0], /@media \(prefers-color-scheme: dark\) \{\s*:root \{[^}]*\}/.exec(css)[0]];
  const levels = [...css.matchAll(/\.cm-(?:ok|no)\.lv(\d+) \{ background: color-mix\(in srgb, var\(--(?:ok|alarm)\) (\d+)%/g)].map((m) => Number(m[2]));
  assert.ok(levels.length >= 6, "no shading levels found");
  for (const b of blocks) {
    const v = (name) => hex(new RegExp(`--${name}: (#[0-9a-f]{6})`, "i").exec(b)[1]);
    for (const tok of ["ok", "alarm"]) {
      for (const lv of levels) assert.ok(ratio(v("ink"), mix(v(tok), v("surface"), lv / 100)) >= 4.5, `${tok} ${lv}%: ink contrast`);
      assert.ok(ratio(v(`${tok}-on`), v(tok)) >= 4.5, `${tok} full: ${tok}-on contrast`);
    }
    assert.ok(ratio(v("ink"), v("surface")) >= 4.5, "empty cell");
  }
});
