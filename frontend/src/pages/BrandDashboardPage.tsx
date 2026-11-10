import { useState, type CSSProperties, type ReactNode } from "react"

import { BrandMark } from "../components/BrandMark"
import { CatalogEmpty } from "../components/CatalogEmpty"
import { DashSectionHead, DashboardTop, type DashboardFact } from "../components/DashboardTop"
import { DateLine } from "../components/DateLine"
import { Icon } from "../components/Icon"
import { JourneyChain, type JourneyStep } from "../components/JourneyChain"
import { MeetingHero } from "../components/MeetingHero"
import { Presence } from "../components/Presence"
import { ProposalControl } from "../components/ProposalControl"
import { RevealStatement, RevealTitle } from "../components/RevealText"
import { ValuePoints } from "../components/ValuePoints"
import { WhyUniconnect } from "../components/WhyUniconnect"
import { WorkBoard, type WorkRow } from "../components/WorkBoard"
import { WorkCard } from "../components/WorkCard"
import { t, tc } from "../i18n"
import { dDayLabel, formatFullDate, nextEvent, semesterLabel, shortDay, todayIso } from "../lib/date"
import { shownTags } from "../lib/distance"
import { formatWon } from "../lib/kpis"
import { AcceptModal } from "../modals/AcceptModal"
import { roasText, roasVerdict } from "../lib/roasLabels"
import { upcomingAwaitingContract, upcomingSponsorships } from "../lib/brandSchedule"
import { analyzeSponsorships, fullWon } from "../lib/sponsorships"
import type { AnswerResult, EventItem, Match, NavLabel, RequestStatus, SentProposal, SponsorRequest, Sponsorship } from "../types"
import type { OpenTasks } from "../api"

const pad = (value: number) => String(value).padStart(2, "0")

const delay = (seconds: number) => ({ "--reveal-delay": `${seconds}s` }) as CSSProperties

// 브랜드 대시보드. 학생 쪽과 같은 세 흐름이다: 브랜드가 캠퍼스를 만나는
// 곳(히어로와 기다리는 제안), 협찬을 이어 가는 것(체인 위의 단계), 함께 만든
// 것(총계와 협찬별 ROAS).
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
  onOpenInbox,
  onOpenDetail,
  onAccept,
  onPropose,
  onCancelProposal,
  onInstall,
  demo = false,
  paused = false,
  onResume,
  checklist,
  onOpenAgreements,
  sent = [],
  openTasks,
  onOpenAgreement,
  campaigns = [],
  confirmedCount,
}: {
  // 인사말에 쓰는, 로그인한 브랜드의 이름.
  accountName?: string
  // 추천 학생단체.
  matches: Match[]
  // 카탈로그의 모든 학생단체. 회원에게는 가입한 단체만.
  groups: Match[]
  // 카탈로그가 도착했으므로 비어 있으면 정말 비어 있다.
  loaded: boolean
  // 학생단체가 이 브랜드에 보낸 제안.
  requests: SponsorRequest[]
  sponsorships: Sponsorship[]
  // 이 브랜드가 제안한 단체.
  proposals: string[]
  // 이 브랜드의 제안에 대한 단체의 답.
  statuses: Partial<Record<string, RequestStatus>>
  // 추천을 마지막으로 불러온 때.
  updatedAt: Date | null
  onNavigate: (label: NavLabel) => void
  // 받은편지함의 받은 제안 쪽이나 보낸 제안 쪽(업무 보드의 답할 제안 · 보낸 제안 답변 대기).
  onOpenInbox?: (box: "received" | "sent") => void
  onOpenDetail: (match: Match) => void
  onAccept: (request: SponsorRequest) => Promise<AnswerResult>
  onPropose: (match: Match) => void
  onCancelProposal: (match: Match) => void
  // 히어로의 앱 다운로드. 설치된 앱 안에서는 없다.
  onInstall?: () => void
  // 방문자에게는 데모 계정의 데이터를 보여 주며, 히어로가 예시라고 알린다.
  demo?: boolean
  // 계정의 리스팅이 당분간 목록에서 빠져 있다(내 정보). 히어로가 그렇게 알리고
  // 한 번 누르면 다시 보이게 한다.
  paused?: boolean
  onResume?: () => void
  // 히어로 아래의 새 회원 체크리스트(components/ProfileChecklist.tsx).
  checklist?: ReactNode
  // 계약서 목록. 확인할 계약서가 있으면 첫 화면의 '지금 할 일'이 된다.
  onOpenAgreements?: () => void
  // 이 계정이 보낸 제안(업무 보드의 답변 대기와 계약 확인 대기).
  sent?: SentProposal[]
  // 자기 쪽에 남은 계약서 할 일(App이 /api/proposals에서 받는다).
  openTasks?: OpenTasks
  // 계약서 하나를 연다(업무 보드에서 그런 계약서가 하나뿐일 때).
  onOpenAgreement?: (id: string) => void
  // 브랜드 자신의 캠페인(회원 첫머리의 '운영 중 캠페인').
  campaigns?: EventItem[]
  // 양쪽이 계약서를 확인한 협찬(서버가 센 것). 없으면 받은 제안에서 센다.
  confirmedCount?: number
}) {
  const pending = requests.filter((request) => request.status === "검토 중")
  // 로그인한 회원의 첫 화면: 인사, 다음 일정, 지금 할 일(답할 제안 → 확인할 계약서).
  const member = Boolean(accountName) && !demo
  // 내가 확인할 계약서(받은 제안과 보낸 제안 모두, 내 쪽이 아직 확인하지 않은 것). 단체만
  // 확인하면 되는 계약서는 '상대 확인 대기'로 따로 센다. 방문자의 예시는 받은 제안에서 센다.
  const toConfirm =
    openTasks?.toConfirm ?? requests.filter((request) => request.status === "수락" && request.contract === "waiting").length
  const openContract = (count: number, id?: string) =>
    count === 1 && id && onOpenAgreement ? onOpenAgreement(id) : onOpenAgreements ? onOpenAgreements() : onNavigate("받은 제안")
  // 다가오는 협찬 일정: 받은 제안과 브랜드가 먼저 보낸 제안 중 양쪽이 계약서를 확인한
  // 것(lib/brandSchedule.ts). 건수와 가장 가까운 일정이 같은 목록에서 나온다. 수락했지만
  // 계약서 확인이 남은 건은 일정에 넣지 않고 계약 대기로 안내한다.
  const schedule = upcomingSponsorships(requests, sent, campaigns)
  const upcoming = schedule[0]
  const awaitingContract = upcomingAwaitingContract(requests, sent, campaigns).length
  const memberHero = member && !paused
  // 업무 보드(회원): 실제 데이터의 건수만. 내가 할 일, 상대를 기다리는 일, 일정 · 결과로
  // 나눠 단체만 할 일이 남은 것을 내 급한 일처럼 보이지 않는다.
  const sentWaiting = sent.filter((item) => !item.noInbox && item.status === "검토 중").length
  const awaitingPartner = openTasks?.awaitingPartner ?? 0
  const resultRows = analyzeSponsorships(sponsorships).rows
  const resultsDone = resultRows.filter((row) => row.state === "done").length
  const resultsCounting = resultRows.filter((row) => row.state === "counting").length
  const workRows: WorkRow[] = [
    {
      key: "review",
      kind: "mine",
      label: t("검토할 제안"),
      count: pending.length,
      detail: pending.length > 0 ? t("조건을 보고 수락하거나 거절해요") : t("새로 온 제안이 없어요"),
      onOpen: () => (onOpenInbox ? onOpenInbox("received") : onNavigate("받은 제안")),
    },
    {
      key: "contract",
      kind: "mine",
      label: t("내가 확인할 계약서"),
      count: toConfirm,
      detail: toConfirm > 0 ? t("확인할 때 성사 수수료를 결제해요") : t("확인할 계약서가 없어요"),
      onOpen: () => openContract(toConfirm, openTasks?.confirmId),
    },
    {
      key: "tasks",
      kind: "mine",
      label: t("증빙 남은 할 일"),
      count: openTasks?.tasks ?? 0,
      detail:
        openTasks && openTasks.tasks > 0
          ? t("계약서 {count}건에서 끝내고 증빙을 붙여요", { count: openTasks.agreements })
          : t("남은 할 일이 없어요"),
      onOpen: () => openContract(openTasks?.agreements ?? 0, openTasks?.taskId),
    },
    {
      key: "sent",
      kind: "waiting",
      label: t("보낸 제안 답변 대기"),
      count: sentWaiting,
      detail: sentWaiting > 0 ? t("단체의 답을 기다려요") : t("답을 기다리는 보낸 제안이 없어요"),
      onOpen: () => (onOpenInbox ? onOpenInbox("sent") : onNavigate("받은 제안")),
    },
    {
      key: "partner",
      kind: "waiting",
      label: t("상대 확인 대기"),
      count: awaitingPartner,
      detail: awaitingPartner > 0 ? t("우리는 확인했고 단체의 확인을 기다려요") : t("상대를 기다리는 계약서가 없어요"),
      onOpen: () => (onOpenAgreements ? onOpenAgreements() : onNavigate("받은 제안")),
    },
    {
      key: "schedule",
      kind: "info",
      label: t("다가오는 협찬 일정"),
      count: schedule.length,
      detail: upcoming
        ? `${upcoming.partner} · ${upcoming.eventName} · ${dDayLabel(upcoming.date)}`
        : awaitingContract > 0
          ? t("계약서 확인을 기다리는 {count}건은 양쪽이 확인하면 일정에 들어가요", { count: awaitingContract })
          : t("다가오는 협찬이 없어요"),
      onOpen: () =>
        schedule.length === 0 && awaitingContract > 0 && onOpenAgreements ? onOpenAgreements() : onNavigate("행사 일정"),
    },
    {
      key: "results",
      kind: "info",
      label: t("결과가 나온 협찬"),
      count: resultsDone,
      detail:
        resultsCounting > 0
          ? t("{count}건은 아직 방문을 세는 중이에요", { count: resultsCounting })
          : resultsDone > 0
            ? t("돌아온 만큼을 성과 분석에서 봐요")
            : t("끝난 협찬이 아직 없어요"),
      onOpen: () => onNavigate("성과 분석"),
    },
  ]
  // 확정은 수락이 아니라 양쪽이 계약서를 확인한 것이다.
  const accepted = requests.filter((request) => request.status === "수락")
  const confirmed = accepted.filter((request) => request.contract === "confirmed")
  const confirmedTotal = confirmedCount ?? confirmed.length
  // 다음 확정 일정은 업무 보드의 '다가오는 협찬 일정'과 같은 목록에서 고른다.
  const nextConfirmed = upcoming
  const liveCampaigns = campaigns.filter((campaign) => (campaign.endDate ?? campaign.date) >= todayIso())
  const nextCampaign = nextEvent(liveCampaigns)
  const topFacts: DashboardFact[] = [
    {
      label: t("운영 중 캠페인"),
      value: t("{count}개", { count: liveCampaigns.length }),
      note: nextCampaign ? `${nextCampaign.name} · ${formatFullDate(nextCampaign.date)}` : t("캠페인을 등록하면 단체 추천이 정확해져요"),
    },
    {
      label: t("확정된 협찬"),
      value: t("{count}건", { count: confirmedTotal }),
      note: upcoming
        ? t("다음 · {name} {dday}", { name: upcoming.eventName, dday: dDayLabel(upcoming.date) })
        : t("양쪽이 계약서를 확인한 것"),
    },
  ]
  // 0원·집계 중인 협찬은 목표와 견주지 않는다(lib/sponsorships.ts roasState).
  const { totals, rows: results, roasScale } = analyzeSponsorships(sponsorships)
  const totalRoas = totals.roasMissing ? "—" : `${totals.roas}%`
  const catalog = groups.length > 0 ? groups : matches
  // 아직 가입한 학생단체가 없다(회원은 가입한 단체만 본다).
  const noGroups = loaded && catalog.length === 0

  const currentStep = pending.length > 0 ? 1 : confirmed.length > 0 ? 2 : sponsorships.length > 0 ? 3 : 0
  const journey: JourneyStep[] = [
    {
      label: t("캠페인 등록"),
      status: t("브랜드 일정"),
      detail: t("예산과 시기를 캠페인으로 적어 두세요."),
    },
    {
      label: t("받은 제안 검토"),
      status: pending.length > 0 ? t("검토 중 {count}건", { count: pending.length }) : t("새 제안 없음"),
      detail: t("제안을 수락하면 바로 계약서가 생겨요."),
    },
    {
      label: t("협찬 확정"),
      status: confirmed.length > 0 ? t("확정 {count}건", { count: confirmed.length }) : t("대기"),
      detail: t("확정한 협찬은 일정에 들어가고, 할 일은 계약서로 정해요."),
    },
    {
      label: t("성과 분석"),
      status: sponsorships.length > 0 ? t("협찬 {count}건", { count: sponsorships.length }) : t("대기"),
      detail: t("쿠폰 · 방문으로 협찬마다 ROAS를 계산해요."),
    },
    { label: t("재집행"), status: t("대기"), detail: t("ROAS가 좋았던 단체에 다음 학기에도 먼저 제안해요.") },
  ]

  // 수락은 확인창을 거친다(modals/AcceptModal.tsx).
  const [accepting, setAccepting] = useState<SponsorRequest | null>(null)

  return (
    <div className="dashboard">
      {member ? (
        <DashboardTop
          who={t("{name} · 브랜드", { name: accountName! })}
          title={
            paused
              ? t("내 소개를 숨기는 중이에요.")
              : pending.length > 0
                ? t("새로 받은 협찬 제안 {count}건이 답을 기다리고 있어요.", { count: pending.length })
                : toConfirm > 0
                  ? t("내가 확인할 계약서가 {count}건 있어요.", { count: toConfirm })
                  : t("지금 바로 할 일은 없어요.")
          }
          lead={
            paused
              ? t("새 제안은 받지 않아요. 진행 중인 대화와 협찬은 그대로예요.")
              : pending.length > 0
                ? t("조건을 보고 수락하거나 거절해 주세요.")
                : toConfirm > 0
                  ? t("양쪽이 계약서를 확인해야 협찬이 확정돼요. 수수료는 확인할 때 결제해요.")
                  : t("잘 맞는 학생단체에 먼저 제안하거나 캠페인을 등록해 두세요.")
          }
          facts={topFacts}
          primary={
            paused && onResume
              ? { label: t("다시 보이게 하기"), onClick: onResume }
              : pending.length > 0
                ? { label: t("받은 제안 확인하기"), onClick: () => onNavigate("받은 제안") }
                : toConfirm > 0
                  ? { label: t("계약서 확인"), onClick: () => openContract(toConfirm, openTasks?.confirmId) }
                  : { label: t("학생단체 찾아보기"), onClick: () => onNavigate("단체 찾기") }
          }
          secondary={{ label: t("행사 일정 보기"), onClick: () => onNavigate("행사 일정") }}
        />
      ) : (
        <MeetingHero
          {...(memberHero ? { greeting: t("반가워요, {name}", { name: accountName! }) } : {})}
          eyebrow={
            memberHero
              ? upcoming
                ? t("다음 일정 · {name} · {dday}", { name: upcoming.eventName, dday: dDayLabel(upcoming.date) })
                : t("다가오는 협찬 일정이 없어요")
              : accountName
              ? t("반가워요, {name}", { name: accountName })
              : demo
                ? t("예시 화면 · {semester}", { semester: semesterLabel() })
                : semesterLabel()
          }
          lines={[t("대학생에게 닿는"), t("가장 확실한 길,"), t("숫자로 확인하세요.")]}
          stats={[
            { value: t("{count}건", { count: pending.length }), label: t("검토할 제안") },
            { value: t("{count}건", { count: confirmed.length }), label: t("확정된 협찬") },
            { value: totalRoas, label: t("추정 ROAS(전체 집행액 기준)") },
          ]}
          insight={
            paused
              ? t("내 소개를 숨기는 중이에요.")
              : pending.length > 0
              ? t("새로 받은 협찬 제안 {count}건이 답을 기다리고 있어요.", { count: pending.length })
              : memberHero && toConfirm > 0
                ? t("계약서 확인이 필요한 협찬이 {count}건 있어요.", { count: toConfirm })
              : noGroups
                ? t("아직 가입한 학생단체가 없어요.")
                : t("캠페인과 잘 맞는 학생단체 {count}곳을 찾았어요.", { count: matches.length })
          }
          detail={
            paused
              ? t("새 제안은 받지 않아요. 진행 중인 대화와 협찬은 그대로예요.")
              : memberHero && pending.length === 0 && toConfirm > 0
                ? t("양쪽이 계약서를 확인해야 협찬이 확정돼요. 수수료는 확인할 때 결제해요.")
              : noGroups && pending.length === 0
                ? t("소개와 캠페인을 먼저 올려 두세요. 학생단체가 가입하면 바로 추천해 드려요.")
                : t("학생 행사에서 쿠폰을 나누고, 매장에 온 손님까지 ROAS로 보여 드려요.")
          }
          primary={
            paused && onResume
              ? { label: t("다시 보이게 하기"), onClick: onResume }
              : pending.length > 0
                ? { label: t("받은 제안 확인하기"), onClick: () => onNavigate("받은 제안") }
                : memberHero && toConfirm > 0 && onOpenAgreements
                  ? { label: t("계약서 확인"), onClick: onOpenAgreements }
                  : { label: t("학생단체 찾아보기"), onClick: () => onNavigate("단체 찾기") }
          }
          secondary={{ label: t("행사 일정 보기"), onClick: () => onNavigate("행사 일정") }}
          onInstall={onInstall}
        />
      )}

      {checklist}

      {/* 회원은 업무부터: 검토할 제안, 계약, 보낸 제안, 다가오는 협찬. 소개는 방문자에게만. */}
      {member ? (
        <WorkBoard rows={workRows} title={t("지금 확인할 일")} />
      ) : (
        <>
        <section className="about-statement-section">
          <span className="eyebrow" data-reveal>
            About uniconnect
          </span>
          <RevealStatement
            breaks={[1, 2]}
            lead={t("uniconnect는 브랜드와 대학 행사를 잇고,")}
            firstChip={<Icon name="link" size={18} />}
            muted={t("협찬 효과를 ROAS로 보여 주는 곳이에요")}
            secondChip={<Icon name="chart" size={18} />}
          />
        </section>
        </>
      )}

      {/* 업무 보드는 건수와 길을, 이 구역은 그 자리에서 수락하는 일을 맡는다. 회원에게는
         답할 제안이 있을 때만 최신 3건을 보인다. */}
      {(!member || pending.length > 0) && (
      <section
        aria-labelledby={member ? "dash-inbox-title" : undefined}
        className={member ? "inbox-section dash-section" : "inbox-section"}
      >
        {member ? (
          <DashSectionHead
            action={{ label: t("받은 제안 전체"), onClick: () => onNavigate("받은 제안") }}
            id="dash-inbox-title"
            note={pending.length > 3 ? t("최근 3건") : undefined}
            title={t("답을 기다리는 제안")}
          />
        ) : (
          <div className="section-head">
            <span className="eyebrow" data-reveal>
              Proposal Inbox
            </span>
            <RevealTitle as="h2" className="section-display">
              {pending.length > 0 ? t("답을 기다리는 제안") : t("새 제안을 기다리고 있어요")}
            </RevealTitle>
          </div>
        )}
        {pending.length === 0 ? (
          <p className="day-empty inbox-empty" data-reveal>
            {t("새로 받은 제안이 없어요. 단체 찾기에서 먼저 제안해 보세요.")}
          </p>
        ) : (
          <ul className="pending-list">
            {(member ? pending.slice(0, 3) : pending).map((request, index) => (
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
                  <button className="proposal-button accept" onClick={() => setAccepting(request)} type="button">
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
      )}

      {!member && (
        <>
        <ValuePoints
          eyebrow={tc("eyebrow", "하는 일")}
          heading={t("브랜드가 여기서 하는 일")}
          points={[
            {
              icon: "users",
              need: t("대학생 접점"),
              title: t("매장 가까운 캠퍼스 행사를 골라요"),
              text: t("규모 · 시기 · 학교로 거르고, 가까운 캠퍼스부터 만나요."),
              figure: t("{count}곳", { count: catalog.length }),
              figureLabel: t("함께할 수 있는 학생단체"),
              action: t("단체 찾기"),
              onClick: () => onNavigate("단체 찾기"),
            },
            {
              icon: "won",
              need: t("소액 · 측정형 협찬"),
              title: t("작게 시작해도 효과가 숫자로 남아요"),
              text: t("현금 · 현물 · 쿠폰 중에 고르고, 방문은 매장에서 직접 확인해요."),
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
              text: t("협찬마다 ROAS를 보고, 다음 예산을 어디에 쓸지 정해요."),
              figure: totalRoas,
              figureLabel: t("전체 집행액 기준 추정 ROAS · 누적 집행액 {spend}", { spend: fullWon(totals.spend) }),
              action: t("성과 분석 보기"),
              onClick: () => onNavigate("성과 분석"),
            },
          ]}
        />

        <WhyUniconnect
          heading={t("캠퍼스 협찬, 보낸 만큼 돌아왔는지 확인하세요")}
          before={[
            t("쏟아지는 제안 메일 중 어디가 맞는지 알 수 없어요"),
            t("보낸 물품이 행사에서 어떻게 쓰였는지 몰라요"),
            t("효과는 사진 몇 장으로 짐작할 뿐이에요"),
            t("학교마다 담당자를 따로 찾아 연락해요"),
          ]}
          after={[
            t("우리 업종과 맞는 단체를 추천 지수 순으로 받아 봐요"),
            t("계약서의 할 일과 사진 증빙으로 집행을 확인해요"),
            t("쿠폰 · 매장 방문 · 추정 매출로 ROAS를 계산해요"),
            t("여러 학교 행사를 한 캘린더와 한 화면에서 관리해요"),
          ]}
          pillars={[
            {
              icon: "spark",
              title: t("이유가 보이는 추천 지수"),
              text: t("다섯 가지 기준으로 단체를 줄 세우고, 왜 맞는지 보여 줘요."),
              proof: t("단체 찾기 · 추천"),
            },
            {
              icon: "store",
              title: t("매장에서 확인하는 방문"),
              text: t("손님이 오면 직원이 PIN으로 확인해요. 단체가 대신 셀 수 없어요."),
              proof: t("직원 PIN 확인"),
            },
            {
              icon: "chart",
              title: t("협찬별 ROAS"),
              text: t("협찬마다 매출을 목표와 비교하고, 분석을 PDF로 받아요."),
              proof: t("성과 분석 PDF"),
            },
            {
              icon: "heart",
              title: t("공개된 파트너 후기"),
              text: t("행사가 끝나면 서로 평가해요. 다음 파트너는 별점부터 보고 골라요."),
              proof: t("파트너 후기"),
            },
          ]}
        />
        </>
      )}

      <section
        aria-labelledby={member ? "dash-matches-title" : undefined}
        className={member ? "works-section dash-section" : "works-section"}
      >
        {member ? (
          <DashSectionHead
            action={{ label: t("단체 찾기"), onClick: () => onNavigate("단체 찾기") }}
            id="dash-matches-title"
            note={t("추천 지수가 높은 3곳")}
            title={t("추천 학생단체")}
          />
        ) : (
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
        )}
        {noGroups && (
          <CatalogEmpty
            title={t("아직 추천할 학생단체가 없어요")}
            text={t("학생단체가 가입하면 여기에 추천해 드려요. 캠페인을 먼저 등록해 두세요.")}
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

      {!member && (
        <>
        <JourneyChain
          intro={t("캠페인 하나를 등록하면 제안 검토 · 확정 · 성과 분석이 차례로 이어져요.")}
          heading={t("지금은 ‘{step}’ 차례예요", { step: journey[currentStep].label })}
          steps={journey}
          current={currentStep}
          scheduleLabel={t("행사 일정 보기")}
          onOpenSchedule={() => onNavigate("행사 일정")}
          tour={demo}
        />
        </>
      )}

      <section
        aria-labelledby={member ? "dash-results-title" : undefined}
        className={member ? "results-section dash-section" : "results-section"}
      >
        {member ? (
          <DashSectionHead
            action={{ label: t("성과 분석"), onClick: () => onNavigate("성과 분석") }}
            id="dash-results-title"
            title={t("협찬별 성과")}
          />
        ) : (
          <div className="section-head">
            <span className="eyebrow" data-reveal>
              Performance
            </span>
            <RevealTitle as="h2" className="section-display">
              {t("협찬마다 돌아온 만큼")}
            </RevealTitle>
          </div>
        )}
        <div className="results-grid">
          <div className="silver-panel" data-reveal>
            {results.length === 0 && (
              <p className="day-empty">{t("협찬이 끝나면 돌아온 만큼이 여기에 보여요.")}</p>
            )}
            <div className="roas-list stagger">
              {results.map((result) => (
                <div className={["roas-row", result.met && "met", result.state !== "done" && result.state].filter(Boolean).join(" ")} key={result.id}>
                  <div className="roas-row-head">
                    <strong>{result.eventName}</strong>
                    <span>{roasText(result)}</span>
                  </div>
                  <div className="roas-track">
                    <i style={{ width: `${(result.roas / roasScale) * 100}%` }} />
                    <b style={{ left: `${(result.targetRoas / roasScale) * 100}%` }} />
                  </div>
                  <small>
                    {result.state === "done" ? (
                      <>
                        {t("{group} · {spend} 집행 · 목표 {target}%", {
                          group: result.groupName,
                          spend: formatWon(result.spend),
                          target: result.targetRoas,
                        })}
                        {result.met && ` ${t("달성")}`}
                      </>
                    ) : (
                      `${result.groupName} · ${roasVerdict(result)}`
                    )}
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
              <span>{t("추정 ROAS(전체 집행액 기준)")}</span>
              <strong>{totalRoas}</strong>
              <small>
                {totals.roasMissing
                  ? t("협찬액이 정해진 협찬이 아직 없어요")
                  : t("추정 매출 합계 ÷ 집행액 합계(현금 + 현물, 수수료 제외)예요.")}
                {totals.roasCounting && ` ${t("집계 중인 협찬이 있어 바뀔 수 있어요.")}`}
              </small>
            </div>
            <div className="report-highlight-actions">
              <button className="pill white" onClick={() => onNavigate("성과 분석")} type="button">
                <span>{t("성과 분석 열기")}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <Presence show={accepting !== null}>
        {accepting && (
          <AcceptModal
            side="브랜드"
            partner={accepting.groupName}
            eventName={accepting.eventName}
            eventDate={accepting.eventDate || undefined}
            terms={accepting.ask}
            details={accepting.terms}
            onClose={() => setAccepting(null)}
            onConfirm={async () => {
              const result = await onAccept(accepting)
              if (result !== "failed") setAccepting(null)
              return result
            }}
          />
        )}
      </Presence>
    </div>
  )
}
