import { describe, expect, it } from "vitest"

import { businessDeadline } from "./businessDays"

describe("business-day deadline", () => {
  it("skips the weekend in Korean time", () => {
    // 2026-11-20 금요일 15:00 KST → 3영업일 뒤는 11-25 수요일의 끝
    expect(businessDeadline("2026-11-20T06:00:00.000Z", 3).toISOString()).toBe("2026-11-25T14:59:59.999Z")
    // 2026-11-22 일요일 → 11-25 수요일
    expect(businessDeadline("2026-11-22T01:00:00.000Z", 3).toISOString()).toBe("2026-11-25T14:59:59.999Z")
  })

  it("counts the Korean day, not the UTC one", () => {
    // 11-23 월요일 08:00 KST는 UTC로 일요일이다 → 11-26 목요일
    expect(businessDeadline("2026-11-22T23:00:00.000Z", 3).toISOString()).toBe("2026-11-26T14:59:59.999Z")
  })
})
