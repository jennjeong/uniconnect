import { isCheckInKind, metricInfo } from "../data/metrics"
import { useLiveMeasurement } from "../hooks/useLiveMeasurement"
import { t } from "../i18n"
import { formatDateTime } from "../lib/date"
import { percent } from "../lib/format"
import { measureState, shownKindsOf } from "../lib/measurements"
import type { EventMeasurement, MetricKind, Metrics, Report } from "../types"
import { AnimatedNumber } from "./AnimatedNumber"
import { EventPicker } from "./EventPicker"
import { Icon } from "./Icon"
import { Pill } from "./Pill"
import { RevealTitle } from "./RevealText"

// 성과 분석 맨 끝에서 브랜드가 자기 캠페인을 현장에서 측정한다. 캠페인을
// 고르고, 체크인 QR을 열고, QR 스캔·쿠폰·매장 방문이 들어오는 대로 지켜본다.
// 양쪽이 전자계약서에서 확정한 확인 방식이 있으면 그것을 따른다. 캠페인 전(진행
// 전)에는 목표 옆에 대시(-)만 보인다. 목표는 브랜드의 제안을 받은 그룹과의
// 협약에서 정한다.
export function CampaignMeasurement({
  measurements,
  metrics,
  report,
  onSelect,
  onUpdate,
  onOpenQr,
  onOpenAgreements,
  onShowLog,
}: {
  // 브랜드의 모든 캠페인. 측정할 캠페인을 고르는 데 쓴다.
  measurements: EventMeasurement[]
  metrics: Metrics
  report: Report | null
  onSelect: (eventId: string) => void
  onUpdate: (measurement: EventMeasurement) => void
  onOpenQr: () => void
  // 캠페인 목표를 정하는 협약 화면을 연다.
  onOpenAgreements: () => void
  onShowLog: (kind?: MetricKind) => void
}) {
  const entries = useLiveMeasurement(report?.eventId, "브랜드", onUpdate)
  const upcoming = report !== null && measureState(report) === "진행 전"

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
            <span className={upcoming ? "measure-state upcoming" : "measure-state"}>{t(measureState(report))}</span>
            {entries[0] && (
              <span className="measure-updated">{t("마지막 참여 {time}", { time: formatDateTime(entries[0].at) })}</span>
            )}
          </div>
          <div className="campaign-measure-tiles">
            {shownKindsOf(report).map((kind) => (
              <button className="campaign-measure-tile" key={kind} onClick={() => onShowLog(kind)} type="button">
                <span>
                  <Icon name={metricInfo[kind].icon} size={16} /> {t(metricInfo[kind].label)}
                </span>
                <strong>{upcoming ? "—" : <AnimatedNumber value={metrics[kind].toLocaleString("ko-KR")} />}</strong>
                <small>
                  {isCheckInKind(kind) ? (
                    <>
                      {t("목표 {target}", { target: report.targets[kind].toLocaleString("ko-KR") })}
                      {!upcoming && ` · ${percent(metrics[kind], report.targets[kind])}%`}
                    </>
                  ) : (
                    t("현장에서 확인")
                  )}
                </small>
              </button>
            ))}
          </div>
          {upcoming && (
            <p className="measure-wait">
              <Icon name="scan" size={20} />
              {t("캠페인이 시작되면 참여 기록이 여기에 쌓여요. 목표는 임시 전자 계약서에서 행사 전까지 정해요.")}
            </p>
          )}
          <div className="campaign-measure-actions">
            {upcoming && (
              <Pill onClick={onOpenAgreements} variant="outline">
                {t("임시 전자 계약서")}
              </Pill>
            )}
            <Pill arrow="up-right" onClick={onOpenQr}>
              {t("현장 QR 열기")}
            </Pill>
          </div>
        </>
      )}
    </section>
  )
}
