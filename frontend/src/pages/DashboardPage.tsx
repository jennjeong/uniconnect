import type { CSSProperties } from "react"

import { BrandMark } from "../components/BrandMark"
import { FaqSection } from "../components/FaqSection"
import { Icon } from "../components/Icon"
import { JourneyChain, type JourneyStep } from "../components/JourneyChain"
import { LogoMarquee } from "../components/LogoMarquee"
import { MeetingHero } from "../components/MeetingHero"
import { ProposalControl } from "../components/ProposalControl"
import { RevealStatement, RevealTitle } from "../components/RevealText"
import { StatsBento } from "../components/StatsBento"
import { WorkCard } from "../components/WorkCard"
import { formatFullDate, fromIsoDate, nextEvent, semesterLabel } from "../lib/date"
import { percent } from "../lib/format"
import { hasRoas, roasText } from "../lib/kpis"
import { measureState } from "../lib/measurements"
import { fullWon } from "../lib/sponsorships"
import type { EventItem, Match, Metrics, NavLabel, Report, RequestStatus } from "../types"

const pad = (value: number) => String(value).padStart(2, "0")

// Top of the performance chart's y-axis (150 / 100 / 50 / 0).
const chartMax = 150

const delay = (seconds: number) => ({ "--reveal-delay": `${seconds}s` }) as CSSProperties

// Dashboard for student groups, told in the three moves of a sponsorship:
// where the group and its brands meet (the hero), what keeps them linked
// (the steps of the sponsorship, over the chain), and what they make
// together (the numbers and the last event's results).
export function DashboardPage({
  accountName,
  matches,
  brands,
  events,
  proposals,
  statuses,
  confirmedCount,
  metrics,
  report,
  updatedAt,
  onNavigate,
  onOpenDetail,
  onPropose,
  onCancelProposal,
  onOpenReport,
  onOpenFaq,
}: {
  // The logged-in group's name for the greeting.
  accountName?: string
  matches: Match[]
  // Every brand in the catalog.
  brands: Match[]
  events: EventItem[]
  proposals: string[]
  // Answers from brands that replied to a proposal.
  statuses: Partial<Record<string, RequestStatus>>
  // Sponsorships confirmed either way round.
  confirmedCount: number
  metrics: Metrics
  report: Report | null
  // When the matches were last loaded.
  updatedAt: Date | null
  onNavigate: (label: NavLabel) => void
  onOpenDetail: (match: Match) => void
  onPropose: (match: Match) => void
  onCancelProposal: (match: Match) => void
  onOpenReport: () => void
  onOpenFaq: () => void
}) {
  const next = nextEvent(events)
  const nextDay = next ? fromIsoDate(next.date) : undefined
  const candidates = brands.length > 0 ? brands : matches
  const strongCut = 80
  const strong = candidates.filter((match) => match.score >= strongCut).length
  const running = events.filter((event) => event.status !== "측정 완료").length
  const proposed = candidates.filter((match) => proposals.includes(match.id))

  // Where the next event stands in the sponsorship flow.
  const currentStep = !next ? 0 : next.status === "매칭 중" ? 1 : next.status === "집행 예정" ? 2 : 3
  const journey: JourneyStep[] = [
    {
      label: "행사 등록",
      status: next ? "완료" : "등록 전",
      detail: "인원 · 일정 · 학과 구성과 노출할 자리를 알려 주세요.",
    },
    {
      label: "매칭 · 제안",
      status:
        confirmedCount > 0
          ? `확정 ${confirmedCount}건`
          : proposals.length > 0
            ? `제안 ${proposals.length}건`
            : next
              ? "진행 중"
              : "대기",
      detail: "일치율 높은 브랜드에 제안하고 답을 받아요.",
    },
    {
      label: "집행 관리",
      status: nextDay ? `${nextDay.getMonth() + 1}.${nextDay.getDate()} 예정` : "대기",
      detail: "협찬 조건과 받은 물품을 행사 전에 함께 확인해요.",
    },
    { label: "성과 측정", status: "대기", detail: "행사 QR과 쿠폰으로 참여와 방문을 집계해요." },
    { label: "재협찬", status: "대기", detail: "쌓인 성과가 신뢰가 되어 다음 협찬으로 이어져요." },
  ]

  const bars = [
    { label: "QR 스캔", value: metrics.scans },
    { label: "쿠폰 수령", value: metrics.coupons },
    { label: "매장 방문", value: metrics.visits },
  ]

  return (
    <div className="dashboard">
      <MeetingHero
        eyebrow={accountName ? `반가워요, ${accountName}` : semesterLabel()}
        lines={["좋은 행사는,", "좋은 파트너를", "만날 때 커져요."]}
        stats={[
          { value: `${candidates.length}곳`, label: "추천 브랜드" },
          { value: `${running}건`, label: "진행 중 협찬" },
          { value: metrics.scans.toLocaleString("ko-KR"), label: "누적 QR 참여" },
        ]}
        insight={`다가오는 행사와 잘 맞는 브랜드 ${matches.length}곳을 찾았어요.`}
        detail="학생단체와 브랜드가 맞닿는 곳에서 협찬이 시작돼요. 일치율이 높은 브랜드부터 제안해 보세요."
        primary={{ label: "추천 매칭 확인하기", onClick: () => onNavigate("추천 매칭") }}
      />

      <LogoMarquee
        label="함께할 수 있는 브랜드"
        rows={[
          candidates.map((match) => ({ key: match.id, mark: <BrandMark match={match} />, label: match.name })),
          candidates.map((match) => ({
            key: match.id,
            mark: <Icon name="link" size={22} />,
            label: match.offer,
          })),
        ]}
      />

      <section className="about-statement-section">
        <span className="eyebrow" data-reveal>
          About uniconnect
        </span>
        <RevealStatement
          lead="학생단체와 브랜드를 잇고,"
          firstChip={<Icon name="link" size={18} />}
          muted="협찬의 성과를 숫자로 증명해요"
          secondChip={<Icon name="chart" size={18} />}
        />
      </section>

      <StatsBento
        stats={[
          {
            label: "추천 브랜드",
            value: `${candidates.length}곳`,
            note: `일치율 ${strongCut}% 이상 브랜드가 ${strong}곳이에요.`,
            onClick: () => onNavigate("추천 매칭"),
          },
          {
            label: "진행 중 협찬",
            value: `${running}건`,
            note:
              confirmedCount > 0
                ? `“협찬 확정 ${confirmedCount}건, 보낸 제안 ${proposals.length}건이에요.”`
                : `“보낸 제안 ${proposals.length}건이 답을 기다리고 있어요.”`,
            onClick: () => onNavigate("내 행사"),
          },
          {
            label: "예상 협찬 가치",
            value: report ? fullWon(report.sponsorValue) : "-",
            note: "현물 환산을 포함한 금액이에요.",
            onClick: () => onNavigate("리포트"),
          },
          {
            label: "누적 QR 참여",
            value: metrics.scans.toLocaleString("ko-KR"),
            note: `참여율 ${report ? percent(metrics.scans, report.expectedAudience) : 0}%`,
            onClick: () => onNavigate("성과 측정"),
          },
        ]}
        marks={proposed.slice(0, 4).map((match) => (
          <BrandMark key={match.id} match={match} />
        ))}
      />

      <section className="works-section" id="matches">
        <div className="section-head centered">
          <span className="eyebrow" data-reveal>
            Smart match
          </span>
          <RevealTitle as="h2" className="section-display">
            맞춤 추천 매칭
          </RevealTitle>
          {updatedAt && (
            <small className="section-note" data-reveal>
              오늘 {pad(updatedAt.getHours())}:{pad(updatedAt.getMinutes())} 업데이트
            </small>
          )}
        </div>
        <ul className="work-grid three">
          {matches.map((match, index) => (
            <li data-reveal key={match.id} style={delay(index * 0.09)}>
              <WorkCard match={match} meta={match.category} onOpenDetail={() => onOpenDetail(match)}>
                <ProposalControl
                  done={proposals.includes(match.id)}
                  status={statuses[match.id]}
                  label="제안하기"
                  className="proposal-button"
                  onPropose={() => onPropose(match)}
                  onCancel={() => onCancelProposal(match)}
                />
              </WorkCard>
            </li>
          ))}
        </ul>
      </section>

      <JourneyChain
        intro={
          next
            ? `다음 행사 ‘${next.name}’은 ${formatFullDate(next.date)}이에요. 지금은 ‘${journey[currentStep].label}’ 단계예요.`
            : "행사 등록부터 재협찬까지, 한 번의 협찬이 다음 협찬으로 이어지도록 모든 단계를 한곳에서 관리해요."
        }
        heading="내 협찬, 지금 여기까지 왔어요"
        steps={journey}
        current={currentStep}
        scheduleLabel="전체 일정 보기"
        onOpenSchedule={() => onNavigate("내 행사")}
      />

      <section className="results-section">
        <div className="section-head">
          <span className="eyebrow" data-reveal>
            Last event
          </span>
          <RevealTitle as="h2" className="section-display">
            함께 만든 지난 행사의 결과
          </RevealTitle>
        </div>
        <div className="results-grid">
          <div className="silver-panel results-chart" data-reveal>
            <div className="event-summary">
              <div>
                <strong>{report?.eventName ?? "최근 행사"}</strong>
                <span>{report ? formatFullDate(report.eventDate) : ""}</span>
              </div>
              {report && <span className="complete-badge">{measureState(report)}</span>}
            </div>
            <div className="chart-area">
              <div className="chart-y" aria-hidden="true">
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
                      <span style={{ height: `${Math.min(100, (bar.value / chartMax) * 100)}%` }} />
                    </div>
                    <small>{bar.label}</small>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="report-highlight" data-reveal style={delay(0.12)}>
            <div>
              <span>추정 ROAS</span>
              <strong>{report ? roasText(report) : "-"}</strong>
              <small>
                {report && hasRoas(report) && report.roas >= 100
                  ? "함께한 브랜드가 쓴 금액보다 더 많이 돌아왔어요."
                  : "목표까지 남은 만큼은 리포트에서 볼 수 있어요."}
              </small>
            </div>
            <div className="report-highlight-actions">
              <button className="pill white" onClick={onOpenReport} type="button">
                <span>상세 데이터</span>
              </button>
              <button className="underline-link light" onClick={() => onNavigate("리포트")} type="button">
                리포트 페이지로
              </button>
            </div>
          </div>
        </div>
      </section>

      <FaqSection onOpenFaq={onOpenFaq} />
    </div>
  )
}
