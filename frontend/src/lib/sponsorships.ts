import { lang } from "../i18n"
import type { Sponsorship } from "../types"
import { percent } from "./format"

// Estimated sales the sponsorship brought per won spent, in percent.
export const roasOf = (sponsorship: Pick<Sponsorship, "sales" | "spend">) =>
  percent(sponsorship.sales, sponsorship.spend)

export const roasMet = (sponsorship: Pick<Sponsorship, "sales" | "spend" | "targetRoas">) =>
  roasOf(sponsorship) >= sponsorship.targetRoas

// Won spent for each store visit; 0 before any visit.
export const costPerVisit = (sponsorship: Pick<Sponsorship, "spend" | "visits">) =>
  sponsorship.visits > 0 ? Math.round(sponsorship.spend / sponsorship.visits) : 0

export function sponsorshipTotals(sponsorships: Sponsorship[]) {
  const sum = (key: "spend" | "sales" | "coupons" | "visits") =>
    sponsorships.reduce((total, sponsorship) => total + sponsorship[key], 0)
  const spend = sum("spend")
  const sales = sum("sales")
  return { spend, sales, coupons: sum("coupons"), visits: sum("visits"), roas: percent(sales, spend) }
}

// The whole amount, "1,480,000원" ("₩1,480,000"), for the large numbers on
// dashboard cards.
export const fullWon = (value: number) =>
  lang === "en" ? `₩${value.toLocaleString("en-US")}` : `${value.toLocaleString("ko-KR")}원`

// Amounts in 만원 for large numbers: "300", or "12.5" when it isn't whole.
// In English, thousands of won ("3,000"), shown with the unit "K won"
// (wonUnit).
export const manWon = (value: number) =>
  lang === "en"
    ? (value / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })
    : (value / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })

// The unit after manWon's number.
export const wonUnit = () => (lang === "en" ? "K won" : "만원")

// Everything the analytics page and its PDF report say about the brand's
// sponsorships: each one's ROAS against its goal and cost per visit, the
// totals, and the standouts the insights name.
export function analyzeSponsorships(sponsorships: Sponsorship[]) {
  const totals = sponsorshipTotals(sponsorships)
  const rows = sponsorships.map((sponsorship) => ({
    ...sponsorship,
    roas: roasOf(sponsorship),
    met: roasMet(sponsorship),
    perVisit: costPerVisit(sponsorship),
  }))
  const best = [...rows].sort((a, b) => b.roas - a.roas)[0]
  // The sponsorship furthest below its goal.
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
    // Bar scale with room past the best result and every goal marker.
    roasScale: Math.max(100, best?.roas ?? 0, ...rows.map((row) => row.targetRoas)) * 1.1,
  }
}
