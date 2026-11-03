import { todayInKorea } from "./dates.js"
import type { Account, Database } from "../types.js"

// What 소개 편집's 불러오기 offers for the portfolio: a brand's past
// sponsorships, a group's past events, newest first, each as a portfolio
// row (a title with its month, and what it came to) the account can still
// edit after adding.
export function portfolioHistory(database: Database, account: Account) {
  const today = todayInKorea()
  const month = (date: string) => `${date.slice(0, 4)}.${date.slice(5, 7)}`
  const won = (value: number) =>
    value >= 10000 && value % 10000 === 0 ? `${(value / 10000).toLocaleString("ko-KR")}만원` : `${value.toLocaleString("ko-KR")}원`
  const join = (parts: (string | false)[]) => parts.filter(Boolean).join(" · ")
  if (account.role === "브랜드") {
    return (database.sponsorships[account.id] ?? [])
      .filter((item) => item.date <= today)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((item) => ({
        id: item.id,
        date: item.date,
        title: `${item.groupName} ${item.eventName} (${month(item.date)})`.slice(0, 40),
        detail: join([
          item.spend > 0 && `협찬 ${won(item.spend)}`,
          item.coupons > 0 && `쿠폰 ${item.coupons.toLocaleString("ko-KR")}장`,
          item.visits > 0 && `매장 방문 ${item.visits.toLocaleString("ko-KR")}명`,
        ]).slice(0, 100),
      }))
  }
  return (database.events[account.id] ?? [])
    .filter((event) => (event.endDate ?? event.date) < today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((event) => {
      const scans = database.measurements.find((item) => item.eventId === event.id)?.metrics.scans ?? 0
      return {
        id: event.id,
        date: event.date,
        title: `${event.name} (${month(event.date)})`.slice(0, 40),
        detail: join([event.people && `예상 ${event.people}`, scans > 0 && `QR 참여 ${scans.toLocaleString("ko-KR")}명`]).slice(0, 100),
      }
    })
}
