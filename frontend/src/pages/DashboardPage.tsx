import type { ReactNode } from "react"

import { BrandMark } from "../components/BrandMark"
import { CatalogEmpty } from "../components/CatalogEmpty"
import { Icon, type IconName } from "../components/Icon"
import { ProposalControl } from "../components/ProposalControl"
import { locale, t } from "../i18n"
import { daysUntil, formatFullDate, nextEvent, semesterLabel } from "../lib/date"
import { hasRoas, roasText } from "../lib/kpis"
import { measureState } from "../lib/measurements"
import { fullWon } from "../lib/sponsorships"
import type { EventItem, Match, Metrics, NavLabel, Report, RequestStatus } from "../types"

// Dashboard for student groups, laid out like Toss's app home: one narrow
// column of white cards on a gray page, each card one question with plain
// rows under it. The next event is a sentence with the steps as a thin bar
// and one wide button; figures are small, side by side in one card; the
// brands to pitch are rows with their mark, offer and match. The deep blue
// of the next-event card and the silver of the rows keep uniconnect's look.
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
  // When the matches were last loaded (not shown on this layout).
  updatedAt: Date | null
  onNavigate: (label: NavLabel) => void
  onOpenDetail: (match: Match) => void
  onPropose: (match: Match) => void
  onCancelProposal: (match: Match) => void
  onOpenReport: () => void
  // 앱 다운로드; absent inside the installed app.
  onInstall?: () => void
  // A visitor, shown the demo account's data: the greeting says it is an example.
  demo?: boolean
  // The account's listing is out of the lists for now (내 정보): the greeting
  // says so and shows it again with one press.
  paused?: boolean
  onResume?: () => void
  // A new member's checklist (components/ProfileChecklist.tsx), under the event.
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

  const figures: { label: string; value: string; nav: NavLabel }[] = [
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
      <header className="dash-hello">
        <span>
          {demo && <b>{t("예시 화면")}</b>}
          {accountName ? t("반가워요, {name}", { name: accountName }) : semesterLabel()}
        </span>
        <h1 className="insight-title">{insight}</h1>
        {paused && onResume && (
          <button className="dash-button small" onClick={onResume} type="button">
            {t("다시 보이게 하기")}
          </button>
        )}
      </header>

      <section aria-label={t("다음 행사")} className="dash-card dash-event">
        {next ? (
          <>
            <span className="dash-event-label">
              {t("다음 행사")} · {formatFullDate(next.date)}
            </span>
            <h2>
              {dDay === 0
                ? t("오늘은 ‘{name}’ 날이에요", { name: next.name })
                : t("‘{name}’까지 {days}일 남았어요", { name: next.name, days: dDay })}
            </h2>
            <p>{t("지금은 ‘{step}’ 단계예요", { step: steps[currentStep] })}</p>
          </>
        ) : (
          <>
            <span className="dash-event-label">{t("다음 행사")}</span>
            <h2>{t("아직 등록한 행사가 없어요")}</h2>
            <p>{t("행사 하나를 등록하면 제안 · 계약 · 측정 · 리포트가 차례로 이어져요.")}</p>
          </>
        )}
        <ol aria-label={t("협찬 단계")} className="dash-steps">
          {steps.map((step, index) => (
            <li
              aria-current={index === currentStep ? "step" : undefined}
              className={index < currentStep ? "done" : index === currentStep ? "current" : undefined}
              key={step}
            >
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <button className="dash-button" onClick={() => onNavigate("추천 매칭")} type="button">
          {t("추천 매칭 확인하기")}
        </button>
        <div className="dash-event-links">
          <button onClick={() => onNavigate("내 행사")} type="button">
            {t("전체 일정 보기")}
          </button>
          {onInstall && (
            <button onClick={onInstall} type="button">
              {t("앱 다운로드")}
            </button>
          )}
        </div>
      </section>

      {checklist}

      <ul aria-label={t("한눈에 보기")} className="dash-card dash-figures">
        {figures.map((figure) => (
          <li key={figure.label}>
            <button onClick={() => onNavigate(figure.nav)} type="button">
              <span>{figure.label}</span>
              <strong>{figure.value}</strong>
            </button>
          </li>
        ))}
      </ul>

      <section aria-labelledby="dash-todo" className="dash-card">
        <h2 className="dash-title" id="dash-todo">
          {t("지금 할 일")}
        </h2>
        <ul className="dash-rows">
          {todos.map((todo) => (
            <li key={todo.title}>
              <button className="dash-row" onClick={todo.onClick} type="button">
                <i aria-hidden="true" className="dash-icon">
                  <Icon name={todo.icon} size={20} />
                </i>
                <span className="dash-row-copy">
                  <strong>{todo.title}</strong>
                  <small>{todo.text}</small>
                </span>
                <b>{todo.figure}</b>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="dash-matches" className="dash-card" id="matches">
        <h2 className="dash-title" id="dash-matches">
          {t("맞춤 추천 매칭")}
        </h2>
        {noBrands ? (
          <CatalogEmpty
            title={t("아직 추천할 브랜드가 없어요")}
            text={t("가까운 순에서 학교 앞 가게에 초대장을 보내 보세요. 가입하면 여기에 추천해 드려요.")}
            action={{ label: t("추천 매칭 열기"), onClick: () => onNavigate("추천 매칭") }}
          />
        ) : (
          <ul className="dash-rows">
            {matches.map((match) => (
              <li className="dash-brand" key={match.id}>
                <button className="dash-row" onClick={() => onOpenDetail(match)} type="button">
                  <BrandMark match={match} />
                  <span className="dash-row-copy">
                    <strong>{match.name}</strong>
                    <small>
                      {t(match.category)} · {match.offer}
                    </small>
                  </span>
                  <b>{t("{score}% 일치", { score: match.score })}</b>
                </button>
                <ProposalControl
                  done={proposals.includes(match.id)}
                  status={statuses[match.id]}
                  label={t("제안하기")}
                  className="proposal-button dash-propose"
                  onPropose={() => onPropose(match)}
                  onCancel={() => onCancelProposal(match)}
                />
              </li>
            ))}
          </ul>
        )}
        <button className="dash-more" onClick={() => onNavigate("추천 매칭")} type="button">
          {t("전체 보기")}
        </button>
      </section>

      <section aria-labelledby="dash-results" className="dash-card">
        <h2 className="dash-title" id="dash-results">
          {t("지난 행사가 남긴 숫자")}
        </h2>
        <div className="dash-last">
          <span>
            {report?.eventName ?? t("최근 행사")}
            {report && ` · ${formatFullDate(report.eventDate)}`}
          </span>
          {report && <span className="complete-badge">{t(measureState(report))}</span>}
        </div>
        <button className="dash-roas" onClick={onOpenReport} type="button">
          <span>{t("추정 ROAS")}</span>
          <strong>{report ? roasText(report) : "-"}</strong>
          <small>
            {report && hasRoas(report) && report.roas >= 100
              ? t("함께한 브랜드가 쓴 금액보다 더 많이 돌아왔어요.")
              : t("목표까지 남은 만큼은 리포트에서 봐요.")}
          </small>
        </button>
        <ul className="dash-bars">
          {bars.map((bar) => {
            const top = Math.max(1, bar.value, bar.target ?? 0)
            return (
              <li key={bar.label}>
                <span>{bar.label}</span>
                <i aria-hidden="true">
                  <em style={{ width: `${(bar.value / top) * 100}%` }} />
                  {bar.target !== undefined && <b style={{ left: `${(bar.target / top) * 100}%` }} />}
                </i>
                <strong>
                  {bar.value.toLocaleString(locale)}
                  {bar.target !== undefined && <small> / {bar.target.toLocaleString(locale)}</small>}
                </strong>
              </li>
            )
          })}
        </ul>
        <button className="dash-more" onClick={() => onNavigate("리포트")} type="button">
          {t("리포트 페이지로")}
        </button>
      </section>
    </div>
  )
}
