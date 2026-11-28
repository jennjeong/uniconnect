import { describe, expect, test } from "vitest"

import site from "../../site.config.json"
import vercel from "../../../vercel.json"
import { pageDocument, pageDocuments, pageFileName } from "./pageDocument"

const shell = `<!doctype html>
<html lang="ko">
  <head>
    <title>uniconnect</title>
    <meta name="description" content="사이트 소개">
    <meta property="og:title" content="uniconnect">
    <meta property="og:description" content="사이트 소개">
  </head>
  <body><div id="root"></div></body>
</html>`

describe("each sitemap page's own HTML", () => {
  test("carries the page's title, description and address", () => {
    const doc = pageDocument(shell, { title: "자주 묻는 질문 · <uni>", description: '"따옴표"와 & 기호', url: "https://example.com/faq" })
    expect(doc).toContain("<title>자주 묻는 질문 · &lt;uni&gt;</title>")
    expect(doc).toContain('<meta name="description" content="&quot;따옴표&quot;와 &amp; 기호">')
    expect(doc).toContain('<meta property="og:title" content="자주 묻는 질문 · &lt;uni&gt;">')
    expect(doc).toContain('<link rel="canonical" href="https://example.com/faq">')
    expect(doc).toContain('<meta property="og:url" content="https://example.com/faq">')
    expect(doc.match(/name="description"/g)).toHaveLength(1)
    expect(doc.match(/rel="canonical"/g)).toHaveLength(1)
    expect(doc).toContain('<div id="root"></div>')
  })

  test("is made for every sitemap page but /, each with its own title", () => {
    const documents = pageDocuments(shell, site.sitemap, "https://example.com")
    expect(documents.map(([name]) => name)).toEqual(site.sitemap.filter((path) => path !== "/").map((path) => path.slice(1)))
    const titles = documents.map(([, doc]) => /<title>([^<]*)<\/title>/.exec(doc)?.[1])
    expect(new Set(titles).size).toBe(documents.length)
    expect(titles).not.toContain("uniconnect")
    expect(pageDocuments(shell, site.sitemap, undefined)).toEqual([])
    expect(pageFileName("/")).toBeUndefined()
    expect(pageFileName("/groups/abc")).toBeUndefined()
  })

  test("is what Vercel serves at each page, before the shared page", () => {
    const rewrites = vercel.rewrites.map((rewrite) => `${rewrite.source} ${rewrite.destination}`)
    const shared = vercel.rewrites.findIndex((rewrite) => rewrite.destination === "/index.html")
    for (const path of site.sitemap) {
      const name = pageFileName(path)
      if (!name) continue
      const at = rewrites.indexOf(`${path} /seo/${name}.html`)
      expect(at, path).toBeGreaterThan(-1)
      expect(at, path).toBeLessThan(shared)
    }
    expect(rewrites.filter((rewrite) => rewrite.includes("/seo/"))).toHaveLength(site.sitemap.length - 1)
  })
})
