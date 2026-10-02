// The wide-screen layout (docs/wide-layout.md): every content section is either split (a head with
// its H2 first, then a body) or prose; no section is left unstructured; and the wide rules exist.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pages } from "./helpers.mjs";

const sections = (html) => [...html.matchAll(/<section class="wrap section([^"]*)"[^>]*>([\s\S]*?)<\/section>/g)].map((m) => ({ cls: m[1], body: m[2].trim() }));

test("every content section is split into a head and a body, or marked as prose", () => {
  const bad = [];
  let split = 0, prose = 0;
  for (const p of pages) for (const s of sections(p.html)) {
    if (/\bsec-split\b/.test(s.cls)) {
      split++;
      if (!/^<div class="sec-head">\s*<h2\b/.test(s.body)) bad.push(`${p.path}: split section does not open with a head holding its H2`);
      const head = s.body.slice(0, s.body.indexOf('<div class="sec-body">'));
      if (s.body.indexOf('<div class="sec-body">') < 0) bad.push(`${p.path}: split section has no body`);
      else if (/<(?:table|figure|svg|article)\b/.test(head)) bad.push(`${p.path}: a figure or table sits in a section head`);
    } else if (/\bsec-prose\b/.test(s.cls)) {
      prose++;
    } else bad.push(`${p.path}: section "${s.cls.trim()}" is neither split nor prose`);
  }
  assert.deepEqual(bad, []);
  assert.ok(split > 50 && prose > 20, `${split} split and ${prose} prose sections`);
});

test("the wide rules are in the stylesheet: column growth, zoom steps, the two-column split and a line measure", () => {
  const css = readFileSync(new URL("../src/styles/site.css", import.meta.url), "utf8");
  assert.match(css, /@media \(min-width: 2000px\) \{[^}]*html \{ zoom: 1\.25; \}[^}]*:root \{ --max: 88%; \}/);
  assert.match(css, /@media \(min-width: 2400px\) \{\s*\.sec-split, \.sec-prose \{ display: grid; grid-template-columns: minmax\(0, 30%\) minmax\(0, 1fr\)/);
  assert.match(css, /\.section p, \.section li[^{]*\{ max-width: 38em; \}/);
  // Laptop and smaller layouts are untouched: no wide rule below 1,500 px.
  for (const m of css.matchAll(/@media \(min-width: (\d+)px\)[^{]*\{[^}]*(?:sec-split|zoom|--max)/g)) assert.ok(Number(m[1]) >= 1500, `wide rule at ${m[1]} px`);
});
