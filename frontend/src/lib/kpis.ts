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
  // 값 아래의 짧은 줄. 예: "QR 스캔 128건".
  note: string
  // 값을 계산하는 방법. 목표 상세에 보여준다.
  formula: string
  // 아직 값이 없다: 협찬의 가치가 정해지기 전의 ROAS.
  missing?: boolean
}

// "68만원", "40,300원"; in English "₩680,000".
export const formatWon = (value: number) =>
  lang === "en"
    ? `₩${value.toLocaleString("en-US")}`
    : value >= 10000 && value % 10000 === 0
      ? `${(value / 10000).toLocaleString("ko-KR")}만원`
      : `${value.toLocaleString("ko-KR")}원`

// 리포트의 헤드라인 숫자 넷과 그 목표. QR과 방문 비율은 실시간 집계를 따르고,
// 도달과 ROAS는 리포트 자체에서 나온다.
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
      // 예상 관객을 정하지 않았으면 0%가 아니라 집계 없음이다.
      missing: report.expectedAudience <= 0,
    },
    {
      key: "visitRate",
      // 분모는 QR 참여자(한 휴대폰은 한 번만 센다)다. 쿠폰 수령자 대비 방문율과 다르다.
      label: t("QR 참여자 대비 방문율"),
      unit: "%",
      current: percent(metrics.visits, metrics.scans),
      target: report.targets.visitRate,
      note: t("{visits}명 방문", { visits: metrics.visits }),
      formula: t("매장 방문 {visits}건 ÷ QR 참여 {scans}명", { visits: metrics.visits, scans: metrics.scans }),
      missing: metrics.scans <= 0,
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

// 협찬의 가치가 정해지면 리포트에 ROAS가 생긴다.
export const hasRoas = (report: Report) => report.sponsorValue > 0

// "243%". 협찬의 가치가 정해지기 전에는 "—".
export const roasText = (report: Report) => (hasRoas(report) ? `${report.roas}%` : "—")

// 보이는 그대로의 KPI 값. 아직 값이 없으면 "—".
export const kpiValue = (kpi: Kpi) => (kpi.missing ? "—" : formatKpi(kpi.current, kpi.unit))

export const achievement = (kpi: Kpi) =>
  kpi.target > 0 ? Math.round((kpi.current / kpi.target) * 100) : 0

export const formatKpi = (value: number, unit: Kpi["unit"]) =>
  unit === "%" ? `${value}%` : t("{reach}명", { reach: value.toLocaleString("ko-KR") })

// 목표와의 차이: "+7%p", "+140명", "−3%p" (영어로는 "+7 pts").
export function kpiGap(kpi: Kpi) {
  const gap = kpi.current - kpi.target
  const sign = gap > 0 ? "+" : gap < 0 ? "−" : "±"
  const amount = Math.abs(gap).toLocaleString("ko-KR")
  const gapText = `${sign}${amount}`
  return kpi.unit === "%" ? t("{gap}%p", { gap: gapText }) : t("{gap}명", { gap: gapText })
}

// 목표와 견준 한 줄. 비율 지표(QR 참여율, 방문율, ROAS)는 목표와의 차이를 %p로,
// 사람 수 지표는 목표의 몇 %인지(달성률)로 말한다. 70% 목표에 35%를 두고
// "50% 달성"이라 하면 헷갈리기 때문이다. 값이 없으면 "집계 없음".
export function goalStatus(kpi: Kpi) {
  if (kpi.missing) return t("집계 없음")
  if (kpi.unit === "%") return t("목표 대비 {gap}", { gap: kpiGap(kpi) })
  const rate = achievement(kpi)
  return rate > 100 ? t("달성률 {rate}% · {over}% 초과", { rate, over: rate - 100 }) : t("달성률 {rate}%", { rate })
}

// 목표 ROAS와의 차이로 만든 "목표보다 73%p 높았어요". ROAS가 이미 퍼센트라
// 상대 비율(%)이 아니라 %p로 말한다.
export function roasSummary(report: Report) {
  const gap = report.roas - report.targets.roas
  return gap >= 0 ? t("{gap}%p 높았어요.", { gap }) : t("{gap}%p 낮았어요.", { gap: -gap })
}
