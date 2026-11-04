import { metricInfo, venueKinds } from "../data/metrics"
import { t } from "../i18n"
import type { Metrics, MetricKind, Report, Sponsorship } from "../types"
import { achievement, reportKpis } from "./kpis"
import { venueKindsOf } from "./measurements"
import { costPerVisit, roasOf } from "./sponsorships"

type Cell = string | number

// 셀 하나. 쉼표, 따옴표, 줄바꿈이 있으면 따옴표로 감싼다. =, +, -, @, 탭,
// 캐리지 리턴으로 시작하는 텍스트는 앞에 '를 붙여, 누가 입력한 이름을
// 스프레드시트가 수식으로 실행하지 못하게 한다 (CSV 인젝션).
export function csvCell(value: Cell): string {
  if (typeof value === "number") return String(value)
  const plain = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(plain) ? `"${plain.replace(/"/g, '""')}"` : plain
}

// Excel이 한글을 그대로 여는 CSV 파일: 바이트 순서 표시가 붙은 UTF-8이고 각
// 줄은 CRLF로 끝난다.
export const toCsv = (rows: Cell[][]) => `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`

// 목표의 결과는 페이지에 대시가 나오는 곳(계산할 값이 없는 경우)에서 비워 둔다.
const result = (missing: boolean | undefined, value: number): Cell => (missing ? "" : value)

// 리포트 페이지가 보여주는 그대로, 화면 언어로 쓴 행사 하나의 리포트: 행사, 각
// 목표와 그 결과 및 달성 정도, 집계된 것(QR, 쿠폰, 방문, 현장 확인 방식),
// 날짜·시간별 QR 스캔, 스폰서별 몫.
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

// 분석 표가 보여주는 그대로, 한 줄에 하나씩 최신 순으로 담은 브랜드의 협찬.
// 협찬 중 하나라도 가진 현장 집계마다 열이 붙는다.
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
