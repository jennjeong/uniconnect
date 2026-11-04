// 검색 엔진이 읽는 사이트맵: 사이트의 공개 페이지를 사이트 주소와 함께 담는다.
// 빌드할 때 frontend/site.config.json으로 만들며 (vite.config.ts가
// /sitemap.xml로 서빙하고 내보낸다), lib/sitemap.test.ts가 각 페이지가 검색에
// 열린 실제 화면인지 검사한다.

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
