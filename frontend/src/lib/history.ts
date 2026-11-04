import { t } from "../i18n"
import type { EventMeasurement } from "../types"
import { toCsv } from "./csv"
import { todayIso } from "./date"

// 일어난 행사 하나를 단체의 협찬 기록에 남는 그대로 담는다: 누가 협찬했고,
// 무엇을 주었고, 무엇을 가져왔는지.
export type HistoryRow = {
  eventId: string
  eventName: string
  date: string
  endDate?: string
  brands: string[]
  value: number
  scans: number
  coupons: number
  visits: number
  // 협찬의 가치가 정해지기 전에는 null이다.
  roas: number | null
  // 단체가 임기를 적었다면, 첫날에 맡고 있던 팀(기수).
  term?: string
}

export type Term = { name: string; from: string }

// 어느 날 맡고 있던 팀: 그날 이전에 시작한 임기 중 가장 최근의 것.
export function termOf(date: string, terms: Term[] = []) {
  return [...terms].sort((a, b) => b.from.localeCompare(a.from)).find((term) => term.from <= date)?.name
}

// 단체의 협찬 기록(협찬 기록): 시작된 모든 행사를 최근 순으로 담는다. 다음 팀이
// 아무것도 없는 상태가 아니라 지금까지 한 일에서 이어받게 한다.
export function sponsorHistory(measurements: EventMeasurement[], today = todayIso(), terms: Term[] = []): HistoryRow[] {
  return measurements
    .filter(({ report }) => report.eventDate <= today)
    .map(({ eventId, metrics, report }) => ({
      eventId,
      eventName: report.eventName,
      date: report.eventDate,
      endDate: report.eventEndDate,
      brands: (report.sponsors ?? []).map((sponsor) => sponsor.brandName),
      value: report.sponsorValue,
      scans: metrics.scans,
      coupons: metrics.coupons,
      visits: metrics.visits,
      roas: report.sponsorValue > 0 ? report.roas : null,
      ...(termOf(report.eventDate, terms) ? { term: termOf(report.eventDate, terms) } : {}),
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

// 제안에 쓰려고 기록을 합산한 것: 연 행사 수, 협찬한 브랜드(브랜드마다 한 번),
// 참여자, 매장 방문, 가치가 있는 협찬의 평균 ROAS.
export function trackRecord(rows: HistoryRow[]) {
  const withRoas = rows.filter((row) => row.roas !== null)
  return {
    events: rows.length,
    brands: new Set(rows.flatMap((row) => row.brands)).size,
    scans: rows.reduce((total, row) => total + row.scans, 0),
    visits: rows.reduce((total, row) => total + row.visits, 0),
    roas: withRoas.length ? Math.round(withRoas.reduce((total, row) => total + (row.roas ?? 0), 0) / withRoas.length) : null,
  }
}

// 넘겨줄 스프레드시트로 만든 기록. 화면에 보이는 언어로 쓴다.
export function historyCsv(rows: HistoryRow[]) {
  return toCsv([
    [t("기수"), t("행사"), t("시작일"), t("종료일"), t("협찬사"), t("협찬 가치(원)"), t("QR 스캔"), t("쿠폰 수령"), t("매장 방문"), "ROAS(%)"],
    ...rows.map((row) => [
      row.term ?? "",
      row.eventName,
      row.date,
      row.endDate ?? row.date,
      row.brands.join(" / "),
      row.value,
      row.scans,
      row.coupons,
      row.visits,
      row.roas ?? "",
    ]),
  ])
}
