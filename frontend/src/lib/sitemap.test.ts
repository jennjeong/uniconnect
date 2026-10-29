import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"

import site from "../../.figma/make/site.json"
import { isAppPath } from "../../../backend/src/lib/appPaths"
import { pageMeta } from "./pageMeta"
import { readView, roleOfPage, viewPath } from "./route"
import { sitemapXml } from "./sitemap"

const at = (path: string) => new URL(path, "http://localhost") as unknown as Location

describe("the sitemap", () => {
  test("lists only real screens that search engines may show", () => {
    for (const path of site.sitemap) {
      expect(isAppPath(path), path).toBe(true)
      const view = readView(at(path))
      expect(viewPath(view), path).toBe(path)
      const meta = pageMeta(view, { role: roleOfPage(view.page) ?? "학생단체", page: view.page })
      expect(meta.noindex, path).toBeUndefined()
    }
  })

  test("robots.txt points to it at the site's address", () => {
    const robots = readFileSync(new URL("../../public/robots.txt", import.meta.url), "utf8")
    expect(robots).toContain(`Sitemap: ${site.url}/sitemap.xml`)
  })

  test("is the sitemaps.org format with each page at the site's address", () => {
    const xml = sitemapXml("https://example.com/", ["/", "/faq?a=1&b=2"])
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')).toBe(true)
    expect(xml).toContain("<url><loc>https://example.com/</loc></url>")
    expect(xml).toContain("<url><loc>https://example.com/faq?a=1&amp;b=2</loc></url>")
  })
})
