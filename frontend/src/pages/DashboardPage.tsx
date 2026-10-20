import type { ReactNode } from "react"

import { BrandMark } from "../components/BrandMark"
import { Icon, type IconName } from "../components/Icon"
import { ProposalControl } from "../components/ProposalControl"
import { formatFullDate, fromIsoDate, nextEvent } from "../lib/date"
import { percent } from "../lib/format"
import { scoreBand } from "../lib/score"
import type { EventItem, Match, Metrics, NavLabel, Report, Role } from "../types"

type Stat = {
  label: string
  icon: IconName
  value: string
  note: ReactNode
  // Page with the details behind the number.
  target: NavLabel
}

const pad = (value: number) => String(value).padStart(2, "0")

// Top of the performance chart's y-axis (150 / 100 / 50 / 0).
const chartMax = 150

export function DashboardPage({
  role,
  matches,
  brands,
  events,
  proposals,
  metrics,
  report,
  updatedAt,
  onNavigate,
  onPropose,
  onCancelProposal,
  onOpenReport,
}: {
  role: Role
  matches: Match[]
  // Brand catalog (student groups only).
  brands: Match[]
  events: EventItem[]
  proposals: string[]
  metrics: Metrics
  report: Report | null
  // When the matches were last loaded.
  updatedAt: Date | null
  onNavigate: (label: NavLabel) => void
  onPropose: (match: Match) => void
  onCancelProposal: (match: Match) => void
  onOpenReport: () => void
}) {
  const students = role === "학생단체"
  const next = nextEvent(events)
  const nextDay = next ? fromIsoDate(next.date) : undefined
  const candidates = students && brands.length > 0 ? brands : matches
  const strongCut = students ? 80 : 90

  // Summary cards, each opening the page with the details behind its number.
  const stats: Stat[] = [
    {
      label: students ? "추천 브랜드" : "추천 단체",
      icon: "spark",
      value: String(candidates.length),
      note: (
        <>
          일치율 {strongCut}% 이상{" "}
          <em>{candidates.filter((match) => match.score >= strongCut).length}곳</em>
        </>
      ),
      target: "추천 매칭",
    },
    {
      label: "진행 중 협찬",
      icon: "calendar",
      value: String(events.filter((event) => event.status !== "측정 완료").length),
      note: `보낸 제안 ${proposals.length}건`,
      target: "내 행사",
    },
    {
      label: "예상 협찬 가치",
      icon: "chart",
      value: report ? `₩${Math.round(report.sponsorValue / 1000).toLocaleString("ko-KR")}K` : "-",
      note: "현물 환산 포함",
      target: "리포트",
    },
    {
      label: "누적 QR 참여",
      icon: "scan",
      value: metrics.scans.toLocaleString("ko-KR"),
      note: (
        <>
          참여율 <em>{report ? percent(metrics.scans, report.expectedAudience) : 0}%</em>
        </>
      ),
      target: "성과 측정",
    },
  ]

  // Where the next event stands in the sponsorship flow.
  const currentStep = !next ? 0 : next.status === "매칭 중" ? 1 : next.status === "집행 예정" ? 2 : 3
  const journey: { icon: IconName; label: string; status: string }[] = [
    { icon: "check", label: students ? "행사 등록" : "캠페인 등록", status: next ? "완료" : "등록 전" },
    {
      icon: "spark",
      label: "매칭·제안",
      status: proposals.length > 0 ? `제안 ${proposals.length}건` : next ? "진행 중" : "대기",
    },
    {
      icon: "calendar",
      label: "집행 관리",
      status: nextDay ? `${nextDay.getMonth() + 1}.${nextDay.getDate()} 예정` : "대기",
    },
    { icon: "scan", label: "성과 측정", status: "대기" },
    { icon: "file", label: "리포트", status: "대기" },
  ]

  const bars = [
    { label: "QR 스캔", value: metrics.scans },
    { label: "쿠폰 수령", value: metrics.coupons },
    { label: "매장 방문", value: metrics.visits },
  ]

  return (
    <>
      <section className="welcome-panel">
        <div className="welcome-copy">
          <span className="section-kicker">YOUR NEXT CONNECTION</span>
          <p className="welcome-title">
            {role === "학생단체" ? "좋은 행사는," : "좋은 캠페인은,"} <br />
            <em>좋은 파트너</em>를 만날 때 커져요.
          </p>
          <p className="welcome-description">
            {role === "학생단체"
              ? `다가오는 행사와 잘 맞는 브랜드 ${matches.length}곳을 찾았어요.`
              : `이번 캠페인과 잘 맞는 학생단체 ${matches.length}곳을 찾았어요.`}
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
          onClick={() => onNavigate("추천 매칭")}
          type="button"
        >
          추천 매칭 확인하기 <Icon name="arrow" size={16} />
        </button>
      </section>

      <section className="workflow-section">
        <div className="section-heading-row">
          <div>
            <span className="section-kicker dark">SPONSORSHIP JOURNEY</span>
            <p className="section-title">내 협찬 진행 현황</p>
          </div>
          <button
            className="subtle-link"
            onClick={() => onNavigate("내 행사")}
            type="button"
          >
            전체 보기 <Icon name="chevron" size={15} />
          </button>
        </div>
        <div className="workflow-card">
          {journey.map((step, index) => (
            <div
              className={`workflow-step ${index === currentStep ? "current" : ""}`}
              key={step.label}
            >
              <div className="step-icon">
                <Icon name={step.icon} size={19} />
              </div>
              <div>
                <span>0{index + 1}</span>
                <strong>{step.label}</strong>
                <small>{step.status}</small>
              </div>
              {index < journey.length - 1 && (
                <div className="step-line">
                  <span />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="stats-grid">
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

      <section className="content-grid" id="matches">
        <div className="matches-panel">
          <div className="section-heading-row">
            <div>
              <span className="section-kicker dark">SMART MATCH</span>
              <p className="section-title">맞춤 추천 매칭</p>
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
                    <span>{match.category}</span>
                  </div>
                  <p>{match.offer}</p>
                  <div className="tag-row">
                    {match.tags.map((tag) => (
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
        </div>

        <aside className="performance-panel">
          <div className="section-heading-row compact">
            <div>
              <span className="section-kicker dark">PERFORMANCE</span>
              <p className="section-title">최근 행사 성과</p>
            </div>
            <button
              className="more-button"
              aria-label="성과 더보기"
              onClick={() => onNavigate("리포트")}
              type="button"
            >
              •••
            </button>
          </div>
          <div className="event-summary">
            <div>
              <strong>{report?.eventName ?? "최근 행사"}</strong>
              <span>{report ? formatFullDate(report.eventDate) : ""}</span>
            </div>
            <span className="complete-badge">측정 완료</span>
          </div>
          <div className="chart-area">
            <div className="chart-y">
              <span>150</span>
              <span>100</span>
              <span>50</span>
              <span>0</span>
            </div>
            <div className="bars">
              {bars.map((bar) => (
                <div className="bar-item" key={bar.label}>
                  <span className="bar-value">{bar.value}</span>
                  <div className="bar-track">
                    <span
                      style={{
                        height: `${Math.min(100, (bar.value / chartMax) * 100)}%`,
                      }}
                    />
                  </div>
                  <small>{bar.label}</small>
                </div>
              ))}
            </div>
          </div>
          <div className="report-highlight">
            <div className="mini-icon">
              <Icon name="chart" size={18} />
            </div>
            <div>
              <span>추정 ROAS</span>
              <strong>{report ? `${report.roas}%` : "-"}</strong>
            </div>
            <button aria-label="리포트 열기" onClick={onOpenReport} type="button">
              <Icon name="arrow" size={18} />
            </button>
          </div>
        </aside>
      </section>
    </>
  )
}
