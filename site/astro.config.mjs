// The results site is static: every page is generated at build time from data/results.json, which
// scripts/collect.mjs writes from the harness's outputs (studies/, engines.yaml, the run manifests).
// No server runtime.
//
// SITE_URL is the public origin for canonical URLs, the sitemap and Open Graph tags; it defaults to
// the production domain, so every build names https://hard-decisions.anth.us unless told otherwise.
// BASE_PATH serves the site from a sub-path.
import { defineConfig } from "astro/config";

export default defineConfig({
  site: process.env.SITE_URL || "https://hard-decisions.anth.us",
  base: process.env.BASE_PATH || "/",
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
  devToolbar: { enabled: false },
  server: { host: "127.0.0.1", port: 4331 },
});
