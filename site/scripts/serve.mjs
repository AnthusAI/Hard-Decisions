// Serves the built site (dist/) the way AWS Amplify hosting will: the redirect and 404 rules from
// ../deploy/amplify-rules.json, the response headers from ../customHttp.yml, and Amplify's clean
// URLs (/about -> /about/ when about/index.html exists). For checking deep links and legacy
// addresses on a hard reload before a deploy. No dependencies.
//
//   node scripts/serve.mjs [port]        (default 4331; `npm run serve` in site/)
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = fileURLToPath(new URL("..", import.meta.url));
const ROOT = join(SITE, "..");
const DIST = join(SITE, "dist");
const PORT = Number(process.argv[2] || process.env.PORT || 4331);

const rules = JSON.parse(readFileSync(join(ROOT, "deploy/amplify-rules.json"), "utf8"));

// customHttp.yml, read for the only shape it uses: pattern / headers / key / value.
function readHeaders() {
  const out = [];
  let cur = null, key = null;
  for (const line of readFileSync(join(ROOT, "customHttp.yml"), "utf8").split("\n")) {
    const unq = (s) => s.trim().replace(/^["']|["']$/g, "");
    let m;
    if ((m = /^\s*- pattern:\s*(.+)$/.exec(line))) out.push((cur = { pattern: unq(m[1]), headers: [] }));
    else if ((m = /^\s*- key:\s*(.+)$/.exec(line))) key = unq(m[1]);
    else if ((m = /^\s*value:\s*(.+)$/.exec(line)) && cur && key) { cur.headers.push([key, unq(m[1])]); key = null; }
  }
  return out;
}
const headerRules = readHeaders();

const globRe = (p) => new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&")
  .replace(/\*\*\//g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, "(?:.*/)?") + "$");
// Later, more specific patterns override a key set by an earlier one.
function headersFor(path) {
  const h = {};
  for (const r of headerRules) {
    const target = r.pattern.startsWith("/") ? path : path.replace(/^\//, "");
    if (globRe(r.pattern).test(target)) for (const [k, v] of r.headers) h[k] = v;
  }
  return h;
}

// An Amplify source ("/engine.html?e=<e>", "/<*>") as a matcher returning its placeholders.
function matcher(source) {
  const [p, q] = source.split("?");
  const names = [];
  const re = new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/<(\*|[a-z0-9-]+)>/gi, (_, n) => {
    names.push(n); return n === "*" ? "(.*)" : "([^/]+)";
  }) + "$");
  const query = q ? q.split("&").map((kv) => { const [k, v] = kv.split("="); return [k, /^<(.+)>$/.exec(v)?.[1] ?? null, v]; }) : [];
  return (url) => {
    const m = re.exec(url.pathname);
    if (!m) return null;
    const vars = Object.fromEntries(names.map((n, i) => [n, m[i + 1]]));
    for (const [k, name, lit] of query) {
      const v = url.searchParams.get(k);
      if (v === null) return null;
      if (name) vars[name] = v; else if (v !== lit) return null;
    }
    return vars;
  };
}
const compiled = rules.map((r) => ({ ...r, match: matcher(r.source) }));
const fill = (target, vars) => target.replace(/<(\*|[a-z0-9-]+)>/gi, (_, n) => vars[n] ?? "");

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8", ".woff": "font/woff", ".woff2": "font/woff2" };

function fileFor(pathname) {
  const p = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const f = join(DIST, p);
  if (!f.startsWith(DIST)) return null;
  if (existsSync(f) && statSync(f).isFile()) return f;
  if (existsSync(join(f, "index.html"))) return join(f, "index.html");
  return null;
}

function send(res, status, file, path, extra = {}) {
  const body = readFileSync(file);
  res.writeHead(status, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", ...headersFor(path), ...extra });
  res.end(body);
}

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  for (const r of compiled) {
    const vars = r.match(url);
    if (!vars) continue;
    if (r.status === "301" || r.status === "302") {
      const to = fill(r.target, vars);
      res.writeHead(Number(r.status), { Location: to, ...headersFor(url.pathname) });
      return res.end();
    }
    if (r.status === "200") {
      const f = fileFor(fill(r.target, vars));
      if (f) return send(res, 200, f, url.pathname);
    }
    if (r.status === "404") {
      const f = fileFor(url.pathname);
      if (f) {
        // Amplify's clean URLs: a directory without its trailing slash redirects to it.
        if (f.endsWith("index.html") && !url.pathname.endsWith("/") && !url.pathname.endsWith(".html")) {
          res.writeHead(301, { Location: `${url.pathname}/${url.search}` });
          return res.end();
        }
        return send(res, 200, f, url.pathname);
      }
      return send(res, 404, fileFor(r.target), url.pathname);
    }
  }
  const f = fileFor(url.pathname);
  if (f) return send(res, 200, f, url.pathname);
  res.writeHead(404); res.end("not found");
}).listen(PORT, "127.0.0.1", () => console.log(`Serving site/dist with the Amplify rules at http://127.0.0.1:${PORT}/`));
