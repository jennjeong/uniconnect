import type { CSSProperties } from "react"

import { BrandMark } from "../components/BrandMark"
import { DateLine } from "../components/DateLine"
import { FaqSection } from "../components/FaqSection"
import { Icon } from "../components/Icon"
import { JourneyChain, type JourneyStep } from "../components/JourneyChain"
import { LogoMarquee } from "../components/LogoMarquee"
import { MeetingHero } from "../components/MeetingHero"
import { ProposalControl } from "../components/ProposalControl"
import { RevealStatement, RevealTitle } from "../components/RevealText"
import { StatsBento } from "../components/StatsBento"
import { WorkCard } from "../components/WorkCard"
import { dDayLabel, nextEvent, semesterLabel, shortDay } from "../lib/date"
import { formatWon } from "../lib/kpis"
import { fullWon, roasMet, roasOf, sponsorshipTotals } from "../lib/sponsorships"
import type { Match, NavLabel, SponsorRequest, Sponsorship } from "../types"

const pad = (value: number) => String(value).padStart(2, "0")

const delay = (seconds: number) => ({ "--reveal-delay": `${seconds}s` }) as CSSProperties

// Dashboard for brands, in the same three moves as the student side: where
// the brand meets campus (the hero and the proposals waiting for it), what
// keeps a sponsorship going (the steps over the chain), and what it made
// together (the totals and the ROAS of each sponsorship).
export function BrandDashboardPage({
  accountName,
  matches,
  groups,
  requests,
  sponsorships,
  proposals,
  updatedAt,
  onNavigate,
  onOpenDetail,
  onAccept,
  onPropose,
  onCancelProposal,
  onOpenFaq,
}: {
  // The logged-in brand's name for the greeting.
  accountName?: string
  // Recommended student groups.
  matches: Match[]
  // Every student group in the catalog.
  groups: Match[]
  // Proposals student groups sent to this brand.
  requests: SponsorRequest[]
  sponsorships: Sponsorship[]
  // Groups this brand has proposed to.
  proposals: string[]
  // When the recommendations were last loaded.
  updatedAt: Date | null
  onNavigate: (label: NavLabel) => void
  onOpenDetail: (match: Match) => void
  onAccept: (request: SponsorRequest) => void
  onPropose: (match: Match) => void
  onCancelProposal: (match: Match) => void
  onOpenFaq: () => void
}) {
  const pending = requests.filter((request) => request.status === "검토 중")
  const confirmed = requests.filter((request) => request.status === "수락")
  const nextConfirmed = nextEvent(confirmed.map((request) => ({ date: request.eventDate })))
  const totals = sponsorshipTotals(sponsorships)
  const results = sponsorships.map((sponsorship) => ({
    ...sponsorship,
    roas: roasOf(sponsorship),
    met: roasMet(sponsorship),
  }))
  const bestRoas = Math.max(0, ...results.map((result) => result.roas))
  // Bar scale with room past the best result and every goal marker.
  const roasScale =
    Math.max(100, bestRoas, ...results.map((result) => result.targetRoas)) * 1.1
  const catalog = groups.length > 0 ? groups : matches

  const currentStep = pending.length > 0 ? 1 : confirmed.length > 0 ? 2 : sponsorships.length > 0 ? 3 : 0
  const journey: JourneyStep[] = [
    { label: "캠페인 등록", status: "브랜드 일정", detail: "예산과 원하는 노출, 함께하고 싶은 행사를 정해요." },
    {
      label: "받은 제안 검토",
      status: pending.length > 0 ? `검토 중 ${pending.length}건` : "새 제안 없음",
      detail: "학생단체가 보낸 제안을 보고 수락하거나 거절해요.",
    },
    {
      label: "협찬 확정",
      status: confirmed.length > 0 ? `확정 ${confirmed.length}건` : "대기",
      detail: "확정한 협찬은 캠페인 달력에 행사 일정으로 들어가요.",
    },
    {
      label: "성과 분석",
      status: sponsorships.length > 0 ? `협찬 ${sponsorships.length}건` : "대기",
      detail: "쿠폰과 방문으로 협찬마다 ROAS를 계산해요.",
    },
    { label: "재집행", status: "대기", detail: "성과가 좋았던 단체와 다음 학기에도 이어가요." },
  ]

  return (
    <div className="dashboard">
      <MeetingHero
        eyebrow={accountName ? `반가워요, ${accountName}` : semesterLabel()}
        lines={["학생들의 현장에서", "브랜드 팬을", "만나 보세요."]}
        stats={[
          { value: `${pending.length}건`, label: "검토할 제안" },
          { value: `${confirmed.length}건`, label: "확정된 협찬" },
          { value: `${totals.roas}%`, label: "평균 ROAS" },
        ]}
        insight={
          pending.length > 0
            ? `새로 받은 협찬 제안 ${pending.length}건이 답을 기다리고 있어요.`
            : `캠페인과 잘 맞는 학생단체 ${matches.length}곳을 찾았어요.`
        }
        detail="브랜드와 학생단체가 맞닿는 캠퍼스 현장에서, 성과가 숫자로 남는 협찬을 시작해 보세요."
        primary={{
          label: pending.length > 0 ? "받은 제안 확인하기" : "학생단체 찾아보기",
          onClick: () => onNavigate(pending.length > 0 ? "받은 제안" : "단체 찾기"),
        }}
        secondary={{ label: "행사 일정 보기", onClick: () => onNavigate("행사 일정") }}
      />

      <LogoMarquee
        label="함께할 수 있는 학생단체"
        rows={[
          catalog.map((group) => ({ key: group.id, mark: <BrandMark match={group} />, label: group.name })),
          catalog
            .filter((group) => group.eventName)
            .map((group) => ({ key: group.id, mark: <Icon name="link" size={22} />, label: group.eventName ?? "" })),
        ]}
      />

      <section className="about-statement-section">
        <span className="eyebrow" data-reveal>
          About uniconnect
        </span>
        <RevealStatement
          lead="학생들의 현장과 브랜드를 잇고,"
          firstChip={<Icon name="link" size={18} />}
          muted="협찬의 효과를 ROAS로 확인해요"
          secondChip={<Icon name="chart" size={18} />}
        />
      </section>

      <section className="inbox-section">
        <div className="section-head">
          <span className="eyebrow" data-reveal>
            Proposal inbox
          </span>
          <RevealTitle as="h2" className="section-display">
            {pending.length > 0 ? "답을 기다리는 제안" : "새 제안을 기다리고 있어요"}
          </RevealTitle>
        </div>
        {pending.length === 0 ? (
          <p className="day-empty inbox-empty" data-reveal>
            새로 받은 제안이 없어요. 단체 찾기에서 먼저 제안해 보세요.
          </p>
        ) : (
          <ul className="pending-list">
            {pending.map((request, index) => (
              <li className="pending-card" data-reveal key={request.id} style={delay(index * 0.08)}>
                <div className="pending-head">
                  <BrandMark match={request} />
                  <div>
                    <strong>{request.eventName}</strong>
                    <small>
                      {request.groupName} · {request.school}
                    </small>
                  </div>
                  <span className="pending-dday">{request.eventDate ? dDayLabel(request.eventDate) : "협의 중"}</span>
                </div>
                {request.eventDate && <DateLine date={request.eventDate} />}
                <p className="pending-ask">
                  요청 · {request.ask} · {request.people}
                </p>
                <div className="pending-actions">
                  <button className="proposal-button accept" onClick={() => onAccept(request)} type="button">
                    수락하기
                  </button>
                  <button className="proposal-cancel" onClick={() => onNavigate("받은 제안")} type="button">
                    자세히 보기
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <StatsBento
        stats={[
          {
            label: "누적 집행액",
            value: fullWon(totals.spend),
            note: `학생단체와 함께한 협찬 ${sponsorships.length}건이에요.`,
            onClick: () => onNavigate("성과 분석"),
          },
          {
            label: "평균 ROAS",
            value: `${totals.roas}%`,
            note: `“가장 좋았던 협찬은 ROAS ${bestRoas}%였어요.”`,
            onClick: () => onNavigate("성과 분석"),
          },
          {
            label: "받은 제안",
            value: `${requests.length}건`,
            note: `그중 ${pending.length}건이 답을 기다려요.`,
            onClick: () => onNavigate("받은 제안"),
          },
          {
            label: "확정된 협찬",
            value: `${confirmed.length}건`,
            note: nextConfirmed ? `다음 일정 ${shortDay(nextConfirmed.date)}` : "예정된 일정 없음",
            onClick: () => onNavigate("행사 일정"),
          },
        ]}
        marks={confirmed.slice(0, 4).map((request) => (
          <BrandMark key={request.id} match={request} />
        ))}
      />

      <section className="works-section">
        <div className="section-head centered">
          <span className="eyebrow" data-reveal>
            Smart match
          </span>
          <RevealTitle as="h2" className="section-display">
            추천 학생단체
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
              <WorkCard
                match={match}
                meta={match.school ?? match.category}
                onOpenDetail={() => onOpenDetail(match)}
                tags={
                  <>
                    {match.eventDate && <DateLine date={match.eventDate} />}
                    {match.eventName && <span className="tag-event">{match.eventName}</span>}
                    {match.tags.slice(0, 1).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </>
                }
              >
                <ProposalControl
                  done={proposals.includes(match.id)}
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
        intro="캠페인 등록부터 재집행까지, 한 번의 협찬이 다음 학기의 협찬으로 이어지도록 모든 단계를 한곳에서 관리해요."
        heading="우리 브랜드의 협찬, 지금 여기까지 왔어요"
        steps={journey}
        current={currentStep}
        scheduleLabel="행사 일정 보기"
        onOpenSchedule={() => onNavigate("행사 일정")}
      />

      <section className="results-section">
        <div className="section-head">
          <span className="eyebrow" data-reveal>
            Performance
          </span>
          <RevealTitle as="h2" className="section-display">
            협찬마다 돌아온 만큼
          </RevealTitle>
        </div>
        <div className="results-grid">
          <div className="silver-panel" data-reveal>
            <div className="roas-list stagger">
              {results.map((result) => (
                <div className={result.met ? "roas-row met" : "roas-row"} key={result.id}>
                  <div className="roas-row-head">
                    <strong>{result.eventName}</strong>
                    <span>{result.roas}%</span>
                  </div>
                  <div className="roas-track">
                    <i style={{ width: `${(result.roas / roasScale) * 100}%` }} />
                    <b style={{ left: `${(result.targetRoas / roasScale) * 100}%` }} />
                  </div>
                  <small>
                    {result.groupName} · {formatWon(result.spend)} 집행 · 목표 {result.targetRoas}%
                    {result.met && " 달성"}
                  </small>
                </div>
              ))}
            </div>
            <p className="roas-legend">
              <b aria-hidden="true" /> 목표 ROAS
              <i aria-hidden="true" /> 목표 달성
            </p>
          </div>
          <div className="report-highlight" data-reveal style={delay(0.12)}>
            <div>
              <span>평균 ROAS</span>
              <strong>{totals.roas}%</strong>
              <small>학생단체와 함께한 협찬의 평균이에요.</small>
            </div>
            <div className="report-highlight-actions">
              <button className="pill white" onClick={() => onNavigate("성과 분석")} type="button">
                <span>성과 분석 열기</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <FaqSection onOpenFaq={onOpenFaq} />
    </div>
  )
}
