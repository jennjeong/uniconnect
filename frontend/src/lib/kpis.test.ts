import { describe, expect, test } from "vitest"

import type { Metrics, Report } from "../types"
import { hasRoas, kpiValue, reportKpis, roasSummary, roasText } from "./kpis"

const metrics: Metrics = {
  scans: 128,
  coupons: 94,
  visits: 41,
  samples: 0,
  stamps: 0,
  posts: 0,
  surveys: 0,
  purchases: 0,
  giveaways: 0,
  raffles: 0,
  signups: 0,
  experiences: 0,
}

const report = (sponsorValue: number, roas: number, targetRoas: number) =>
  ({
    sponsorValue,
    roas,
    reach: 1240,
    expectedAudience: 350,
    averageSpend: 40300,
    snsReach: 1112,
    postedReach: 0,
    pendingReach: 0,
    targets: { reach: 1100, scans: 105, coupons: 75, visits: 26, qrRate: 30, visitRate: 25, roas: targetRoas },
  }) as Report

describe("report figures", () => {
  test("show no ROAS until the sponsorship's value is set", () => {
    const unset = report(0, 0, 150)
    expect(hasRoas(unset)).toBe(false)
    expect(roasText(unset)).toBe("—")
    const roasKpi = reportKpis(unset, metrics).find((kpi) => kpi.key === "roas")!
    expect(kpiValue(roasKpi)).toBe("—")
    expect(roasKpi.note).toBe("협찬 가치를 정하면 계산돼요")
    expect(roasText(report(680000, 243, 170))).toBe("243%")
  })

  test("never divide by a goal of 0", () => {
    expect(roasSummary(report(680000, 243, 170))).toBe("43% 높았어요.")
    expect(roasSummary(report(680000, 120, 0))).not.toMatch(/Infinity|NaN/)
  })

  test("explain reach and ROAS as they are worked out", () => {
    const [reach, , , roas] = reportKpis(report(680000, 243, 170), metrics)
    expect(reach.formula).toBe("QR 스캔 128건에 목표 설정에서 적은 현장 밖 도달(SNS 등) 1,112명과 브랜드가 확인한 게시물 도달 0명을 더한 값이에요.")
    expect(roas.formula).toContain("매장 방문 41건 × 1인 예상 지출 40,300원")
    expect(roas.formula).toContain("68만원")
  })
})
