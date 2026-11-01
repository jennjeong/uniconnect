import type { CSSProperties, ReactNode } from "react"

import { AnimatedNumber } from "../components/AnimatedNumber"
import { CatalogEmpty } from "../components/CatalogEmpty"
import { Icon, type IconName } from "../components/Icon"
import { Lines } from "../components/Lines"
import { Pill } from "../components/Pill"
import { ProposalControl } from "../components/ProposalControl"
import { WorkCard } from "../components/WorkCard"
import { locale, t } from "../i18n"
import { daysUntil, formatFullDate, nextEvent, semesterLabel } from "../lib/date"
import { hasRoas, roasText } from "../lib/kpis"
import { measureState } from "../lib/measurements"
import { fullWon } from "../lib/sponsorships"
import { LayersGradient } from "../scenes/LayersGradient"
import { ANTIPODE } from "../scenes/shaders"
import type { EventItem, Match, Metrics, NavLabel, Report, RequestStatus } from "../types"

const pad = (value: number) => String(value).padStart(2, "0")

const delay = (seconds: number) => ({ "--reveal-delay": `${seconds}s` }) as CSSProperties

// Dashboard for student groups, laid out the way Toss lays out a home: what
// the group needs to do now first, then plain numbers, then the brands to
// pitch and the last event's results. One question per block, one main
// action per block, every row a button that goes where it says. The deep
// blue Antipode card for the next event keeps uniconnect's own look.
export function DashboardPage({
  accountName,
  matches,
  brands,
  loaded,
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
  onInstall,
  demo = false,
  paused = false,
  onResume,
  checklist,
}: {
  // The logged-in group's name for the greeting.
  accountName?: string
  matches: Match[]
  // Every brand in the catalog: brands that signed up, for a member.
  brands: Match[]
  // The catalog has arrived, so an empty one is empty.
  loaded: boolean
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
  // 앱 다운로드 on the next-event card; absent inside the installed app.
  onInstall?: () => void
  // A visitor, shown the demo account's data: the greeting says it is an example.
  demo?: boolean
  // The account's listing is out of the lists for now (내 정보): the greeting
  // says so and shows it again with one press.
  paused?: boolean
  onResume?: () => void
  // A new member's checklist (components/ProfileChecklist.tsx), under the card.
  checklist?: ReactNode
}) {
  const next = nextEvent(events)
  const dDay = next ? daysUntil(next.date) : 0
  const candidates = brands.length > 0 ? brands : matches
  // No brand has signed up yet (a member sees only those that have).
  const noBrands = loaded && candidates.length === 0
  const strongCut = 80
  const strong = candidates.filter((match) => match.score >= strongCut).length
  const running = events.filter((event) => event.status !== "측정 완료").length

  // Where the next event stands in the sponsorship flow.
  const currentStep = !next ? 0 : next.status === "매칭 중" ? 1 : next.status === "집행 예정" ? 2 : 3
  const steps = [t("행사 등록"), t("매칭 · 제안"), t("집행 관리"), t("성과"), t("재협찬")]

  const insight = paused
    ? t("내 소개를 숨기는 중이에요.")
    : noBrands
      ? t("아직 가입한 브랜드가 없어요.")
      : t("다가오는 행사와 잘 맞는 브랜드 {count}곳을 찾았어요.", { count: matches.length })

  const summary: { label: string; value: string; nav: NavLabel }[] = [
    { label: t("추천 브랜드"), value: t("{count}곳", { count: candidates.length }), nav: "추천 매칭" },
    { label: t("진행 중 협찬"), value: t("{count}건", { count: running }), nav: "내 행사" },
    { label: t("누적 QR 참여"), value: metrics.scans.toLocaleString(locale), nav: "리포트" },
  ]

  // What to do now, each with the figure that says why.
  const todos: { icon: IconName; title: string; text: string; figure: string; onClick: () => void }[] = [
    {
      icon: "spark",
      title: t("잘 맞는 브랜드에 제안하기"),
      text: t("추천 브랜드 · 일치율 {cut}% 이상 {count}곳", { cut: strongCut, count: strong }),
      figure: t("{count}곳", { count: candidates.length }),
      onClick: () => onNavigate("추천 매칭"),
    },
    {
      icon: "file",
      title: t("약속한 일을 계약서로 챙기기"),
      text:
        confirmedCount > 0
          ? t("진행 중 · 확정 {confirmed}건, 보낸 제안 {sent}건", { confirmed: confirmedCount, sent: proposals.length })
          : t("진행 중 · 보낸 제안 {sent}건", { sent: proposals.length }),
      figure: t("{count}건", { count: running }),
      onClick: () => onNavigate("내 행사"),
    },
    {
      icon: "chart",
      title: t("다음 제안서에 넣을 숫자 보기"),
      text: t("누적 QR 참여 · 예상 협찬 가치 {value}", { value: report ? fullWon(report.sponsorValue) : "-" }),
      figure: report ? roasText(report) : "-",
      onClick: () => onNavigate("리포트"),
    },
  ]

  const bars = [
    { label: t("QR 스캔"), value: metrics.scans, target: report?.targets.scans },
    { label: t("쿠폰 수령"), value: metrics.coupons, target: report?.targets.coupons },
    { label: t("매장 방문"), value: metrics.visits, target: report?.targets.visits },
  ]

  return (
    <div className="dashboard dash">
      <header className="dash-greeting">
        <span className="dash-eyebrow">
          {demo && <b>{t("예시 화면")}</b>}
          {semesterLabel()}
        </span>
        <h1>{accountName ? t("반가워요, {name}", { name: accountName }) : t("오늘의 협찬 현황이에요")}</h1>
        <p className="insight-title">{insight}</p>
        {paused && onResume && (
          <Pill onClick={onResume} variant="primary">
            {t("다시 보이게 하기")}
          </Pill>
        )}
      </header>

      <section aria-label={t("다음 행사")} className="dash-next">
        <LayersGradient shader={ANTIPODE} />
        <div className="dash-next-body">
          {next ? (
            <>
              <span className="dash-next-label">
                {t("다음 행사")}
                <b>{dDay === 0 ? "D-DAY" : `D-${dDay}`}</b>
              </span>
              <h2>{next.name}</h2>
              <p className="dash-next-date">{formatFullDate(next.date)}</p>
            </>
          ) : (
            <>
              <span className="dash-next-label">{t("다음 행사")}</span>
              <h2>{t("아직 등록한 행사가 없어요")}</h2>
              <p className="dash-next-date">
                <Lines text={t("행사 하나를 등록하면 제안 · 계약 · 측정 · 리포트가 차례로 이어져요.")} />
              </p>
            </>
          )}
          <ol aria-label={t("협찬 단계")} className="dash-steps">
            {steps.map((step, index) => (
              <li
                aria-current={index === currentStep ? "step" : undefined}
                className={index < currentStep ? "done" : index === currentStep ? "current" : undefined}
                key={step}
              >
                <i aria-hidden="true">{index < currentStep ? <Icon name="check" size={12} /> : index + 1}</i>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <div className="dash-next-actions">
            <Pill arrow="right" onClick={() => onNavigate("추천 매칭")} variant="white">
              {t("추천 매칭 확인하기")}
            </Pill>
            <button className="dash-text-link" onClick={() => onNavigate("내 행사")} type="button">
              {t("전체 일정 보기")}
            </button>
            {onInstall && (
              <button className="dash-text-link" onClick={onInstall} type="button">
                <Icon name="download" size={15} />
                {t("앱 다운로드")}
              </button>
            )}
          </div>
        </div>
      </section>

      {checklist}

      <ul aria-label={t("한눈에 보기")} className="dash-summary">
        {summary.map((item, index) => (
          <li data-reveal key={item.label} style={delay(index * 0.06)}>
            <button onClick={() => onNavigate(item.nav)} type="button">
              <span>{item.label}</span>
              <strong>
                <AnimatedNumber value={item.value} />
              </strong>
              <Icon name="chevron" size={18} />
            </button>
          </li>
        ))}
      </ul>

      <section aria-labelledby="dash-todo" className="dash-section">
        <h2 className="dash-title" id="dash-todo">
          {t("지금 할 일")}
        </h2>
        <ul className="dash-list">
          {todos.map((todo, index) => (
            <li data-reveal key={todo.title} style={delay(index * 0.06)}>
              <button onClick={todo.onClick} type="button">
                <i aria-hidden="true">
                  <Icon name={todo.icon} size={20} />
                </i>
                <span className="dash-row-copy">
                  <strong>{todo.title}</strong>
                  <small>{todo.text}</small>
                </span>
                <b>{todo.figure}</b>
                <Icon name="chevron" size={18} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="dash-matches" className="dash-section" id="matches">
        <div className="dash-section-head">
          <h2 className="dash-title" id="dash-matches">
            {t("맞춤 추천 매칭")}
          </h2>
          {updatedAt && (
            <small>{t("오늘 {time} 업데이트", { time: `${pad(updatedAt.getHours())}:${pad(updatedAt.getMinutes())}` })}</small>
          )}
          <button className="dash-more" onClick={() => onNavigate("추천 매칭")} type="button">
            {t("전체 보기")}
            <Icon name="chevron" size={16} />
          </button>
        </div>
        {noBrands && (
          <CatalogEmpty
            title={t("아직 추천할 브랜드가 없어요")}
            text={t("가까운 순에서 학교 앞 가게에 초대장을 보내 보세요. 가입하면 여기에 추천해 드려요.")}
            action={{ label: t("추천 매칭 열기"), onClick: () => onNavigate("추천 매칭") }}
          />
        )}
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

      <section aria-labelledby="dash-results" className="dash-section">
        <div className="dash-section-head">
          <h2 className="dash-title" id="dash-results">
            {t("지난 행사가 남긴 숫자")}
          </h2>
          <button className="dash-more" onClick={() => onNavigate("리포트")} type="button">
            {t("리포트 페이지로")}
            <Icon name="chevron" size={16} />
          </button>
        </div>
        <div className="dash-results" data-reveal>
          <div className="dash-results-head">
            <div>
              <strong>{report?.eventName ?? t("최근 행사")}</strong>
              <span>{report ? formatFullDate(report.eventDate) : ""}</span>
            </div>
            {report && <span className="complete-badge">{t(measureState(report))}</span>}
          </div>
          <div className="dash-results-body">
            <ul className="dash-bars">
              {bars.map((bar) => {
                const top = Math.max(1, bar.value, bar.target ?? 0)
                return (
                  <li key={bar.label}>
                    <span>{bar.label}</span>
                    <strong>{bar.value.toLocaleString(locale)}</strong>
                    <i aria-hidden="true">
                      <em style={{ width: `${(bar.value / top) * 100}%` }} />
                      {bar.target !== undefined && <b style={{ left: `${(bar.target / top) * 100}%` }} />}
                    </i>
                    {bar.target !== undefined && <small>{t("목표 {target}", { target: bar.target })}</small>}
                  </li>
                )
              })}
            </ul>
            <div className="dash-roas">
              <span>{t("추정 ROAS")}</span>
              <strong>{report ? roasText(report) : "-"}</strong>
              <small>
                {report && hasRoas(report) && report.roas >= 100
                  ? t("함께한 브랜드가 쓴 금액보다 더 많이 돌아왔어요.")
                  : t("목표까지 남은 만큼은 리포트에서 봐요.")}
              </small>
              <Pill onClick={onOpenReport} variant="primary">
                {t("상세 데이터")}
              </Pill>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
