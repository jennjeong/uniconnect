import { describe, expect, test } from "vitest"

import { calendarApps, googleCalendarLink, opensEach, outlookCalendarLink } from "./calendarApps"

const concert = { id: "e1", title: "겨울 정기 공연", date: "2026-11-27", description: "200명 · 제품" }
const festival = { id: "e2", title: "축제", date: "2026-11-29", endDate: "2026-11-30" }

describe("calendar apps", () => {
  test("Google Calendar opens an all-day entry ready to add", () => {
    const link = new URL(googleCalendarLink(concert))
    expect(link.origin + link.pathname).toBe("https://calendar.google.com/calendar/render")
    expect(link.searchParams.get("action")).toBe("TEMPLATE")
    expect(link.searchParams.get("text")).toBe("겨울 정기 공연")
    // All-day entries end on the day after their last.
    expect(link.searchParams.get("dates")).toBe("20261127/20261128")
    expect(link.searchParams.get("details")).toBe("200명 · 제품")
    expect(new URL(googleCalendarLink(festival)).searchParams.get("dates")).toBe("20261129/20261201")
    expect(new URL(googleCalendarLink(festival)).searchParams.has("details")).toBe(false)
  })

  test("Outlook opens the same entry on its compose page", () => {
    const link = new URL(outlookCalendarLink(festival))
    expect(link.origin + link.pathname).toBe("https://outlook.live.com/calendar/0/deeplink/compose")
    expect(link.searchParams.get("rru")).toBe("addevent")
    expect(link.searchParams.get("allday")).toBe("true")
    expect(link.searchParams.get("subject")).toBe("축제")
    expect([link.searchParams.get("startdt"), link.searchParams.get("enddt")]).toEqual(["2026-11-29", "2026-12-01"])
  })

  test("Google and Outlook open each entry, the others the calendar file", () => {
    expect(calendarApps.map((app) => [app.id, opensEach(app.id)])).toEqual([
      ["google", true],
      ["apple", false],
      ["outlook", true],
      ["other", false],
    ])
  })
})
