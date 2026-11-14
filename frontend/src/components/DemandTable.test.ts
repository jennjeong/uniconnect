import { describe, expect, test } from "vitest"

import { monthLabel } from "../lib/date"
import { monthsBetween, shiftMonth } from "./DemandTable"

// 수요 표의 달은 서버가 보낸 from부터 to까지(지난 6달 + 이번 달 + 앞으로 11달)다.
describe("demand table months", () => {
  test("moves across years", () => {
    expect(shiftMonth("2026-11", 2)).toBe("2027-01")
    expect(shiftMonth("2026-01", -6)).toBe("2025-07")
  })

  test("lists every month from the server's from to its to", () => {
    const months = monthsBetween("2026-05", "2027-10")
    expect(months).toHaveLength(18)
    expect(months[0]).toBe("2026-05")
    expect(months.at(-1)).toBe("2027-10")
    expect(months).toContain("2027-01")
  })

  test("names a month, with its year where asked", () => {
    expect(monthLabel("2026-05")).toBe("5월")
    expect(monthLabel("2027-01", true)).toBe("2027년 1월")
  })
})
