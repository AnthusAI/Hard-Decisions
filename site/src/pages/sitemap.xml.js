// /sitemap.xml: every indexable page, from the same list the social cards are made from.
import { allCards } from "../lib/cards.js";
import { data } from "../lib/site.js";

export function GET({ site }) {
  const lastmod = data.provenance.generated;
  const urls = allCards().map((c) => `  <url><loc>${new URL(c.path, site).href}</loc><lastmod>${lastmod}</lastmod></url>`).join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
