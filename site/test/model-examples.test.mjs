// "What X got right and wrong, depth by depth": every scored model's page has the section, with six
// open-world depth rows (and six closed-world ones in the fold-out) of four cards; each row's
// right/wrong mix follows the model's accuracy; icons are labelled; statements match the data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { content, unescape } from "./helpers.mjs";

const ME = JSON.parse(readFileSync(new URL("../../studies/model-examples.json", import.meta.url), "utf8"));
const roundHalfUp = (x) => Math.floor(x + 0.5 + 1e-9);
const PAGE = { jev: "/models/jev/", "openai-gpt-6-luna-effort-none": "/compare/jev-vs-gpt-6-luna/", laya: "/compare/jev-vs-laya/",
  "kev-0.8b": "/compare/jev-vs-kev/", "kev-4b": "/compare/jev-vs-kev/", "kev-9b": "/compare/jev-vs-kev/" };

function sectionOf(html, engine) {
  const at = html.indexOf(`data-engine="${engine}"`);
  if (at < 0) return null;
  const start = html.lastIndexOf("<section", at);
  let depth = 0, i = start;
  const re = /<\/?section\b/g;
  re.lastIndex = start;
  for (let m; (m = re.exec(html));) { depth += m[0] === "<section" ? 1 : -1; if (depth === 0) { i = m.index; break; } }
  return html.slice(start, i);
}
// Each row runs from its opening tag to the next row (or the end of the section).
function rowsOf(sec) {
  const starts = [...sec.matchAll(/<div class="mde-row" data-task="([^"]+)" data-depth="(\d)"/g)];
  return starts.map((m, i) => ({ task: m[1], depth: Number(m[2]), html: sec.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : sec.length) }));
}

for (const [engine, path] of Object.entries(PAGE)) {
  if (!ME.engines[engine]) continue;
  test(`${engine}: ${path} has six depth rows of four cards per task`, () => {
    const page = content.find((p) => p.path === path);
    assert.ok(page, `no page ${path}`);
    const sec = sectionOf(page.html, engine);
    assert.ok(sec, `no right-and-wrong section for ${engine} on ${path}`);
    assert.match(sec, /<h2[^>]*>What [^<]+ got right and wrong, depth by depth<\/h2>/);
    for (const [task, rows] of Object.entries(ME.engines[engine])) {
      const shown = rowsOf(sec).filter((r) => r.task === task);
      assert.deepEqual(shown.map((r) => r.depth), [0, 1, 2, 3, 4, 5], `${task}: depth rows`);
      for (const r of shown) {
        const data = rows.find((x) => x.depth === r.depth);
        const cards = [...r.html.matchAll(/<article class="xc[^"]*" data-correct="(\d)" data-id="([^"]+)">([\s\S]*?)<\/article>/g)];
        assert.equal(cards.length, 4, `${task} depth ${r.depth}: ${cards.length} cards`);
        const wrong = cards.filter((c) => c[1] === "0").length;
        assert.equal(wrong, roundHalfUp(4 * (1 - data.accuracy)), `${task} depth ${r.depth}: ${wrong} wrong at ${data.accuracy}`);
        assert.equal(4 - wrong, data.right_shown);
        for (const c of cards) {
          const ex = data.examples.find((x) => x.id === c[2]);
          assert.ok(ex, `${c[2]} is not in the data`);
          assert.equal(c[1] === "1", ex.correct);
          const st = /<p class="xc-st">([^<]*)<\/p>/.exec(c[3]);
          assert.equal(unescape(st[1]), ex.statement, `${c[2]}: statement`);
          assert.match(c[3], new RegExp(`role="img" aria-label="${ex.correct ? "right" : "wrong"}"`), `${c[2]}: icon label`);
        }
      }
    }
  });
}

test("the right and wrong colours contrast with their marks in both themes (WCAG 3:1 for graphics)", () => {
  const css = readFileSync(new URL("../src/styles/site.css", import.meta.url), "utf8");
  const lum = (hex) => { const c = hex.match(/\w\w/g).map((h) => parseInt(h, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const blocks = [/:root \{[^}]*\}/.exec(css)[0], /@media \(prefers-color-scheme: dark\) \{\s*:root \{[^}]*\}/.exec(css)[0]];
  for (const b of blocks) {
    const v = (name) => new RegExp(`--${name}: (#[0-9a-f]{6})`, "i").exec(b)[1];
    for (const [bg, fg] of [["ok", "ok-on"], ["alarm", "alarm-on"]]) assert.ok(ratio(v(bg), v(fg)) >= 4.5, `${bg}/${fg}: ${ratio(v(bg), v(fg)).toFixed(2)}`);
  }
});
