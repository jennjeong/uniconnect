import type { CSSProperties } from "react"

import { AnimatedNumber } from "../components/AnimatedNumber"
import { EventPicker } from "../components/EventPicker"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { Pill } from "../components/Pill"
import { RevealTitle } from "../components/RevealText"
import { metricInfo, metricKinds } from "../data/metrics"
import { useLiveMeasurement } from "../hooks/useLiveMeasurement"
import { t } from "../i18n"
import { formatDateTime } from "../lib/date"
import { measureState } from "../lib/measurements"
import { percent } from "../lib/format"
import { LayersGradient } from "../scenes/LayersGradient"
import { INTERFERENCE } from "../scenes/shaders"
import type { EventMeasurement, MetricKind, Metrics, Report } from "../types"

const delay = (seconds: number) => ({ "--reveal-delay": `${seconds}s` }) as CSSProperties

// The event's live counts on getlayers.ai's Interference gradient (each scan,
// coupon and visit adding to the wave), then the funnel and the latest
// participation as cards.
export function MeasurementPage({
  measurements,
  metrics,
  report,
  onSelect,
  onUpdate,
  onOpenQr,
  onOpenGoals,
  onShowLog,
}: {
  // Every event of the group, to pick the one to measure.
  measurements: EventMeasurement[]
  metrics: Metrics
  report: Report | null
  onSelect: (eventId: string) => void
  // Receives fresh counts and report from each refresh.
  onUpdate: (measurement: EventMeasurement) => void
  onOpenQr: () => void
  onOpenGoals: () => void
  // Opens the participation history; without a kind, all of it.
  onShowLog: (kind?: MetricKind) => void
}) {
  const entries = useLiveMeasurement(report?.eventId, "학생단체", onUpdate)

  const funnel: { kind: MetricKind; note: string }[] = [
    { kind: "scans", note: t("현장에서 QR을 스캔했어요") },
    { kind: "coupons", note: t("QR 스캔의 {rate}%가 받았어요", { rate: percent(metrics.coupons, metrics.scans) }) },
    { kind: "visits", note: t("쿠폰 받은 사람의 {rate}%가 왔어요", { rate: percent(metrics.visits, metrics.coupons) }) },
  ]

  return (
    <section className="page-view measurement-view">
      <PageIntro
        eyebrow="Live Attribution"
        title={t("현장 반응을 실시간으로 측정해요")}
        description={t("고유 QR과 쿠폰 데이터를 행사 성과로 안전하게 집계합니다.")}
        actions={
          <>
            <Pill disabled={!report} onClick={onOpenGoals} variant="outline">
              {t("목표 설정")}
            </Pill>
            <Pill arrow="up-right" disabled={!report} onClick={onOpenQr}>
              {t("현장 QR 열기")}
            </Pill>
          </>
        }
      />

      <div className="measure-bar">
        {report ? (
          <EventPicker measurements={measurements} onSelect={onSelect} value={report.eventId} />
        ) : (
          <span className="measure-event">{t("행사를 등록하면 행사마다 현장 QR과 측정이 생겨요.")}</span>
        )}
        {report &&
          (measureState(report) === "측정 중" ? (
            <span className="live-badge">
              <i aria-hidden="true" /> {t("실시간 집계 중")}
            </span>
          ) : (
            <span className="measure-state">{t(measureState(report))}</span>
          ))}
        {entries[0] && (
          <span className="measure-updated">{t("마지막 참여 {time}", { time: formatDateTime(entries[0].at) })}</span>
        )}
      </div>

      <section className="power-panel live-panel" data-reveal>
        <LayersGradient shader={INTERFERENCE} />
        <div className="power-content">
          <span className="eyebrow light">Live Now</span>
          <RevealTitle as="h2" className="power-title">
            {t("지금 이 순간의 현장 반응")}
          </RevealTitle>
          <ul className="power-stats three">
            {metricKinds.map((kind, index) => {
              const target = report?.targets[kind]
              return (
                <li data-reveal key={kind} style={delay(index * 0.09)}>
                  <button onClick={() => onShowLog(kind)} type="button">
                    <strong>
                      <AnimatedNumber value={metrics[kind].toLocaleString("ko-KR")} />
                    </strong>
                    <span>
                      <Icon name={metricInfo[kind].icon} size={16} />
                      {t(metricInfo[kind].label)}
                    </span>
                    {target !== undefined && (
                      <small className={metrics[kind] >= target ? "good" : ""}>
                        {t("목표 {target}", { target })} ·{" "}
                        {metrics[kind] >= target ? t("달성") : t("{count} 남음", { count: target - metrics[kind] })}
                      </small>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      <div className="measure-grid">
        <div className="measure-card" data-reveal>
          <p className="section-title">{t("참여 전환")}</p>
          <div className="measure-funnel">
            {funnel.map((step) => (
              <div className="measure-step" key={step.kind}>
                <div className="measure-step-head">
                  <strong>{t(metricInfo[step.kind].label)}</strong>
                  <span>{t("{count}명", { count: metrics[step.kind].toLocaleString("ko-KR") })}</span>
                </div>
                <div className="measure-track">
                  <i style={{ width: `${percent(metrics[step.kind], metrics.scans)}%` }} />
                </div>
                <small>{step.note}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="measure-card" data-reveal style={delay(0.1)}>
          <div className="measure-card-head">
            <p className="section-title">{t("실시간 참여 기록")}</p>
            <button className="subtle-link" onClick={() => onShowLog()} type="button">
              {t("전체 보기")} <Icon name="chevron" size={15} />
            </button>
          </div>
          {entries.length === 0 ? (
            <p className="day-empty">{t("아직 참여 기록이 없어요.")}</p>
          ) : (
            <ol className="activity-feed stagger">
              {entries.slice(0, 5).map((entry) => (
                <li key={entry.id}>
                  <span className={`activity-kind kind-${entry.kind}`}>
                    {t(metricInfo[entry.kind].label)}
                  </span>
                  <div>
                    <strong>{entry.participant}</strong>
                    <small>{t(entry.detail)}</small>
                  </div>
                  <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  )
}
