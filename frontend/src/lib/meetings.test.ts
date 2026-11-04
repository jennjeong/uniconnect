import { describe, expect, test } from "vitest"

import { googleMeetingLink, meetingIcs, meetingSpan } from "./meetings"
import type { Meeting } from "../types"

const meeting: Meeting = { date: "2026-11-12", time: "14:00", minutes: 90, place: "삼육대 학생회관, 2층", status: "accepted" }

describe("meetings in calendars", () => {
  test("a Korean start time is nine hours ahead of UTC, and the length is added", () => {
    const { start, end } = meetingSpan(meeting)
    expect(start.toISOString()).toBe("2026-11-12T05:00:00.000Z")
    expect(end.toISOString()).toBe("2026-11-12T06:30:00.000Z")
    // 한국의 이른 아침은 UTC로는 아직 전날이다.
    expect(meetingSpan({ ...meeting, time: "08:00", minutes: 30 }).start.toISOString()).toBe("2026-11-11T23:00:00.000Z")
  })

  test("Google Calendar gets the timed entry and the place", () => {
    const url = new URL(googleMeetingLink(meeting, "오후의 커피 미팅"))
    expect(url.searchParams.get("dates")).toBe("20261112T050000Z/20261112T063000Z")
    expect(url.searchParams.get("location")).toBe("삼육대 학생회관, 2층")
    expect(url.searchParams.get("text")).toBe("오후의 커피 미팅")
  })

  test("the calendar file has the instants, the escaped place and a reminder", () => {
    const file = meetingIcs(meeting, "오후의 커피 미팅", "m1")
    expect(file).toContain("DTSTART:20261112T050000Z\r\n")
    expect(file).toContain("DTEND:20261112T063000Z\r\n")
    expect(file).toContain("LOCATION:삼육대 학생회관\\, 2층\r\n")
    expect(file).toContain("TRIGGER:-PT30M")
  })

  test("a place's semicolon is escaped and a lone carriage return stays inside it", () => {
    const file = meetingIcs({ ...meeting, place: "회관; 2층\rATTACH:https://evil.example" }, "미팅", "m1")
    expect(file).toContain("LOCATION:회관\\; 2층\\nATTACH:https://evil.example\r\n")
    expect(file).not.toMatch(/\rATTACH:/)
  })
})
