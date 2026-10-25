import { describe, expect, test } from "vitest"

import { brandNotifications, soonNotices, studentNotifications } from "./notifications"
import type { Match } from "../types"

describe("notices for a member with nothing yet", () => {
  const match: Match = { id: "brand-1", name: "첫 카페", category: "카페 · 식음료", industry: "cafe", offer: "", score: 70, tags: [] }

  test("a group or a brand that just joined has none, so the bell has nothing to point at", () => {
    expect(studentNotifications({ matches: [], brands: [], statuses: {}, report: null, offers: [], events: [] })).toEqual([])
    expect(brandNotifications({ matches: [], requests: [], sponsorships: [], events: [] })).toEqual([])
  })

  test("the matches are a notice once there are some", () => {
    const student = studentNotifications({ matches: [match], brands: [match], statuses: {}, report: null, offers: [], events: [] })
    expect(student.map((notice) => notice.title)).toEqual(["새 추천 매칭 1건"])
    const brand = brandNotifications({ matches: [match], requests: [], sponsorships: [], events: [] })
    expect(brand.map((notice) => notice.title)).toEqual(["추천 학생단체 1곳"])
  })
})

describe("notices of the days that are near", () => {
  const entries = [
    { id: "far", name: "먼 공연", date: "2026-11-30" },
    { id: "three", name: "사흘 뒤 공연", date: "2026-11-28" },
    { id: "today", name: "오늘 공연", date: "2026-11-25" },
    { id: "tomorrow", name: "내일 공연", date: "2026-11-26" },
    { id: "past", name: "어제 공연", date: "2026-11-24" },
  ]

  test("lists the days three days away or nearer, nearest first", () => {
    const notices = soonNotices(entries, "내 행사", "2026-11-25")
    expect(notices.map((notice) => notice.title)).toEqual([
      "오늘은 ‘오늘 공연’ 날이에요",
      "내일은 ‘내일 공연’ 날이에요",
      "‘사흘 뒤 공연’까지 3일 남았어요",
    ])
    expect(notices.every((notice) => notice.icon === "calendar" && notice.target === "내 행사")).toBe(true)
    expect(notices[0].key).toBe("soon-today")
  })

  test("has nothing when no day is near", () => {
    expect(soonNotices(entries, "행사 일정", "2026-12-10")).toEqual([])
  })
})
