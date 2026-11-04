import { lang, t } from "../i18n"
import type { Metrics, Report } from "../types"
import { percent } from "./format"

export type KpiKey = "reach" | "qrRate" | "visitRate" | "roas"

export type Kpi = {
  key: KpiKey
  label: string
  unit: "명" | "%"
  current: number
  target: number
  // Short line under the value, such as "QR 스캔 128건".
  note: string
  // How the value is calculated, shown in the goal details.
  formula: string
  // No value yet: a ROAS before the sponsorship's value is set.
  missing?: boolean
}

// "68만원", "40,300원"; in English "₩680,000".
export const formatWon = (value: number) =>
  lang === "en"
    ? `₩${value.toLocaleString("en-US")}`
    : value >= 10000 && value % 10000 === 0
      ? `${(value / 10000).toLocaleString("ko-KR")}만원`
      : `${value.toLocaleString("ko-KR")}원`

// The report's four headline numbers with their goals. QR and visit rates
// follow the live counts; reach and ROAS come from the report itself.
export function reportKpis(report: Report, metrics: Metrics): Kpi[] {
  return [
    {
      key: "reach",
      label: t("도달 인원"),
      unit: "명",
      current: report.reach,
      target: report.targets.reach,
      note: t("QR 스캔 + 현장 밖 도달"),
      formula: t("QR 스캔 {scans}건에 목표 설정에서 적은 현장 밖 도달(SNS 등) {snsReach}명과 브랜드가 확인한 게시물 도달 {posted}명을 더한 값이에요.", {
        scans: metrics.scans.toLocaleString("ko-KR"),
        snsReach: report.snsReach.toLocaleString("ko-KR"),
        posted: report.postedReach.toLocaleString("ko-KR"),
      }),
    },
    {
      key: "qrRate",
      label: t("QR 참여율"),
      unit: "%",
      current: percent(metrics.scans, report.expectedAudience),
      target: report.targets.qrRate,
      note: t("QR 스캔 {scans}건", { scans: metrics.scans }),
      formula: t("QR 스캔 {scans}건 ÷ 예상 관객 {audience}명", {
        scans: metrics.scans,
        audience: report.expectedAudience,
      }),
    },
    {
      key: "visitRate",
      label: t("방문 전환율"),
      unit: "%",
      current: percent(metrics.visits, metrics.scans),
      target: report.targets.visitRate,
      note: t("{visits}명 방문", { visits: metrics.visits }),
      formula: t("매장 방문 {visits}건 ÷ QR 스캔 {scans}건", { visits: metrics.visits, scans: metrics.scans }),
    },
    {
      key: "roas",
      label: t("추정 ROAS"),
      unit: "%",
      current: report.roas,
      target: report.targets.roas,
      note: hasRoas(report)
        ? t("협찬 가치 {value}", { value: formatWon(report.sponsorValue) })
        : t("협찬 가치를 정하면 계산돼요"),
      formula: t(
        "추정 매출(매장 방문 {visits}건 × 1인 예상 지출 {spend}) ÷ 협찬 가치 {value}. 실제 매출이 아니라 목표 설정에서 적은 1인 예상 지출로 셈한 추정치예요.",
        {
          visits: metrics.visits.toLocaleString("ko-KR"),
          spend: formatWon(report.averageSpend),
          value: formatWon(report.sponsorValue),
        },
      ),
      missing: !hasRoas(report),
    },
  ]
}

// A report has a ROAS once the sponsorship's value is set.
export const hasRoas = (report: Report) => report.sponsorValue > 0

// "243%", or "—" until the sponsorship's value is set.
export const roasText = (report: Report) => (hasRoas(report) ? `${report.roas}%` : "—")

// A KPI's value as shown, "—" when it has none yet.
export const kpiValue = (kpi: Kpi) => (kpi.missing ? "—" : formatKpi(kpi.current, kpi.unit))

export const achievement = (kpi: Kpi) =>
  kpi.target > 0 ? Math.round((kpi.current / kpi.target) * 100) : 0

export const formatKpi = (value: number, unit: Kpi["unit"]) =>
  unit === "%" ? `${value}%` : t("{reach}명", { reach: value.toLocaleString("ko-KR") })

// Distance from the goal: "+7%p", "+140명", "−3%p" ("+7 pts" in English).
export function kpiGap(kpi: Kpi) {
  const gap = kpi.current - kpi.target
  const sign = gap > 0 ? "+" : gap < 0 ? "−" : "±"
  const amount = Math.abs(gap).toLocaleString("ko-KR")
  const gapText = `${sign}${amount}`
  return kpi.unit === "%" ? t("{gap}%p", { gap: gapText }) : t("{gap}명", { gap: gapText })
}

// "목표보다 43% 높았어요" from the ROAS against its goal.
export function roasSummary(report: Report) {
  // Goals start at 1%; an older one of 0 counts as 1 rather than dividing by it.
  const gain = Math.round((report.roas / Math.max(1, report.targets.roas) - 1) * 100)
  return gain >= 0 ? t("{gain}% 높았어요.", { gain }) : t("{gain}% 낮았어요.", { gain: -gain })
}
