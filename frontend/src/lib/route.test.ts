import { afterEach, describe, expect, test, vi } from "vitest"

import { readView, roleOfPage, viewPath } from "./route"
import { sampleViews } from "./route.samples"

const at = (path: string) => new URL(path, "http://localhost") as unknown as Location

describe("addresses", () => {
  afterEach(() => vi.useRealTimers())

  test.each(sampleViews)("%o reads back from its own address", (view) => {
    expect(readView(at(viewPath(view)))).toEqual(view)
  })

  test.each([
    "/nope",
    "/events/x",
    "/matches/a/b",
    "/me/other",
    "/faq/x",
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

  test("pages belong to their side, and the dashboard to both", () => {
    expect(roleOfPage("대시보드")).toBeUndefined()
    expect(roleOfPage("추천 매칭")).toBe("학생단체")
    expect(roleOfPage("받은 제안")).toBe("브랜드")
  })
})
