import type { CSSProperties } from "react"

import { AnimatedNumber } from "../components/AnimatedNumber"
import { EventPicker } from "../components/EventPicker"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { Pill } from "../components/Pill"
import { RevealTitle } from "../components/RevealText"
import { formatFullDate } from "../lib/date"
import {
  achievement,
  formatKpi,
  formatWon,
  hasRoas,
  kpiValue,
  reportKpis,
  roasSummary,
  roasText,
  type KpiKey,
} from "../lib/kpis"
import { measureState } from "../lib/measurements"
import { LayersGradient } from "../scenes/LayersGradient"
import { INTERFERENCE } from "../scenes/shaders"
import type { EventMeasurement, Metrics, Report } from "../types"

const delay = (seconds: number) => ({ "--reveal-delay": `${seconds}s` }) as CSSProperties

// One event's results (the latest one that has started, or the one picked):
// the ROAS on a deep blue panel over getlayers.ai's
// Interference gradient (waves from two sources adding up where they meet,
// the way a sponsorship does), then each goal as a card that opens its
// details.
export function ReportsPage({
  measurements,
  report,
  onSelect,
  metrics,
  exporting,
  onDownload,
  onOpenReport,
  onOpenGoal,
}: {
  // Every event of the group, to pick the one to report on.
  measurements: EventMeasurement[]
  report: Report | null
  onSelect: (eventId: string) => void
  metrics: Metrics
  // True while the PDF is being made.
  exporting: boolean
  onDownload: () => void
  onOpenReport: () => void
  onOpenGoal: (key: KpiKey) => void
}) {
  // ROAS bar scale, with room past the larger of the result and the goal.
  const roasScale = report ? Math.max(1, report.roas, report.targets.roas) * 1.15 : 1

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
        <p className="day-empty">행사를 등록하면 행사마다 리포트가 생겨요.</p>
      ) : (
        <>
          <div className="measure-bar">
            <EventPicker measurements={measurements} onSelect={onSelect} value={report.eventId} />
          </div>
          <article className="power-panel" data-reveal>
            <LayersGradient shader={INTERFERENCE} />
            <div className="power-content">
              <div className="power-top">
                <span className="eyebrow light">
                  {report.eventName} · {formatFullDate(report.eventDate)}
                </span>
                <span className="power-status">{measureState(report)}</span>
              </div>
              <RevealTitle as="h2" className="power-title">
                {hasRoas(report) ? `협찬 성과가 목표보다 ${roasSummary(report)}` : "협찬 가치를 정하면 ROAS가 계산돼요"}
              </RevealTitle>
              <div className="power-roas">
                <div className="power-roas-head">
                  <span>추정 ROAS</span>
                  <strong>
                    <AnimatedNumber value={roasText(report)} />
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
                      <AnimatedNumber value={kpiValue(kpi)} />
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

          {report.sponsors && report.sponsors.length > 1 && (
            <div className="analytics-card sponsor-card" data-reveal>
              <p className="section-title">협찬사별 성과</p>
              <div className="analytics-table sponsor-table stagger" role="table" aria-label="협찬사별 성과">
                <div className="analytics-row head" role="row">
                  <span role="columnheader">협찬사</span>
                  <span role="columnheader">협찬 가치</span>
                  <span role="columnheader">쿠폰 수령</span>
                  <span role="columnheader">매장 방문</span>
                  <span role="columnheader">ROAS</span>
                </div>
                {report.sponsors.map((sponsor) => (
                  <div className="analytics-row" key={sponsor.id} role="row">
                    <span className="analytics-event" role="cell">
                      <strong>{sponsor.brandName}</strong>
                      <small>
                        {sponsor.coupon.store} · {sponsor.coupon.title}
                      </small>
                    </span>
                    <span role="cell" data-label="협찬 가치">
                      {formatWon(sponsor.value)}
                    </span>
                    <span role="cell" data-label="쿠폰 수령">
                      {sponsor.coupons.toLocaleString("ko-KR")}장
                    </span>
                    <span role="cell" data-label="매장 방문">
                      {sponsor.visits.toLocaleString("ko-KR")}명
                    </span>
                    <span
                      role="cell"
                      data-label="ROAS"
                      className={sponsor.roas >= report.targets.roas ? "analytics-roas met" : "analytics-roas"}
                    >
                      {sponsor.roas}%
                    </span>
                  </div>
                ))}
              </div>
              <small className="field-hint">
                참여자는 협찬사마다 쿠폰을 따로 받고, 각 매장이 자기 쿠폰의 방문만 확인해요. 위 목표는 행사 전체 기준이에요.
              </small>
            </div>
          )}
        </>
      )}
    </section>
  )
}
