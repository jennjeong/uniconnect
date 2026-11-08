import { Fragment, useState, type CSSProperties, type ReactNode } from "react"

import { AnimatedNumber } from "../components/AnimatedNumber"
import { CampusPortfolio } from "../components/CampusPortfolio"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { Pager } from "../components/Pager"
import { Pill } from "../components/Pill"
import { RevealTitle } from "../components/RevealText"
import { venueSummary } from "../data/methods"
import { lang, t, tc } from "../i18n"
import { analyticsCsv } from "../lib/csv"
import { formatFullDate, todayIso } from "../lib/date"
import { saveFile } from "../lib/download"
import { formatWon } from "../lib/kpis"
import { roasText, roasVerdict } from "../lib/roasLabels"
import { analyzeSponsorships, manWon, wonUnit } from "../lib/sponsorships"
import { LayersGradient } from "../scenes/LayersGradient"
import { INTERFERENCE } from "../scenes/shaders"
import type { Sponsorship } from "../types"

const delay = (seconds: number) => ({ "--reveal-delay": `${seconds}s` }) as CSSProperties

// 표 한 페이지에 보이는 협찬.
const perPage = 5

// 일부가 마크업인 번역 문장. 문장 안의 {name}마다 nodes[name]이 들어간다. 일반
// 값은 먼저 t()로 넘기며, t()가 복수형 단어도 고른다.
function rich(text: string, nodes: Record<string, ReactNode>) {
  return text.split(/\{(\w+)\}/).map((part, index) =>
    index % 2 ? <Fragment key={index}>{nodes[part]}</Fragment> : part,
  )
}

// 숫자 뒤의 세는 단위("장", "명")는 영어에서는 빠진다.
const countUnit = (unit: string) => (lang === "en" ? "" : unit)

// 브랜드가 한 협찬마다의 지출, 쿠폰, 방문, ROAS. getlayers.ai의 Interference
// 그라디언트 위에 총계를 놓고, 이어서 ROAS, 인사이트, 표를 보여 준다. 협찬마다
// 리포트 페이지를 붙인 전체 분석은 PDF로 내려받는다. 협찬의 상세 리포트는 그
// 행의 끝에서 읽거나 사거나, 행사 당일부터 열 수 있다.
function ReportButton({ state, onOpen }: { state?: Sponsorship["report"]; onOpen: () => void }) {
  if (!state || state === "none") return <small className="analytics-report-none">—</small>
  if (state === "soon") return <small className="analytics-report-none">{t("행사 날부터")}</small>
  return (
    <button className={state === "open" ? "report-button open" : "report-button"} onClick={onOpen} type="button">
      <Icon name={state === "open" ? "file" : "lock"} size={13} />
      {state === "open" ? t("상세 리포트 보기") : t("상세 리포트 구매")}
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
  // 최신순.
  sponsorships: Sponsorship[]
  // PDF 리포트를 만드는 동안.
  exporting: boolean
  // 협찬마다의 리포트를 붙인 분석을 PDF로 저장한다.
  onDownload: () => void
  // 측정된 행사의 협찬에 대한 상세 리포트(pages/InsightPage.tsx).
  onOpenReport: (sponsorshipId: string) => void
  // 잠긴 포트폴리오로 만든, 내 정보의 요금제 카드.
  onOpenPlan: () => void
  // 브랜드 자신의 캠페인에 대한 현장 측정. 맨 끝에 둔다.
  campaign?: ReactNode
}) {
  const { totals, rows, best, furthestBelow, cheapest, doneCount, metCount, visitRate, roasScale } =
    analyzeSponsorships(sponsorships)
  // 표의 페이지. 한 번에 협찬 다섯 개.
  const [page, setPage] = useState(0)
  const pages = Math.ceil(rows.length / perPage)
  const current = Math.min(page, Math.max(0, pages - 1))
  const pageRows = rows.slice(current * perPage, (current + 1) * perPage)

  // 숫자마다 뒤에 단위를 작게 붙여 네 개가 같아 보이게 한다.
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
      label: t("추정 ROAS(전체 집행액 기준)"),
      value: totals.roasMissing ? "—" : String(totals.roas),
      unit: totals.roasMissing ? "" : "%",
      note: totals.roasMissing
        ? t("협찬액이 정해진 협찬이 아직 없어요")
        : totals.roasCounting
          ? t("집계 중 · 추정 매출 {sales}", { sales: formatWon(totals.sales) })
          : t("추정 매출 {sales}", { sales: formatWon(totals.sales) }),
    },
  ]

  return (
    <section className="page-view">
      <PageIntro
        eyebrow={tc("eyebrow", "협찬 분석")}
        title={t("협찬 성과 분석")}
        description={t("협찬마다 쓴 돈과 돌아온 손님을 한눈에 비교해요.")}
        actions={
          <>
            <Pill arrow="up-right" disabled={rows.length === 0 || exporting} onClick={onDownload}>
              {exporting ? t("PDF 만드는 중…") : t("요약 PDF 다운로드")}
            </Pill>
            {/* 표를 스프레드시트로(lib/csv.ts). 페이지에서 만든다. */}
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
              <span className="eyebrow light">{tc("eyebrow", "숫자로 보기")}</span>
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
                  <div className={["roas-row", row.met && "met", row.state !== "done" && row.state].filter(Boolean).join(" ")} key={row.id}>
                    <div className="roas-row-head">
                      <strong>
                        {row.eventName}
                        <small>{row.groupName}</small>
                      </strong>
                      <span>{roasText(row)}</span>
                    </div>
                    <div className="roas-track">
                      <i style={{ width: `${(row.roas / roasScale) * 100}%` }} />
                      <b style={{ left: `${(row.targetRoas / roasScale) * 100}%` }} />
                    </div>
                    <small>{roasVerdict(row)}</small>
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
                    {doneCount === 0 ? (
                      t("아직 집계가 끝난 협찬이 없어요. 방문 집계가 끝나면 목표와 견줘 볼 수 있어요.")
                    ) : (
                      <>
                        {rich(t("집계가 끝난 협찬 {total}건 중 {met}이 목표 ROAS를 달성했어요.", { total: doneCount }), {
                          met: <b>{t("{met}건", { met: metCount })}</b>,
                        })}{" "}
                        {furthestBelow
                          ? rich(t("{event} 협찬은 목표보다 {gap}%p 낮았어요."), {
                              event: <b>{furthestBelow.eventName}</b>,
                              gap: furthestBelow.targetRoas - furthestBelow.roas,
                            })
                          : t("집계가 끝난 협찬은 모두 목표를 넘었어요.")}
                      </>
                    )}
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
              {pageRows.map((row) => (
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
                    {row.state === "cost" || row.visits === 0 ? "—" : formatWon(row.perVisit)}
                  </span>
                  <span
                    role="cell"
                    data-label="ROAS"
                    className={row.met ? "analytics-roas met" : "analytics-roas"}
                  >
                    {roasText(row)}
                    <small>
                      {row.state === "done" ? t("목표 {target}%", { target: row.targetRoas }) : roasVerdict(row)}
                    </small>
                  </span>
                  <span className="analytics-report" role="cell">
                    <ReportButton onOpen={() => onOpenReport(row.id)} state={sponsorships.find((item) => item.id === row.id)?.report} />
                  </span>
                </div>
              ))}
            </div>
            <Pager label={t("협찬별 상세 페이지")} onPage={setPage} page={current} pages={pages} />
            <p className="field-hint analytics-hint">
              {t(
                "집행액은 학생단체가 목표 설정에서 적은 협찬 가치이고 추정 매출은 매장 방문 수 × 학생단체가 적은 1인 예상 지출이에요. 실제 매출과 다를 수 있어요.",
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
