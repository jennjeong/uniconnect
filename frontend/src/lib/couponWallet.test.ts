import { describe, expect, it } from "vitest"

import { couponState, couponUntil, mergeTaken, walletCoupons } from "./couponWallet"

const now = new Date("2026-11-24T12:00:00Z")

describe("coupon wallet", () => {
  it("dates a coupon from the server, else seven days after it was taken", () => {
    expect(couponUntil({ number: "1", expiresAt: "2026-12-01T00:00:00Z", takenAt: "2026-11-01T00:00:00Z" })).toBe("2026-12-01T00:00:00Z")
    expect(couponUntil({ number: "1", takenAt: "2026-11-20T00:00:00.000Z" })).toBe("2026-11-27T00:00:00.000Z")
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
})
