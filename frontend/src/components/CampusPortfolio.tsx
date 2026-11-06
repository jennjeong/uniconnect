import { useEffect, useState } from "react"

import { api } from "../api"
import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import { fullWon } from "../lib/sponsorships"
import type { Portfolio, PortfolioGroup } from "../types"
import { Icon } from "./Icon"

// 협찬을 묶는 한 가지 방식. 그룹별 ROAS를 막대로 보여 주고 건수, 금액, 방문
// 수를 곁들인다.
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

// 지금까지의 방문당 비용으로 예산을 쓰면 얻을 수 있는 성과.
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

// 성과 분석의 캠퍼스 포트폴리오 (backend lib/portfolio.ts). 캠퍼스
// 파트너스(그리고 데모 브랜드의 것을 보는 방문자)에게 모든 협찬을 학교, 월,
// 그룹 종류별로 묶어 가장 좋은 쪽과 약한 쪽, 예산 플래너를 보여 준다. 무료
// 브랜드에게는 내용을 잠가 둔다.
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
          <span className="eyebrow">Growth</span>
          <p className="section-title" id="portfolio-title">
            {t("캠퍼스 포트폴리오")}
          </p>
          <p className="field-hint">{t("모든 협찬을 학교 · 시기 · 단체 종류별로 모아 어디에 다시 쓸지 정해요.")}</p>
        </div>
      </header>
      {answer.locked ? (
        <div className="portfolio-locked">
          <Icon name="lock" size={22} />
          <p>{t("Growth에서 볼 수 있어요. 학교별 · 월별 · 단체 종류별 ROAS, 가장 좋았던 협찬과 아쉬웠던 협찬, 예산 계획기를 한 화면에서 봐요.")}</p>
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
