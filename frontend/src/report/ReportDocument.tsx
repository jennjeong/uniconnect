import { Fragment, type ReactNode } from "react"

import logo from "../assets/brand/uniconnect_horizontal.svg"
import { venueSummary } from "../data/methods"
import { metricInfo, metricKinds } from "../data/metrics"
import { t, tc } from "../i18n"
import { formatDateTime, formatFullDate, todayIso } from "../lib/date"
import { percent } from "../lib/format"
import { achievement, formatKpi, formatWon, hasRoas, kpiGap, kpiValue, reportKpis, roasSummary, roasText } from "../lib/kpis"
import { venueKindsOf } from "../lib/measurements"
import { shares, studentInsights } from "../lib/studentInsights"
import type { MetricEntry, Metrics, MetricKind, Report } from "../types"

// 협찬 가치 구성(현금, 제품, 서비스)의 색: 짙은 파랑, 더 밝은 파랑, 은색.
const valueColors = ["#1b3f8f", "#5b86e0", "#b9c2d2"]

// 일부가 마크업인 번역 문장. 문장 안의 {name}마다 nodes[name]이 들어간다. 일반
// 값은 먼저 t()로 넘기며, t()가 복수형 단어도 고른다.
function rich(text: string, nodes: Record<string, ReactNode>) {
  return text.split(/\{(\w+)\}/).map((part, index) =>
    index % 2 ? <Fragment key={index}>{nodes[part]}</Fragment> : part,
  )
}

// 측정 방식으로 현장 직원이 확인한 것. 개수마다 타일 하나이고, 스폰서가
// 여럿이면 스폰서마다 한 줄. 어떤 방식도 세지 않았으면 아무것도 없다.
export function VenueCounts({
  kinds,
  counts,
  sponsors,
}: {
  kinds: MetricKind[]
  counts: Partial<Record<MetricKind, number>>
  sponsors?: ({ id: string; brandName: string } & Partial<Record<MetricKind, number>>)[]
}) {
  if (kinds.length === 0) return null
  const lines = (sponsors ?? []).map((sponsor) => ({ ...sponsor, summary: venueSummary(sponsor) })).filter((sponsor) => sponsor.summary)
  return (
    <section className="pdf-section pdf-card">
      <h2>{t("현장에서 확인한 성과")}</h2>
      <div className="pdf-kpis">
        {kinds.map((kind) => (
          <div className="pdf-kpi" key={kind}>
            <span>{t(metricInfo[kind].label)}</span>
            <strong>{(counts[kind] ?? 0).toLocaleString("ko-KR")}</strong>
            <small className="good">{t("현장에서 확인")}</small>
          </div>
        ))}
      </div>
      {lines.length > 1 && (
        <ul className="pdf-venue-sponsors">
          {lines.map((sponsor) => (
            <li key={sponsor.id}>
              <b>{sponsor.brandName}</b> {sponsor.summary}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// PDF 모든 페이지의 위쪽: 로고, 날짜, 누구를 위해 만들었는지.
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

// PDF 모든 페이지의 아래쪽: 무엇인지와 쪽 번호.
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


// 행사 성과 리포트의 A4 두 페이지(794×1123 px).
export function ReportDocument({
  report,
  metrics,
  entries,
  author,
}: {
  report: Report
  metrics: Metrics
  // 최근 참여 기록. 최신순.
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
  // 여러 날에 걸친 행사는 시간마다 날짜를 붙인다.
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

        <PageFooter note={footerNote} page={1} total={3} />
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

        <VenueCounts counts={metrics} kinds={venueKindsOf(report)} sponsors={report.sponsors} />

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

        <PageFooter note={footerNote} page={2} total={3} />
      </div>

      <StudentPage author={author} metrics={metrics} report={report} />
    </>
  )
}

// 설문 답 하나의 비율을 막대로. 큰 순서.
function Distribution({ title, counts }: { title: string; counts?: Record<string, number> }) {
  const rows = shares(counts)
  return (
    <div className="pdf-dist">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="pdf-note">{t("응답이 없어요.")}</p>
      ) : (
        <ul>
          {rows.slice(0, 5).map((row) => (
            <li key={row.label}>
              <span>{t(row.label)}</span>
              <i>
                <b style={{ width: `${row.share}%` }} />
              </i>
              <em>{row.share}%</em>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// 학생 자신을 위한 3페이지: 누가 왔는지(퍼널에 따른 참석, 예상한 사람과 견준
// 설문의 학년, 전공, 성별)와 다음 행사에서 바꿀 것.
function StudentPage({ report, metrics, author }: { report: Report; metrics: Metrics; author: string }) {
  const insight = studentInsights(report, metrics)
  const expected = report.makeup
  return (
    <div className="pdf-page">
      <PageHeader author={author} />
      <div className="pdf-title">
        <span>FOR OUR STUDENTS</span>
        <h1>{t("참여 학생 분석과 다음 행사 제안")}</h1>
        <p>{t("누가 왔고 어디서 놓쳤는지 보고 다음 행사를 더 잘 준비해요.")}</p>
      </div>
      <section className="pdf-section">
        <h2>{t("참여 흐름")}</h2>
        <div className="pdf-kpis">
          <div className="pdf-kpi">
            <span>{t("참여율")}</span>
            <strong>{report.expectedAudience > 0 ? `${insight.participation}%` : "—"}</strong>
            <small className="good">{t("예상 {count}명 중 QR 참여", { count: report.expectedAudience.toLocaleString("ko-KR") })}</small>
          </div>
          <div className="pdf-kpi">
            <span>{t("쿠폰 전환")}</span>
            <strong>{metrics.scans > 0 ? `${insight.couponRate}%` : "—"}</strong>
            <small className="good">{t("QR 참여 중 쿠폰 수령")}</small>
          </div>
          <div className="pdf-kpi">
            <span>{t("방문 전환")}</span>
            <strong>{metrics.coupons > 0 ? `${insight.visitRate}%` : "—"}</strong>
            <small className="good">{t("쿠폰 수령 중 매장 방문")}</small>
          </div>
          <div className="pdf-kpi">
            <span>{t("설문 응답")}</span>
            <strong>{t("{count}명", { count: insight.responses.toLocaleString("ko-KR") })}</strong>
            <small className="good">{insight.hour !== undefined ? t("가장 붐빈 시간 {hour}시", { hour: insight.hour }) : t("시간대 기록 없음")}</small>
          </div>
        </div>
      </section>
      <section className="pdf-section pdf-card">
        <h2>{t("참여 학생 구성")}</h2>
        <div className="pdf-dists">
          <Distribution counts={report.survey?.grade} title={t("학년")} />
          <Distribution counts={report.survey?.field} title={t("전공 계열")} />
          <Distribution counts={report.survey?.gender} title={t("성별")} />
        </div>
        {expected && (
          <p className="pdf-note">
            {[
              expected.years?.length ? t("예상 참여 {years}", { years: expected.years.map((year) => t(year)).join(", ") }) : "",
              expected.majors ? t("주요 전공 {majors}", { majors: expected.majors }) : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </section>
      <section className="pdf-section">
        <h2>{t("다음 행사에 이렇게 반영해요")}</h2>
        <ol className="pdf-advice">
          {insight.advice.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </section>
      <PageFooter note={footerNote} page={3} total={3} />
    </div>
  )
}
