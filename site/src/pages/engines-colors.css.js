// The colour of every model as custom properties (light, dark, print). scripts/build-site.mjs publishes it as
// assets/engines.css, linked on every page by web/projection.json.
import { allModels } from "../lib/site.js";

export function GET() {
  const light = allModels.map((e) => `--eng-${e.slug}: ${e.color};`).join(" ");
  const dark = allModels.map((e) => `--eng-${e.slug}: ${e.color_dark || e.color};`).join(" ");
  const css = `:root { ${light} }\n@media (prefers-color-scheme: dark) { :root { ${dark} } }\n@media print { :root { ${light} } }\n`;
  return new Response(css, { headers: { "Content-Type": "text/css; charset=utf-8" } });
}
