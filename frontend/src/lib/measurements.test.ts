import { describe, expect, test } from "vitest"

import type { EventMeasurement, Report } from "../types"
import { defaultMeasurement, measureState, shownKindsOf } from "./measurements"

const item = (eventId: string, eventDate: string, eventEndDate?: string) =>
  ({ eventId, report: { eventDate, eventEndDate } }) as EventMeasurement

describe("measurement pages", () => {
  test("say whether an event is still to be measured, under way or done", () => {
    const today = "2026-10-22"
    expect(measureState(item("a", "2026-11-27").report, today)).toBe("진행 전")
    expect(measureState(item("b", "2026-10-22").report, today)).toBe("측정 중")
    expect(measureState(item("c", "2026-10-20", "2026-10-23").report, today)).toBe("측정 중")
    expect(measureState(item("d", "2026-10-12").report, today)).toBe("진행 완료")
  })

  test("show only the counts of the methods both sides confirmed", () => {
    const report = (methods: unknown[], sponsors?: unknown[]) => ({ methods, sponsors }) as unknown as Report
    const defaults = [
      { kind: "qr", side: "group" },
      { kind: "coupon", side: "brand" },
      { kind: "visit", side: "brand" },
    ]
    expect(shownKindsOf(report(defaults))).toEqual(["scans", "coupons", "visits"])
    // Every sponsor's, once brands sponsor the event, in the methods' order.
    const sponsors = [
      { methods: [{ kind: "booth", side: "both" }] },
      { methods: [{ kind: "survey", side: "brand" }, { kind: "qr", side: "group" }] },
    ]
    expect(shownKindsOf(report(defaults, sponsors))).toEqual(["scans", "stamps", "surveys"])
  })

  test("open on the latest event that has started, or else the next one", () => {
    const today = "2026-10-22"
    const list = [item("later", "2026-12-01"), item("soon", "2026-11-27"), item("done", "2026-10-12")]
    expect(defaultMeasurement(list, today)?.eventId).toBe("done")
    expect(defaultMeasurement(list.slice(0, 2), today)?.eventId).toBe("soon")
    expect(defaultMeasurement([], today)).toBeUndefined()
  })
})
