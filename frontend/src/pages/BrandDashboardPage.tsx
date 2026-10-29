import type { CSSProperties, ReactNode } from "react"

import { BrandMark } from "../components/BrandMark"
import { CatalogEmpty } from "../components/CatalogEmpty"
import { DateLine } from "../components/DateLine"
import { Icon } from "../components/Icon"
import { JourneyChain, type JourneyStep } from "../components/JourneyChain"
import { MeetingHero } from "../components/MeetingHero"
import { ProposalControl } from "../components/ProposalControl"
import { RevealStatement, RevealTitle } from "../components/RevealText"
import { ValuePoints } from "../components/ValuePoints"
import { WorkCard } from "../components/WorkCard"
import { t } from "../i18n"
import { dDayLabel, nextEvent, semesterLabel, shortDay } from "../lib/date"
import { shownTags } from "../lib/distance"
import { formatWon } from "../lib/kpis"
import { fullWon, roasMet, roasOf, sponsorshipTotals } from "../lib/sponsorships"
import type { Match, NavLabel, RequestStatus, SponsorRequest, Sponsorship } from "../types"

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
  loaded,
  requests,
  sponsorships,
  proposals,
  statuses,
  updatedAt,
  onNavigate,
  onOpenDetail,
  onAccept,
  onPropose,
  onCancelProposal,
  onInstall,
  demo = false,
  paused = false,
  onResume,
  checklist,
}: {
  // The logged-in brand's name for the greeting.
  accountName?: string
  // Recommended student groups.
  matches: Match[]
  // Every student group in the catalog: groups that signed up, for a member.
  groups: Match[]
  // The catalog has arrived, so an empty one is empty.
  loaded: boolean
  // Proposals student groups sent to this brand.
  requests: SponsorRequest[]
  sponsorships: Sponsorship[]
  // Groups this brand has proposed to.
  proposals: string[]
  // The groups' answers to this brand's offers.
  statuses: Partial<Record<string, RequestStatus>>
  // When the recommendations were last loaded.
  updatedAt: Date | null
  onNavigate: (label: NavLabel) => void
  onOpenDetail: (match: Match) => void
  onAccept: (request: SponsorRequest) => void
  onPropose: (match: Match) => void
  onCancelProposal: (match: Match) => void
  // 앱 다운로드 on the hero; absent inside the installed app.
  onInstall?: () => void
  // A visitor, shown the demo account's data: the hero says it is an example.
  demo?: boolean
  // The account's listing is out of the lists for now (내 정보): the hero
  // says so and shows it again with one press.
  paused?: boolean
  onResume?: () => void
  // A new member's checklist (components/ProfileChecklist.tsx), under the hero.
  checklist?: ReactNode
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
  // Bar scale with room past the best result and every goal marker.
  const roasScale =
    Math.max(100, ...results.map((result) => Math.max(result.roas, result.targetRoas))) * 1.1
  const catalog = groups.length > 0 ? groups : matches
  // No student group has signed up yet (a member sees only those that have).
  const noGroups = loaded && catalog.length === 0

  const currentStep = pending.length > 0 ? 1 : confirmed.length > 0 ? 2 : sponsorships.length > 0 ? 3 : 0
  const journey: JourneyStep[] = [
    {
      label: t("캠페인 등록"),
      status: t("브랜드 일정"),
      detail: t("예산과 원하는 노출, 함께하고 싶은 시기를 행사 일정에 적어 두세요."),
    },
    {
      label: t("받은 제안 검토"),
      status: pending.length > 0 ? t("검토 중 {count}건", { count: pending.length }) : t("새 제안 없음"),
      detail: t("학생단체의 제안을 보고 수락하면 바로 계약서가 만들어져요."),
    },
    {
      label: t("협찬 확정"),
      status: confirmed.length > 0 ? t("확정 {count}건", { count: confirmed.length }) : t("대기"),
      detail: t("확정한 협찬은 행사 일정에 들어가고, 할 일과 확인 방식은 계약서에서 정해요."),
    },
    {
      label: t("성과 분석"),
      status: sponsorships.length > 0 ? t("협찬 {count}건", { count: sponsorships.length }) : t("대기"),
      detail: t("쿠폰 · 방문으로 협찬마다 ROAS와 방문당 비용을 계산해요."),
    },
    { label: t("재집행"), status: t("대기"), detail: t("ROAS가 좋았던 단체에 다음 학기에도 먼저 제안해요.") },
  ]

  return (
    <div className="dashboard">
      <MeetingHero
        eyebrow={
          accountName
            ? t("반가워요, {name}", { name: accountName })
            : demo
              ? t("예시 화면 · {semester}", { semester: semesterLabel() })
              : semesterLabel()
        }
        lines={[t("감이 아닌 숫자로"), t("캠퍼스 협찬을"), t("집행하세요.")]}
        stats={[
          { value: t("{count}건", { count: pending.length }), label: t("검토할 제안") },
          { value: t("{count}건", { count: confirmed.length }), label: t("확정된 협찬") },
          { value: `${totals.roas}%`, label: t("평균 ROAS") },
        ]}
        insight={
          paused
            ? t("내 소개를 숨기는 중이에요.")
            : pending.length > 0
            ? t("새로 받은 협찬 제안 {count}건이 답을 기다리고 있어요.", { count: pending.length })
            : noGroups
              ? t("아직 가입한 학생단체가 없어요.")
              : t("캠페인과 잘 맞는 학생단체 {count}곳을 찾았어요.", { count: matches.length })
        }
        detail={
          paused
            ? t("학생단체의 목록에 보이지 않고 새 협찬 제안을 받지 않아요. 진행 중인 대화와 협찬은 그대로예요.")
            : noGroups && pending.length === 0
              ? t("브랜드 소개를 써 두고 캠페인을 행사 일정에 등록해 두세요. 학생단체가 가입하면 캠페인과 잘 맞는 순서로 추천해 드려요.")
              : t("학생 행사에서 쿠폰을 나누고, 매장에 온 손님까지 세어 협찬마다 ROAS로 보여 드려요.")
        }
        primary={
          paused && onResume
            ? { label: t("다시 보이게 하기"), onClick: onResume }
            : {
                label: pending.length > 0 ? t("받은 제안 확인하기") : t("학생단체 찾아보기"),
                onClick: () => onNavigate(pending.length > 0 ? "받은 제안" : "단체 찾기"),
              }
        }
        secondary={{ label: t("행사 일정 보기"), onClick: () => onNavigate("행사 일정") }}
        onInstall={onInstall}
      />

      {checklist}

      <section className="about-statement-section">
        <span className="eyebrow" data-reveal>
          About uniconnect
        </span>
        <RevealStatement
          lead={t("uniconnect는 브랜드와 대학 행사를 잇고,")}
          firstChip={<Icon name="link" size={18} />}
          muted={t("협찬 효과를 ROAS로 보여 주는 곳이에요")}
          secondChip={<Icon name="chart" size={18} />}
        />
      </section>

      <section className="inbox-section">
        <div className="section-head">
          <span className="eyebrow" data-reveal>
            Proposal Inbox
          </span>
          <RevealTitle as="h2" className="section-display">
            {pending.length > 0 ? t("답을 기다리는 제안") : t("새 제안을 기다리고 있어요")}
          </RevealTitle>
        </div>
        {pending.length === 0 ? (
          <p className="day-empty inbox-empty" data-reveal>
            {t("새로 받은 제안이 없어요. 단체 찾기에서 먼저 제안해 보세요.")}
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
                  <span className="pending-dday">{request.eventDate ? dDayLabel(request.eventDate) : t("협의 중")}</span>
                </div>
                {request.eventDate && <DateLine date={request.eventDate} />}
                <p className="pending-ask">
                  {t("요청 · {ask} · {people}", { ask: request.ask, people: request.people })}
                </p>
                <div className="pending-actions">
                  <button className="proposal-button accept" onClick={() => onAccept(request)} type="button">
                    {t("수락하기")}
                  </button>
                  <button className="proposal-cancel" onClick={() => onNavigate("받은 제안")} type="button">
                    {t("자세히 보기")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ValuePoints
        eyebrow="What We Do"
        heading={t("브랜드가 여기서 하는 일")}
        points={[
          {
            icon: "users",
            need: t("대학생 접점"),
            title: t("매장 가까운 캠퍼스 행사를 골라요"),
            text: t("행사 규모 · 시기 · 학교로 걸러 보고, 매장과 가까운 캠퍼스의 단체부터 일치율 순으로 만나요."),
            figure: t("{count}곳", { count: catalog.length }),
            figureLabel: t("함께할 수 있는 학생단체"),
            action: t("단체 찾기"),
            onClick: () => onNavigate("단체 찾기"),
          },
          {
            icon: "won",
            need: t("소액 · 측정형 협찬"),
            title: t("작게 시작해도 효과가 숫자로 남아요"),
            text: t("현금 · 현물 · 쿠폰 중에 고르고, 행사 QR과 매장 직원 확인으로 쿠폰 · 방문을 정확히 세요."),
            figure: t("{count}건", { count: confirmed.length }),
            figureLabel: nextConfirmed
              ? t("확정된 협찬 · 다음 일정 {date}", { date: shortDay(nextConfirmed.date) })
              : t("확정된 협찬 · 받은 제안 {count}건", { count: requests.length }),
            action: t("받은 제안 보기"),
            onClick: () => onNavigate("받은 제안"),
          },
          {
            icon: "chart",
            need: t("다음 예산 결정"),
            title: t("다시 쓸 곳을 데이터로 정해요"),
            text: t("협찬마다 ROAS와 방문당 비용을 보고, 상세 분석 리포트와 캠퍼스 포트폴리오로 어디에 다시 쓸지 정해요."),
            figure: `${totals.roas}%`,
            figureLabel: t("평균 ROAS · 누적 집행액 {spend}", { spend: fullWon(totals.spend) }),
            action: t("성과 분석 보기"),
            onClick: () => onNavigate("성과 분석"),
          },
        ]}
      />

      <section className="works-section">
        <div className="section-head centered">
          <span className="eyebrow" data-reveal>
            Smart Match
          </span>
          <RevealTitle as="h2" className="section-display">
            {t("추천 학생단체")}
          </RevealTitle>
          {updatedAt && (
            <small className="section-note" data-reveal>
              {t("오늘 {time} 업데이트", { time: `${pad(updatedAt.getHours())}:${pad(updatedAt.getMinutes())}` })}
            </small>
          )}
        </div>
        {noGroups && (
          <CatalogEmpty
            title={t("아직 추천할 학생단체가 없어요")}
            text={t("학생단체가 가입하면 캠페인과 잘 맞는 순서로 여기에 추천해 드려요. 제안은 다가오는 캠페인으로 보내지니, 행사 일정에 캠페인을 먼저 등록해 두세요.")}
            action={{ label: t("행사 일정 보기"), onClick: () => onNavigate("행사 일정") }}
          />
        )}
        <ul className="work-grid three">
          {matches.map((match, index) => (
            <li data-reveal key={match.id} style={delay(index * 0.09)}>
              <WorkCard
                match={match}
                meta={match.school ?? t(match.category)}
                onOpenDetail={() => onOpenDetail(match)}
                date={match.eventDate}
                tags={
                  <>
                    {match.eventName && <span className="tag-event">{match.eventName}</span>}
                    {shownTags(match).slice(0, 1).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </>
                }
              >
                <ProposalControl
                  done={proposals.includes(match.id)}
                  status={statuses[match.id]}
                  label={t("제안하기")}
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
        intro={t("캠페인 하나를 등록하면 제안 검토 · 확정 · 성과 분석이 차례로 이어져요.")}
        heading={t("지금은 ‘{step}’ 차례예요", { step: journey[currentStep].label })}
        steps={journey}
        current={currentStep}
        scheduleLabel={t("행사 일정 보기")}
        onOpenSchedule={() => onNavigate("행사 일정")}
      />

      <section className="results-section">
        <div className="section-head">
          <span className="eyebrow" data-reveal>
            Performance
          </span>
          <RevealTitle as="h2" className="section-display">
            {t("협찬마다 돌아온 만큼")}
          </RevealTitle>
        </div>
        <div className="results-grid">
          <div className="silver-panel" data-reveal>
            {results.length === 0 && (
              <p className="day-empty">{t("협찬이 끝나면 협찬마다 돌아온 만큼이 여기에 보여요.")}</p>
            )}
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
                    {t("{group} · {spend} 집행 · 목표 {target}%", {
                      group: result.groupName,
                      spend: formatWon(result.spend),
                      target: result.targetRoas,
                    })}
                    {result.met && ` ${t("달성")}`}
                  </small>
                </div>
              ))}
            </div>
            {results.length > 0 && (
              <p className="roas-legend">
                <b aria-hidden="true" /> {t("목표 ROAS")}
                <i aria-hidden="true" /> {t("목표 달성")}
              </p>
            )}
          </div>
          <div className="report-highlight" data-reveal style={delay(0.12)}>
            <div>
              <span>{t("평균 ROAS")}</span>
              <strong>{totals.roas}%</strong>
              <small>{t("학생단체와 함께한 협찬의 평균이에요.")}</small>
            </div>
            <div className="report-highlight-actions">
              <button className="pill white" onClick={() => onNavigate("성과 분석")} type="button">
                <span>{t("성과 분석 열기")}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

    </div>
  )
}
