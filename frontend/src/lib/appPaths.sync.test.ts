import { describe, expect, test } from "vitest"

import { isAppPath } from "../../../backend/src/lib/appPaths"
import vercel from "../../../vercel.json"
import { readView, viewPath } from "./route"
import { sampleViews } from "./route.samples"

// 서버는 어느 화면에도 없는 주소에 404를 답한다 (backend/src/lib/appPaths.ts).
// 그래서 그 목록은 route.ts와, 그리고 Vercel의 rewrites(vercel.json)와 같아야
// 한다. rewrites에 걸리지 않으면 Vercel이 404.html로 404를 답한다.
const at = (path: string) => new URL(path, "http://localhost") as unknown as Location

// vercel.json의 rewrites가 쓰는 형태. Vercel이 읽는 path-to-regexp 문법으로,
// 고정 부분과 :name, :name?, :name(pattern), :name(pattern)? 세그먼트다.
// Vercel은 이를 엄격하게 맞추므로 끝의 슬래시는 어느 것에도 속하지 않는다.
function rewritePattern(source: string) {
  const parts = source.split(/(?=\/)/).map((segment) => {
    const param = /^\/:\w+(?:\((.+)\))?(\?)?$/.exec(segment)
    if (!param) return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const part = `/(?:${param[1] ?? "[^/]+"})`
    return param[2] ? `(?:${part})?` : part
  })
  return new RegExp(`^${parts.join("")}$`)
}

const appRewrites = vercel.rewrites
  .filter((rewrite) => rewrite.destination === "/index.html")
  .map((rewrite) => rewritePattern(rewrite.source))
// trailingSlash가 false이면 Vercel은 먼저 슬래시로 끝나는 주소를 슬래시 없는
// 같은 주소로 보내고(308), /에는 알아서 index.html을 서빙한다.
const vercelServesApp = (path: string) => {
  const target = vercel.trailingSlash === false && path !== "/" ? path.replace(/\/$/, "") : path
  return target === "/" || appRewrites.some((pattern) => pattern.test(target))
}

describe("the server's page list matches the screens", () => {
  test.each(sampleViews)("%o is a page the server serves", (view) => {
    expect(isAppPath(new URL(viewPath(view), "http://localhost").pathname)).toBe(true)
  })

  test.each([
    "/",
    "/dashboard",
    "/dashboard/x",
    "/matches",
    "/groups/abc/",
    "/new",
    "/me/edit",
    "/messages/abc",
    "/faq",
    "/plans",
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
    "/edit/event-1",
    "/edit",
    "/edit/a/b",
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

  test("the check-in page and its venue pages, which main.tsx opens before the app, are served too", () => {
    expect(isAppPath("/check-in/20261012")).toBe(true)
    expect(isAppPath("/check-in/20261012/staff")).toBe(true)
    expect(isAppPath("/check-in/20261012/group")).toBe(true)
  })
})

describe("Vercel's rewrites match the server's page list", () => {
  test.each(sampleViews)("%o is the app on Vercel", (view) => {
    expect(vercelServesApp(new URL(viewPath(view), "http://localhost").pathname)).toBe(true)
  })

  test.each([
    "/",
    "/dashboard",
    "/dashboard/",
    "/dashboard/x",
    "/matches",
    "/matches/abc",
    "/groups/abc/",
    "/offers",
    "/analytics",
    "/new",
    "/edit/event-1",
    "/edit",
    "/edit/a/b",
    "/me",
    "/me/edit",
    "/messages",
    "/messages/abc",
    "/faq",
    "/plans",
    "/faq/",
    "/terms",
    "/privacy/",
    "/admin",
    "/invite/Ab3_x-9Z",
    "/agreements",
    "/agreements/req-runners",
    "/check-in/20261012",
    "/check-in/20261012/staff",
    "/check-in/20261012/staff/",
    "/check-in/20261012/group",
    "/nope",
    "/nope/",
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

  // Express는 슬래시로 끝나는 앱 주소도 서빙한다. Vercel의 rewrites는 그런
  // 주소에 맞지 않으므로 Vercel이 먼저 슬래시를 떼어야 한다.
  test("an address ending in a slash reaches the app through Vercel's redirect", () => {
    expect(vercel.trailingSlash).toBe(false)
    expect(appRewrites.some((pattern) => pattern.test("/faq/"))).toBe(false)
    expect(vercelServesApp("/faq/")).toBe(true)
  })
})
