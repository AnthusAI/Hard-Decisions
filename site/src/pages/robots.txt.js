// /robots.txt, naming the sitemap on this build's origin.
export function GET({ site }) {
  const body = `User-agent: *\nDisallow: /og-gallery/\n\nSitemap: ${new URL("sitemap.xml", site).href}\n`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
