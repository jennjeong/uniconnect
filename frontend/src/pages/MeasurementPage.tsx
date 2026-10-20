import { useEffect, useState } from "react"

import { api } from "../api"
import { Icon } from "../components/Icon"
import { metricInfo, metricKinds } from "../data/metrics"
import { formatDateTime, formatFullDate } from "../lib/date"
import { percent } from "../lib/format"
import type { MetricEntry, MetricKind, Metrics, Report } from "../types"

// How often the counts and the activity feed refresh while this page is open.
const refreshMs = 10_000

export function MeasurementPage({
  metrics,
  report,
  onMetrics,
  onOpenQr,
  onShowLog,
}: {
  metrics: Metrics
  report: Report | null
  // Receives fresh counts from each refresh.
  onMetrics: (metrics: Metrics) => void
  onOpenQr: () => void
  // Opens the participation history; without a kind, all of it.
  onShowLog: (kind?: MetricKind) => void
}) {
  const [entries, setEntries] = useState<MetricEntry[]>([])

  useEffect(() => {
    let cancelled = false
    const load = () =>
      Promise.all([api.metricLog(), api.metrics()])
        .then(([log, latest]) => {
          if (cancelled) return
          setEntries(log.entries)
          onMetrics(latest.metrics)
        })
        .catch(() => {
          // Keep showing the last data; the next refresh tries again.
        })
    load()
    const timer = window.setInterval(load, refreshMs)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [onMetrics])

  const funnel: { kind: MetricKind; note: string }[] = [
    { kind: "scans", note: "현장에서 QR을 스캔했어요" },
    { kind: "coupons", note: `스캔한 사람의 ${percent(metrics.coupons, metrics.scans)}%가 받았어요` },
    { kind: "visits", note: `쿠폰 받은 사람의 ${percent(metrics.visits, metrics.coupons)}%가 왔어요` },
  ]

  return (
    <section className="page-view measurement-view">
      <div className="view-intro measurement-intro">
        <div>
          <span className="section-kicker">LIVE ATTRIBUTION</span>
          <p>현장 반응을 실시간으로 측정해요</p>
          <small>고유 QR과 쿠폰 데이터를 행사 성과로 안전하게 집계합니다.</small>
        </div>
        <button
          className="primary-button qr-open-button"
          disabled={!report}
          onClick={onOpenQr}
          type="button"
        >
          <Icon name="scan" size={15} /> 현장 QR 열기
        </button>
      </div>

      <div className="measure-bar">
        {report && (
          <span className="measure-event">
            <Icon name="calendar" size={15} />
            {report.eventName} · {formatFullDate(report.eventDate)}
          </span>
        )}
        <span className="live-badge">
          <i aria-hidden="true" /> 실시간 집계 중
        </span>
        {entries[0] && (
          <span className="measure-updated">마지막 참여 {formatDateTime(entries[0].at)}</span>
        )}
      </div>

      <div className="live-metrics">
        {metricKinds.map((kind) => {
          const target = report?.targets[kind]
          return (
            <button
              className="live-card"
              key={kind}
              onClick={() => onShowLog(kind)}
              type="button"
            >
              <div className="live-card-top">
                <div className="live-icon">
                  <Icon name={metricInfo[kind].icon} size={17} />
                </div>
                <span>{metricInfo[kind].label}</span>
              </div>
              <strong>{metrics[kind].toLocaleString("ko-KR")}</strong>
              {target !== undefined && (
                <small className={metrics[kind] >= target ? "good" : ""}>
                  목표 {target} · {metrics[kind] >= target ? "달성" : `${target - metrics[kind]} 남음`}
                </small>
              )}
            </button>
          )
        })}
      </div>

      <div className="measure-grid">
        <div className="measure-card">
          <p className="section-title">참여 전환</p>
          <div className="measure-funnel">
            {funnel.map((step) => (
              <div className="measure-step" key={step.kind}>
                <div className="measure-step-head">
                  <strong>{metricInfo[step.kind].label}</strong>
                  <span>{metrics[step.kind].toLocaleString("ko-KR")}명</span>
                </div>
                <div className="measure-track">
                  <i style={{ width: `${percent(metrics[step.kind], metrics.scans)}%` }} />
                </div>
                <small>{step.note}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="measure-card">
          <div className="measure-card-head">
            <p className="section-title">실시간 참여 기록</p>
            <button className="subtle-link" onClick={() => onShowLog()} type="button">
              전체 보기 <Icon name="chevron" size={15} />
            </button>
          </div>
          {entries.length === 0 ? (
            <p className="day-empty">아직 참여 기록이 없어요.</p>
          ) : (
            <ol className="activity-feed">
              {entries.slice(0, 5).map((entry) => (
                <li key={entry.id}>
                  <span className={`activity-kind kind-${entry.kind}`}>
                    {metricInfo[entry.kind].label}
                  </span>
                  <div>
                    <strong>{entry.participant}</strong>
                    <small>{entry.detail}</small>
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
