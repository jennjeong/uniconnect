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

// "₩1,480K", for numbers in small cards.
export const compactWon = (value: number) =>
  `₩${Math.round(value / 1000).toLocaleString("ko-KR")}K`
