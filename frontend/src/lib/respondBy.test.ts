import { describe, expect, test } from "vitest"

import { byDeadline, deadlineOf } from "./respondBy"
import type { RequestStatus } from "../types"

const today = "2026-11-10"
const item = (respondBy?: string, status: RequestStatus = "검토 중") => ({ status, terms: respondBy ? { respondBy } : undefined })

describe("a proposal's reply deadline", () => {
  test("reads as later, soon, today or overdue only while it waits", () => {
    expect(deadlineOf(item(), today)).toBeNull()
    expect(deadlineOf(item("2026-11-20"), today)?.state).toBe("later")
    expect(deadlineOf(item("2026-11-13"), today)?.state).toBe("soon")
    expect(deadlineOf(item("2026-11-10"), today)?.state).toBe("today")
    expect(deadlineOf(item("2026-11-08"), today)).toMatchObject({ state: "overdue", days: -2 })
    // 행사가 끝나 마감됐거나 수락 · 거절 · 취소된 제안에는 기한이 없다.
    for (const status of ["마감", "수락", "거절", "취소됨"] as RequestStatus[]) {
      expect(deadlineOf(item("2026-11-08", status), today)).toBeNull()
    }
  })

  test("sorts by the nearest deadline, those without one after in their order", () => {
    const list = [
      { id: "none-1", ...item() },
      { id: "late", ...item("2026-11-30") },
      { id: "none-2", ...item() },
      { id: "past", ...item("2026-11-01") },
    ]
    expect(byDeadline(list, today).map((entry) => entry.id)).toEqual(["past", "late", "none-1", "none-2"])
  })
})
