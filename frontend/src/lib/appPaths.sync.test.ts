import { describe, expect, test } from "vitest"

import { isAppPath } from "../../../backend/src/lib/appPaths"
import vercel from "../../../vercel.json"
import { readView, viewPath } from "./route"
import { sampleViews } from "./route.samples"

// The server answers 404 for addresses no screen has (backend/src/lib/
// appPaths.ts), so its list has to agree with route.ts, and with Vercel's
// rewrites (vercel.json), past which Vercel answers 404 with 404.html.
const at = (path: string) => new URL(path, "http://localhost") as unknown as Location

// The forms vercel.json's rewrites use, in path-to-regexp's syntax as
// Vercel reads them: fixed parts, and :name, :name?, :name(pattern) and
// :name(pattern)? segments.
function rewritePattern(source: string) {
  const parts = source.split(/(?=\/)/).map((segment) => {
    const param = /^\/:\w+(?:\((.+)\))?(\?)?$/.exec(segment)
    if (!param) return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const part = `/(?:${param[1] ?? "[^/]+"})`
    return param[2] ? `(?:${part})?` : part
  })
  return new RegExp(`^${parts.join("")}/?$`)
}

const appRewrites = vercel.rewrites
  .filter((rewrite) => rewrite.destination === "/index.html")
  .map((rewrite) => rewritePattern(rewrite.source))
// Vercel serves index.html for / by itself.
const vercelServesApp = (path: string) => path === "/" || appRewrites.some((pattern) => pattern.test(path))

describe("the server's page list matches the screens", () => {
  test.each(sampleViews)("%o is a page the server serves", (view) => {
    expect(isAppPath(new URL(viewPath(view), "http://localhost").pathname)).toBe(true)
  })

  test.each([
    "/",
    "/matches",
    "/groups/abc/",
    "/new",
    "/me/edit",
    "/messages/abc",
    "/faq",
    "/terms",
    "/privacy/",
    "/privacy/x",
    "/admin",
    "/admin/x",
    "/nope",
    "/events/x",
    "/matches/a/b",
    "/me/other",
    "/faq/x",
    "/new/x",
    "/invite/Ab3_x-9Z",
    "/invite",
    "/invite/a/b",
    "/invite/%E0",
    "/invite/a.b",
    "/agreements",
    "/agreements/req-runners",
    "/agreements/a/b",
  ])("%s gets the same answer from both", (path) => {
    expect(isAppPath(path)).toBe(readView(at(path)).missing === undefined)
  })

  test("the check-in page, which main.tsx opens before the app, is served too", () => {
    expect(isAppPath("/check-in/20261012")).toBe(true)
  })
})

describe("Vercel's rewrites match the server's page list", () => {
  test.each(sampleViews)("%o is the app on Vercel", (view) => {
    expect(vercelServesApp(new URL(viewPath(view), "http://localhost").pathname)).toBe(true)
  })

  test.each([
    "/",
    "/matches",
    "/matches/abc",
    "/groups/abc/",
    "/offers",
    "/analytics",
    "/new",
    "/me",
    "/me/edit",
    "/messages",
    "/messages/abc",
    "/faq",
    "/terms",
    "/privacy/",
    "/admin",
    "/invite/Ab3_x-9Z",
    "/agreements",
    "/agreements/req-runners",
    "/check-in/20261012",
    "/check-in/20261012/staff",
    "/nope",
    "/matches/a/b",
    "/me/other",
    "/faq/x",
    "/admin/x",
    "/invite",
    "/invite/a.b",
    "/agreements/a/b",
    "/check-in/20261012/other",
    "/llms.txt",
    "/.well-known/ai-catalog.json",
  ])("%s gets the same answer from both", (path) => {
    expect(vercelServesApp(path)).toBe(isAppPath(path))
  })
})
