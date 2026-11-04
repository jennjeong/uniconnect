// The sitemap search engines read: the site's public pages at its address,
// made at build from frontend/site.config.json (vite.config.ts serves
// and emits it as /sitemap.xml). lib/sitemap.test.ts checks that each page
// is a real screen open to search.

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")

export function sitemapXml(siteUrl: string, paths: string[]) {
  const base = siteUrl.replace(/\/$/, "")
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map((path) => `  <url><loc>${escapeXml(base + path)}</loc></url>`),
    "</urlset>",
    "",
  ].join("\n")
}
