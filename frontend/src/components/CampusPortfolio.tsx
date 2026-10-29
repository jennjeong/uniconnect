import { useEffect, useState } from "react"

import { api } from "../api"
import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import { fullWon } from "../lib/sponsorships"
import type { Portfolio, PortfolioGroup } from "../types"
import { Icon } from "./Icon"

// One way of grouping the sponsorships: each group's ROAS as a bar, with
// how many, the value and the visits.
function Groups({ title, groups, label }: { title: string; groups: PortfolioGroup[]; label?: (key: string) => string }) {
  const top = Math.max(1, ...groups.map((group) => group.roas))
  return (
    <figure className="portfolio-groups">
      <figcaption>{title}</figcaption>
      <ul>
        {groups.slice(0, 6).map((group) => (
          <li key={group.key}>
            <span className="portfolio-key">{label ? label(group.key) : group.key}</span>
            <span aria-hidden="true" className="portfolio-bar">
              <i style={{ width: `${(group.roas / top) * 100}%` }} />
            </span>
            <span className="portfolio-figure">
              <strong>ROAS {group.roas}%</strong>
              <small>{t("{count}건 · {spend} · 방문 {visits}명", { count: group.count, spend: fullWon(group.spend), visits: group.visits })}</small>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  )
}

// What a budget would bring at the cost per visit so far.
function Simulator({ portfolio }: { portfolio: Portfolio }) {
  const [budget, setBudget] = useState(1_000_000)
  const { costPerVisit, salesPerVisit } = portfolio.totals
  if (!costPerVisit || !salesPerVisit) return null
  const visits = Math.round(budget / costPerVisit)
  const sales = visits * salesPerVisit
  return (
    <div className="portfolio-simulator">
      <label>
        {t("다음 협찬 예산")}
        <input
          inputMode="numeric"
          onChange={(event) => setBudget(Number(event.target.value.replace(/[^0-9]/g, "")) || 0)}
          value={budget.toLocaleString("ko-KR")}
        />
      </label>
      <dl>
        <div>
          <dt>{t("예상 매장 방문")}</dt>
          <dd>{t("{count}명", { count: visits.toLocaleString("ko-KR") })}</dd>
        </div>
        <div>
          <dt>{t("예상 매출")}</dt>
          <dd>{fullWon(sales)}</dd>
        </div>
        <div>
          <dt>{t("예상 ROAS")}</dt>
          <dd>{budget > 0 ? `${Math.round((sales / budget) * 100)}%` : "—"}</dd>
        </div>
      </dl>
      <small>{t("지금까지 방문 1명당 {cost}, 방문 1명당 매출 {sales}로 계산한 추정이에요.", { cost: fullWon(costPerVisit), sales: fullWon(salesPerVisit) })}</small>
    </div>
  )
}

// 캠퍼스 포트폴리오 on 성과 분석 (backend lib/portfolio.ts): for Campus
// Partners (and visitors, with the demo brand's), every sponsorship
// together by school, month and kind of group, the best and weakest, and a
// budget planner; locked with what it holds for a free brand.
export function CampusPortfolio({ onOpenPlan }: { onOpenPlan: () => void }) {
  const [answer, setAnswer] = useState<{ locked: true } | { locked: false; portfolio: Portfolio }>()

  useEffect(() => {
    let cancelled = false
    api.portfolio().then(
      (result) => {
        if (!cancelled) setAnswer(result)
      },
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [])

  if (!answer) return null
  return (
    <section aria-labelledby="portfolio-title" className="analytics-card portfolio-card">
      <header className="portfolio-head">
        <div>
          <span className="eyebrow">Campus Partners</span>
          <p className="section-title" id="portfolio-title">
            {t("캠퍼스 포트폴리오")}
          </p>
          <p className="field-hint">{t("모든 협찬을 학교 · 시기 · 단체 종류별로 모아 어디에 다시 쓸지 정해요.")}</p>
        </div>
      </header>
      {answer.locked ? (
        <div className="portfolio-locked">
          <Icon name="lock" size={22} />
          <p>{t("캠퍼스 파트너스에서 볼 수 있어요. 학교별 · 월별 · 단체 종류별 ROAS, 가장 좋았던 협찬과 아쉬웠던 협찬, 예산 계획기를 한 화면에서 봐요.")}</p>
          <button className="primary-button" onClick={onOpenPlan} type="button">
            {t("요금제 보기")}
          </button>
        </div>
      ) : answer.portfolio.count === 0 ? (
        <p className="field-hint">{t("끝난 협찬이 생기면 여기에 모아 보여 드려요.")}</p>
      ) : (
        <>
          <dl className="portfolio-totals">
            <div>
              <dt>{t("협찬")}</dt>
              <dd>{t("{count}건", { count: answer.portfolio.count })}</dd>
            </div>
            <div>
              <dt>{t("누적 ROAS")}</dt>
              <dd>{answer.portfolio.totals.roas}%</dd>
            </div>
            <div>
              <dt>{t("방문 1명당 비용")}</dt>
              <dd>{answer.portfolio.totals.costPerVisit === null ? "—" : fullWon(answer.portfolio.totals.costPerVisit)}</dd>
            </div>
            <div>
              <dt>{t("누적 추정 매출")}</dt>
              <dd>{fullWon(answer.portfolio.totals.sales)}</dd>
            </div>
          </dl>
          <div className="portfolio-grid">
            <Groups groups={answer.portfolio.bySchool} title={t("학교별")} />
            <Groups groups={answer.portfolio.byCategory} label={(key) => t(key)} title={t("단체 종류별")} />
            <Groups groups={answer.portfolio.byMonth} title={t("월별")} />
          </div>
          <div className="portfolio-picks">
            {answer.portfolio.best && (
              <p>
                <strong>{t("가장 좋았던 협찬")}</strong> {answer.portfolio.best.eventName} · {answer.portfolio.best.groupName} ·{" "}
                {formatFullDate(answer.portfolio.best.date)} · ROAS {answer.portfolio.best.roas}%
              </p>
            )}
            {answer.portfolio.weakest && (
              <p>
                <strong>{t("아쉬웠던 협찬")}</strong> {answer.portfolio.weakest.eventName} · {answer.portfolio.weakest.groupName} ·{" "}
                {formatFullDate(answer.portfolio.weakest.date)} · ROAS {answer.portfolio.weakest.roas}%
              </p>
            )}
          </div>
          <Simulator portfolio={answer.portfolio} />
        </>
      )}
    </section>
  )
}
