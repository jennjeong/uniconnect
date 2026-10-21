import logo from "../assets/brand/uniconnect_horizontal.svg"
import { metricInfo, metricKinds } from "../data/metrics"
import { formatDateTime, formatFullDate, todayIso } from "../lib/date"
import { percent } from "../lib/format"
import { achievement, formatKpi, formatWon, kpiGap, reportKpis, roasSummary } from "../lib/kpis"
import type { MetricEntry, Metrics, Report } from "../types"

// Colors of the sponsorship value parts (cash, products, services): deep
// blue, a lighter blue and silver.
const valueColors = ["#1b3f8f", "#5b86e0", "#b9c2d2"]

// The top of every PDF page: the logo, the day and who it was made for.
export function PageHeader({ author }: { author: string }) {
  return (
    <header className="pdf-header">
      <img alt="uniconnect" src={logo} />
      <div>
        <span>발행 {formatFullDate(todayIso())}</span>
        <span>작성 {author}</span>
      </div>
    </header>
  )
}

// The bottom of every PDF page: what it is and the page number.
export function PageFooter({ note, page, total }: { note: string; page: number; total: number }) {
  return (
    <footer className="pdf-footer">
      <span>{note}</span>
      <span>
        {page} / {total}
      </span>
    </footer>
  )
}

const footerNote = "uniconnect · 협찬 성과 리포트 · 행사 측정 데이터로 자동 생성했어요."


// Two A4 pages (794×1123 px) of the event's performance report.
export function ReportDocument({
  report,
  metrics,
  entries,
  author,
}: {
  report: Report
  metrics: Metrics
  // Recent participation records, newest first.
  entries: MetricEntry[]
  author: string
}) {
  const kpis = reportKpis(report, metrics)
  const [, qrRate, visitRate, roas] = kpis

  const counts = metricKinds.map((kind) => ({
    kind,
    label: metricInfo[kind].label,
    actual: metrics[kind],
    target: report.targets[kind],
  }))
  const countScale = Math.max(...counts.flatMap((count) => [count.actual, count.target]), 1) * 1.15

  const funnel = [
    { label: "QR 스캔", value: metrics.scans, note: "참여 시작" },
    {
      label: "쿠폰 수령",
      value: metrics.coupons,
      note: `스캔한 사람의 ${percent(metrics.coupons, metrics.scans)}%`,
    },
    {
      label: "매장 방문",
      value: metrics.visits,
      note: `쿠폰 받은 사람의 ${percent(metrics.visits, metrics.coupons)}%`,
    },
  ]

  const hourScale = Math.max(...report.hourlyScans.map((hour) => hour.scans), 1)
  const peak = report.hourlyScans.reduce(
    (best, hour) => (hour.scans > best.scans ? hour : best),
    report.hourlyScans[0] ?? { hour: 0, scans: 0 },
  )
  const valueTotal = report.valueBreakdown.reduce((sum, part) => sum + part.value, 0)

  const insights = [
    `추정 ROAS ${roas.current}%로 목표 ${roas.target}%보다 ${roasSummary(report)}`,
    `QR 참여율은 ${qrRate.current}%로 목표(${qrRate.target}%) 대비 ${kpiGap(qrRate)}예요.`,
    `QR을 스캔한 ${metrics.scans}명 중 ${metrics.visits}명(${visitRate.current}%)이 실제로 매장을 찾았어요.`,
    `${peak.hour}시에 스캔이 ${peak.scans}건으로 가장 많았어요. 다음 행사에서는 이 시간대에 부스 인력을 모아 보세요.`,
  ]

  return (
    <>
      <div className="pdf-page">
        <PageHeader author={author} />

        <div className="pdf-title">
          <span>SPONSORSHIP PERFORMANCE REPORT</span>
          <h1>협찬 성과 리포트</h1>
          <p>
            {report.eventName} · {formatFullDate(report.eventDate)} · 예상 관객{" "}
            {report.expectedAudience.toLocaleString("ko-KR")}명
          </p>
        </div>

        <div className="pdf-summary">
          <strong>
            협찬 성과가 목표보다 <em>{roasSummary(report)}</em>
          </strong>
          <p>
            추정 ROAS {roas.current}% (목표 {roas.target}%) · 협찬 가치{" "}
            {formatWon(report.sponsorValue)} · 도달 {report.reach.toLocaleString("ko-KR")}명
          </p>
        </div>

        <section className="pdf-section">
          <h2>핵심 지표</h2>
          <div className="pdf-kpis">
            {kpis.map((kpi) => {
              const rate = achievement(kpi)
              return (
                <div className="pdf-kpi" key={kpi.key}>
                  <span>{kpi.label}</span>
                  <strong>{formatKpi(kpi.current, kpi.unit)}</strong>
                  <small className={rate >= 100 ? "good" : ""}>
                    목표 {formatKpi(kpi.target, kpi.unit)} · {rate}% 달성
                  </small>
                  <div className="pdf-kpi-track">
                    <i style={{ width: `${Math.min(rate, 100)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <div className="pdf-chart-row">
          <section className="pdf-section pdf-card">
            <h2>목표 대비 실적</h2>
            <div className="pdf-bar-chart">
              {counts.map((count) => (
                <div className="pdf-bar-pair" key={count.kind}>
                  <div
                    className="pdf-bar target"
                    style={{ height: `${(count.target / countScale) * 100}%` }}
                  >
                    <span>{count.target}</span>
                  </div>
                  <div
                    className="pdf-bar actual"
                    style={{ height: `${(count.actual / countScale) * 100}%` }}
                  >
                    <span>{count.actual}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="pdf-axis">
              {counts.map((count) => (
                <span key={count.kind}>{count.label}</span>
              ))}
            </div>
            <div className="pdf-legend">
              <span className="target">목표</span>
              <span>실적</span>
            </div>
          </section>

          <section className="pdf-section pdf-card">
            <h2>참여 전환 단계</h2>
            <div className="pdf-funnel">
              {funnel.map((step) => (
                <div className="pdf-funnel-row" key={step.label}>
                  <span className="pdf-funnel-label">{step.label}</span>
                  <div className="pdf-funnel-track">
                    <div
                      className="pdf-funnel-bar"
                      style={{ width: `${percent(step.value, metrics.scans)}%` }}
                    >
                      {step.value}명
                    </div>
                  </div>
                  <span className="pdf-funnel-note">{step.note}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="pdf-section pdf-card">
          <h2>행사 당일 시간대별 QR 스캔</h2>
          <div className="pdf-hourly">
            {report.hourlyScans.map((hour) => (
              <div className={hour === peak ? "pdf-hour peak" : "pdf-hour"} key={hour.hour}>
                <span>{hour.scans}</span>
                <i style={{ height: `${(hour.scans / hourScale) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="pdf-axis">
            {report.hourlyScans.map((hour) => (
              <span key={hour.hour}>{hour.hour}시</span>
            ))}
          </div>
        </section>

        <PageFooter note={footerNote} page={1} total={2} />
      </div>

      <div className="pdf-page">
        <PageHeader author={author} />

        <section className="pdf-section pdf-card">
          <h2>협찬 가치 구성 · 총 {formatWon(valueTotal)}</h2>
          <div className="pdf-stack">
            {report.valueBreakdown.map((part, index) => (
              <span
                key={part.type}
                style={{
                  width: `${(part.value / (valueTotal || 1)) * 100}%`,
                  background: valueColors[index % valueColors.length],
                }}
              />
            ))}
          </div>
          <ul className="pdf-value-legend">
            {report.valueBreakdown.map((part, index) => (
              <li key={part.type}>
                <i style={{ background: valueColors[index % valueColors.length] }} />
                {part.type}
                <strong>{formatWon(part.value)}</strong>
                <span>{percent(part.value, valueTotal)}%</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="pdf-section">
          <h2>최근 참여 기록</h2>
          <table className="pdf-log">
            <thead>
              <tr>
                <th>시각</th>
                <th>항목</th>
                <th>참여자</th>
                <th>내용</th>
              </tr>
            </thead>
            <tbody>
              {entries.slice(0, 6).map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDateTime(entry.at)}</td>
                  <td>{metricInfo[entry.kind].label}</td>
                  <td>{entry.participant}</td>
                  <td>{entry.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="pdf-section">
          <h2>인사이트와 다음 행사 제안</h2>
          <ol className="pdf-insights">
            {insights.map((insight, index) => (
              <li key={insight}>
                <b>{index + 1}</b>
                {insight}
              </li>
            ))}
          </ol>
        </section>

        <PageFooter note={footerNote} page={2} total={2} />
      </div>
    </>
  )
}
