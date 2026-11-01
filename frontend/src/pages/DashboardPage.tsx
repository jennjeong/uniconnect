import type { CSSProperties, ReactNode } from "react"

import { BrandMark } from "../components/BrandMark"
import { CatalogEmpty } from "../components/CatalogEmpty"
import { Icon } from "../components/Icon"
import { JourneyChain, type JourneyStep } from "../components/JourneyChain"
import { MeetingHero } from "../components/MeetingHero"
import { ProposalControl } from "../components/ProposalControl"
import { RevealStatement, RevealTitle } from "../components/RevealText"
import { ValuePoints } from "../components/ValuePoints"
import { WhyUniconnect } from "../components/WhyUniconnect"
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
  const next = nextEvent(events)
  const nextDay = next ? fromIsoDate(next.date) : undefined
  const candidates = brands.length > 0 ? brands : matches
  // No brand has signed up yet (a member sees only those that have).
  const noBrands = loaded && candidates.length === 0
  const strongCut = 80
  const strong = candidates.filter((match) => match.score >= strongCut).length
  const running = events.filter((event) => event.status !== "측정 완료").length

  // Where the next event stands in the sponsorship flow.
  const currentStep = !next ? 0 : next.status === "매칭 중" ? 1 : next.status === "집행 예정" ? 2 : 3
  const journey: JourneyStep[] = [
    {
      label: t("행사 등록"),
      status: next ? t("완료") : t("등록 전"),
      detail: t("행사를 자세히 적을수록 추천이 정확해져요."),
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
      detail: t("잘 맞는 브랜드 몇 곳에 먼저 제안해요."),
    },
    {
      label: t("집행 관리"),
      status: nextDay ? t("{date} 예정", { date: `${nextDay.getMonth() + 1}.${nextDay.getDate()}` }) : t("대기"),
      detail: t("받을 물품과 할 일을 계약서로 미리 정해요."),
    },
    { label: t("성과"), status: t("대기"), detail: t("QR만 띄우면 참여 · 쿠폰 · 방문이 저절로 세져요.") },
    { label: t("재협찬"), status: t("대기"), detail: t("리포트를 들고 다음 학기 협찬을 제안해요.") },
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
        lines={[t("협찬 구하느라"), t("밤새던 날은"), t("이제 끝.")]}
        stats={[
          { value: t("{count}곳", { count: candidates.length }), label: t("추천 브랜드") },
          { value: t("{count}건", { count: running }), label: t("진행 중 협찬") },
          { value: metrics.scans.toLocaleString(locale), label: t("누적 QR 참여") },
        ]}
        insight={
          paused
            ? t("내 소개를 숨기는 중이에요.")
            : noBrands
              ? t("아직 가입한 브랜드가 없어요.")
              : t("다가오는 행사와 잘 맞는 브랜드 {count}곳을 찾았어요.", { count: matches.length })
        }
        detail={
          paused
            ? t("새 제안은 받지 않아요. 진행 중인 대화와 협찬은 그대로예요.")
            : noBrands
              ? t("학교 앞 가게에 초대장을 보내 보세요. 가입하면 바로 추천해 드려요.")
              : t("잘 맞는 브랜드부터 제안해 보세요. 수락되면 계약부터 리포트까지 여기서 이어져요.")
        }
        primary={
          paused && onResume
            ? { label: t("다시 보이게 하기"), onClick: onResume }
            : { label: t("추천 매칭 확인하기"), onClick: () => onNavigate("추천 매칭") }
        }
        onInstall={onInstall}
      />

      {checklist}

      <section className="about-statement-section">
        <span className="eyebrow" data-reveal>
          About uniconnect
        </span>
        <RevealStatement
          lead={t("uniconnect는 학생단체와 브랜드를 잇고,")}
          firstChip={<Icon name="link" size={18} />}
          muted={t("협찬 성과를 숫자로 남기는 곳이에요")}
          secondChip={<Icon name="chart" size={18} />}
        />
      </section>

      <ValuePoints
        eyebrow="What We Do"
        heading={t("학생단체가 여기서 하는 일")}
        points={[
          {
            icon: "spark",
            need: t("협찬처 찾기"),
            title: t("제안할 곳부터 정해 드려요"),
            text: t("일치율로 골라 주고, 학교 앞 가게까지 보여 줘요."),
            figure: t("{count}곳", { count: candidates.length }),
            figureLabel: t("추천 브랜드 · 일치율 {cut}% 이상 {count}곳", { cut: strongCut, count: strong }),
            action: t("추천 매칭 보기"),
            onClick: () => onNavigate("추천 매칭"),
          },
          {
            icon: "file",
            need: t("준비와 증빙"),
            title: t("약속한 일을 계약서 하나로 챙겨요"),
            text: t("제안부터 계약서 · 증빙까지 한 화면에서 끝내요."),
            figure: t("{count}건", { count: running }),
            figureLabel:
              confirmedCount > 0
                ? t("진행 중 · 확정 {confirmed}건, 보낸 제안 {sent}건", { confirmed: confirmedCount, sent: proposals.length })
                : t("진행 중 · 보낸 제안 {sent}건", { sent: proposals.length }),
            action: t("내 행사 보기"),
            onClick: () => onNavigate("내 행사"),
          },
          {
            icon: "chart",
            need: t("성과 증명"),
            title: t("다음 제안서에 넣을 숫자가 남아요"),
            text: t("현장 숫자가 리포트로 쌓이고, 다음 브랜드를 설득해요."),
            figure: metrics.scans.toLocaleString(locale),
            figureLabel: t("누적 QR 참여 · 예상 협찬 가치 {value}", { value: report ? fullWon(report.sponsorValue) : "-" }),
            action: t("리포트 보기"),
            onClick: () => onNavigate("리포트"),
          },
        ]}
      />

      <WhyUniconnect
        heading={t("연결에서 끝나지 않고, 협찬을 끝까지 함께해요")}
        before={[
          t("아는 가게마다 메일과 DM을 돌리고 답을 기다려요"),
          t("말로 정한 약속이 행사 날 엇갈려요"),
          t("결과 보고는 사진 몇 장이 전부예요"),
          t("운영진이 바뀌면 협찬 기록도 같이 사라져요"),
        ]}
        after={[
          t("일치율과 거리로 제안할 브랜드부터 골라 드려요"),
          t("전자 계약서에 물품 · 할 일 · 확인 방식을 남겨요"),
          t("QR · 쿠폰 · 매장 방문이 저절로 집계돼 리포트가 돼요"),
          t("제안서와 협찬 기록이 다음 운영진에게 그대로 이어져요"),
        ]}
        pillars={[
          {
            icon: "spark",
            title: t("이유가 보이는 일치율"),
            text: t("다섯 가지 기준으로 점수를 매기고, 왜 맞는지 보여 줘요."),
            proof: t("추천 브랜드 {count}곳", { count: candidates.length }),
          },
          {
            icon: "pin",
            title: t("캠퍼스 앞 가게까지"),
            text: t("학교 앞 실제 가게를 찾고, 초대장까지 보내요."),
            proof: t("가까운 순 · 초대장"),
          },
          {
            icon: "scan",
            title: t("현장에서 세는 성과"),
            text: t("QR · 쿠폰 · 직원 PIN 확인으로, 약속한 방식대로만 세요."),
            proof: t("누적 QR 참여 {count}", { count: metrics.scans.toLocaleString(locale) }),
          },
          {
            icon: "file",
            title: t("숫자로 쓰는 다음 제안서"),
            text: t("숫자가 담긴 제안서를 만들고, 기록은 다음 운영진에게 넘겨요."),
            proof: t("제안서 PDF · 협찬 기록"),
          },
        ]}
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

      <JourneyChain
        intro={
          next
            ? t("다음 행사 ‘{name}’은 {date}이에요. 지금은 ‘{step}’ 단계예요.", {
                name: next.name,
                date: formatFullDate(next.date),
                step: journey[currentStep].label,
              })
            : t("행사 하나를 등록하면 제안 · 계약 · 측정 · 리포트가 차례로 이어져요.")
        }
        heading={t("지금은 ‘{step}’ 차례예요", { step: journey[currentStep].label })}
        steps={journey}
        current={currentStep}
        scheduleLabel={t("전체 일정 보기")}
        onOpenSchedule={() => onNavigate("내 행사")}
        tour={demo}
      />

      <section className="results-section">
        <div className="section-head">
          <span className="eyebrow" data-reveal>
            Last Event
          </span>
          <RevealTitle as="h2" className="section-display">
            {t("지난 행사가 남긴 숫자")}
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
                  : t("목표까지 남은 만큼은 리포트에서 봐요.")}
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

    </div>
  )
}
