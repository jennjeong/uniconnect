import { Fragment, type ReactNode } from "react"

import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import { percent } from "../lib/format"
import { formatWon } from "../lib/kpis"
import { analyzeSponsorships } from "../lib/sponsorships"
import type { Sponsorship } from "../types"
import { PageFooter, PageHeader } from "./ReportDocument"

const footerNote = t("uniconnect · 협찬 성과 분석 보고서 · 집계된 협찬 데이터로 자동 생성했어요.")

// A translated sentence with parts in markup: each {name} in it becomes
// nodes[name]. Plain values go to t() first, which also picks a plural word.
function rich(text: string, nodes: Record<string, ReactNode>) {
  return text.split(/\{(\w+)\}/).map((part, index) =>
    index % 2 ? <Fragment key={index}>{nodes[part]}</Fragment> : part,
  )
}

type Row = ReturnType<typeof analyzeSponsorships>["rows"][number]

// One sponsorship's ROAS as a bar against its goal tick, on the summary page.
function RoasBar({ row, scale }: { row: Row; scale: number }) {
  return (
    <div className={row.met ? "pdf-roas-row met" : "pdf-roas-row"}>
      <span className="pdf-roas-name">
        {row.eventName}
        <small>{row.groupName}</small>
      </span>
      <div className="pdf-roas-track">
        <i style={{ width: `${(row.roas / scale) * 100}%` }} />
        <b style={{ left: `${(row.targetRoas / scale) * 100}%` }} />
      </div>
      <span className="pdf-roas-value">
        {row.roas}%<small>{t("목표 {target}%", { target: row.targetRoas })}</small>
      </span>
    </div>
  )
}

// The brand's analytics as A4 pages (794×1123 px): a summary of every
// sponsorship, then each sponsorship's own performance report.
export function AnalyticsDocument({
  sponsorships,
  author,
}: {
  sponsorships: Sponsorship[]
  author: string
}) {
  const { totals, rows, best, furthestBelow, cheapest, metCount, visitRate, roasScale } =
    analyzeSponsorships(sponsorships)
  const total = rows.length + 1
  const days = rows.map((row) => row.date).sort()
  const averagePerVisit = totals.visits > 0 ? Math.round(totals.spend / totals.visits) : 0

  const insights = [
    `${t("목표 ROAS를 달성한 협찬은 {total}건 중 {met}건이에요.", { total: rows.length, met: metCount })} ${
      furthestBelow
        ? t("{event}은 목표보다 {gap}%p 낮았어요.", {
            event: furthestBelow.eventName,
            gap: furthestBelow.targetRoas - furthestBelow.roas,
          })
        : t("모든 협찬이 목표를 넘었어요.")
    }`,
    ...(best
      ? [
          t("{event} 협찬의 효율이 가장 좋았어요. 추정 매출이 집행액의 {times}배예요.", {
            event: best.eventName,
            times: (best.roas / 100).toFixed(1),
          }),
        ]
      : []),
    ...(cheapest
      ? [
          t("방문 한 명을 데려오는 데 {group} 협찬이 {cost}으로 가장 적게 들었어요.", {
            group: cheapest.groupName,
            cost: formatWon(cheapest.perVisit),
          }),
        ]
      : []),
    `${t("쿠폰을 받은 학생의 {rate}%가 매장에 왔어요.", { rate: visitRate })} ${
      visitRate >= 40 ? t("현장 쿠폰이 방문으로 잘 이어지고 있어요.") : t("쿠폰 혜택을 키우면 방문이 더 늘 수 있어요.")
    }`,
  ]

  return (
    <>
      <div className="pdf-page">
        <PageHeader author={author} />

        <div className="pdf-title">
          <span>SPONSORSHIP ANALYTICS REPORT</span>
          <h1>{t("협찬 성과 분석 보고서")}</h1>
          <p>
            {author} · {t("협찬 {count}건", { count: rows.length })}
            {days.length > 0 &&
              ` · ${t("{from} ~ {to}", { from: formatFullDate(days[0]), to: formatFullDate(days[days.length - 1]) })}`}
          </p>
        </div>

        <div className="pdf-summary">
          <strong>
            {rich(t("협찬 {total}건 중 {met}했어요", { total: rows.length }), {
              met: <em>{t("{met}건이 목표 ROAS를 달성", { met: metCount })}</em>,
            })}
          </strong>
          <p>
            {t("평균 ROAS {roas}% · 누적 집행액 {spend} · 추정 매출 {sales}", {
              roas: totals.roas,
              spend: formatWon(totals.spend),
              sales: formatWon(totals.sales),
            })}
          </p>
        </div>

        <section className="pdf-section">
          <h2>{t("핵심 지표")}</h2>
          <div className="pdf-kpis">
            <div className="pdf-kpi">
              <span>{t("누적 집행액")}</span>
              <strong>{formatWon(totals.spend)}</strong>
              <small className="good">{t("현금과 현물 포함")}</small>
            </div>
            <div className="pdf-kpi">
              <span>{t("쿠폰 수령")}</span>
              <strong>{t("{coupons}장", { coupons: totals.coupons.toLocaleString("ko-KR") })}</strong>
              <small className="good">{t("협찬 {count}건 합계", { count: rows.length })}</small>
            </div>
            <div className="pdf-kpi">
              <span>{t("매장 방문")}</span>
              <strong>{t("{visits}명", { visits: totals.visits.toLocaleString("ko-KR") })}</strong>
              <small className="good">{t("쿠폰 받은 학생의 {rate}%", { rate: visitRate })}</small>
            </div>
            <div className="pdf-kpi">
              <span>{t("평균 ROAS")}</span>
              <strong>{totals.roas}%</strong>
              <small className={totals.roas >= 100 ? "good" : ""}>
                {t("추정 매출 {sales}", { sales: formatWon(totals.sales) })}
              </small>
            </div>
          </div>
        </section>

        <section className="pdf-section pdf-card">
          <h2>{t("협찬별 ROAS")}</h2>
          <div className="pdf-roas">
            {rows.map((row) => (
              <RoasBar key={row.id} row={row} scale={roasScale} />
            ))}
          </div>
          <div className="pdf-legend">
            <span className="goal">{t("목표 ROAS")}</span>
            <span>{t("달성한 ROAS")}</span>
          </div>
        </section>

        <section className="pdf-section">
          <h2>{t("인사이트")}</h2>
          <ol className="pdf-insights">
            {insights.map((insight, index) => (
              <li key={insight}>
                <b>{index + 1}</b>
                {insight}
              </li>
            ))}
          </ol>
        </section>

        <PageFooter note={footerNote} page={1} total={total} />
      </div>

      {rows.map((row, index) => {
        const salesScale = Math.max(row.spend, row.sales, 1)
        const rowVisitRate = percent(row.visits, row.coupons)
        const verdict = row.met
          ? t("목표 ROAS {target}%를 {gap}%p 넘겼어요.", { target: row.targetRoas, gap: row.roas - row.targetRoas })
          : t("목표 ROAS {target}%까지 {gap}%p 남았어요.", { target: row.targetRoas, gap: row.targetRoas - row.roas })
        const perVisit = { cost: formatWon(row.perVisit), average: formatWon(averagePerVisit) }
        const notes = [
          t("{spend}을 집행해 추정 매출 {sales}을 만들었어요. {verdict}", {
            spend: formatWon(row.spend),
            sales: formatWon(row.sales),
            verdict,
          }),
          t("쿠폰을 받은 {coupons}명 중 {visits}명({rate}%)이 매장을 찾았어요. 전체 평균은 {average}%예요.", {
            coupons: row.coupons.toLocaleString("ko-KR"),
            visits: row.visits.toLocaleString("ko-KR"),
            rate: rowVisitRate,
            average: visitRate,
          }),
          row.visits > 0
            ? row.perVisit <= averagePerVisit
              ? t("방문 한 명당 {cost}이 들었어요. 전체 평균 {average}보다 적게 들었어요.", perVisit)
              : t("방문 한 명당 {cost}이 들었어요. 전체 평균 {average}보다 많이 들었어요.", perVisit)
            : t("아직 매장 방문이 집계되지 않았어요."),
        ]
        return (
          <div className="pdf-page" key={row.id}>
            <PageHeader author={author} />

            <div className="pdf-title">
              <span>SPONSORSHIP REPORT {String(index + 1).padStart(2, "0")}</span>
              <h1>{row.eventName}</h1>
              <p>
                {row.groupName} · {formatFullDate(row.date)}
              </p>
            </div>

            <div className="pdf-summary">
              <strong>
                ROAS {row.roas}% ·{" "}
                <em>
                  {row.met ? t("목표 달성") : t("목표까지 {gap}%p", { gap: row.targetRoas - row.roas })}
                </em>
              </strong>
              <p>
                {t("집행액 {spend} · 추정 매출 {sales} · 방문당 비용 {cost}", {
                  spend: formatWon(row.spend),
                  sales: formatWon(row.sales),
                  cost: row.visits > 0 ? formatWon(row.perVisit) : "-",
                })}
              </p>

            </div>

            <section className="pdf-section">
              <h2>{t("핵심 지표")}</h2>
              <div className="pdf-kpis">
                <div className="pdf-kpi">
                  <span>{t("집행액")}</span>
                  <strong>{formatWon(row.spend)}</strong>
                  <small className="good">{t("현금과 현물 포함")}</small>
                </div>
                <div className="pdf-kpi">
                  <span>{t("쿠폰 수령")}</span>
                  <strong>{t("{coupons}장", { coupons: row.coupons.toLocaleString("ko-KR") })}</strong>
                  <small className="good">{t("행사 현장 QR")}</small>
                </div>
                <div className="pdf-kpi">
                  <span>{t("매장 방문")}</span>
                  <strong>{t("{visits}명", { visits: row.visits.toLocaleString("ko-KR") })}</strong>
                  <small className="good">{t("쿠폰 받은 학생의 {rate}%", { rate: rowVisitRate })}</small>
                </div>
                <div className="pdf-kpi">
                  <span>ROAS</span>
                  <strong>{row.roas}%</strong>
                  <small className={row.met ? "good" : ""}>
                    {t("목표 {target} · {rate}% 달성", {
                      target: `${row.targetRoas}%`,
                      rate: percent(row.roas, row.targetRoas),
                    })}
                  </small>
                  <div className="pdf-kpi-track">
                    <i style={{ width: `${Math.min(percent(row.roas, row.targetRoas), 100)}%` }} />
                  </div>
                </div>
              </div>
            </section>

            <div className="pdf-chart-row">
              <section className="pdf-section pdf-card">
                <h2>{t("집행액과 추정 매출")}</h2>
                <div className="pdf-funnel">
                  <div className="pdf-funnel-row">
                    <span className="pdf-funnel-label">{t("집행액")}</span>
                    <div className="pdf-funnel-track">
                      <div className="pdf-funnel-bar spend" style={{ width: `${(row.spend / salesScale) * 100}%` }}>
                        {formatWon(row.spend)}
                      </div>
                    </div>
                  </div>
                  <div className="pdf-funnel-row">
                    <span className="pdf-funnel-label">{t("추정 매출")}</span>
                    <div className="pdf-funnel-track">
                      <div className="pdf-funnel-bar" style={{ width: `${(row.sales / salesScale) * 100}%` }}>
                        {formatWon(row.sales)}
                      </div>
                    </div>
                    <span className="pdf-funnel-note">
                      {t("집행액의 {times}배", { times: (row.roas / 100).toFixed(1) })}
                    </span>
                  </div>
                </div>
              </section>

              <section className="pdf-section pdf-card">
                <h2>{t("쿠폰에서 방문까지")}</h2>
                <div className="pdf-funnel">
                  <div className="pdf-funnel-row">
                    <span className="pdf-funnel-label">{t("쿠폰 수령")}</span>
                    <div className="pdf-funnel-track">
                      <div className="pdf-funnel-bar" style={{ width: "100%" }}>
                        {t("{people}명", { people: row.coupons })}
                      </div>
                    </div>
                  </div>
                  <div className="pdf-funnel-row">
                    <span className="pdf-funnel-label">{t("매장 방문")}</span>
                    <div className="pdf-funnel-track">
                      <div className="pdf-funnel-bar" style={{ width: `${rowVisitRate}%` }}>
                        {t("{people}명", { people: row.visits })}
                      </div>
                    </div>
                    <span className="pdf-funnel-note">{t("쿠폰 받은 학생의 {rate}%", { rate: rowVisitRate })}</span>
                  </div>
                </div>
              </section>
            </div>

            <section className="pdf-section">
              <h2>{t("평가")}</h2>
              <ol className="pdf-insights">
                {notes.map((note, noteIndex) => (
                  <li key={note}>
                    <b>{noteIndex + 1}</b>
                    {note}
                  </li>
                ))}
              </ol>
            </section>

            <PageFooter note={footerNote} page={index + 2} total={total} />
          </div>
        )
      })}
    </>
  )
}
