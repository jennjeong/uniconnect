import { describe, expect, test } from "vitest"

import type { EventMeasurement } from "../types"
import { defaultMeasurement, measureState } from "./measurements"

const item = (eventId: string, eventDate: string, eventEndDate?: string) =>
  ({ eventId, report: { eventDate, eventEndDate } }) as EventMeasurement

describe("measurement pages", () => {
  test("say whether an event is still to be measured, under way or done", () => {
    const today = "2026-10-22"
    expect(measureState(item("a", "2026-11-27").report, today)).toBe("측정 예정")
    expect(measureState(item("b", "2026-10-22").report, today)).toBe("측정 중")
    expect(measureState(item("c", "2026-10-20", "2026-10-23").report, today)).toBe("측정 중")
    expect(measureState(item("d", "2026-10-12").report, today)).toBe("측정 완료")
  })

  test("open on the latest event that has started, or else the next one", () => {
    const today = "2026-10-22"
    const list = [item("later", "2026-12-01"), item("soon", "2026-11-27"), item("done", "2026-10-12")]
    expect(defaultMeasurement(list, today)?.eventId).toBe("done")
    expect(defaultMeasurement(list.slice(0, 2), today)?.eventId).toBe("soon")
    expect(defaultMeasurement([], today)).toBeUndefined()
  })
})
