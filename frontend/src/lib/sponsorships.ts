import { venueKinds } from "../data/metrics"
import { lang } from "../i18n"
import type { Sponsorship, VenueCounts } from "../types"
import { todayIso } from "./date"
import { percent } from "./format"

// 협찬이 쓴 원당 가져온 추정 매출을 퍼센트로.
export const roasOf = (sponsorship: Pick<Sponsorship, "sales" | "spend">) =>
  percent(sponsorship.sales, sponsorship.spend)

export const roasMet = (sponsorship: Pick<Sponsorship, "sales" | "spend" | "targetRoas">) =>
  roasOf(sponsorship) >= sponsorship.targetRoas

// 협찬의 ROAS를 읽을 수 있는 상태.
// - cost: 협찬액(현금 + 현물)이 아직 0원이라 ROAS를 계산할 수 없다(비용 미확정).
// - counting: 방문이 아직 들어오는 중이라 지금 값은 중간값이다(집계 중).
// - done: 집계가 끝나 목표와 견줄 수 있다(측정 완료).
// 0원이나 집계 중인 협찬을 'ROAS 0%', '목표 미달'로 보이지 않게 한다.
export type RoasState = "cost" | "counting" | "done"

export function roasState(sponsorship: Pick<Sponsorship, "spend" | "countingUntil">, today = todayIso()): RoasState {
  if (!(sponsorship.spend > 0)) return "cost"
  if (sponsorship.countingUntil && today <= sponsorship.countingUntil) return "counting"
  return "done"
}

// 상태와 함께 본 ROAS. 비용 미확정이면 숫자가 없다(null).
export const roasFigure = (sponsorship: Pick<Sponsorship, "sales" | "spend" | "countingUntil">) =>
  roasState(sponsorship) === "cost" ? null : roasOf(sponsorship)

// 매장 방문 한 건당 쓴 원. 방문이 없으면 0.
export const costPerVisit = (sponsorship: Pick<Sponsorship, "spend" | "visits">) =>
  sponsorship.visits > 0 ? Math.round(sponsorship.spend / sponsorship.visits) : 0

export function sponsorshipTotals(sponsorships: Sponsorship[]) {
  const sum = (key: "spend" | "sales" | "coupons" | "visits" | keyof VenueCounts) =>
    sponsorships.reduce((total, sponsorship) => total + (sponsorship[key] ?? 0), 0)
  const spend = sum("spend")
  const sales = sum("sales")
  // 전체 ROAS는 협찬액이 정해진 협찬만으로 계산한다. 0원 협찬의 매출이 ROAS를 부풀리지 않게.
  const priced = sponsorships.filter((sponsorship) => sponsorship.spend > 0)
  const pricedSales = priced.reduce((total, sponsorship) => total + sponsorship.sales, 0)
  return {
    spend,
    sales,
    coupons: sum("coupons"),
    visits: sum("visits"),
    // 협찬 확인 방식으로 현장이 확인한 것.
    ...(Object.fromEntries(venueKinds.map((kind) => [kind, sum(kind as keyof VenueCounts)])) as VenueCounts),
    roas: percent(pricedSales, spend),
    // 협찬액이 정해진 협찬이 없으면 ROAS는 "—"다.
    roasMissing: priced.length === 0,
    // 그중 아직 집계 중인 것이 있으면 전체 ROAS도 중간값이다.
    roasCounting: priced.some((sponsorship) => roasState(sponsorship) === "counting"),
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
  const rows = sponsorships.map((sponsorship) => {
    const state = roasState(sponsorship)
    return {
      ...sponsorship,
      state,
      roas: state === "cost" ? 0 : roasOf(sponsorship),
      // 목표 달성 여부는 집계가 끝난 협찬만 따진다.
      met: state === "done" && roasMet(sponsorship),
      perVisit: state === "cost" ? 0 : costPerVisit(sponsorship),
    }
  })
  // 인사이트는 집계가 끝난 협찬으로만 말한다.
  const done = rows.filter((row) => row.state === "done")
  const best = [...done].sort((a, b) => b.roas - a.roas)[0]
  // 목표에 가장 크게 못 미친 협찬.
  const furthestBelow = done
    .filter((row) => !row.met)
    .sort((a, b) => a.roas - a.targetRoas - (b.roas - b.targetRoas))[0]
  const cheapest = [...done].filter((row) => row.visits > 0).sort((a, b) => a.perVisit - b.perVisit)[0]
  return {
    totals,
    rows,
    best,
    furthestBelow,
    cheapest,
    doneCount: done.length,
    metCount: done.filter((row) => row.met).length,
    visitRate: percent(totals.visits, totals.coupons),
    // 가장 좋은 결과와 모든 목표 표시를 넘는 여유를 둔 막대 눈금.
    roasScale: Math.max(100, ...rows.map((row) => Math.max(row.roas, row.targetRoas))) * 1.1,
  }
}
