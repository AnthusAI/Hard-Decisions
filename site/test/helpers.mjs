// Shared readers for the specs: they read dist/ and data/results.json only (run after the build).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
export const DATA = JSON.parse(readFileSync(new URL("../data/results.json", import.meta.url), "utf8"));
export const SITE = (process.env.SITE_URL || "https://hard-decisions.anth.us").replace(/\/$/, "");

export function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
export const files = walk(DIST);
const urlOf = (file) => "/" + relative(DIST, file).split(sep).join("/").replace(/index\.html$/, "");
export const pages = files.filter((f) => f.endsWith("index.html")).map((f) => ({ file: f, path: urlOf(f), html: readFileSync(f, "utf8") }));
export const noindex = (p) => /<meta name="robots" content="noindex">/.test(p.html);
export const content = pages.filter((p) => !noindex(p));

export const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
export function meta(html, key) {
  const re = new RegExp(`<meta (?:property|name)="${key.replace(/[.:]/g, "\\$&")}" content="([^"]*)"`);
  const m = re.exec(html);
  return m ? unescape(m[1]) : null;
}
export function text(html) {
  const at = html.indexOf("<body");
  const body = at >= 0 ? html.slice(at) : html;
  return unescape(body.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
}
export const strip = (s) => unescape(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
export function headings(html) {
  return [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => ({ level: Number(m[1]), text: strip(m[2]) }));
}
export const pct = (x) => (100 * x).toFixed(1);
