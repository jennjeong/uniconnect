import { BrandMark } from "../components/BrandMark"
import { Icon, type IconName } from "../components/Icon"
import { ProposalControl } from "../components/ProposalControl"
import type { Match, Metrics, NavLabel, Role } from "../types"

const journey: { icon: IconName; label: string; status: string }[] = [
  { icon: "check", label: "행사 등록", status: "완료" },
  { icon: "spark", label: "매칭·제안", status: "진행 중" },
  { icon: "calendar", label: "집행 관리", status: "11.27 예정" },
  { icon: "scan", label: "성과 측정", status: "대기" },
  { icon: "file", label: "리포트", status: "대기" },
]

// Top of the performance chart's y-axis (150 / 100 / 50 / 0).
const chartMax = 150

export function DashboardPage({
  role,
  matches,
  proposals,
  metrics,
  onNavigate,
  onPropose,
  onCancelProposal,
  onOpenReport,
}: {
  role: Role
  matches: Match[]
  proposals: string[]
  metrics: Metrics
  onNavigate: (label: NavLabel) => void
  onPropose: (match: Match) => void
  onCancelProposal: (match: Match) => void
  onOpenReport: () => void
}) {
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
          <div className="welcome-footer">
            <p className="welcome-description">
              {role === "학생단체"
                ? "다가오는 종강 공연과 잘 맞는 브랜드 3곳을 찾았어요."
                : "이번 캠페인과 잘 맞는 학생단체 3곳을 찾았어요."}
            </p>
            <button
              className="text-link"
              onClick={() => onNavigate("추천 매칭")}
              type="button"
            >
              추천 매칭 확인하기 <Icon name="arrow" size={18} />
            </button>
          </div>
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
              className={`workflow-step ${index === 1 ? "current" : ""}`}
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
        <article className="stat-card">
          <div className="stat-top">
            <span>추천 브랜드</span>
            <Icon name="spark" size={18} />
          </div>
          <strong>12</strong>
          <small>
            이번 주 <em>+3곳</em>
          </small>
        </article>
        <article className="stat-card">
          <div className="stat-top">
            <span>진행 중 협찬</span>
            <Icon name="calendar" size={18} />
          </div>
          <strong>2</strong>
          <small>제안 검토 중 1건</small>
        </article>
        <article className="stat-card">
          <div className="stat-top">
            <span>예상 협찬 가치</span>
            <Icon name="chart" size={18} />
          </div>
          <strong>₩680K</strong>
          <small>현물 환산 포함</small>
        </article>
        <article className="stat-card scan-card">
          <div className="stat-top">
            <span>누적 QR 참여</span>
            <Icon name="scan" size={18} />
          </div>
          <strong>428</strong>
          <small>
            평균 참여율 <em>36%</em>
          </small>
        </article>
      </section>

      <section className="content-grid" id="matches">
        <div className="matches-panel">
          <div className="section-heading-row">
            <div>
              <span className="section-kicker dark">SMART MATCH</span>
              <p className="section-title">종강 공연 추천 매칭</p>
            </div>
            <span className="updated-at">오늘 10:24 업데이트</span>
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
                  <strong>
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
              <strong>가을 버스킹 데이</strong>
              <span>2026. 10. 12.</span>
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
              <strong>243%</strong>
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
