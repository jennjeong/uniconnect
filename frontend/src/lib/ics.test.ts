import { describe, expect, test } from "vitest"

import { calendarFile } from "./ics"

const now = new Date("2026-10-24T09:30:00.123Z")

describe("the calendar file of events", () => {
  test("has each event as an all-day entry with a reminder the day before", () => {
    const file = calendarFile([{ id: "e1", title: "종강 공연", date: "2026-11-27" }], "uniconnect", now)
    expect(file.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true)
    expect(file.endsWith("END:VCALENDAR\r\n")).toBe(true)
    expect(file).toContain("UID:e1@uniconnect\r\n")
    expect(file).toContain("DTSTAMP:20261024T093000Z\r\n")
    expect(file).toContain("DTSTART;VALUE=DATE:20261127\r\nDTEND;VALUE=DATE:20261128\r\n")
    expect(file).toContain("BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:종강 공연\r\nTRIGGER:-PT15H\r\nEND:VALARM")
    // 모든 줄은 CRLF로 끝나며 단독 개행은 없다.
    expect(file.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/)
  })

  test("ends an event over several days the day after its last, across a month", () => {
    const file = calendarFile([{ id: "e2", title: "축제", date: "2026-11-29", endDate: "2026-11-30" }], "x", now)
    expect(file).toContain("DTSTART;VALUE=DATE:20261129\r\nDTEND;VALUE=DATE:20261201\r\n")
  })

  test("escapes commas, semicolons, backslashes and new lines", () => {
    const file = calendarFile([{ id: "e3", title: "A, B; C\\D", date: "2026-12-01", description: "줄 하나\n줄 둘" }], "x", now)
    expect(file).toContain("SUMMARY:A\\, B\\; C\\\\D\r\n")
    expect(file).toContain("DESCRIPTION:줄 하나\\n줄 둘\r\n")
  })

  test("a lone carriage return can't start a line of its own", () => {
    const file = calendarFile([{ id: "e5", title: "x\rURL:https://evil.example", date: "2026-12-01" }], "x", now)
    expect(file).toContain("SUMMARY:x\\nURL:https://evil.example\r\n")
    expect(file).not.toMatch(/\rURL:/)
  })

  test("folds long lines at 75 bytes without splitting a letter", () => {
    const title = "가".repeat(60)
    const file = calendarFile([{ id: "e4", title, date: "2026-12-01" }], "x", now)
    const lines = file.split("\r\n")
    expect(lines.every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true)
    // 접힘을 풀면(접힌 곳마다 CRLF와 공백) 제목이 다시 온전해진다.
    expect(file.replace(/\r\n /g, "")).toContain(`SUMMARY:${title}\r\n`)
  })
})
