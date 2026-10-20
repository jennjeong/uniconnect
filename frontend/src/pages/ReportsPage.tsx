import { Icon } from "../components/Icon"
import { formatFullDate } from "../lib/date"
import {
  achievement,
  formatKpi,
  formatWon,
  reportKpis,
  roasSummary,
  type KpiKey,
} from "../lib/kpis"
import type { Metrics, Report } from "../types"

export function ReportsPage({
  report,
  metrics,
  exporting,
  onDownload,
  onOpenReport,
  onOpenGoal,
}: {
  report: Report | null
  metrics: Metrics
  // True while the PDF is being made.
  exporting: boolean
  onDownload: () => void
  onOpenReport: () => void
  onOpenGoal: (key: KpiKey) => void
}) {
  // ROAS bar scale, with room past the larger of the result and the goal.
  const roasScale = report ? Math.max(report.roas, report.targets.roas) * 1.15 : 1

  return (
    <section className="page-view">
      <div className="section-heading-row view-heading">
        <div>
          <span className="section-kicker dark">PERFORMANCE REPORTS</span>
          <p className="section-title">성과 리포트</p>
        </div>
        <button
          className="primary-button"
          disabled={!report || exporting}
          onClick={onDownload}
          type="button"
        >
          <Icon name="file" size={16} /> {exporting ? "PDF 만드는 중…" : "PDF 리포트 다운로드"}
        </button>
      </div>
      {!report ? (
        <p className="day-empty">리포트를 불러오고 있어요.</p>
      ) : (
        <div className="report-overview">
          <article className="report-hero">
            <div aria-hidden="true" className="hero-bars">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="hero-top">
              <span className="hero-chip">
                <Icon name="calendar" size={14} />
                {report.eventName} · {formatFullDate(report.eventDate)}
              </span>
              <span className="hero-status">측정 완료</span>
            </div>
            <p className="report-hero-title">
              협찬 성과가 목표보다
              <br />
              <em>{roasSummary(report)}</em>
            </p>
            <div className="hero-roas">
              <div className="hero-roas-head">
                <span>추정 ROAS</span>
                <strong>{report.roas}%</strong>
              </div>
              <div className="hero-roas-track">
                <i style={{ width: `${(report.roas / roasScale) * 100}%` }} />
                <b style={{ left: `${(report.targets.roas / roasScale) * 100}%` }} />
              </div>
              <small>
                목표 {report.targets.roas}% · 협찬 가치 {formatWon(report.sponsorValue)}
              </small>
            </div>
            <button className="detail-button hero-action" onClick={onOpenReport} type="button">
              상세 데이터 보기 <Icon name="arrow" size={16} />
            </button>
          </article>
          <div className="report-metric-grid">
            {reportKpis(report, metrics).map((kpi) => {
              const rate = achievement(kpi)
              return (
                <button
                  className="kpi-card"
                  key={kpi.key}
                  onClick={() => onOpenGoal(kpi.key)}
                  type="button"
                >
                  <span className="kpi-label">
                    {kpi.label}
                    <Icon name="chevron" size={14} />
                  </span>
                  <strong>{formatKpi(kpi.current, kpi.unit)}</strong>
                  <span className={rate >= 100 ? "kpi-status good" : "kpi-status"}>
                    목표 {formatKpi(kpi.target, kpi.unit)}
                    <b>{rate}% 달성</b>
                  </span>
                  <span className="kpi-note">{kpi.note}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
