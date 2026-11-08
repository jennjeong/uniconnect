import { describe, expect, test } from "vitest"

import type { Sponsorship } from "../types"
import {
  analyzeSponsorships,
  costPerVisit,
  fullWon,
  manWon,
  roasMet,
  roasOf,
  roasState,
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
    // 일부 협찬에만 있는 현장 집계는 나머지에서 0으로 합산된다.
    expect(sponsorshipTotals(list)).toEqual({
      spend: 1000000,
      sales: 1300000,
      coupons: 400,
      visits: 110,
      samples: 40,
      stamps: 0,
      posts: 5,
      surveys: 0,
      purchases: 0,
      giveaways: 0,
      raffles: 0,
      signups: 0,
      experiences: 0,
      roas: 130,
      roasMissing: false,
      roasCounting: false,
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
    // b는 목표보다 40포인트 낮고, c는 20포인트만 낮다.
    expect(analysis.furthestBelow?.id).toBe("b")
    // c는 방문이 없으므로 방문당 비용이 가장 낮을 수 없다.
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

  test("a 0-won or still-counting sponsorship is not judged against its goal", () => {
    expect(roasState(sponsorship({ id: "free" }))).toBe("cost")
    expect(roasState(list[0], "2026-10-20")).toBe("done")
    expect(roasState({ ...list[0], countingUntil: "2026-10-20" }, "2026-10-20")).toBe("counting")
    expect(roasState({ ...list[0], countingUntil: "2026-10-20" }, "2026-10-21")).toBe("done")

    const free = sponsorship({ id: "free", sales: 120000, visits: 10, coupons: 10, targetRoas: 150 })
    const counting = sponsorship({ id: "live", spend: 100000, sales: 0, targetRoas: 150, countingUntil: "2999-01-01" })
    const analysis = analyzeSponsorships([free, counting, list[1]])
    const row = (id: string) => analysis.rows.find((item) => item.id === id)!
    expect([row("free").state, row("free").met, row("free").perVisit]).toEqual(["cost", false, 0])
    expect([row("live").state, row("live").met]).toEqual(["counting", false])
    // 집계가 끝난 b만 목표와 견준다.
    expect(analysis.doneCount).toBe(1)
    expect(analysis.furthestBelow?.id).toBe("b")
    // 0원 협찬의 매출은 전체 ROAS에 들어가지 않는다: 240,000 ÷ 400,000.
    const totals = sponsorshipTotals([free, counting, list[1]])
    expect(totals.roas).toBe(60)
    expect(totals.roasCounting).toBe(true)
    expect(sponsorshipTotals([free]).roasMissing).toBe(true)
  })
})
