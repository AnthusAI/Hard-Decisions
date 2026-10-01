// Draws a social card: Satori lays out the card from lib/cards.js's words and numbers (text
// becomes outlines, with the fonts embedded), resvg rasterises it to a 1200 x 630 PNG. Both run at
// build time only. Adapted from Biased-Decisions' cards: same type, ground, furniture and layout.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import satori from "satori";
import { modelById } from "./site.js";

const require = createRequire(import.meta.url);
const fontFile = (pkg, file) => readFileSync(require.resolve(`${pkg}/files/${file}`));

export const W = 1200;
export const H = 630;

// Palette tokens from site.css (light ground); every text colour AA on the ground.
const C = { ground: "#f1f9fe", ink: "#0c1e2b", ink2: "#33485a", muted: "#5b6f7d", rule: "#d5e3ec", track: "#e3eef5", accent: "#0377bd" };

let fonts = null;
function loadFonts() {
  if (!fonts) {
    fonts = [
      { name: "Jersey 25", data: fontFile("@fontsource/jersey-25", "jersey-25-latin-400-normal.woff"), weight: 400, style: "normal" },
      { name: "Montserrat", data: fontFile("@fontsource/montserrat", "montserrat-latin-500-normal.woff"), weight: 500, style: "normal" },
      { name: "Montserrat", data: fontFile("@fontsource/montserrat", "montserrat-latin-600-normal.woff"), weight: 600, style: "normal" },
      { name: "Montserrat", data: fontFile("@fontsource/montserrat", "montserrat-latin-700-normal.woff"), weight: 700, style: "normal" },
    ];
  }
  return fonts;
}

let resvgReady = null;
async function resvg() {
  if (!resvgReady) {
    resvgReady = (async () => {
      const mod = await import("@resvg/resvg-wasm");
      await mod.initWasm(readFileSync(require.resolve("@resvg/resvg-wasm/index_bg.wasm")));
      return mod.Resvg;
    })();
  }
  return resvgReady;
}

const el = (type, style, ...children) => ({ type, props: { style, children: children.flat().filter((c) => c !== null && c !== false && c !== undefined) } });

function marker(id, size) {
  const e = modelById[id];
  const fill = e.color;
  const shape = e.marker === "square" ? { type: "rect", props: { x: 3, y: 3, width: 18, height: 18, rx: 2, fill } }
    : e.marker === "diamond" ? { type: "path", props: { d: "M12 1 L23 12 L12 23 L1 12 Z", fill } }
    : e.marker === "diamond-open" ? { type: "path", props: { d: "M12 3.5 L20.5 12 L12 20.5 L3.5 12 Z", fill: "none", stroke: fill, strokeWidth: 3.5 } }
    : e.marker === "triangle" ? { type: "path", props: { d: "M12 2 L22.5 21 L1.5 21 Z", fill } }
    : { type: "circle", props: { cx: 12, cy: 12, r: 10, fill } };
  return { type: "svg", props: { width: size, height: size, viewBox: "0 0 24 24", style: { display: "flex", flexShrink: 0 }, children: [shape] } };
}

// The staircase from the wordmark.
const steps = (size, color) => ({ type: "svg", props: { width: size, height: size, viewBox: "0 0 41 41", style: { display: "flex", marginLeft: 10 },
  children: [0, 1, 2, 3, 4, 5].map((k) => ({ type: "rect", props: { x: 4 + 5 * k, y: 36 - 4 * k, width: 5, height: 5 + 4 * k, fill: color } })) } });

export function cardTree(card) {
  const headSize = card.headline.length > 70 ? 42 : card.headline.length > 52 ? 46 : 50;
  function barsSection() {
    return el("div", { display: "flex", flexDirection: "column", alignItems: "center", marginTop: 14, width: 1040, gap: 6 },
      card.bars.map((b) =>
        el("div", { display: "flex", alignItems: "center", height: 50, width: 1040 },
          marker(b.engine, 36),
          el("div", { display: "flex", fontSize: 34, fontWeight: 700, width: 250, marginLeft: 14, color: C.ink }, modelById[b.engine].label),
          el("div", { width: 540, height: 30, backgroundColor: C.track, borderRadius: 6, display: "flex" },
            b.value > 0 ? el("div", { display: "flex", width: Math.max(8, Math.round(540 * b.value)), height: 30, borderRadius: 6, backgroundColor: modelById[b.engine].color }) : null),
          el("div", { display: "flex", fontSize: 34, fontWeight: 600, marginLeft: 18, color: C.ink }, b.text))),
      el("div", { display: "flex", fontSize: 28, color: C.muted, marginTop: 6 }, card.numberNote));
  }
  return el("div", { width: W, height: H, display: "flex", flexDirection: "column", alignItems: "center",
    backgroundColor: C.ground, color: C.ink, fontFamily: "Montserrat", padding: "34px 48px 30px", position: "relative" },
    el("div", { position: "absolute", top: 0, left: 0, width: W, height: 8, backgroundColor: C.accent, display: "flex" }),
    el("div", { position: "absolute", top: 30, left: 48, display: "flex", alignItems: "flex-end", fontFamily: "Jersey 25", fontSize: 44, color: C.ink },
      "Hard", el("span", { color: C.muted, marginLeft: 10 }, "Decisions"), steps(40, C.ink)),
    el("div", { position: "absolute", top: 44, right: 48, display: "flex", fontSize: 24, fontWeight: 600, color: C.muted, letterSpacing: 1 }, card.stamp),
    el("div", { display: "flex", marginTop: 74, width: 900, justifyContent: "center", textAlign: "center",
      fontSize: headSize, fontWeight: 700, lineHeight: 1.14, color: C.ink }, card.headline),
    card.bars ? barsSection() : card.number ? el("div", { display: "flex", flexDirection: "column", alignItems: "center", marginTop: 8 },
      el("div", { display: "flex", alignItems: "center", gap: 24, fontFamily: "Jersey 25", fontSize: 120, lineHeight: 1, color: C.ink }, card.number),
      el("div", { display: "flex", fontSize: 34, fontWeight: 500, color: C.ink2, marginTop: 2, textAlign: "center", maxWidth: 1080 }, card.numberNote)) : null,
    el("div", { display: "flex", flexDirection: "column", alignItems: "center", marginTop: "auto", gap: 6 },
      card.rows.map((r) => el("div", { display: "flex", alignItems: "center", fontSize: 32, fontWeight: 500, color: C.ink2, maxWidth: 1100, textAlign: "center" },
        r.engine ? marker(r.engine, 30) : null,
        el("span", { marginLeft: r.engine ? 12 : 0 }, r.text)))),
  );
}

export async function renderPng(card) {
  const svg = await satori(cardTree(card), { width: W, height: H, fonts: loadFonts() });
  const Resvg = await resvg();
  return new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
}
