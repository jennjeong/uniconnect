import { Fragment, type ReactNode } from "react"

import logo from "../assets/brand/uniconnect_horizontal.svg"
import { metricInfo, metricKinds } from "../data/metrics"
import { t, tc } from "../i18n"
import { formatDateTime, formatFullDate, todayIso } from "../lib/date"
import { percent } from "../lib/format"
import { achievement, formatKpi, formatWon, hasRoas, kpiGap, kpiValue, reportKpis, roasSummary, roasText } from "../lib/kpis"
import type { MetricEntry, Metrics, Report } from "../types"

// Colors of the sponsorship value parts (cash, products, services): deep
// blue, a lighter blue and silver.
const valueColors = ["#1b3f8f", "#5b86e0", "#b9c2d2"]

// A translated sentence with parts in markup: each {name} in it becomes
// nodes[name]. Plain values go to t() first, which also picks a plural word.
function rich(text: string, nodes: Record<string, ReactNode>) {
  return text.split(/\{(\w+)\}/).map((part, index) =>
    index % 2 ? <Fragment key={index}>{nodes[part]}</Fragment> : part,
  )
}

// The top of every PDF page: the logo, the day and who it was made for.
export function PageHeader({ author }: { author: string }) {
  return (
    <header className="pdf-header">
      <img alt="uniconnect" src={logo} />
      <div>
        <span>{t("발행 {date}", { date: formatFullDate(todayIso()) })}</span>
        <span>{t("작성 {author}", { author })}</span>
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

const footerNote = t("uniconnect · 협찬 성과 리포트 · 행사 측정 데이터로 자동 생성했어요.")


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
    label: t(metricInfo[kind].label),
    actual: metrics[kind],
    target: report.targets[kind],
  }))
  const countScale = Math.max(...counts.flatMap((count) => [count.actual, count.target]), 1) * 1.15

  const funnel = [
    { label: t("QR 스캔"), value: metrics.scans, note: t("참여 시작") },
    {
      label: t("쿠폰 수령"),
      value: metrics.coupons,
      note: t("QR 스캔의 {rate}%", { rate: percent(metrics.coupons, metrics.scans) }),
    },
    {
      label: t("매장 방문"),
      value: metrics.visits,
      note: t("쿠폰 받은 사람의 {rate}%", { rate: percent(metrics.visits, metrics.coupons) }),
    },
  ]

  const hourScale = Math.max(...report.hourlyScans.map((hour) => hour.scans), 1)
  const peak = report.hourlyScans.reduce(
    (best, hour) => (hour.scans > best.scans ? hour : best),
    report.hourlyScans[0] ?? { date: report.eventDate, hour: 0, scans: 0 },
  )
  // An event over several days labels each hour with its day.
  const severalDays = new Set(report.hourlyScans.map((hour) => hour.date)).size > 1
  const hourLabel = (hour: { date: string; hour: number }) =>
    severalDays
      ? t("{month}/{day} {hour}시", {
          month: Number(hour.date.slice(5, 7)),
          day: Number(hour.date.slice(8, 10)),
          hour: hour.hour,
        })
      : t("{hour}시", { hour: hour.hour })
  const valueTotal = report.valueBreakdown.reduce((sum, part) => sum + part.value, 0)

  const insights = [
    hasRoas(report)
      ? t("추정 ROAS {roas}%로 목표 {target}%보다 {summary}", {
          roas: roas.current,
          target: roas.target,
          summary: roasSummary(report),
        })
      : t("협찬 가치를 정하지 않아 ROAS는 계산하지 않았어요."),
    t("QR 참여율은 {rate}%로 목표({target}%) 대비 {gap}예요.", {
      rate: qrRate.current,
      target: qrRate.target,
      gap: kpiGap(qrRate),
    }),
    t("QR 스캔 {scans}건에 매장 방문이 {visits}건({rate}%) 이어졌어요.", {
      scans: metrics.scans,
      visits: metrics.visits,
      rate: visitRate.current,
    }),
    t("{hour}에 스캔이 {scans}건으로 가장 많았어요. 다음 행사에서는 이 시간대에 부스 인력을 모아 보세요.", {
      hour: hourLabel(peak),
      scans: peak.scans,
    }),
  ]

  return (
    <>
      <div className="pdf-page">
        <PageHeader author={author} />

        <div className="pdf-title">
          <span>SPONSORSHIP PERFORMANCE REPORT</span>
          <h1>{t("협찬 성과 리포트")}</h1>
          <p>
            {report.eventName} · {formatFullDate(report.eventDate)} ·{" "}
            {t("예상 관객 {audience}명", { audience: report.expectedAudience.toLocaleString("ko-KR") })}
          </p>
        </div>

        <div className="pdf-summary">
          <strong>
            {hasRoas(report)
              ? rich(t("협찬 성과가 목표보다 {summary}"), { summary: <em>{roasSummary(report)}</em> })
              : t("협찬 가치를 정하면 ROAS가 계산돼요")}
          </strong>
          <p>
            {t("추정 ROAS {roas} (목표 {target}%) · 협찬 가치 {value} · 도달 {reach}명", {
              roas: roasText(report),
              target: roas.target,
              value: formatWon(report.sponsorValue),
              reach: report.reach.toLocaleString("ko-KR"),
            })}
          </p>
        </div>

        <section className="pdf-section">
          <h2>{t("핵심 지표")}</h2>
          <div className="pdf-kpis">
            {kpis.map((kpi) => {
              const rate = achievement(kpi)
              return (
                <div className="pdf-kpi" key={kpi.key}>
                  <span>{kpi.label}</span>
                  <strong>{kpiValue(kpi)}</strong>
                  <small className={rate >= 100 ? "good" : ""}>
                    {t("목표 {target} · {rate}% 달성", { target: formatKpi(kpi.target, kpi.unit), rate })}
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
            <h2>{t("목표 대비 실적")}</h2>
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
              <span className="target">{tc("marker", "목표")}</span>
              <span>{t("실적")}</span>
            </div>
          </section>

          <section className="pdf-section pdf-card">
            <h2>{t("참여 전환 단계")}</h2>
            <div className="pdf-funnel">
              {funnel.map((step) => (
                <div className="pdf-funnel-row" key={step.label}>
                  <span className="pdf-funnel-label">{step.label}</span>
                  <div className="pdf-funnel-track">
                    <div
                      className="pdf-funnel-bar"
                      style={{ width: `${percent(step.value, metrics.scans)}%` }}
                    >
                      {t("{people}명", { people: step.value })}
                    </div>
                  </div>
                  <span className="pdf-funnel-note">{step.note}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="pdf-section pdf-card">
          <h2>{severalDays ? t("날짜·시간대별 QR 스캔") : t("행사 당일 시간대별 QR 스캔")}</h2>
          <div className="pdf-hourly">
            {report.hourlyScans.map((hour) => (
              <div className={hour === peak ? "pdf-hour peak" : "pdf-hour"} key={`${hour.date} ${hour.hour}`}>
                <span>{hour.scans}</span>
                <i style={{ height: `${(hour.scans / hourScale) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="pdf-axis">
            {report.hourlyScans.map((hour) => (
              <span key={`${hour.date} ${hour.hour}`}>{hourLabel(hour)}</span>
            ))}
          </div>
        </section>

        <PageFooter note={footerNote} page={1} total={2} />
      </div>

      <div className="pdf-page">
        <PageHeader author={author} />

        <section className="pdf-section pdf-card">
          <h2>{t("협찬 가치 구성 · 총 {total}", { total: formatWon(valueTotal) })}</h2>
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
                {t(part.type)}
                <strong>{formatWon(part.value)}</strong>
                <span>{percent(part.value, valueTotal)}%</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="pdf-section">
          <h2>{t("최근 참여 기록")}</h2>
          <table className="pdf-log">
            <thead>
              <tr>
                <th>{t("시각")}</th>
                <th>{tc("log", "항목")}</th>
                <th>{t("참여자")}</th>
                <th>{t("내용")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.slice(0, 6).map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDateTime(entry.at)}</td>
                  <td>{t(metricInfo[entry.kind].label)}</td>
                  <td>{entry.participant}</td>
                  <td>{entry.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="pdf-section">
          <h2>{t("인사이트와 다음 행사 제안")}</h2>
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
