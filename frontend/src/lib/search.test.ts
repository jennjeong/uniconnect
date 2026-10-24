import { describe, expect, test } from "vitest"

import type { Match } from "../types"
import { matchesGroupFilters, matchesQuery, noGroupFilters } from "./search"

const listing = (fields: Partial<Match>): Match => ({
  id: "x",
  name: "이름",
  category: "카페 · 디저트",
  industry: "cafe",
  offer: "음료 쿠폰 100장",
  score: 80,
  tags: ["캠퍼스 근처"],
  ...fields,
})

describe("catalog search", () => {
  const coffee = listing({ name: "오후의 커피", tags: ["대학생 선호", "반경 1.2km"] })

  test("finds every word typed, in the name, kind, offer or tags", () => {
    expect(matchesQuery(coffee, "")).toBe(true)
    expect(matchesQuery(coffee, "커피")).toBe(true)
    expect(matchesQuery(coffee, "디저트 쿠폰")).toBe(true)
    expect(matchesQuery(coffee, "대학생")).toBe(true)
    expect(matchesQuery(coffee, "커피 미용")).toBe(false)
  })

  test("looks at a group's school and next event too", () => {
    const band = listing({ name: "과기대 소리샘", school: "서울과학기술대학교", eventName: "연말 밴드 공연" })
    expect(matchesQuery(band, "과학기술")).toBe(true)
    expect(matchesQuery(band, "밴드 공연")).toBe(true)
  })
})

describe("group filters", () => {
  const today = "2026-10-24"
  const group = (audience: number | undefined, eventDate: string | undefined, school = "삼육대학교") =>
    listing({ audience, eventDate, school })

  test("sort the next event by size", () => {
    expect(matchesGroupFilters(group(80, "2026-11-01"), { ...noGroupFilters, size: "small" }, today)).toBe(true)
    expect(matchesGroupFilters(group(200, "2026-11-01"), { ...noGroupFilters, size: "medium" }, today)).toBe(true)
    expect(matchesGroupFilters(group(300, "2026-11-01"), { ...noGroupFilters, size: "large" }, today)).toBe(true)
    expect(matchesGroupFilters(group(undefined, undefined), { ...noGroupFilters, size: "unknown" }, today)).toBe(true)
    expect(matchesGroupFilters(group(300, "2026-11-01"), { ...noGroupFilters, size: "small" }, today)).toBe(false)
  })

  test("sort the next event by month, the year turning over", () => {
    expect(matchesGroupFilters(group(80, "2026-10-30"), { ...noGroupFilters, when: "thisMonth" }, today)).toBe(true)
    expect(matchesGroupFilters(group(80, "2026-11-15"), { ...noGroupFilters, when: "nextMonth" }, today)).toBe(true)
    expect(matchesGroupFilters(group(80, "2027-02-01"), { ...noGroupFilters, when: "later" }, today)).toBe(true)
    expect(matchesGroupFilters(group(80, "2027-01-05"), { ...noGroupFilters, when: "nextMonth" }, "2026-12-20")).toBe(true)
    expect(matchesGroupFilters(group(80, undefined), { ...noGroupFilters, when: "unknown" }, today)).toBe(true)
  })

  test("keep one school, or any", () => {
    expect(matchesGroupFilters(group(80, undefined, "광운대학교"), { ...noGroupFilters, school: "광운대학교" }, today)).toBe(true)
    expect(matchesGroupFilters(group(80, undefined, "광운대학교"), { ...noGroupFilters, school: "삼육대학교" }, today)).toBe(false)
    expect(matchesGroupFilters(group(80, undefined, "광운대학교"), noGroupFilters, today)).toBe(true)
  })
})
