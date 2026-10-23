import { metricInfo, metricKinds } from "../data/metrics"
import { useLiveMeasurement } from "../hooks/useLiveMeasurement"
import { t } from "../i18n"
import { formatDateTime } from "../lib/date"
import { percent } from "../lib/format"
import { measureState } from "../lib/measurements"
import type { EventMeasurement, MetricKind, Metrics, Report } from "../types"
import { AnimatedNumber } from "./AnimatedNumber"
import { EventPicker } from "./EventPicker"
import { Icon } from "./Icon"
import { Pill } from "./Pill"
import { RevealTitle } from "./RevealText"

// A brand's own campaign measured on site, at the end of 성과 분석: pick
// the campaign, open its check-in QR, set its goals, and watch its QR scans,
// coupons and store visits as they come in.
export function CampaignMeasurement({
  measurements,
  metrics,
  report,
  onSelect,
  onUpdate,
  onOpenQr,
  onOpenGoals,
  onShowLog,
}: {
  // Every campaign of the brand, to pick the one to measure.
  measurements: EventMeasurement[]
  metrics: Metrics
  report: Report | null
  onSelect: (eventId: string) => void
  onUpdate: (measurement: EventMeasurement) => void
  onOpenQr: () => void
  onOpenGoals: () => void
  onShowLog: (kind?: MetricKind) => void
}) {
  const entries = useLiveMeasurement(report?.eventId, "브랜드", onUpdate)

  return (
    <section aria-label={t("캠페인 현장 측정")} className="campaign-measure">
      <div className="section-head">
        <span className="eyebrow" data-reveal>
          Campaign Check-In
        </span>
        <RevealTitle as="h2" className="section-display">
          {t("캠페인 현장 측정")}
        </RevealTitle>
        <p className="campaign-measure-lead" data-reveal>
          {t("캠페인 현장에 QR을 띄우면 참여, 쿠폰, 매장 방문이 실시간으로 쌓여요.")}
        </p>
      </div>
      {!report ? (
        <p className="day-empty">{t("행사 일정에서 캠페인을 등록하면 캠페인마다 현장 QR과 측정이 생겨요.")}</p>
      ) : (
        <>
          <div className="measure-bar">
            <EventPicker measurements={measurements} onSelect={onSelect} value={report.eventId} />
            <span className="measure-state">{t(measureState(report))}</span>
            {entries[0] && (
              <span className="measure-updated">{t("마지막 참여 {time}", { time: formatDateTime(entries[0].at) })}</span>
            )}
          </div>
          <div className="campaign-measure-tiles">
            {metricKinds.map((kind) => (
              <button className="campaign-measure-tile" key={kind} onClick={() => onShowLog(kind)} type="button">
                <span>
                  <Icon name={metricInfo[kind].icon} size={16} /> {t(metricInfo[kind].label)}
                </span>
                <strong>
                  <AnimatedNumber value={metrics[kind].toLocaleString("ko-KR")} />
                </strong>
                <small>
                  {t("목표 {target}", { target: report.targets[kind].toLocaleString("ko-KR") })} ·{" "}
                  {percent(metrics[kind], report.targets[kind])}%
                </small>
              </button>
            ))}
          </div>
          <div className="campaign-measure-actions">
            <Pill onClick={onOpenGoals} variant="outline">
              {t("목표 설정")}
            </Pill>
            <Pill arrow="up-right" onClick={onOpenQr}>
              {t("현장 QR 열기")}
            </Pill>
          </div>
        </>
      )}
    </section>
  )
}
