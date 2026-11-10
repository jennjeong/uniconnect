import type { CSSProperties, ReactNode } from "react"

import { BrandMark } from "../components/BrandMark"
import { CatalogEmpty } from "../components/CatalogEmpty"
import { DashSectionHead, DashboardTop, type DashboardFact } from "../components/DashboardTop"
import { Icon } from "../components/Icon"
import { JourneyChain, type JourneyStep } from "../components/JourneyChain"
import { MeetingHero } from "../components/MeetingHero"
import { ProposalControl } from "../components/ProposalControl"
import { RevealStatement, RevealTitle } from "../components/RevealText"
import { ValuePoints } from "../components/ValuePoints"
import { WhyUniconnect } from "../components/WhyUniconnect"
import { WorkBoard, type WorkRow } from "../components/WorkBoard"
import { WorkCard } from "../components/WorkCard"
import { locale, t, tc } from "../i18n"
import { dDayLabel, formatFullDate, fromIsoDate, nextEvent, semesterLabel, todayIso } from "../lib/date"
import { percent } from "../lib/format"
import { hasRoas, roasText } from "../lib/kpis"
import { measureState } from "../lib/measurements"
import { fullWon } from "../lib/sponsorships"
import type { EventItem, Match, Metrics, NavLabel, Report, RequestStatus, SentProposal, SponsorOffer } from "../types"
import type { OpenTasks } from "../api"

const pad = (value: number) => String(value).padStart(2, "0")

// 성과 차트 y축의 맨 위(150 / 100 / 50 / 0).
const chartMax = 150

const delay = (seconds: number) => ({ "--reveal-delay": `${seconds}s` }) as CSSProperties

// 학생단체 대시보드. 협찬의 세 흐름으로 이야기한다: 단체와 브랜드가 만나는
// 곳(히어로), 둘을 잇는 것(체인 위의 협찬 단계), 함께 만든 것(숫자와 마지막
// 행사의 결과).
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
  onOpenInbox,
  onOpenDetail,
  onPropose,
  onCancelProposal,
  onOpenReport,
  onInstall,
  demo = false,
  paused = false,
  onResume,
  checklist,
  offers = [],
  sent = [],
  openTasks,
  onOpenAgreements,
  onOpenAgreement,
}: {
  // 인사말에 쓰는, 로그인한 단체의 이름.
  accountName?: string
  matches: Match[]
  // 카탈로그의 모든 브랜드. 회원에게는 가입한 브랜드만.
  brands: Match[]
  // 카탈로그가 도착했으므로 비어 있으면 정말 비어 있다.
  loaded: boolean
  events: EventItem[]
  proposals: string[]
  // 제안에 답한 브랜드의 답변.
  statuses: Partial<Record<string, RequestStatus>>
  // 어느 쪽이든 확정된 협찬.
  confirmedCount: number
  metrics: Metrics
  report: Report | null
  // 매칭을 마지막으로 불러온 때.
  updatedAt: Date | null
  onNavigate: (label: NavLabel) => void
  // 받은편지함의 받은 제안 쪽이나 보낸 제안 쪽(업무 보드의 답할 제안 · 보낸 제안 답변 대기).
  onOpenInbox?: (box: "received" | "sent") => void
  onOpenDetail: (match: Match) => void
  onPropose: (match: Match) => void
  onCancelProposal: (match: Match) => void
  onOpenReport: () => void
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
  // 받은 협찬 제안. 답할 것과 계약 확인할 것이 첫 화면의 '지금 할 일'이 된다.
  offers?: SponsorOffer[]
  // 이 계정이 보낸 제안(업무 보드의 답변 대기와 계약 확인 대기).
  sent?: SentProposal[]
  // 자기 쪽에 남은 계약서 할 일(App이 /api/proposals에서 받는다).
  openTasks?: OpenTasks
  onOpenAgreements?: () => void
  // 계약서 하나를 연다(업무 보드에서 그런 계약서가 하나뿐일 때).
  onOpenAgreement?: (id: string) => void
}) {
  const next = nextEvent(events)
  const nextDay = next ? fromIsoDate(next.date) : undefined
  const candidates = brands.length > 0 ? brands : matches
  // 아직 가입한 브랜드가 없다(회원은 가입한 브랜드만 본다).
  const noBrands = loaded && candidates.length === 0
  const strongCut = 80
  const strong = candidates.filter((match) => match.score >= strongCut).length
  const running = events.filter((event) => event.status !== "측정 완료").length
  // 로그인한 회원의 첫 화면에서 먼저 보여 줄 일: 답할 제안, 확인할 계약서, 등록할 행사.
  const member = Boolean(accountName) && !demo
  const toAnswer = offers.filter((offer) => offer.status === "검토 중").length
  // 내가 확인할 계약서(받은 협찬과 보낸 제안 모두, 내 쪽이 아직 확인하지 않은 것). 상대만
  // 확인하면 되는 계약서는 여기 들지 않는다(업무 보드의 '상대 확인 대기').
  const toConfirm = openTasks?.toConfirm ?? 0
  // 그런 계약서가 하나뿐이면 목록 대신 그 계약서를 연다.
  const openContract = (count: number, id?: string) =>
    count === 1 && id && onOpenAgreement ? onOpenAgreement(id) : onOpenAgreements ? onOpenAgreements() : onNavigate("받은 협찬")
  const todo =
    toAnswer > 0
      ? {
          insight: t("받은 협찬 제안 {count}건이 답을 기다려요.", { count: toAnswer }),
          detail: t("조건을 보고 수락하거나 거절해 주세요."),
          primary: { label: t("받은 협찬 확인"), onClick: () => onNavigate("받은 협찬") },
        }
      : toConfirm > 0 && onOpenAgreements
        ? {
            insight: t("내가 확인할 계약서가 {count}건 있어요.", { count: toConfirm }),
            detail: t("양쪽이 계약서를 확인해야 협찬이 확정돼요."),
            primary: { label: t("계약서 확인"), onClick: () => openContract(toConfirm, openTasks?.confirmId) },
          }
        : !next
          ? {
              insight: t("행사를 등록하면 잘 맞는 브랜드를 찾아 드려요."),
              detail: t("행사 이름과 날짜만 있어도 추천을 시작해요."),
              primary: { label: t("행사 등록하기"), onClick: () => onNavigate("내 행사") },
            }
          : null

  // 업무 보드(회원): 실제 데이터의 건수만. 줄을 누르면 그 일로 간다. 내가 할 일, 상대를
  // 기다리는 일, 일정 · 결과를 나눠 상대만 할 일이 남은 것을 내 급한 일처럼 보이지 않는다.
  const sentWaiting = sent.filter((item) => !item.noInbox && item.status === "검토 중").length
  const awaitingPartner = openTasks?.awaitingPartner ?? 0
  const upcomingEvents = events.filter((event) => (event.endDate ?? event.date) >= todayIso())
  const workRows: WorkRow[] = [
    {
      key: "answer",
      kind: "mine",
      label: t("답할 협찬 제안"),
      count: toAnswer,
      detail: toAnswer > 0 ? t("조건을 보고 수락하거나 거절해요") : t("새로 온 제안이 없어요"),
      onOpen: () => (onOpenInbox ? onOpenInbox("received") : onNavigate("받은 협찬")),
    },
    {
      key: "contract",
      kind: "mine",
      label: t("내가 확인할 계약서"),
      count: toConfirm,
      detail: toConfirm > 0 ? t("내용을 보고 확인하면 상대 확인 뒤 협찬이 확정돼요") : t("확인할 계약서가 없어요"),
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
      detail: sentWaiting > 0 ? t("브랜드의 답을 기다려요") : t("답을 기다리는 보낸 제안이 없어요"),
      onOpen: () => (onOpenInbox ? onOpenInbox("sent") : onNavigate("받은 협찬")),
    },
    {
      key: "partner",
      kind: "waiting",
      label: t("상대 확인 대기"),
      count: awaitingPartner,
      detail: awaitingPartner > 0 ? t("우리는 확인했고 브랜드의 확인을 기다려요") : t("상대를 기다리는 계약서가 없어요"),
      onOpen: () => (onOpenAgreements ? onOpenAgreements() : onNavigate("받은 협찬")),
    },
    {
      key: "events",
      kind: "info",
      label: t("다가오는 행사"),
      count: upcomingEvents.length,
      detail: next ? `${next.name} · ${dDayLabel(next.date)}` : t("등록한 다가오는 행사가 없어요"),
      onOpen: () => onNavigate("내 행사"),
    },
  ]

  // 회원 첫머리: 지금 할 일을 제목으로, 다음 행사와 확정된 협찬을 사실로.
  const topFacts: DashboardFact[] = [
    {
      label: t("다음 행사"),
      value: next ? next.name : t("없음"),
      note: next ? `${formatFullDate(next.date)} · ${dDayLabel(next.date)} · ${t(next.status)}` : t("행사를 등록하면 추천이 시작돼요"),
    },
    {
      label: t("확정된 협찬"),
      value: t("{count}건", { count: confirmedCount }),
      note: t("양쪽이 계약서를 확인한 것"),
    },
  ]

  // 다음 행사가 협찬 흐름 어디에 있는지.
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
      {member ? (
        <DashboardTop
          who={t("{name} · 학생단체", { name: accountName! })}
          title={
            paused
              ? t("내 소개를 숨기는 중이에요.")
              : todo
                ? todo.insight
                : t("지금 바로 할 일은 없어요.")
          }
          lead={
            paused
              ? t("새 제안은 받지 않아요. 진행 중인 대화와 협찬은 그대로예요.")
              : todo
                ? todo.detail
                : t("추천 브랜드에 제안하거나 다음 행사 준비를 이어 가요.")
          }
          facts={topFacts}
          primary={
            paused && onResume
              ? { label: t("다시 보이게 하기"), onClick: onResume }
              : todo
                ? todo.primary
                : { label: t("추천 매칭 보기"), onClick: () => onNavigate("추천 매칭") }
          }
          secondary={{ label: t("내 행사 보기"), onClick: () => onNavigate("내 행사") }}
        />
      ) : (
        <MeetingHero
          eyebrow={
            member && !paused
              ? next
                ? t("다음 일정 · {name} · {dday}", { name: next.name, dday: dDayLabel(next.date) })
                : t("다가오는 행사가 없어요")
              : accountName
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
          {...(member && !paused
            ? {
                greeting: t("반가워요, {name}", { name: accountName! }),
                ...(todo
                  ? {
                      insight: todo.insight,
                      detail: todo.detail,
                      primary: todo.primary,
                      secondary: { label: t("추천 매칭 보기"), onClick: () => onNavigate("추천 매칭") },
                    }
                  : { secondary: { label: t("내 행사 보기"), onClick: () => onNavigate("내 행사") } }),
              }
            : {})}
        />
      )}

      {checklist}

      {/* 회원은 업무부터: 지금 답하거나 확인할 일. 서비스 소개는 방문자에게만(예시 화면). */}
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
            lead={t("uniconnect는 학생단체와 브랜드를 잇고,")}
            firstChip={<Icon name="link" size={18} />}
            muted={t("협찬 성과를 숫자로 남기는 곳이에요")}
            secondChip={<Icon name="chart" size={18} />}
          />
        </section>

        <ValuePoints
          eyebrow={tc("eyebrow", "하는 일")}
          heading={t("학생단체가 여기서 하는 일")}
          points={[
            {
              icon: "spark",
              need: t("협찬처 찾기"),
              title: t("제안할 곳부터 정해 드려요"),
              text: t("추천 지수로 골라 주고, 학교 앞 가게까지 보여 줘요."),
              figure: t("{count}곳", { count: candidates.length }),
              figureLabel: t("추천 브랜드 · 추천 지수 {cut} 이상 {count}곳", { cut: strongCut, count: strong }),
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
          heading={t("연결에서 끝나지 않고 협찬을 끝까지 함께해요")}
          before={[
            t("아는 가게마다 메일과 DM을 돌리고 답을 기다려요"),
            t("말로 정한 약속이 행사 날 엇갈려요"),
            t("결과 보고는 사진 몇 장이 전부예요"),
            t("운영진이 바뀌면 협찬 기록도 같이 사라져요"),
          ]}
          after={[
            t("추천 지수와 거리로 제안할 브랜드부터 골라 드려요"),
            t("전자 계약서에 물품 · 할 일 · 확인 방식을 남겨요"),
            t("QR · 쿠폰 · 매장 방문이 저절로 집계돼 리포트가 돼요"),
            t("제안서와 협찬 기록이 다음 운영진에게 그대로 이어져요"),
          ]}
          pillars={[
            {
              icon: "spark",
              title: t("이유가 보이는 추천 지수"),
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
        </>
      )}

      <section
        aria-labelledby={member ? "dash-matches-title" : undefined}
        className={member ? "works-section dash-section" : "works-section"}
        id="matches"
      >
        {member ? (
          <DashSectionHead
            action={{ label: t("브랜드 찾기"), onClick: () => onNavigate("추천 매칭") }}
            id="dash-matches-title"
            note={t("추천 지수가 높은 3곳")}
            title={t("추천 브랜드")}
          />
        ) : (
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
        )}
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

      {!member && (
        <>
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
        </>
      )}

      <section
        aria-labelledby={member ? "dash-results-title" : undefined}
        className={member ? "results-section dash-section" : "results-section"}
      >
        {member ? (
          <DashSectionHead
            action={{ label: t("리포트 보기"), onClick: () => onNavigate("리포트") }}
            id="dash-results-title"
            note={
              report && measureState(report) !== "진행 전"
                ? t("{name} · {date}", { name: report.eventName, date: formatFullDate(report.eventDate) })
                : undefined
            }
            title={t("지난 행사 결과")}
          />
        ) : (
          <div className="section-head">
            <span className="eyebrow" data-reveal>
              Last Event
            </span>
            <RevealTitle as="h2" className="section-display">
              {t("지난 행사가 남긴 숫자")}
            </RevealTitle>
          </div>
        )}
        {member && (!report || measureState(report) === "진행 전") ? (
          // 시작한 행사가 없으면 0으로 채운 그래프 대신 무엇이 언제 생기는지 말한다.
          <p className="day-empty">{t("행사 날 QR을 띄우면 참여 · 쿠폰 · 방문이 여기에 쌓여요.")}</p>
        ) : (
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
        )}
      </section>

    </div>
  )
}
