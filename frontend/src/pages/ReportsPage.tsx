import type { CSSProperties } from "react"

import { AnimatedNumber } from "../components/AnimatedNumber"
import { EventPicker } from "../components/EventPicker"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { Pill } from "../components/Pill"
import { RevealTitle } from "../components/RevealText"
import { metricInfo } from "../data/metrics"
import { venueSummary } from "../data/methods"
import { t } from "../i18n"
import { reportCsv } from "../lib/csv"
import { formatFullDate } from "../lib/date"
import { saveFile } from "../lib/download"
import { historyCsv, sponsorHistory, trackRecord } from "../lib/history"
import {
  achievement,
  formatKpi,
  formatWon,
  hasRoas,
  kpiValue,
  reportKpis,
  roasText,
  type KpiKey,
} from "../lib/kpis"
import { measureState, venueKindsOf } from "../lib/measurements"
import { LayersGradient } from "../scenes/LayersGradient"
import { INTERFERENCE } from "../scenes/shaders"
import type { EventMeasurement, Metrics, Report } from "../types"

const delay = (seconds: number) => ({ "--reveal-delay": `${seconds}s` }) as CSSProperties

// "협찬 성과가 목표보다 43% 높았어요." from the ROAS against its goal (as
// roasSummary in lib/kpis.ts works it out), in the language shown.
function roasHeadline(report: Report) {
  const gain = Math.round((report.roas / Math.max(1, report.targets.roas) - 1) * 100)
  return gain >= 0
    ? t("협찬 성과가 목표보다 {gain}% 높았어요.", { gain })
    : t("협찬 성과가 목표보다 {gain}% 낮았어요.", { gain: -gain })
}

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
        eyebrow="Performance Reports"
        title={t("성과 리포트")}
        description={t("행사가 끝나면 현장 참여와 협찬 효과를 한 장으로 정리해 드려요.")}
        actions={
          <>
            <Pill arrow="up-right" disabled={!report || exporting} onClick={onDownload}>
              {exporting ? t("PDF 만드는 중…") : t("PDF 리포트 다운로드")}
            </Pill>
            {/* The same figures as a spreadsheet (lib/csv.ts), made on the page. */}
            <Pill
              disabled={!report}
              onClick={() =>
                report &&
                saveFile(`uniconnect-report-${report.eventDate}.csv`, reportCsv(report, metrics), "text/csv;charset=utf-8")
              }
              variant="outline"
            >
              {t("CSV로 내보내기")}
            </Pill>
          </>
        }
      />
      {!report ? (
        <p className="day-empty">{t("행사를 등록하면 행사마다 리포트가 생겨요.")}</p>
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
                <span className="power-status">{t(measureState(report))}</span>
              </div>
              <RevealTitle as="h2" className="power-title">
                {hasRoas(report) ? roasHeadline(report) : t("협찬 가치를 정하면 ROAS가 계산돼요")}
              </RevealTitle>
              <div className="power-roas">
                <div className="power-roas-head">
                  <span>{t("추정 ROAS")}</span>
                  <strong>
                    <AnimatedNumber value={roasText(report)} />
                  </strong>
                </div>
                <div className="power-track">
                  <i style={{ width: `${(report.roas / roasScale) * 100}%` }} />
                  <b style={{ left: `${(report.targets.roas / roasScale) * 100}%` }} />
                </div>
                <small>
                  {t("목표 {roas}% · 협찬 가치 {value}", {
                    roas: report.targets.roas,
                    value: formatWon(report.sponsorValue),
                  })}
                </small>
              </div>
              <Pill arrow="right" onClick={onOpenReport} variant="white">
                {t("상세 데이터 보기")}
              </Pill>
            </div>
          </article>

          <div className="section-head">
            <span className="eyebrow" data-reveal>
              Goals
            </span>
            <RevealTitle as="h2" className="section-display">
              {t("목표마다 얼마나 왔을까요")}
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
                      {t(kpi.label)}
                      <Icon name="arrowUpRight" size={16} />
                    </span>
                    <strong>
                      <AnimatedNumber value={kpiValue(kpi)} />
                    </strong>
                    <span className="kpi-meter" aria-hidden="true">
                      <i style={{ width: `${Math.min(100, rate)}%` }} />
                    </span>
                    <span className={rate >= 100 ? "kpi-status good" : "kpi-status"}>
                      {t("목표 {target}", { target: formatKpi(kpi.target, kpi.unit) })}
                      <b>{t("{rate}% 달성", { rate })}</b>
                    </span>
                    <span className="kpi-note">{kpi.note}</span>
                  </button>
                </li>
              )
            })}
          </ul>

          {venueKindsOf(report).length > 0 && (
            <div className="analytics-card venue-card" data-reveal>
              <p className="section-title">{t("현장에서 확인한 성과")}</p>
              <dl className="goals-list">
                {venueKindsOf(report).map((kind) => (
                  <div key={kind}>
                    <dt>{t(metricInfo[kind].label)}</dt>
                    <dd>{metrics[kind].toLocaleString("ko-KR")}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {report.sponsors && report.sponsors.length > 1 && (
            <div className="analytics-card sponsor-card" data-reveal>
              <p className="section-title">{t("협찬사별 성과")}</p>
              <div className="analytics-table sponsor-table stagger" role="table" aria-label={t("협찬사별 성과")}>
                <div className="analytics-row head" role="row">
                  <span role="columnheader">{t("협찬사")}</span>
                  <span role="columnheader">{t("협찬 가치")}</span>
                  <span role="columnheader">{t("쿠폰 수령")}</span>
                  <span role="columnheader">{t("매장 방문")}</span>
                  <span role="columnheader">ROAS</span>
                </div>
                {report.sponsors.map((sponsor) => (
                  <div className="analytics-row" key={sponsor.id} role="row">
                    <span className="analytics-event" role="cell">
                      <strong>{sponsor.brandName}</strong>
                      <small>
                        {sponsor.coupon.store} · {sponsor.coupon.title}
                      </small>
                      {venueSummary(sponsor) && <small className="venue-summary">{venueSummary(sponsor)}</small>}
                    </span>
                    <span role="cell" data-label={t("협찬 가치")}>
                      {formatWon(sponsor.value)}
                    </span>
                    <span role="cell" data-label={t("쿠폰 수령")}>
                      {t("{count}장", { count: sponsor.coupons.toLocaleString("ko-KR") })}
                    </span>
                    <span role="cell" data-label={t("매장 방문")}>
                      {t("{count}명", { count: sponsor.visits.toLocaleString("ko-KR") })}
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
                {t("참여자는 협찬사마다 쿠폰을 따로 받고, 각 매장이 자기 쿠폰의 방문만 확인해요. 위 목표는 행사 전체 기준이에요.")}
              </small>
            </div>
          )}
          <SponsorHistory measurements={measurements} onOpen={onSelect} />
        </>
      )}
    </section>
  )
}

// The group's sponsorship record (협찬 기록): every event held, its
// sponsors and results, what they add up to, and the whole as a file the
// team hands to the next one.
function SponsorHistory({ measurements, onOpen }: { measurements: EventMeasurement[]; onOpen: (eventId: string) => void }) {
  const rows = sponsorHistory(measurements)
  const record = trackRecord(rows)
  return (
    <div className="analytics-card history-card" data-reveal>
      <div className="history-head">
        <div>
          <p className="section-title">{t("협찬 기록")}</p>
          <small className="field-hint">{t("운영진이 바뀌어도 이어지도록, 지금까지 연 행사와 협찬 결과를 모아 둬요.")}</small>
        </div>
        <Pill
          disabled={rows.length === 0}
          onClick={() => saveFile("uniconnect-sponsorship-history.csv", historyCsv(rows), "text/csv;charset=utf-8")}
          variant="outline"
        >
          {t("인수인계용 CSV")}
        </Pill>
      </div>
      {rows.length === 0 ? (
        <p className="day-empty">{t("행사가 열리면 여기에 차곡차곡 쌓여요.")}</p>
      ) : (
        <>
          <dl className="history-totals">
            <div>
              <dt>{t("연 행사")}</dt>
              <dd>{t("{count}건", { count: record.events })}</dd>
            </div>
            <div>
              <dt>{t("함께한 브랜드")}</dt>
              <dd>{t("{count}곳", { count: record.brands })}</dd>
            </div>
            <div>
              <dt>{t("누적 QR 참여")}</dt>
              <dd>{record.scans.toLocaleString("ko-KR")}</dd>
            </div>
            <div>
              <dt>{t("평균 ROAS")}</dt>
              <dd>{record.roas === null ? "—" : `${record.roas}%`}</dd>
            </div>
          </dl>
          <div className="analytics-table history-table" role="table" aria-label={t("협찬 기록")}>
            <div className="analytics-row head" role="row">
              <span role="columnheader">{t("행사")}</span>
              <span role="columnheader">{t("협찬사")}</span>
              <span role="columnheader">{t("QR 스캔")}</span>
              <span role="columnheader">{t("매장 방문")}</span>
              <span role="columnheader">ROAS</span>
            </div>
            {rows.map((row) => (
              <div className="analytics-row" key={row.eventId} role="row">
                <span className="analytics-event" role="cell">
                  <button className="history-open" onClick={() => onOpen(row.eventId)} type="button">
                    <strong>{row.eventName}</strong>
                    <small>{formatFullDate(row.date)}</small>
                  </button>
                </span>
                <span role="cell" data-label={t("협찬사")}>
                  {row.brands.length ? row.brands.join(", ") : t("협찬 없음")}
                </span>
                <span role="cell" data-label={t("QR 스캔")}>
                  {row.scans.toLocaleString("ko-KR")}
                </span>
                <span role="cell" data-label={t("매장 방문")}>
                  {t("{count}명", { count: row.visits.toLocaleString("ko-KR") })}
                </span>
                <span role="cell" data-label="ROAS">
                  {row.roas === null ? "—" : `${row.roas}%`}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
