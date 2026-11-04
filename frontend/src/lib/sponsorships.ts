import { venueKinds } from "../data/metrics"
import { lang } from "../i18n"
import type { Sponsorship, VenueCounts } from "../types"
import { percent } from "./format"

// 협찬이 쓴 원당 가져온 추정 매출을 퍼센트로.
export const roasOf = (sponsorship: Pick<Sponsorship, "sales" | "spend">) =>
  percent(sponsorship.sales, sponsorship.spend)

export const roasMet = (sponsorship: Pick<Sponsorship, "sales" | "spend" | "targetRoas">) =>
  roasOf(sponsorship) >= sponsorship.targetRoas

// 매장 방문 한 건당 쓴 원. 방문이 없으면 0.
export const costPerVisit = (sponsorship: Pick<Sponsorship, "spend" | "visits">) =>
  sponsorship.visits > 0 ? Math.round(sponsorship.spend / sponsorship.visits) : 0

export function sponsorshipTotals(sponsorships: Sponsorship[]) {
  const sum = (key: "spend" | "sales" | "coupons" | "visits" | keyof VenueCounts) =>
    sponsorships.reduce((total, sponsorship) => total + (sponsorship[key] ?? 0), 0)
  const spend = sum("spend")
  const sales = sum("sales")
  return {
    spend,
    sales,
    coupons: sum("coupons"),
    visits: sum("visits"),
    // 협찬 확인 방식으로 현장이 확인한 것.
    ...(Object.fromEntries(venueKinds.map((kind) => [kind, sum(kind as keyof VenueCounts)])) as VenueCounts),
    roas: percent(sales, spend),
  }
}

// 전체 금액 "1,480,000원" ("₩1,480,000"). 대시보드 카드의 큰 숫자에 쓴다.
export const fullWon = (value: number) =>
  lang === "en" ? `₩${value.toLocaleString("en-US")}` : `${value.toLocaleString("ko-KR")}원`

// 큰 숫자를 위한 만원 단위 금액: "300", 정수가 아니면 "12.5". 영어에서는 천 원
// 단위("3,000")이며 단위 "K won"(wonUnit)과 함께 쓴다.
export const manWon = (value: number) =>
  lang === "en"
    ? (value / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })
    : (value / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })

// manWon의 숫자 뒤에 붙는 단위.
export const wonUnit = () => (lang === "en" ? "K won" : "만원")

// 분석 페이지와 그 PDF 리포트가 브랜드의 협찬에 대해 말하는 모든 것: 각 협찬의
// 목표 대비 ROAS와 방문당 비용, 합계, 그리고 인사이트가 짚는 눈에 띄는 협찬.
export function analyzeSponsorships(sponsorships: Sponsorship[]) {
  const totals = sponsorshipTotals(sponsorships)
  const rows = sponsorships.map((sponsorship) => ({
    ...sponsorship,
    roas: roasOf(sponsorship),
    met: roasMet(sponsorship),
    perVisit: costPerVisit(sponsorship),
  }))
  const best = [...rows].sort((a, b) => b.roas - a.roas)[0]
  // 목표에 가장 크게 못 미친 협찬.
  const furthestBelow = rows
    .filter((row) => !row.met)
    .sort((a, b) => a.roas - a.targetRoas - (b.roas - b.targetRoas))[0]
  const cheapest = [...rows].filter((row) => row.visits > 0).sort((a, b) => a.perVisit - b.perVisit)[0]
  return {
    totals,
    rows,
    best,
    furthestBelow,
    cheapest,
    metCount: rows.filter((row) => row.met).length,
    visitRate: percent(totals.visits, totals.coupons),
    // 가장 좋은 결과와 모든 목표 표시를 넘는 여유를 둔 막대 눈금.
    roasScale: Math.max(100, best?.roas ?? 0, ...rows.map((row) => row.targetRoas)) * 1.1,
  }
}
