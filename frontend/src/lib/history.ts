import { t } from "../i18n"
import type { EventMeasurement } from "../types"
import { toCsv } from "./csv"
import { todayIso } from "./date"

// One event that has taken place, as the group's sponsorship record keeps
// it: who sponsored it, what they gave and what it brought.
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
  // Null until the sponsorship's value is set.
  roas: number | null
}

// The group's sponsorship record (협찬 기록): every event that has begun,
// latest first, so the next team running the group starts from what was
// done rather than from nothing.
export function sponsorHistory(measurements: EventMeasurement[], today = todayIso()): HistoryRow[] {
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
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

// What the record adds up to, for a proposal: events held, brands that
// sponsored (each once), participants, store visits and the average ROAS
// of those with a value.
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

// The record as a spreadsheet to hand over, in the language shown.
export function historyCsv(rows: HistoryRow[]) {
  return toCsv([
    [t("행사"), t("시작일"), t("종료일"), t("협찬사"), t("협찬 가치(원)"), t("QR 스캔"), t("쿠폰 수령"), t("매장 방문"), "ROAS(%)"],
    ...rows.map((row) => [
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
