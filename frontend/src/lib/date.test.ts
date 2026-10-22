import { afterEach, describe, expect, test, vi } from "vitest"

import {
  calendarDays,
  dDayLabel,
  daysOf,
  daysUntil,
  formatDay,
  formatFullDate,
  formatPeriod,
  fromIsoDate,
  nextEvent,
  semesterLabel,
  toIsoDate,
} from "./date"

// Displayed dates join their parts with no-break spaces.
const spaced = (text: string) => text.replace(/ /g, " ")

describe("days", () => {
  afterEach(() => vi.useRealTimers())

  test("an ISO day is local midnight and comes back the same", () => {
    expect(fromIsoDate("2026-11-27")).toEqual(new Date(2026, 10, 27))
    expect(toIsoDate(new Date(2026, 10, 27, 23, 59))).toBe("2026-11-27")
    expect(fromIsoDate("2026-11-7")).toBeUndefined()
    expect(fromIsoDate("미정")).toBeUndefined()
  })

  test("days until a day count across months", () => {
    expect(daysUntil("2026-11-30", "2026-11-27")).toBe(3)
    expect(daysUntil("2026-12-01", "2026-11-30")).toBe(1)
    expect(daysUntil("2026-11-27", "2026-11-30")).toBe(-3)
    expect(daysUntil("미정", "2026-11-30")).toBe(0)
  })

  test("a period lists each of its days, both ends included", () => {
    expect(daysOf("2026-11-29", "2026-12-02")).toEqual([
      "2026-11-29",
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
    ])
    expect(daysOf("2026-11-27")).toEqual(["2026-11-27"])
    expect(daysOf("미정")).toEqual(["미정"])
  })

  test("days and periods read in Korean", () => {
    expect(formatDay("2026-11-27")).toBe(spaced("11월 27일 (금)"))
    expect(formatFullDate("2026-11-27")).toBe(spaced("2026. 11. 27. (금)"))
    expect(formatPeriod("2026-11-27")).toBe(formatDay("2026-11-27"))
    expect(formatPeriod("2026-11-27", "2026-11-27")).toBe(formatDay("2026-11-27"))
    expect(formatPeriod("2026-11-27", "2026-11-29")).toBe(
      `${spaced("11월 27일 (금)")} ~ ${spaced("11월 29일 (일)")} · 3일`,
    )
    expect(formatDay("미정")).toBe("미정")
  })

  test("D-day labels count from today", () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 22, 9) })
    expect(dDayLabel("2026-10-25")).toBe("D-3")
    expect(dDayLabel("2026-10-22")).toBe("D-DAY")
    expect(dDayLabel("2026-10-21")).toBe("종료")
  })

  test("the next event is the earliest one not yet over", () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 22, 9) })
    const events = [
      { id: "over", date: "2026-10-01" },
      { id: "later", date: "2026-11-01" },
      { id: "running", date: "2026-10-20", endDate: "2026-10-23" },
      { id: "undecided", date: "미정" },
    ]
    expect(nextEvent(events)?.id).toBe("running")
    expect(nextEvent(events.filter((event) => event.id !== "running"))?.id).toBe("later")
    expect(nextEvent([{ date: "2026-10-01" }])).toBeUndefined()
  })

  test("a month's calendar is whole weeks from Sunday", () => {
    const days = calendarDays(new Date(2026, 9, 15))
    expect(days.length % 7).toBe(0)
    expect(days[0].getDay()).toBe(0)
    expect(days.at(-1)?.getDay()).toBe(6)
    expect(days.map(toIsoDate)).toContain("2026-10-01")
    expect(days.map(toIsoDate)).toContain("2026-10-31")
  })

  test("semesters follow the Korean school year", () => {
    expect(semesterLabel(new Date(2026, 9, 22))).toBe("2026 FALL SEMESTER")
    expect(semesterLabel(new Date(2026, 3, 1))).toBe("2026 SPRING SEMESTER")
    expect(semesterLabel(new Date(2026, 6, 1))).toBe("2026 SUMMER SEMESTER")
    expect(semesterLabel(new Date(2026, 0, 1))).toBe("2026 WINTER SEMESTER")
  })
})
