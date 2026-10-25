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
import { locale, t } from "../i18n"
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
  onInstall,
  demo = false,
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
  // 앱 다운로드 on the hero; absent inside the installed app.
  onInstall?: () => void
  // A visitor, shown the demo account's data: the hero says it is an example.
  demo?: boolean
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
      label: t("행사 등록"),
      status: next ? t("완료") : t("등록 전"),
      detail: t("인원 · 일정 · 학과 구성과 노출할 자리를 알려 주세요."),
    },
    {
      label: t("매칭 · 제안"),
      status:
        confirmedCount > 0
          ? t("확정 {count}건", { count: confirmedCount })
          : proposals.length > 0
            ? t("제안 {count}건", { count: proposals.length })
            : next
              ? t("진행 중")
              : t("대기"),
      detail: t("일치율 높은 브랜드에 제안하고 답을 받아요."),
    },
    {
      label: t("집행 관리"),
      status: nextDay ? t("{date} 예정", { date: `${nextDay.getMonth() + 1}.${nextDay.getDate()}` }) : t("대기"),
      detail: t("협찬 조건과 받은 물품을 행사 전에 함께 확인해요."),
    },
    { label: t("성과 측정"), status: t("대기"), detail: t("행사 QR과 쿠폰으로 참여와 방문을 집계해요.") },
    { label: t("재협찬"), status: t("대기"), detail: t("쌓인 성과가 신뢰가 되어 다음 협찬으로 이어져요.") },
  ]

  const bars = [
    { label: t("QR 스캔"), value: metrics.scans },
    { label: t("쿠폰 수령"), value: metrics.coupons },
    { label: t("매장 방문"), value: metrics.visits },
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
        lines={[t("좋은 행사는,"), t("좋은 파트너를"), t("만날 때 커져요.")]}
        stats={[
          { value: t("{count}곳", { count: candidates.length }), label: t("추천 브랜드") },
          { value: t("{count}건", { count: running }), label: t("진행 중 협찬") },
          { value: metrics.scans.toLocaleString(locale), label: t("누적 QR 참여") },
        ]}
        insight={t("다가오는 행사와 잘 맞는 브랜드 {count}곳을 찾았어요.", { count: matches.length })}
        detail={t("학생단체와 브랜드가 맞닿는 곳에서 협찬이 시작돼요. 일치율이 높은 브랜드부터 제안해 보세요.")}
        primary={{ label: t("추천 매칭 확인하기"), onClick: () => onNavigate("추천 매칭") }}
        onInstall={onInstall}
      />

      <LogoMarquee
        label={t("함께할 수 있는 브랜드")}
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
          lead={t("학생단체와 브랜드를 잇고,")}
          firstChip={<Icon name="link" size={18} />}
          muted={t("협찬의 성과를 숫자로 증명해요")}
          secondChip={<Icon name="chart" size={18} />}
        />
      </section>

      <StatsBento
        stats={[
          {
            label: t("추천 브랜드"),
            value: t("{count}곳", { count: candidates.length }),
            note: t("일치율 {cut}% 이상 브랜드가 {count}곳이에요.", { cut: strongCut, count: strong }),
            onClick: () => onNavigate("추천 매칭"),
          },
          {
            label: t("진행 중 협찬"),
            value: t("{count}건", { count: running }),
            note:
              confirmedCount > 0
                ? t("“협찬 확정 {confirmed}건, 보낸 제안 {sent}건이에요.”", {
                    confirmed: confirmedCount,
                    sent: proposals.length,
                  })
                : t("“보낸 제안 {sent}건이 답을 기다리고 있어요.”", { sent: proposals.length }),
            onClick: () => onNavigate("내 행사"),
          },
          {
            label: t("예상 협찬 가치"),
            value: report ? fullWon(report.sponsorValue) : "-",
            note: t("현물 환산을 포함한 금액이에요."),
            onClick: () => onNavigate("리포트"),
          },
          {
            label: t("누적 QR 참여"),
            value: metrics.scans.toLocaleString(locale),
            note: t("참여율 {rate}%", { rate: report ? percent(metrics.scans, report.expectedAudience) : 0 }),
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
            Smart Match
          </span>
          <RevealTitle as="h2" className="section-display">
            {t("맞춤 추천 매칭")}
          </RevealTitle>
          {updatedAt && (
            <small className="section-note" data-reveal>
              {t("오늘 {time} 업데이트", { time: `${pad(updatedAt.getHours())}:${pad(updatedAt.getMinutes())}` })}
            </small>
          )}
        </div>
        <ul className="work-grid three">
          {matches.map((match, index) => (
            <li data-reveal key={match.id} style={delay(index * 0.09)}>
              <WorkCard match={match} meta={t(match.category)} onOpenDetail={() => onOpenDetail(match)}>
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
        intro={
          next
            ? t("다음 행사 ‘{name}’은 {date}이에요. 지금은 ‘{step}’ 단계예요.", {
                name: next.name,
                date: formatFullDate(next.date),
                step: journey[currentStep].label,
              })
            : t("행사 등록부터 재협찬까지, 한 번의 협찬이 다음 협찬으로 이어지도록 모든 단계를 한곳에서 관리해요.")
        }
        heading={t("내 협찬, 지금 여기까지 왔어요")}
        steps={journey}
        current={currentStep}
        scheduleLabel={t("전체 일정 보기")}
        onOpenSchedule={() => onNavigate("내 행사")}
      />

      <section className="results-section">
        <div className="section-head">
          <span className="eyebrow" data-reveal>
            Last Event
          </span>
          <RevealTitle as="h2" className="section-display">
            {t("함께 만든 지난 행사의 결과")}
          </RevealTitle>
        </div>
        <div className="results-grid">
          <div className="silver-panel results-chart" data-reveal>
            <div className="event-summary">
              <div>
                <strong>{report?.eventName ?? t("최근 행사")}</strong>
                <span>{report ? formatFullDate(report.eventDate) : ""}</span>
              </div>
              {report && <span className="complete-badge">{t(measureState(report))}</span>}
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
              <span>{t("추정 ROAS")}</span>
              <strong>{report ? roasText(report) : "-"}</strong>
              <small>
                {report && hasRoas(report) && report.roas >= 100
                  ? t("함께한 브랜드가 쓴 금액보다 더 많이 돌아왔어요.")
                  : t("목표까지 남은 만큼은 리포트에서 볼 수 있어요.")}
              </small>
            </div>
            <div className="report-highlight-actions">
              <button className="pill white" onClick={onOpenReport} type="button">
                <span>{t("상세 데이터")}</span>
              </button>
              <button className="underline-link light" onClick={() => onNavigate("리포트")} type="button">
                {t("리포트 페이지로")}
              </button>
            </div>
          </div>
        </div>
      </section>

      <FaqSection onOpenFaq={onOpenFaq} />
    </div>
  )
}
