import { describe, expect, it } from "vitest"

import { couponState, couponUntil, keepWithoutPass, mergeTaken, walletCoupons } from "./couponWallet"

const now = new Date("2026-11-24T12:00:00Z")

describe("coupon wallet", () => {
  it("dates a coupon from the server, else seven days after it was taken", () => {
    expect(couponUntil({ number: "1", expiresAt: new Date(2026, 11, 1, 8).toISOString() })).toBe("2026-12-01")
    // 이 휴대폰의 이른 아침에 받아도 그날부터 센다.
    expect(couponUntil({ number: "1", takenAt: new Date(2026, 10, 20, 1).toISOString() })).toBe("2026-11-27")
    expect(couponState({ number: "1", takenAt: new Date(2026, 10, 20, 1).toISOString() }, new Date(2026, 10, 27, 23))).toBe("ready")
    expect(couponState({ number: "1", takenAt: new Date(2026, 10, 20, 1).toISOString() }, new Date(2026, 10, 28, 1))).toBe("expired")
    expect(couponUntil({ number: "1" })).toBeUndefined()
  })

  it("tells ready, used and expired apart", () => {
    expect(couponState({ number: "1", takenAt: "2026-11-23T00:00:00Z" }, now)).toBe("ready")
    expect(couponState({ number: "1", visited: true, takenAt: "2026-11-01T00:00:00Z" }, now)).toBe("used")
    expect(couponState({ number: "1", takenAt: "2026-11-01T00:00:00Z" }, now)).toBe("expired")
    expect(couponState({ number: "1" }, now)).toBe("ready")
  })

  it("keeps what the phone noted when the server answers", () => {
    const saved = { a: { number: "A1", store: "봄날 커피", title: "아메리카노", takenAt: "2026-11-23T00:00:00Z", hidden: true as const } }
    expect(mergeTaken(saved, { a: { number: "A1", visited: true }, b: { number: null, visited: false } })).toEqual({
      a: { number: "A1", store: "봄날 커피", title: "아메리카노", takenAt: "2026-11-23T00:00:00Z", hidden: true, visited: true, expiresAt: undefined },
    })
  })

  it("gathers every event's coupons, ready ones first and hidden ones left out", () => {
    const coupons = walletCoupons(
      [
        ["e1", { participant: "P-1", eventName: "가을 공연", coupons: { a: { number: "A1", visited: true, takenAt: "2026-11-23T00:00:00Z" } } }],
        [
          "e2",
          {
            participant: "P-2",
            pass: "pass-2",
            coupons: {
              b: { number: "B1", takenAt: "2026-11-22T00:00:00Z" },
              c: { number: "C1", takenAt: "2026-11-23T00:00:00Z" },
              d: { number: "D1", hidden: true },
            },
          },
        ],
        ["broken", null],
      ],
      now,
    )
    expect(coupons.map((coupon) => [coupon.number, coupon.state])).toEqual([
      ["C1", "ready"],
      ["B1", "ready"],
      ["A1", "used"],
    ])
    expect(coupons[2].eventName).toBe("가을 공연")
  })

  it("keeps the coupons, as expired, once the server has dropped the pass", () => {
    const kept = keepWithoutPass("e1", {
      participant: "P-1",
      pass: "gone",
      coupons: { a: { number: "A1", visited: true }, b: { number: "B1", takenAt: "2026-11-24T00:00:00Z" } },
    })
    expect(kept?.pass).toBeUndefined()
    expect(walletCoupons([["e1", kept]], now).map((coupon) => [coupon.number, coupon.state])).toEqual([
      ["A1", "used"],
      ["B1", "expired"],
    ])
    expect(keepWithoutPass("e1", null)).toBeNull()
  })
})
