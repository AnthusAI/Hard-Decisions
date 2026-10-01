// The wordmark's icon and the favicons: a pixel staircase of six steps, one per proof depth, drawn
// on the same grid as Biased-Decisions' scales (25-step capital height in a 41-step em, base on the
// text baseline) so CSS can size it to 1em beside the Jersey 25 wordmark.
//
//   node scripts/generate-logo.mjs     writes src/assets/steps.svg and public/favicon*.{svg,png}
import { writeFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rows = [];
// Six steps, each 5 wide; step k is 4k+5 high. The top step is 25 high (the capital height).
for (let k = 0; k < 6; k++) {
  const x = 4 + k * 5, h = 4 * k + 5;
  rows.push(`M${x} ${41 - h}h5v${h}h-5z`);
}
const path = rows.join("");
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 41 41" width="1em" height="1em"><path fill="currentColor" d="${path}"/></svg>\n`;
writeFileSync(new URL("../src/assets/steps.svg", import.meta.url), icon);

// Favicon: the staircase on the ink ground, the top step in the accent blue.
const fav = (size) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 41 41" width="${size}" height="${size}"><rect width="41" height="41" rx="7" fill="#0c1e2b"/><g transform="translate(1.5 -8)">${
  rows.map((d, i) => `<path fill="${i === rows.length - 1 ? "#3aa7ec" : "#e8f2f8"}" d="${d}"/>`).join("")}</g></svg>\n`;
writeFileSync(new URL("../public/favicon.svg", import.meta.url), fav(41));

const { initWasm, Resvg } = await import("@resvg/resvg-wasm");
await initWasm(readFileSync(require.resolve("@resvg/resvg-wasm/index_bg.wasm")));
for (const [name, size] of [["favicon-32.png", 32], ["favicon-16.png", 16], ["apple-touch-icon.png", 180]]) {
  const png = new Resvg(fav(size), { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(new URL(`../public/${name}`, import.meta.url), png);
}
console.log("wrote src/assets/steps.svg and public/favicon.svg, favicon-16.png, favicon-32.png, apple-touch-icon.png");
