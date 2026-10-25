import { describe, expect, test } from "vitest"

import type { Sponsorship } from "../types"
import {
  analyzeSponsorships,
  costPerVisit,
  fullWon,
  manWon,
  roasMet,
  roasOf,
  sponsorshipTotals,
} from "./sponsorships"

const sponsorship = (fields: Partial<Sponsorship> & Pick<Sponsorship, "id">): Sponsorship => ({
  groupName: "삼육대 뮤즈",
  eventName: "가을 공연",
  date: "2026-10-12",
  spend: 0,
  coupons: 0,
  visits: 0,
  sales: 0,
  targetRoas: 100,
  ...fields,
})

const list = [
  sponsorship({ id: "a", spend: 500000, sales: 900000, coupons: 200, visits: 50, targetRoas: 150, samples: 40, posts: 3 }),
  sponsorship({ id: "b", spend: 300000, sales: 240000, coupons: 100, visits: 60, targetRoas: 120, posts: 2 }),
  sponsorship({ id: "c", spend: 200000, sales: 160000, coupons: 100, visits: 0, targetRoas: 100 }),
]

describe("sponsorship results", () => {
  test("ROAS is sales per won spent, against each goal", () => {
    expect(roasOf(list[0])).toBe(180)
    expect(roasMet(list[0])).toBe(true)
    expect(roasOf(list[1])).toBe(80)
    expect(roasMet(list[1])).toBe(false)
    expect(roasOf(sponsorship({ id: "new" }))).toBe(0)
  })

  test("cost per visit stays 0 before any visit", () => {
    expect(costPerVisit(list[0])).toBe(10000)
    expect(costPerVisit(list[2])).toBe(0)
  })

  test("totals add every sponsorship up", () => {
    // Venue counts only some sponsorships have add up as zero for the rest.
    expect(sponsorshipTotals(list)).toEqual({
      spend: 1000000,
      sales: 1300000,
      coupons: 400,
      visits: 110,
      samples: 40,
      stamps: 0,
      posts: 5,
      roas: 130,
    })
  })

  test("amounts read in won and 만원", () => {
    expect(fullWon(1480000)).toBe("1,480,000원")
    expect(manWon(3000000)).toBe("300")
    expect(manWon(125000)).toBe("12.5")
  })

  test("the analysis names the standouts", () => {
    const analysis = analyzeSponsorships(list)
    expect(analysis.best.id).toBe("a")
    // b is 40 points under its goal, c only 20.
    expect(analysis.furthestBelow?.id).toBe("b")
    // c has no visits, so it cannot be the cheapest per visit.
    expect(analysis.cheapest?.id).toBe("b")
    expect(analysis.metCount).toBe(1)
    expect(analysis.visitRate).toBe(28)
    expect(analysis.roasScale).toBeCloseTo(198)
  })

  test("no sponsorships yet means zeros, not errors", () => {
    const analysis = analyzeSponsorships([])
    expect(analysis.totals.roas).toBe(0)
    expect(analysis.best).toBeUndefined()
    expect(analysis.furthestBelow).toBeUndefined()
    expect(analysis.metCount).toBe(0)
    expect(analysis.roasScale).toBeCloseTo(110)
  })
})
