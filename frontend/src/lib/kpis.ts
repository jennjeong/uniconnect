import type { Metrics, Report } from "../types"
import { percent } from "./format"

export type KpiKey = "reach" | "qrRate" | "visitRate" | "roas"

export type Kpi = {
  key: KpiKey
  label: string
  unit: "명" | "%"
  current: number
  target: number
  // Short line under the value, such as "128명 참여".
  note: string
  // How the value is calculated, shown in the goal details.
  formula: string
}

export const formatWon = (value: number) =>
  value >= 10000 && value % 10000 === 0
    ? `${(value / 10000).toLocaleString("ko-KR")}만원`
    : `${value.toLocaleString("ko-KR")}원`

// The report's four headline numbers with their goals. QR and visit rates
// follow the live counts; reach and ROAS come from the report itself.
export function reportKpis(report: Report, metrics: Metrics): Kpi[] {
  return [
    {
      key: "reach",
      label: "도달 인원",
      unit: "명",
      current: report.reach,
      target: report.targets.reach,
      note: "현장 방문 + SNS 도달",
      formula: "행사 현장 방문자와 SNS 게시물 도달 수를 더한 값이에요.",
    },
    {
      key: "qrRate",
      label: "QR 참여율",
      unit: "%",
      current: percent(metrics.scans, report.expectedAudience),
      target: report.targets.qrRate,
      note: `${metrics.scans}명 참여`,
      formula: `QR 스캔 ${metrics.scans}명 ÷ 예상 관객 ${report.expectedAudience}명`,
    },
    {
      key: "visitRate",
      label: "방문 전환율",
      unit: "%",
      current: percent(metrics.visits, metrics.scans),
      target: report.targets.visitRate,
      note: `${metrics.visits}명 방문`,
      formula: `매장 방문 ${metrics.visits}명 ÷ QR 스캔 ${metrics.scans}명`,
    },
    {
      key: "roas",
      label: "추정 ROAS",
      unit: "%",
      current: report.roas,
      target: report.targets.roas,
      note: `협찬 가치 ${formatWon(report.sponsorValue)}`,
      formula: `협찬 뒤 늘어난 매장 매출 추정치 ÷ 협찬 가치 ${formatWon(report.sponsorValue)}`,
    },
  ]
}

export const achievement = (kpi: Kpi) =>
  kpi.target > 0 ? Math.round((kpi.current / kpi.target) * 100) : 0

export const formatKpi = (value: number, unit: Kpi["unit"]) =>
  unit === "%" ? `${value}%` : `${value.toLocaleString("ko-KR")}명`

// Distance from the goal: "+7%p", "+140명", "−3%p".
export function kpiGap(kpi: Kpi) {
  const gap = kpi.current - kpi.target
  const sign = gap > 0 ? "+" : gap < 0 ? "−" : "±"
  const amount = Math.abs(gap).toLocaleString("ko-KR")
  return kpi.unit === "%" ? `${sign}${amount}%p` : `${sign}${amount}명`
}

// "목표보다 43% 높았어요" from the ROAS against its goal.
export function roasSummary(report: Report) {
  const gain = Math.round((report.roas / report.targets.roas - 1) * 100)
  return gain >= 0 ? `${gain}% 높았어요.` : `${-gain}% 낮았어요.`
}
