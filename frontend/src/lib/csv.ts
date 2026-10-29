import { metricInfo, venueKinds } from "../data/metrics"
import { t } from "../i18n"
import type { Metrics, MetricKind, Report, Sponsorship } from "../types"
import { achievement, reportKpis } from "./kpis"
import { venueKindsOf } from "./measurements"
import { costPerVisit, roasOf } from "./sponsorships"

type Cell = string | number

// One cell, quoted when it holds a comma, a quote or a line break. Text that
// starts with =, +, -, @, a tab or a carriage return gets a ' in front, so a
// spreadsheet never runs a name someone typed as a formula (CSV injection).
export function csvCell(value: Cell): string {
  if (typeof value === "number") return String(value)
  const plain = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(plain) ? `"${plain.replace(/"/g, '""')}"` : plain
}

// A CSV file that Excel opens with Korean intact: UTF-8 with a byte order
// mark, each line ended with CRLF.
export const toCsv = (rows: Cell[][]) => `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`

// A goal's result is blank where the page shows a dash (no value to work from).
const result = (missing: boolean | undefined, value: number): Cell => (missing ? "" : value)

// One event's report as the report page shows it, in the language shown: the
// event, each goal with its result and how much of it was met, what was
// counted (QR, coupons, visits and the venue's confirmation methods), QR
// scans by day and hour, and each sponsor's share.
export function reportCsv(report: Report, metrics: Metrics): string {
  const counted: MetricKind[] = ["scans", "coupons", "visits", ...venueKindsOf(report)]
  const rows: Cell[][] = [
    [t("행사"), report.eventName],
    [t("날짜"), report.eventEndDate ? `${report.eventDate} ~ ${report.eventEndDate}` : report.eventDate],
    [t("예상 인원"), report.expectedAudience],
    [t("협찬 가치(원)"), report.sponsorValue],
    [],
    [t("지표"), t("결과"), t("목표"), t("달성률(%)")],
    ...reportKpis(report, metrics).map((kpi) => [
      kpi.unit === "%" ? `${kpi.label} (%)` : kpi.label,
      result(kpi.missing, kpi.current),
      kpi.target,
      result(kpi.missing, achievement(kpi)),
    ]),
    [],
    [t("현장 기록"), t("횟수")],
    ...counted.map((kind) => [t(metricInfo[kind].label), metrics[kind]]),
  ]
  if (report.hourlyScans.length > 0) {
    rows.push([], [t("날짜"), t("시간대"), t(metricInfo.scans.label)])
    rows.push(...report.hourlyScans.map((entry) => [entry.date, entry.hour, entry.scans]))
  }
  if (report.sponsors?.length) {
    rows.push([], [t("협찬사"), t("협찬 가치(원)"), t(metricInfo.coupons.label), t(metricInfo.visits.label), "ROAS (%)"])
    rows.push(...report.sponsors.map((sponsor) => [sponsor.brandName, sponsor.value, sponsor.coupons, sponsor.visits, sponsor.roas]))
  }
  return toCsv(rows)
}

// A brand's sponsorships as the analytics table shows them, one a line,
// newest first, with a column for each venue count any of them has.
export function analyticsCsv(sponsorships: Sponsorship[]): string {
  const counted = venueKinds.filter((kind) => sponsorships.some((item) => (item[kind as keyof Sponsorship] ?? 0) !== 0))
  const head: Cell[] = [
    t("단체"),
    t("행사"),
    t("날짜"),
    t("집행액(원)"),
    t(metricInfo.coupons.label),
    t(metricInfo.visits.label),
    t("추정 매출(원)"),
    "ROAS (%)",
    t("목표 ROAS (%)"),
    t("방문당 비용(원)"),
    ...counted.map((kind) => t(metricInfo[kind].label)),
  ]
  return toCsv([
    head,
    ...sponsorships.map((item) => [
      item.groupName,
      item.eventName,
      item.date,
      item.spend,
      item.coupons,
      item.visits,
      item.sales,
      roasOf(item),
      item.targetRoas,
      costPerVisit(item),
      ...counted.map((kind) => Number(item[kind as keyof Sponsorship] ?? 0)),
    ]),
  ])
}
