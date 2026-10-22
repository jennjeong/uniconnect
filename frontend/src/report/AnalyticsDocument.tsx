import { formatFullDate } from "../lib/date"
import { percent } from "../lib/format"
import { formatWon } from "../lib/kpis"
import { analyzeSponsorships } from "../lib/sponsorships"
import type { Sponsorship } from "../types"
import { PageFooter, PageHeader } from "./ReportDocument"

const footerNote = "uniconnect · 협찬 성과 분석 보고서 · 집계된 협찬 데이터로 자동 생성했어요."

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
        {row.roas}%<small>목표 {row.targetRoas}%</small>
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
    `목표 ROAS를 달성한 협찬은 ${rows.length}건 중 ${metCount}건이에요.${
      furthestBelow
        ? ` ${furthestBelow.eventName}은 목표보다 ${furthestBelow.targetRoas - furthestBelow.roas}%p 낮았어요.`
        : " 모든 협찬이 목표를 넘었어요."
    }`,
    ...(best
      ? [`${best.eventName} 협찬의 효율이 가장 좋았어요. 추정 매출이 집행액의 ${(best.roas / 100).toFixed(1)}배예요.`]
      : []),
    ...(cheapest
      ? [`방문 한 명을 데려오는 데 ${cheapest.groupName} 협찬이 ${formatWon(cheapest.perVisit)}으로 가장 적게 들었어요.`]
      : []),
    `쿠폰을 받은 학생의 ${visitRate}%가 매장에 왔어요. ${
      visitRate >= 40 ? "현장 쿠폰이 방문으로 잘 이어지고 있어요." : "쿠폰 혜택을 키우면 방문이 더 늘 수 있어요."
    }`,
  ]

  return (
    <>
      <div className="pdf-page">
        <PageHeader author={author} />

        <div className="pdf-title">
          <span>SPONSORSHIP ANALYTICS REPORT</span>
          <h1>협찬 성과 분석 보고서</h1>
          <p>
            {author} · 협찬 {rows.length}건
            {days.length > 0 && ` · ${formatFullDate(days[0])} ~ ${formatFullDate(days[days.length - 1])}`}
          </p>
        </div>

        <div className="pdf-summary">
          <strong>
            협찬 {rows.length}건 중 <em>{metCount}건이 목표 ROAS를 달성</em>했어요
          </strong>
          <p>
            평균 ROAS {totals.roas}% · 누적 집행액 {formatWon(totals.spend)} · 추정 매출{" "}
            {formatWon(totals.sales)}
          </p>
        </div>

        <section className="pdf-section">
          <h2>핵심 지표</h2>
          <div className="pdf-kpis">
            <div className="pdf-kpi">
              <span>누적 집행액</span>
              <strong>{formatWon(totals.spend)}</strong>
              <small className="good">현금과 현물 포함</small>
            </div>
            <div className="pdf-kpi">
              <span>쿠폰 수령</span>
              <strong>{totals.coupons.toLocaleString("ko-KR")}장</strong>
              <small className="good">협찬 {rows.length}건 합계</small>
            </div>
            <div className="pdf-kpi">
              <span>매장 방문</span>
              <strong>{totals.visits.toLocaleString("ko-KR")}명</strong>
              <small className="good">쿠폰 받은 학생의 {visitRate}%</small>
            </div>
            <div className="pdf-kpi">
              <span>평균 ROAS</span>
              <strong>{totals.roas}%</strong>
              <small className={totals.roas >= 100 ? "good" : ""}>추정 매출 {formatWon(totals.sales)}</small>
            </div>
          </div>
        </section>

        <section className="pdf-section pdf-card">
          <h2>협찬별 ROAS</h2>
          <div className="pdf-roas">
            {rows.map((row) => (
              <RoasBar key={row.id} row={row} scale={roasScale} />
            ))}
          </div>
          <div className="pdf-legend">
            <span className="goal">목표 ROAS</span>
            <span>달성한 ROAS</span>
          </div>
        </section>

        <section className="pdf-section">
          <h2>인사이트</h2>
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
          ? `목표 ROAS ${row.targetRoas}%를 ${row.roas - row.targetRoas}%p 넘겼어요.`
          : `목표 ROAS ${row.targetRoas}%까지 ${row.targetRoas - row.roas}%p 남았어요.`
        const notes = [
          `${formatWon(row.spend)}을 집행해 추정 매출 ${formatWon(row.sales)}을 만들었어요. ${verdict}`,
          `쿠폰을 받은 ${row.coupons.toLocaleString("ko-KR")}명 중 ${row.visits.toLocaleString("ko-KR")}명(${rowVisitRate}%)이 매장을 찾았어요. 전체 평균은 ${visitRate}%예요.`,
          row.visits > 0
            ? `방문 한 명당 ${formatWon(row.perVisit)}이 들었어요. 전체 평균 ${formatWon(averagePerVisit)}보다 ${
                row.perVisit <= averagePerVisit ? "적게 들었어요." : "많이 들었어요."
              }`
            : "아직 매장 방문이 집계되지 않았어요.",
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
                ROAS {row.roas}% · <em>{row.met ? "목표 달성" : `목표까지 ${row.targetRoas - row.roas}%p`}</em>
              </strong>
              <p>
                집행액 {formatWon(row.spend)} · 추정 매출 {formatWon(row.sales)} · 방문당 비용{" "}
                {row.visits > 0 ? formatWon(row.perVisit) : "-"}
              </p>

            </div>

            <section className="pdf-section">
              <h2>핵심 지표</h2>
              <div className="pdf-kpis">
                <div className="pdf-kpi">
                  <span>집행액</span>
                  <strong>{formatWon(row.spend)}</strong>
                  <small className="good">현금과 현물 포함</small>
                </div>
                <div className="pdf-kpi">
                  <span>쿠폰 수령</span>
                  <strong>{row.coupons.toLocaleString("ko-KR")}장</strong>
                  <small className="good">행사 현장 QR</small>
                </div>
                <div className="pdf-kpi">
                  <span>매장 방문</span>
                  <strong>{row.visits.toLocaleString("ko-KR")}명</strong>
                  <small className="good">쿠폰 받은 학생의 {rowVisitRate}%</small>
                </div>
                <div className="pdf-kpi">
                  <span>ROAS</span>
                  <strong>{row.roas}%</strong>
                  <small className={row.met ? "good" : ""}>
                    목표 {row.targetRoas}% · {percent(row.roas, row.targetRoas)}% 달성
                  </small>
                  <div className="pdf-kpi-track">
                    <i style={{ width: `${Math.min(percent(row.roas, row.targetRoas), 100)}%` }} />
                  </div>
                </div>
              </div>
            </section>

            <div className="pdf-chart-row">
              <section className="pdf-section pdf-card">
                <h2>집행액과 추정 매출</h2>
                <div className="pdf-funnel">
                  <div className="pdf-funnel-row">
                    <span className="pdf-funnel-label">집행액</span>
                    <div className="pdf-funnel-track">
                      <div className="pdf-funnel-bar spend" style={{ width: `${(row.spend / salesScale) * 100}%` }}>
                        {formatWon(row.spend)}
                      </div>
                    </div>
                  </div>
                  <div className="pdf-funnel-row">
                    <span className="pdf-funnel-label">추정 매출</span>
                    <div className="pdf-funnel-track">
                      <div className="pdf-funnel-bar" style={{ width: `${(row.sales / salesScale) * 100}%` }}>
                        {formatWon(row.sales)}
                      </div>
                    </div>
                    <span className="pdf-funnel-note">집행액의 {(row.roas / 100).toFixed(1)}배</span>
                  </div>
                </div>
              </section>

              <section className="pdf-section pdf-card">
                <h2>쿠폰에서 방문까지</h2>
                <div className="pdf-funnel">
                  <div className="pdf-funnel-row">
                    <span className="pdf-funnel-label">쿠폰 수령</span>
                    <div className="pdf-funnel-track">
                      <div className="pdf-funnel-bar" style={{ width: "100%" }}>
                        {row.coupons}명
                      </div>
                    </div>
                  </div>
                  <div className="pdf-funnel-row">
                    <span className="pdf-funnel-label">매장 방문</span>
                    <div className="pdf-funnel-track">
                      <div className="pdf-funnel-bar" style={{ width: `${rowVisitRate}%` }}>
                        {row.visits}명
                      </div>
                    </div>
                    <span className="pdf-funnel-note">쿠폰 받은 학생의 {rowVisitRate}%</span>
                  </div>
                </div>
              </section>
            </div>

            <section className="pdf-section">
              <h2>평가</h2>
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
