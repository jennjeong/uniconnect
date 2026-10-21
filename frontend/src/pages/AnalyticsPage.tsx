import type { CSSProperties } from "react"

import { AnimatedNumber } from "../components/AnimatedNumber"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { Pill } from "../components/Pill"
import { RevealTitle } from "../components/RevealText"
import { formatFullDate } from "../lib/date"
import { percent } from "../lib/format"
import { formatWon } from "../lib/kpis"
import { costPerVisit, roasMet, roasOf, sponsorshipTotals } from "../lib/sponsorships"
import { LayersGradient } from "../scenes/LayersGradient"
import { INTERFERENCE } from "../scenes/shaders"
import type { NavLabel, Sponsorship } from "../types"

const delay = (seconds: number) => ({ "--reveal-delay": `${seconds}s` }) as CSSProperties

// Spend, coupons, visits and ROAS of each sponsorship the brand has done:
// the totals over getlayers.ai's Interference gradient, then ROAS, insights
// and a table.
export function AnalyticsPage({
  sponsorships,
  onNavigate,
}: {
  // Newest first.
  sponsorships: Sponsorship[]
  onNavigate: (label: NavLabel) => void
}) {
  const totals = sponsorshipTotals(sponsorships)
  const rows = sponsorships.map((sponsorship) => ({
    ...sponsorship,
    roas: roasOf(sponsorship),
    met: roasMet(sponsorship),
    perVisit: costPerVisit(sponsorship),
  }))
  const best = [...rows].sort((a, b) => b.roas - a.roas)[0]
  const metCount = rows.filter((row) => row.met).length
  // The sponsorship furthest below its goal.
  const furthestBelow = rows
    .filter((row) => !row.met)
    .sort((a, b) => a.roas - a.targetRoas - (b.roas - b.targetRoas))[0]
  const cheapest = [...rows].filter((row) => row.visits > 0).sort((a, b) => a.perVisit - b.perVisit)[0]
  const visitRate = percent(totals.visits, totals.coupons)
  // Bar scale with room past the best result and every goal marker.
  const roasScale = Math.max(100, best?.roas ?? 0, ...rows.map((row) => row.targetRoas)) * 1.1

  const kpis = [
    {
      label: "누적 집행액",
      value: formatWon(totals.spend),
      note: `협찬 ${sponsorships.length}건 · 현금과 현물 포함`,
    },
    {
      label: "쿠폰 수령",
      value: `${totals.coupons.toLocaleString("ko-KR")}장`,
      note: `협찬당 평균 ${sponsorships.length ? Math.round(totals.coupons / sponsorships.length) : 0}장`,
    },
    {
      label: "매장 방문",
      value: `${totals.visits.toLocaleString("ko-KR")}명`,
      note: `쿠폰 받은 학생의 ${visitRate}%가 방문`,
    },
    {
      label: "평균 ROAS",
      value: `${totals.roas}%`,
      note: `추정 매출 ${formatWon(totals.sales)}`,
      good: totals.roas >= 100,
    },
  ]

  return (
    <section className="page-view">
      <PageIntro
        eyebrow="Sponsorship analytics"
        title="협찬 성과 분석"
        description="협찬마다 쓴 금액과 돌아온 쿠폰, 방문, 추정 매출을 함께 비교해요."
        actions={
          <Pill arrow="right" onClick={() => onNavigate("단체 찾기")}>
            비슷한 단체 찾기
          </Pill>
        }
      />

      {rows.length === 0 ? (
        <p className="day-empty">아직 집계된 협찬이 없어요. 협찬이 끝나면 성과를 여기서 볼 수 있어요.</p>
      ) : (
        <>
          <section className="power-panel" data-reveal>
            <LayersGradient shader={INTERFERENCE} />
            <div className="power-content">
              <span className="eyebrow light">By the numbers</span>
              <RevealTitle as="h2" className="power-title">
                지금까지의 협찬을 모아 보면
              </RevealTitle>
              <ul className="power-stats">
                {kpis.map((kpi, index) => (
                  <li data-reveal key={kpi.label} style={delay(index * 0.09)}>
                    <div className="power-stat">
                      <strong className={kpi.good ? "good" : ""}>
                        <AnimatedNumber value={kpi.value} />
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
                <p className="section-title">협찬별 ROAS</p>
                <span className="roas-legend">
                  <b aria-hidden="true" /> 목표 ROAS
                  <i aria-hidden="true" /> 목표 달성
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
                      목표 {row.targetRoas}%{row.met ? " 달성" : ` · ${row.targetRoas - row.roas}%p 부족`}
                    </small>
                  </div>
                ))}
              </div>
            </div>

            <div className="analytics-card insight-card" data-reveal style={delay(0.1)}>
              <p className="section-title">인사이트</p>
              <ul className="insight-list stagger">
                <li>
                  <span className="insight-icon">
                    <Icon name="check" size={16} />
                  </span>
                  <p>
                    목표 ROAS를 달성한 협찬은 {rows.length}건 중 <b>{metCount}건</b>이에요.{" "}
                    {furthestBelow ? (
                      <>
                        <b>{furthestBelow.eventName}</b> 협찬은 목표보다{" "}
                        {furthestBelow.targetRoas - furthestBelow.roas}%p 낮았어요.
                      </>
                    ) : (
                      "모든 협찬이 목표를 넘었어요."
                    )}
                  </p>
                </li>
                {best && (
                  <li>
                    <span className="insight-icon">
                      <Icon name="chart" size={16} />
                    </span>
                    <p>
                      <b>{best.eventName}</b> 협찬의 효율이 가장 좋았어요. 추정 매출이 집행액의{" "}
                      <b>{(best.roas / 100).toFixed(1)}배</b>예요.
                    </p>
                  </li>
                )}
                {cheapest && (
                  <li>
                    <span className="insight-icon">
                      <Icon name="store" size={16} />
                    </span>
                    <p>
                      방문 한 명을 데려오는 데 <b>{cheapest.groupName}</b> 협찬이{" "}
                      <b>{formatWon(cheapest.perVisit)}</b>으로 가장 적게 들었어요.
                    </p>
                  </li>
                )}
                <li>
                  <span className="insight-icon">
                    <Icon name="spark" size={16} />
                  </span>
                  <p>
                    쿠폰을 받은 학생의 <b>{visitRate}%</b>가 매장에 왔어요.{" "}
                    {visitRate >= 40
                      ? "현장 쿠폰이 방문으로 잘 이어지고 있어요."
                      : "쿠폰 혜택을 키우면 방문이 더 늘 수 있어요."}
                  </p>
                </li>
              </ul>
            </div>
          </div>

          <div className="analytics-card" data-reveal>
            <p className="section-title">협찬별 상세</p>
            <div className="analytics-table stagger" role="table" aria-label="협찬별 상세">
              <div className="analytics-row head" role="row">
                <span role="columnheader">행사</span>
                <span role="columnheader">집행액</span>
                <span role="columnheader">쿠폰 수령</span>
                <span role="columnheader">매장 방문</span>
                <span role="columnheader">방문당 비용</span>
                <span role="columnheader">ROAS</span>
              </div>
              {rows.map((row) => (
                <div className="analytics-row" key={row.id} role="row">
                  <span className="analytics-event" role="cell">
                    <strong>{row.eventName}</strong>
                    <small>{row.groupName}</small>
                    <small>{formatFullDate(row.date)}</small>
                  </span>
                  <span role="cell" data-label="집행액">
                    {formatWon(row.spend)}
                  </span>
                  <span role="cell" data-label="쿠폰 수령">
                    {row.coupons.toLocaleString("ko-KR")}장
                  </span>
                  <span role="cell" data-label="매장 방문">
                    {row.visits.toLocaleString("ko-KR")}명
                  </span>
                  <span role="cell" data-label="방문당 비용">
                    {formatWon(row.perVisit)}
                  </span>
                  <span
                    role="cell"
                    data-label="ROAS"
                    className={row.met ? "analytics-roas met" : "analytics-roas"}
                  >
                    {row.roas}%<small>목표 {row.targetRoas}%</small>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
