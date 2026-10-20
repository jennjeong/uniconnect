import type { ReactNode } from "react"

import { BrandMark } from "../components/BrandMark"
import { Icon, type IconName } from "../components/Icon"
import { ProposalControl } from "../components/ProposalControl"
import { formatDay, nextEvent, shortDay } from "../lib/date"
import { formatWon } from "../lib/kpis"
import { scoreBand } from "../lib/score"
import { compactWon, roasOf, sponsorshipTotals } from "../lib/sponsorships"
import type { Match, NavLabel, SponsorRequest, Sponsorship } from "../types"

type Stat = {
  label: string
  icon: IconName
  value: string
  note: ReactNode
  // Page with the details behind the number.
  target: NavLabel
}

const pad = (value: number) => String(value).padStart(2, "0")

// Dashboard for brands: proposals waiting for an answer, results of past
// sponsorships and the student groups worth proposing to.
export function BrandDashboardPage({
  matches,
  requests,
  sponsorships,
  proposals,
  updatedAt,
  onNavigate,
  onAccept,
  onPropose,
  onCancelProposal,
}: {
  // Recommended student groups.
  matches: Match[]
  // Proposals student groups sent to this brand.
  requests: SponsorRequest[]
  sponsorships: Sponsorship[]
  // Groups this brand has proposed to.
  proposals: string[]
  // When the recommendations were last loaded.
  updatedAt: Date | null
  onNavigate: (label: NavLabel) => void
  onAccept: (request: SponsorRequest) => void
  onPropose: (match: Match) => void
  onCancelProposal: (match: Match) => void
}) {
  const pending = requests.filter((request) => request.status === "검토 중")
  const confirmed = requests.filter((request) => request.status === "수락")
  const nextConfirmed = nextEvent(confirmed.map((request) => ({ date: request.eventDate })))
  const totals = sponsorshipTotals(sponsorships)
  const results = sponsorships.map((sponsorship) => ({ ...sponsorship, roas: roasOf(sponsorship) }))
  const bestRoas = Math.max(0, ...results.map((result) => result.roas))
  // Bar scale with room past the best result; the marker shows break-even.
  const roasScale = Math.max(100, bestRoas) * 1.1

  const stats: Stat[] = [
    {
      label: "검토할 제안",
      icon: "inbox",
      value: String(pending.length),
      note: (
        <>
          받은 제안 <em>{requests.length}건</em>
        </>
      ),
      target: "받은 제안",
    },
    {
      label: "확정된 협찬",
      icon: "check",
      value: String(confirmed.length),
      note: nextConfirmed ? `다음 일정 ${shortDay(nextConfirmed.date)}` : "예정된 일정 없음",
      target: "캠페인",
    },
    {
      label: "누적 집행액",
      icon: "won",
      value: compactWon(totals.spend),
      note: `협찬 ${sponsorships.length}건`,
      target: "성과 분석",
    },
    {
      label: "평균 ROAS",
      icon: "chart",
      value: `${totals.roas}%`,
      note: (
        <>
          최고 <em>{bestRoas}%</em>
        </>
      ),
      target: "성과 분석",
    },
  ]

  return (
    <>
      <section className="welcome-panel">
        <div className="welcome-copy">
          <span className="section-kicker">BRAND PARTNER CENTER</span>
          <p className="welcome-title">
            학생들의 현장에서 <br />
            <em>브랜드 팬</em>을 만나 보세요.
          </p>
          <p className="welcome-description">
            {pending.length > 0
              ? `새로 받은 협찬 제안 ${pending.length}건이 답을 기다리고 있어요.`
              : `캠페인과 잘 맞는 학생단체 ${matches.length}곳을 찾았어요.`}
          </p>
        </div>
        <div className="connection-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="art-node brand-node">
            <Icon name="store" size={26} />
            <span>BRAND</span>
          </div>
          <div className="art-center">
            <Icon name="spark" size={30} />
          </div>
          <div className="art-node group-node">
            <Icon name="users" size={26} />
            <span>GROUP</span>
          </div>
          <span className="spark-dot dot-one" />
          <span className="spark-dot dot-two" />
          <span className="spark-dot dot-three" />
        </div>
        <button
          className="detail-button welcome-action"
          onClick={() => onNavigate(pending.length > 0 ? "받은 제안" : "단체 찾기")}
          type="button"
        >
          {pending.length > 0 ? "받은 제안 확인하기" : "학생단체 찾아보기"}
          <Icon name="arrow" size={16} />
        </button>
      </section>

      <section className="stats-grid brand-stats">
        {stats.map((stat) => (
          <button
            className="stat-card"
            key={stat.label}
            onClick={() => onNavigate(stat.target)}
            type="button"
          >
            <span className="stat-top">
              <span>{stat.label}</span>
              <Icon name={stat.icon} size={18} />
            </span>
            <span className="stat-value">
              <strong>{stat.value}</strong>
              <small>{stat.note}</small>
            </span>
          </button>
        ))}
      </section>

      <section className="content-grid">
        <div className="matches-panel">
          <div className="section-heading-row">
            <div>
              <span className="section-kicker dark">PROPOSAL INBOX</span>
              <p className="section-title">답을 기다리는 제안</p>
            </div>
            <button className="subtle-link" onClick={() => onNavigate("받은 제안")} type="button">
              전체 보기 <Icon name="chevron" size={15} />
            </button>
          </div>
          {pending.length === 0 ? (
            <p className="day-empty inbox-empty">
              새로 받은 제안이 없어요. 단체 찾기에서 먼저 제안해 보세요.
            </p>
          ) : (
            <div className="match-list">
              {pending.map((request) => (
                <article className="inbox-row" key={request.id}>
                  <BrandMark match={request} />
                  <div className="match-details">
                    <div className="match-title-row">
                      <strong>{request.groupName}</strong>
                      <span>{request.school}</span>
                    </div>
                    <p>
                      {request.eventName}
                      {request.eventDate && ` · ${formatDay(request.eventDate)}`}
                    </p>
                    <div className="tag-row">
                      <span className="tag-ask">요청 · {request.ask}</span>
                      <span>{request.people}</span>
                    </div>
                  </div>
                  <div className="inbox-row-actions">
                    <button
                      className="proposal-button accept"
                      onClick={() => onAccept(request)}
                      type="button"
                    >
                      수락하기
                    </button>
                    <button
                      className="proposal-cancel"
                      onClick={() => onNavigate("받은 제안")}
                      type="button"
                    >
                      자세히 보기
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <aside className="performance-panel">
          <div className="section-heading-row compact">
            <div>
              <span className="section-kicker dark">PERFORMANCE</span>
              <p className="section-title">협찬별 ROAS</p>
            </div>
            <button
              className="more-button"
              aria-label="성과 분석 열기"
              onClick={() => onNavigate("성과 분석")}
              type="button"
            >
              •••
            </button>
          </div>
          <div className="roas-list">
            {results.map((result) => (
              <div className="roas-row" key={result.id}>
                <div className="roas-row-head">
                  <strong>{result.eventName}</strong>
                  <span className={result.roas === bestRoas ? "best" : ""}>{result.roas}%</span>
                </div>
                <div className="roas-track">
                  <i style={{ width: `${(result.roas / roasScale) * 100}%` }} />
                  <b style={{ left: `${(100 / roasScale) * 100}%` }} />
                </div>
                <small>
                  {result.groupName} · {formatWon(result.spend)} 집행
                </small>
              </div>
            ))}
          </div>
          <p className="roas-legend">
            <b aria-hidden="true" /> 100% 손익분기
          </p>
          <div className="report-highlight">
            <div className="mini-icon">
              <Icon name="chart" size={18} />
            </div>
            <div>
              <span>평균 ROAS</span>
              <strong>{totals.roas}%</strong>
            </div>
            <button aria-label="성과 분석 열기" onClick={() => onNavigate("성과 분석")} type="button">
              <Icon name="arrow" size={18} />
            </button>
          </div>
        </aside>
      </section>

      <section className="matches-panel brand-picks">
        <div className="section-heading-row">
          <div>
            <span className="section-kicker dark">SMART MATCH</span>
            <p className="section-title">추천 학생단체</p>
          </div>
          {updatedAt && (
            <span className="updated-at">
              오늘 {pad(updatedAt.getHours())}:{pad(updatedAt.getMinutes())} 업데이트
            </span>
          )}
        </div>
        <div className="match-list">
          {matches.map((match) => (
            <article className="match-card" key={match.id}>
              <BrandMark match={match} />
              <div className="match-details">
                <div className="match-title-row">
                  <strong>{match.name}</strong>
                  <span>{match.school}</span>
                </div>
                <p>{match.offer}</p>
                <div className="tag-row">
                  {match.eventDate && (
                    <span className="tag-event">
                      {shortDay(match.eventDate)} {match.eventName}
                    </span>
                  )}
                  {match.tags.slice(0, 1).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
              <div className="score">
                <span>매칭 적합도</span>
                <strong style={{ color: scoreBand(match.score).text }}>
                  {match.score}
                  <small>%</small>
                </strong>
              </div>
              <ProposalControl
                done={proposals.includes(match.id)}
                label="제안하기"
                className="proposal-button"
                onPropose={() => onPropose(match)}
                onCancel={() => onCancelProposal(match)}
              />
            </article>
          ))}
        </div>
      </section>
    </>
  )
}
