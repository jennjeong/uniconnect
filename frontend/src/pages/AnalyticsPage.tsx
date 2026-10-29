import { Fragment, type CSSProperties, type ReactNode } from "react"

import { AnimatedNumber } from "../components/AnimatedNumber"
import { CampusPortfolio } from "../components/CampusPortfolio"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { Pill } from "../components/Pill"
import { RevealTitle } from "../components/RevealText"
import { venueSummary } from "../data/methods"
import { lang, t } from "../i18n"
import { analyticsCsv } from "../lib/csv"
import { formatFullDate, todayIso } from "../lib/date"
import { saveFile } from "../lib/download"
import { formatWon } from "../lib/kpis"
import { analyzeSponsorships, manWon, wonUnit } from "../lib/sponsorships"
import { LayersGradient } from "../scenes/LayersGradient"
import { INTERFERENCE } from "../scenes/shaders"
import type { Sponsorship } from "../types"

const delay = (seconds: number) => ({ "--reveal-delay": `${seconds}s` }) as CSSProperties

// A translated sentence with parts in markup: each {name} in it becomes
// nodes[name]. Plain values go to t() first, which also picks a plural word.
function rich(text: string, nodes: Record<string, ReactNode>) {
  return text.split(/\{(\w+)\}/).map((part, index) =>
    index % 2 ? <Fragment key={index}>{nodes[part]}</Fragment> : part,
  )
}

// Counting words after a number ("장", "명"), which English leaves out.
const countUnit = (unit: string) => (lang === "en" ? "" : unit)

// Spend, coupons, visits and ROAS of each sponsorship the brand has done:
// the totals over getlayers.ai's Interference gradient, then ROAS, insights
// and a table. The whole analysis, with a report page for each
// sponsorship, downloads as a PDF.
// A sponsorship's detailed report at the end of its row: to read, to buy,
// or from its event's day.
function ReportButton({ state, onOpen }: { state?: Sponsorship["report"]; onOpen: () => void }) {
  if (!state || state === "none") return <small className="analytics-report-none">—</small>
  if (state === "soon") return <small className="analytics-report-none">{t("행사 날부터")}</small>
  return (
    <button className={state === "open" ? "report-button open" : "report-button"} onClick={onOpen} type="button">
      <Icon name={state === "open" ? "file" : "lock"} size={13} />
      {state === "open" ? t("리포트 보기") : t("리포트 사기")}
    </button>
  )
}

export function AnalyticsPage({
  sponsorships,
  exporting,
  onDownload,
  onOpenReport,
  onOpenPlan,
  campaign,
}: {
  // Newest first.
  sponsorships: Sponsorship[]
  // While the PDF report is being made.
  exporting: boolean
  // Saves the analysis with each sponsorship's report as a PDF.
  onDownload: () => void
  // A sponsorship's detailed report (pages/InsightPage.tsx), for those of a
  // measured event.
  onOpenReport: (sponsorshipId: string) => void
  // The plan card on 내 정보, from the locked portfolio.
  onOpenPlan: () => void
  // On-site measurement of the brand's own campaigns, at the end.
  campaign?: ReactNode
}) {
  const { totals, rows, best, furthestBelow, cheapest, metCount, visitRate, roasScale } =
    analyzeSponsorships(sponsorships)

  // Each number with its unit set smaller after it, so the four read alike.
  const kpis = [
    {
      label: t("누적 집행액"),
      value: manWon(totals.spend),
      unit: wonUnit(),
      note: t("협찬 {count}건 · 현금과 현물 포함", { count: sponsorships.length }),
    },
    {
      label: t("쿠폰 수령"),
      value: totals.coupons.toLocaleString("ko-KR"),
      unit: countUnit("장"),
      note: t("협찬당 평균 {count}장", {
        count: sponsorships.length ? Math.round(totals.coupons / sponsorships.length) : 0,
      }),
    },
    {
      label: t("매장 방문"),
      value: totals.visits.toLocaleString("ko-KR"),
      unit: countUnit("명"),
      note: t("쿠폰 받은 학생의 {rate}%가 방문", { rate: visitRate }),
    },
    {
      label: t("평균 ROAS"),
      value: String(totals.roas),
      unit: "%",
      note: t("추정 매출 {sales}", { sales: formatWon(totals.sales) }),
    },
  ]

  return (
    <section className="page-view">
      <PageIntro
        eyebrow="Sponsorship Analytics"
        title={t("협찬 성과 분석")}
        description={t("협찬마다 쓴 금액과 돌아온 쿠폰, 방문, 추정 매출을 함께 비교해요.")}
        actions={
          <>
            <Pill arrow="up-right" disabled={rows.length === 0 || exporting} onClick={onDownload}>
              {exporting ? t("PDF 만드는 중…") : t("분석 보고서 다운로드")}
            </Pill>
            {/* The table as a spreadsheet (lib/csv.ts), made on the page. */}
            <Pill
              disabled={rows.length === 0}
              onClick={() =>
                saveFile(`uniconnect-analytics-${todayIso()}.csv`, analyticsCsv(sponsorships), "text/csv;charset=utf-8")
              }
              variant="outline"
            >
              {t("CSV로 내보내기")}
            </Pill>
          </>
        }
      />

      {rows.length === 0 ? (
        <p className="day-empty">{t("아직 집계된 협찬이 없어요. 협찬이 끝나면 성과를 여기서 볼 수 있어요.")}</p>
      ) : (
        <>
          <section className="power-panel" data-reveal>
            <LayersGradient shader={INTERFERENCE} />
            <div className="power-content">
              <span className="eyebrow light">By the Numbers</span>
              <RevealTitle as="h2" className="power-title">
                {t("지금까지의 협찬을 모아 보면")}
              </RevealTitle>
              <ul className="power-stats">
                {kpis.map((kpi, index) => (
                  <li data-reveal key={kpi.label} style={delay(index * 0.09)}>
                    <div className="power-stat">
                      <strong>
                        <AnimatedNumber value={kpi.value} />
                        <small>{kpi.unit}</small>
                      </strong>
                      <span>{kpi.label}</span>
                      <small>{kpi.note}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <div className="analytics-grid">
            <div className="analytics-card" data-reveal>
              <div className="measure-card-head">
                <p className="section-title">{t("협찬별 ROAS")}</p>
                <span className="roas-legend">
                  <b aria-hidden="true" /> {t("목표 ROAS")}
                  <i aria-hidden="true" /> {t("목표 달성")}
                </span>
              </div>
              <div className="roas-list large stagger">
                {rows.map((row) => (
                  <div className={row.met ? "roas-row met" : "roas-row"} key={row.id}>
                    <div className="roas-row-head">
                      <strong>
                        {row.eventName}
                        <small>{row.groupName}</small>
                      </strong>
                      <span>{row.roas}%</span>
                    </div>
                    <div className="roas-track">
                      <i style={{ width: `${(row.roas / roasScale) * 100}%` }} />
                      <b style={{ left: `${(row.targetRoas / roasScale) * 100}%` }} />
                    </div>
                    <small>
                      {row.met
                        ? t("목표 {target}% 달성", { target: row.targetRoas })
                        : t("목표 {target}% · {gap}%p 부족", { target: row.targetRoas, gap: row.targetRoas - row.roas })}
                    </small>
                  </div>
                ))}
              </div>
            </div>

            <div className="analytics-card insight-card" data-reveal style={delay(0.1)}>
              <p className="section-title">{t("인사이트")}</p>
              <ul className="insight-list stagger">
                <li>
                  <span className="insight-icon">
                    <Icon name="check" size={16} />
                  </span>
                  <p>
                    {rich(t("목표 ROAS를 달성한 협찬은 {total}건 중 {met}이에요.", { total: rows.length }), {
                      met: <b>{t("{met}건", { met: metCount })}</b>,
                    })}{" "}
                    {furthestBelow
                      ? rich(t("{event} 협찬은 목표보다 {gap}%p 낮았어요."), {
                          event: <b>{furthestBelow.eventName}</b>,
                          gap: furthestBelow.targetRoas - furthestBelow.roas,
                        })
                      : t("모든 협찬이 목표를 넘었어요.")}
                  </p>
                </li>
                {best && (
                  <li>
                    <span className="insight-icon">
                      <Icon name="chart" size={16} />
                    </span>
                    <p>
                      {rich(t("{event} 협찬의 효율이 가장 좋았어요. 추정 매출이 집행액의 {times}예요."), {
                        event: <b>{best.eventName}</b>,
                        times: <b>{t("{times}배", { times: (best.roas / 100).toFixed(1) })}</b>,
                      })}
                    </p>
                  </li>
                )}
                {cheapest && (
                  <li>
                    <span className="insight-icon">
                      <Icon name="store" size={16} />
                    </span>
                    <p>
                      {rich(t("방문 한 명을 데려오는 데 {group} 협찬이 {cost}으로 가장 적게 들었어요."), {
                        group: <b>{cheapest.groupName}</b>,
                        cost: <b>{formatWon(cheapest.perVisit)}</b>,
                      })}
                    </p>
                  </li>
                )}
                <li>
                  <span className="insight-icon">
                    <Icon name="spark" size={16} />
                  </span>
                  <p>
                    {rich(t("쿠폰을 받은 학생의 {rate}가 매장에 왔어요."), { rate: <b>{visitRate}%</b> })}{" "}
                    {visitRate >= 40
                      ? t("현장 쿠폰이 방문으로 잘 이어지고 있어요.")
                      : t("쿠폰 혜택을 키우면 방문이 더 늘 수 있어요.")}
                  </p>
                </li>
              </ul>
            </div>
          </div>

          <div className="analytics-card" data-reveal>
            <p className="section-title">{t("협찬별 상세")}</p>
            <div className="analytics-table stagger" role="table" aria-label={t("협찬별 상세")}>
              <div className="analytics-row head" role="row">
                <span role="columnheader">{t("행사")}</span>
                <span role="columnheader">{t("집행액")}</span>
                <span role="columnheader">{t("쿠폰 수령")}</span>
                <span role="columnheader">{t("매장 방문")}</span>
                <span role="columnheader">{t("방문당 비용")}</span>
                <span role="columnheader">ROAS</span>
                <span role="columnheader">{t("상세 리포트")}</span>
              </div>
              {rows.map((row) => (
                <div className="analytics-row" key={row.id} role="row">
                  <span className="analytics-event" role="cell">
                    <strong>{row.eventName}</strong>
                    <small>{row.groupName}</small>
                    <small>{formatFullDate(row.date)}</small>
                    {venueSummary(row) && <small className="venue-summary">{venueSummary(row)}</small>}
                  </span>
                  <span role="cell" data-label={t("집행액")}>
                    {formatWon(row.spend)}
                  </span>
                  <span role="cell" data-label={t("쿠폰 수령")}>
                    {t("{coupons}장", { coupons: row.coupons.toLocaleString("ko-KR") })}
                  </span>
                  <span role="cell" data-label={t("매장 방문")}>
                    {t("{visits}명", { visits: row.visits.toLocaleString("ko-KR") })}
                  </span>
                  <span role="cell" data-label={t("방문당 비용")}>
                    {formatWon(row.perVisit)}
                  </span>
                  <span
                    role="cell"
                    data-label="ROAS"
                    className={row.met ? "analytics-roas met" : "analytics-roas"}
                  >
                    {row.roas}%<small>{t("목표 {target}%", { target: row.targetRoas })}</small>
                  </span>
                  <span className="analytics-report" role="cell">
                    <ReportButton onOpen={() => onOpenReport(row.id)} state={sponsorships.find((item) => item.id === row.id)?.report} />
                  </span>
                </div>
              ))}
            </div>
            <p className="field-hint analytics-hint">
              {t(
                "집행액은 학생단체가 목표 설정에서 적은 협찬 가치이고, 추정 매출은 매장 방문 수 × 학생단체가 적은 1인 예상 지출이에요. 실제 매출과 다를 수 있어요.",
              )}
            </p>
          </div>
        </>
      )}
      <CampusPortfolio onOpenPlan={onOpenPlan} />
      {campaign}
    </section>
  )
}
