import { todayInKorea } from "./dates.js"
import type { Account, Database } from "../types.js"

// 소개 편집의 불러오기가 포트폴리오에 내놓는 것: 브랜드의 지난 협찬, 단체의
// 지난 행사를 새것부터, 각각 포트폴리오 행(월이 붙은 제목과 성과)으로 둔다.
// 계정은 더한 뒤에도 고칠 수 있다.
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
