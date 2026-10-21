import type { CSSProperties } from "react"

import { AnimatedNumber } from "../components/AnimatedNumber"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { Pill } from "../components/Pill"
import { RevealTitle } from "../components/RevealText"
import { formatFullDate } from "../lib/date"
import {
  achievement,
  formatKpi,
  formatWon,
  reportKpis,
  roasSummary,
  type KpiKey,
} from "../lib/kpis"
import { LayersGradient } from "../scenes/LayersGradient"
import { INTERFERENCE } from "../scenes/shaders"
import type { Metrics, Report } from "../types"

const delay = (seconds: number) => ({ "--reveal-delay": `${seconds}s` }) as CSSProperties

// The last event's results: the ROAS on a deep blue panel over getlayers.ai's
// Interference gradient (waves from two sources adding up where they meet,
// the way a sponsorship does), then each goal as a card that opens its
// details.
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
      <PageIntro
        eyebrow="Performance reports"
        title="성과 리포트"
        description="행사가 끝나면 현장 참여와 협찬 효과를 한 장으로 정리해 드려요."
        actions={
          <Pill arrow="up-right" disabled={!report || exporting} onClick={onDownload}>
            {exporting ? "PDF 만드는 중…" : "PDF 리포트 다운로드"}
          </Pill>
        }
      />
      {!report ? (
        <p className="day-empty">리포트를 불러오고 있어요.</p>
      ) : (
        <>
          <article className="power-panel" data-reveal>
            <LayersGradient shader={INTERFERENCE} />
            <div className="power-content">
              <div className="power-top">
                <span className="eyebrow light">
                  {report.eventName} · {formatFullDate(report.eventDate)}
                </span>
                <span className="power-status">측정 완료</span>
              </div>
              <RevealTitle as="h2" className="power-title">
                {`협찬 성과가 목표보다 ${roasSummary(report)}`}
              </RevealTitle>
              <div className="power-roas">
                <div className="power-roas-head">
                  <span>추정 ROAS</span>
                  <strong>
                    <AnimatedNumber value={`${report.roas}%`} />
                  </strong>
                </div>
                <div className="power-track">
                  <i style={{ width: `${(report.roas / roasScale) * 100}%` }} />
                  <b style={{ left: `${(report.targets.roas / roasScale) * 100}%` }} />
                </div>
                <small>
                  목표 {report.targets.roas}% · 협찬 가치 {formatWon(report.sponsorValue)}
                </small>
              </div>
              <Pill arrow="right" onClick={onOpenReport} variant="white">
                상세 데이터 보기
              </Pill>
            </div>
          </article>

          <div className="section-head">
            <span className="eyebrow" data-reveal>
              Goals
            </span>
            <RevealTitle as="h2" className="section-display">
              목표마다 얼마나 왔을까요
            </RevealTitle>
          </div>
          <ul className="kpi-grid">
            {reportKpis(report, metrics).map((kpi, index) => {
              const rate = achievement(kpi)
              return (
                <li data-reveal key={kpi.key} style={delay(index * 0.08)}>
                  <button className="kpi-card" onClick={() => onOpenGoal(kpi.key)} type="button">
                    <span className="kpi-label">
                      <span className="service-index">{String(index + 1).padStart(2, "0")}</span>
                      {kpi.label}
                      <Icon name="arrowUpRight" size={16} />
                    </span>
                    <strong>
                      <AnimatedNumber value={formatKpi(kpi.current, kpi.unit)} />
                    </strong>
                    <span className="kpi-meter" aria-hidden="true">
                      <i style={{ width: `${Math.min(100, rate)}%` }} />
                    </span>
                    <span className={rate >= 100 ? "kpi-status good" : "kpi-status"}>
                      목표 {formatKpi(kpi.target, kpi.unit)}
                      <b>{rate}% 달성</b>
                    </span>
                    <span className="kpi-note">{kpi.note}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
