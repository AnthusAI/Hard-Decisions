// The OpenAI Decisions API is an SEO target on the GPT-6 Luna comparison: the page names it, cites
// a source for it, says the results are a preview rather than a test of the API, and never says
// whether the API returns a confidence score (no OpenAI source says so).
import { test } from "node:test";
import assert from "node:assert/strict";
import { content, text, meta } from "./helpers.mjs";

const SOURCES = ["https://the-decoder.com/openai-expands-codex-and-its-api-at-devday-with-security-scans-a-decisions-api-and-ultrafast/",
  "https://www.axios.com/2026/09/29/openai-dev-day-2026-dots-space-sol"];
const page = () => content.find((p) => p.path === "/compare/jev-vs-gpt-6-luna/");

test("the Luna comparison names the OpenAI Decisions API and links a source for it", () => {
  const p = page();
  assert.ok(p, "no Luna comparison page");
  assert.match(text(p.html), /OpenAI Decisions API/);
  assert.ok(SOURCES.some((u) => p.html.includes(`href="${u}"`)), "no Decisions API source linked");
  assert.match(/<title>([^<]*)<\/title>/.exec(p.html)[1], /OpenAI Decisions API/);
  assert.match(meta(p.html, "description"), /Decisions API/);
});

test("the Decisions API is framed as a preview, not as something we tested", () => {
  const t = text(page().html);
  assert.match(t, /not results for the Decisions API itself|not a test of the (?:OpenAI Decisions )?API itself/);
  for (const p of content) assert.doesNotMatch(text(p.html), /we (?:tested|benchmarked|measured) the (?:OpenAI )?Decisions API/i, p.path);
});

test("no page says whether the Decisions API returns a confidence score", () => {
  for (const p of content) {
    for (const s of text(p.html).split(/(?<=[.!?])\s+/)) {
      if (/Decisions API/.test(s)) assert.doesNotMatch(s, /confidence|probabilit/i, `${p.path}: "${s}"`);
    }
  }
});
