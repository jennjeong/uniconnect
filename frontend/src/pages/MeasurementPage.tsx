import type { CSSProperties } from "react"

import { AnimatedNumber } from "../components/AnimatedNumber"
import { EventPicker } from "../components/EventPicker"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { Pill } from "../components/Pill"
import { RevealTitle } from "../components/RevealText"
import { isCheckInKind, metricInfo, metricKinds } from "../data/metrics"
import { useLiveMeasurement } from "../hooks/useLiveMeasurement"
import { t } from "../i18n"
import { formatDateTime, formatFullDate } from "../lib/date"
import { measureState, shownKindsOf } from "../lib/measurements"
import { percent } from "../lib/format"
import { LayersGradient } from "../scenes/LayersGradient"
import { INTERFERENCE } from "../scenes/shaders"
import type { EventMeasurement, MetricKind, Metrics, Report } from "../types"

const delay = (seconds: number) => ({ "--reveal-delay": `${seconds}s` }) as CSSProperties

// getlayers.ai의 Interference 그라디언트 위의 행사 실시간 집계. 양쪽이 전자
// 계약서에서 확인한 확인 방식의 것만 보여 주며(그 전에는 QR, 쿠폰, 매장 방문),
// QR이 있으면 이어서 퍼널, 마지막으로 최근 참여를 카드로 보여 준다. 행사가
// 끝나면(진행 완료) 패널이 그렇게 알린다. 행사 전에는(진행 전) 집계가 목표 옆에
// 대시로 기다리고, 카드는 행사가 열리면 보일 내용을 알려 주며, 목표는 협찬의
// 계약서에서 정한다.
export function MeasurementPage({
  measurements,
  metrics,
  report,
  onSelect,
  onUpdate,
  onOpenQr,
  onOpenAgreements,
  onShowLog,
}: {
  // 단체의 모든 행사. 측정할 행사를 고른다.
  measurements: EventMeasurement[]
  metrics: Metrics
  report: Report | null
  onSelect: (eventId: string) => void
  // 새로 고칠 때마다 최신 집계와 리포트를 받는다.
  onUpdate: (measurement: EventMeasurement) => void
  onOpenQr: () => void
  // 행사 목표를 정하는 계약서를 연다.
  onOpenAgreements: () => void
  // 참여 기록을 연다. 종류가 없으면 전부.
  onShowLog: (kind?: MetricKind) => void
}) {
  const entries = useLiveMeasurement(report?.eventId, "학생단체", onUpdate)
  const state = report ? measureState(report) : null
  const upcoming = state === "진행 전"
  const ended = state === "진행 완료"
  const tiles: MetricKind[] = report ? shownKindsOf(report) : metricKinds
  // 타일은 네 개까지 한 열씩, 그 뒤는 네 개나 세 개씩 한 줄.
  const columns = tiles.length <= 4 ? tiles.length : tiles.length % 4 === 0 ? 4 : 3

  const funnel: { kind: MetricKind; note: string }[] = [
    { kind: "scans" as const, note: t("현장에서 QR을 스캔했어요") },
    { kind: "coupons" as const, note: t("QR 스캔의 {rate}%가 받았어요", { rate: percent(metrics.coupons, metrics.scans) }) },
    { kind: "visits" as const, note: t("쿠폰 받은 사람의 {rate}%가 왔어요", { rate: percent(metrics.visits, metrics.coupons) }) },
  ].filter((step) => tiles.includes(step.kind))

  return (
    <section className="page-view measurement-view">
      <PageIntro
        eyebrow="Live Attribution"
        title={t("현장 반응을 실시간으로 측정해요")}
        description={t("QR과 쿠폰으로 행사 성과를 실시간으로 세요.")}
        actions={
          <Pill arrow="up-right" disabled={!report} onClick={onOpenQr}>
            {t("현장 QR 열기")}
          </Pill>
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
            <span className={upcoming ? "measure-state upcoming" : "measure-state"}>{t(measureState(report))}</span>
          ))}
        {upcoming && (
          <button className="subtle-link" onClick={onOpenAgreements} type="button">
            {t("목표는 임시 전자 계약서에서 정해요")} <Icon name="chevron" size={15} />
          </button>
        )}
        {entries[0] && (
          <span className="measure-updated">{t("마지막 참여 {time}", { time: formatDateTime(entries[0].at) })}</span>
        )}
      </div>

      <section className="power-panel live-panel" data-reveal>
        <LayersGradient shader={INTERFERENCE} />
        <div className="power-content">
          <span className="eyebrow light">{upcoming ? "Before the Event" : ended ? "Event Ended" : "Live Now"}</span>
          <RevealTitle as="h2" className="power-title">
            {upcoming
              ? t("행사가 시작되면 현장 반응이 여기에 떠요")
              : ended
                ? t("행사가 끝났어요. 모인 현장 반응이에요")
                : t("지금 이 순간의 현장 반응")}
          </RevealTitle>
          {upcoming && report && (
            <p className="power-lead">
              {t("{date}부터 임시 전자 계약서에서 확정한 협찬 확인 방식으로 실시간 집계해요.", {
                date: formatFullDate(report.eventDate),
              })}
            </p>
          )}
          <ul
            className={tiles.length % 2 ? "power-stats odd" : "power-stats"}
            style={{ "--columns": columns } as CSSProperties}
          >
            {tiles.map((kind, index) => {
              const target = isCheckInKind(kind) ? report?.targets[kind] : undefined
              return (
                <li data-reveal key={kind} style={delay(index * 0.09)}>
                  <button onClick={() => onShowLog(kind)} type="button">
                    <strong>
                      {upcoming ? "—" : <AnimatedNumber value={metrics[kind].toLocaleString("ko-KR")} />}
                    </strong>
                    <span>
                      <Icon name={metricInfo[kind].icon} size={16} />
                      {t(metricInfo[kind].label)}
                    </span>
                    {target === undefined ? (
                      <small>{t("현장에서 확인")}</small>
                    ) : (
                      (upcoming ? (
                        <small>{t("목표 {target}", { target })}</small>
                      ) : (
                        <small className={metrics[kind] >= target ? "good" : ""}>
                          {t("목표 {target}", { target })} ·{" "}
                          {metrics[kind] >= target ? t("달성") : t("{count} 남음", { count: target - metrics[kind] })}
                        </small>
                      ))
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
          {upcoming ? (
            <p className="measure-wait">
              <Icon name="chart" size={20} />
              {t("행사가 진행되면 QR 스캔에서 쿠폰, 매장 방문으로 이어진 비율이 여기에 그려져요.")}
            </p>
          ) : !tiles.includes("scans") ? (
            <p className="measure-wait">
              <Icon name="chart" size={20} />
              {t("참여 전환은 임시 전자 계약서에서 QR 체크인을 고른 행사에 그려져요.")}
            </p>
          ) : (
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
          )}
        </div>

        <div className="measure-card" data-reveal style={delay(0.1)}>
          <div className="measure-card-head">
            <p className="section-title">{t("실시간 참여 기록")}</p>
            {!upcoming && (
              <button className="subtle-link" onClick={() => onShowLog()} type="button">
                {t("전체 보기")} <Icon name="chevron" size={15} />
              </button>
            )}
          </div>
          {upcoming ? (
            <p className="measure-wait">
              <Icon name="scan" size={20} />
              {t("행사가 진행되면 참여 기록이 여기에 떠요. 확정한 협찬 확인 방식으로 기록되는 대로 보여요.")}
            </p>
          ) : entries.length === 0 ? (
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
