// Builds the results site into dist/. The site is a standard Papyrus static site (web/projection.json, web/hooks.py,
// web/css/site-theme.css) whose pages are rendered from data/results.json:
//
//   1. Astro renders the body of every page from the data into .build/astro (src/pages, src/components, src/layouts);
//   2. stage: each body becomes a fragment (.build/stage/web/fragments/<id>.html) and a custom page of projection.json
//      (path, title, description, share card), and the static files Astro copied (social cards, the data file, icons)
//      become the `public` directory that Papyrus publishes verbatim;
//   3. esbuild bundles the browser script (assets/page.js, on every page);
//   4. `papyrus ops content project --all` writes the site into dist/: head, header, footer, sitemap, robots.txt, 404
//      page, Markdown twins and llms.txt, around the fragments (web/hooks.py `main`).
//
//   node scripts/build-site.mjs
//   SITE_URL=https://staging.example.org node scripts/build-site.mjs    a non-production origin (noindex, its own canonicals)
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const site = fileURLToPath(new URL("..", import.meta.url));
const build_ = join(site, ".build");
const astroOut = join(build_, "astro");
const stage = join(build_, "stage");
const staged = { web: join(stage, "web"), content: join(stage, "content") };
const dist = join(site, "dist");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", cwd: site, ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
}

function walk(directory, found = []) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) walk(path, found);
    else found.push(path);
  }
  return found;
}

const META = /<script type="application\/json" id="page-meta">([\s\S]*?)<\/script>/;
const idOf = (path) => (path === "/" ? "home" : path.replace(/^\/|\/$/g, "").replace(/\//g, "~"));

/** Every page Astro rendered becomes a fragment and, except the home and 404 pages (Papyrus makes those), a custom page. */
function stagePages() {
  const pages = [];
  let home = null;
  for (const file of walk(astroOut)) {
    const name = relative(astroOut, file).split(sep).join("/");
    if (!(name === "404.html" || name.endsWith("index.html"))) continue;
    const html = readFileSync(file, "utf8").replace(/^<!DOCTYPE html>/i, "");
    const found = META.exec(html);
    if (!found) throw new Error(`${name} carries no page-meta block (src/layouts/Base.astro)`);
    const meta = JSON.parse(found[1]);
    const kind = name === "404.html" ? "not-found" : name === "index.html" ? "home" : "custom";
    const id = kind === "custom" ? idOf(meta.path) : kind;
    writeFileSync(join(staged.web, "fragments", `${id}.html`), html.replace(META, "").trim() + "\n");
    if (kind === "home") home = meta;
    if (kind !== "custom") continue;
    pages.push({
      id,
      path: meta.path.replace(/^\/|\/$/g, ""),
      title: meta.title,
      description: meta.description,
      dependsOn: [],
      noindex: meta.noindex,
      ...(meta.card ? { image: meta.card.url, imageAlt: meta.card.alt, socialTitle: meta.card.headline } : {}),
    });
  }
  if (!home) throw new Error("Astro rendered no home page");
  pages.sort((a, b) => a.path.localeCompare(b.path));
  return { pages, home };
}

/** Static files Astro copied from public/ and the endpoints it rendered (social cards, the data file) are published verbatim. */
function stagePublic() {
  const publicDirectory = join(staged.web, "public");
  for (const file of walk(astroOut)) {
    const name = relative(astroOut, file).split(sep).join("/");
    if (name === "404.html" || name.endsWith("/index.html") || name === "index.html" || name === "engines-colors.css") continue;
    const target = join(publicDirectory, name);
    mkdirSync(join(target, ".."), { recursive: true });
    cpSync(file, target);
  }
}

async function bundleScripts() {
  const common = { bundle: true, minify: true, platform: "browser", target: ["es2020"], logLevel: "warning" };
  await build({ ...common, entryPoints: [join(site, "src/scripts/page.js")], outfile: join(staged.web, "assets/page.js"), format: "iife" });
}

rmSync(build_, { recursive: true, force: true });
rmSync(dist, { recursive: true, force: true });
mkdirSync(staged.content, { recursive: true });
cpSync(join(site, "web"), staged.web, { recursive: true });
mkdirSync(join(staged.web, "fragments"), { recursive: true });

run(join(site, "node_modules/.bin/astro"), ["build"]);

const { pages, home } = stagePages();
stagePublic();
cpSync(join(astroOut, "engines-colors.css"), join(staged.web, "assets/engines.css"));
// The home page is an authored item, so it can carry its own title (the site name is not its title).
writeFileSync(join(staged.content, "index.md"), `---\ntitle: ${JSON.stringify(home.title)}\ndescription: ${JSON.stringify(home.description)}\n---\n\n${home.description}\n`);
const projection = JSON.parse(readFileSync(join(staged.web, "projection.json"), "utf8"));
projection.site.description = home.description;
projection.seo.defaultImage = home.card.url;
projection.seo.defaultImageAlt = home.card.alt;
projection.seo.homeSocialTitle = home.card.headline;
projection.pages = pages;
writeFileSync(join(staged.web, "projection.json"), JSON.stringify(projection, null, 1) + "\n");
await bundleScripts();

// SITE_URL names another origin to build for (a staging copy); Papyrus then treats the site as non-production.
const environment = { ...process.env };
if (process.env.SITE_URL) environment.PAPYRUS_SITE_PUBLIC_URL = process.env.SITE_URL;
run("bash", [join(site, "scripts/project-site.sh"), staged.content, staged.web, dist], { env: environment });
if (!existsSync(join(dist, "index.html"))) throw new Error("Papyrus wrote no home page");
console.log(`${pages.length + 2} pages (${pages.length} custom, the home page and the 404 page)`);
