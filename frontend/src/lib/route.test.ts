import { afterEach, describe, expect, test, vi } from "vitest"

import { entryView, menuPageOf, readView, roleOfPage, viewPath } from "./route"
import { sampleViews } from "./route.samples"

const at = (path: string) => new URL(path, "http://localhost") as unknown as Location

describe("addresses", () => {
  afterEach(() => vi.useRealTimers())

  test.each(sampleViews)("%o reads back from its own address", (view) => {
    expect(readView(at(viewPath(view)))).toEqual(view)
  })

  test.each([
    "/nope",
    "/dashboard/x",
    "/events/x",
    "/matches/a/b",
    "/me/other",
    "/faq/x",
    "/terms/x",
    "/new/x",
    "/matches/%E0",
    "/messages/%E0%A4%A",
  ])("%s is the 404 screen, kept as typed", (path) => {
    expect(readView(at(path))).toEqual({ page: "대시보드", missing: path })
  })

  test("a registration address without a real day opens on today", () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 22, 10) })
    expect(readView(at("/new?date=tomorrow")).create).toBe("2026-10-22")
    expect(readView(at("/new")).create).toBe("2026-10-22")
  })

  // 대시보드의 '보낸 제안 답변 대기'는 받은편지함의 보낸 제안 쪽을 연다.
  test("an inbox opens on the sent side by its address", () => {
    expect(viewPath({ page: "받은 제안", box: "sent" })).toBe("/inbox?box=sent")
    expect(readView(at("/inbox?box=sent"))).toEqual({ page: "받은 제안", box: "sent" })
    expect(readView(at("/offers?box=sent"))).toEqual({ page: "받은 협찬", box: "sent" })
    expect(readView(at("/inbox?box=other"))).toEqual({ page: "받은 제안" })
    expect(readView(at("/matches?box=sent"))).toEqual({ page: "추천 매칭" })
  })

  test("visitors land on the introduction at /, and the dashboard has its own address", () => {
    expect(readView(at("/"))).toEqual({ page: "대시보드", home: true })
    expect(viewPath({ page: "대시보드" })).toBe("/dashboard")
  })

  test("a history entry kept before the dashboard moved gives way to the address", () => {
    expect(entryView({ view: { page: "대시보드" }, index: 0 }, at("/"))).toEqual({ page: "대시보드", home: true })
    expect(entryView({ view: { page: "추천 매칭", chat: "c1" }, index: 2 }, at("/messages/c1"))).toEqual({
      page: "추천 매칭",
      chat: "c1",
    })
    expect(entryView(null, at("/dashboard"))).toEqual({ page: "대시보드" })
  })

  test("pages belong to their side, and the dashboard to both", () => {
    expect(roleOfPage("대시보드")).toBeUndefined()
    expect(roleOfPage("추천 매칭")).toBe("학생단체")
    expect(roleOfPage("받은 제안")).toBe("브랜드")
  })
})

describe("menuPageOf", () => {
  test("marks the page itself and its brands or groups", () => {
    expect(menuPageOf({ page: "추천 매칭" }, "추천 매칭")).toBe("추천 매칭")
    expect(menuPageOf({ page: "추천 매칭", detail: "afternoon-coffee" }, "추천 매칭")).toBe("추천 매칭")
  })

  test("marks no page on a screen outside the menu, though the view keeps one", () => {
    expect(menuPageOf({ page: "대시보드", board: true }, "대시보드")).toBeUndefined()
    expect(menuPageOf({ page: "대시보드", faq: true }, "대시보드")).toBeUndefined()
    expect(menuPageOf({ page: "대시보드", missing: "/nowhere" }, "대시보드")).toBeUndefined()
  })
})
