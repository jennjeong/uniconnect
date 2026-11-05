import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react"

import {
  api,
  ApiError,
  errorMessage,
  getToken,
  setToken,
  type EventDraft,
  type ProposalState,
} from "./api"
import { Loader } from "./components/Loader"
import { CampaignMeasurement } from "./components/CampaignMeasurement"
import { Presence } from "./components/Presence"
import { SiteNotices } from "./components/SiteNotices"
import { useSiteState } from "./hooks/useSiteState"
import { ProfileChecklist } from "./components/ProfileChecklist"
import { Toast } from "./components/Toast"
import { demoAccounts } from "./data/demo"
import type { LegalKind } from "./data/legal"
import { pageFor } from "./data/navigation"
import { useInstallState } from "./hooks/useInstallState"
import { useNotice } from "./hooks/useNotice"
import { Footer } from "./layout/Footer"
import { Header } from "./layout/Header"
import { NavMenu } from "./layout/NavMenu"
import { socialNames } from "./data/social"
import { readPaymentReturn, withoutPaymentReturn } from "./lib/payments"
import { lang, t, tc } from "./i18n"
import { nextEvent, todayIso } from "./lib/date"
import { saveFile } from "./lib/download"
import { reportKpis, type KpiKey } from "./lib/kpis"
import { defaultMeasurement, measureState } from "./lib/measurements"
import {
  answerNotices,
  brandNotifications,
  isUnread,
  readParts,
  studentNotifications,
  type NotificationItem,
} from "./lib/notifications"
import { track } from "./lib/analytics"
import { applyPageMeta, pageMeta } from "./lib/pageMeta"
import { install } from "./lib/install"
import { installReveal } from "./lib/reveal"
import { installRipple } from "./lib/ripple"
import { entryView, menuPageOf, roleOfPage, viewPath, type HistoryEntry, type View } from "./lib/route"
import { installSwipeNavigation, noteHistoryEnd } from "./lib/swipe"
import { LoginModal } from "./modals/LoginModal"
import { councilTypes } from "./data/roles"
import type { SafetyTarget } from "./modals/SafetyModal"
import { SignupModal } from "./modals/SignupModal"
import { BrandDashboardPage } from "./pages/BrandDashboardPage"
import { DashboardPage } from "./pages/DashboardPage"
import { LandingPage } from "./pages/LandingPage"
import { NotFoundPage } from "./pages/NotFoundPage"
import type { ActivityItem } from "./pages/ProfilePage"
import type {
  Account,
  BlockedListing,
  BoardPost,
  BusinessStatus,
  CodeTicket,
  Conversation,
  EventItem,
  EventMeasurement,
  Inquiry,
  MailKind,
  Match,
  MetricKind,
  Metrics,
  ModalName,
  NavLabel,
  NearbyPlace,
  PostDraft,
  ProfileDraft,
  Role,
  SentProposal,
  Session,
  SocialProvider,
  SponsorOffer,
  SponsorRequest,
  Sponsorship,
} from "./types"

// 서버가 실패한 뒤 카드 승인을 다시 시도하기까지 기다리는 시간.
const confirmRetryMs = [1500, 4000]

// 첫 화면에 필요 없는 화면과 팝업은 처음 열릴 때 불러와서 첫 페이지의
// 다운로드를 줄인다(지연 청크, 아래의 Suspense).
const GoalModal = lazy(() => import("./modals/GoalModal").then((module) => ({ default: module.GoalModal })))
const GoalsModal = lazy(() => import("./modals/GoalsModal").then((module) => ({ default: module.GoalsModal })))
const InstallGuideModal = lazy(() => import("./modals/InstallGuideModal").then((module) => ({ default: module.InstallGuideModal })))
const LeaveModal = lazy(() => import("./modals/LeaveModal").then((module) => ({ default: module.LeaveModal })))
const BusinessModal = lazy(() => import("./modals/BusinessModal").then((module) => ({ default: module.BusinessModal })))
const ContactModal = lazy(() => import("./modals/ContactModal").then((module) => ({ default: module.ContactModal })))
const EmailChangeModal = lazy(() => import("./modals/EmailChangeModal").then((module) => ({ default: module.EmailChangeModal })))
const InviteShopModal = lazy(() => import("./modals/InviteShopModal").then((module) => ({ default: module.InviteShopModal })))
const PasswordModal = lazy(() => import("./modals/PasswordModal").then((module) => ({ default: module.PasswordModal })))
const DevicesModal = lazy(() => import("./modals/DevicesModal").then((module) => ({ default: module.DevicesModal })))
const PaymentsModal = lazy(() => import("./modals/PaymentsModal").then((module) => ({ default: module.PaymentsModal })))
const JoinTeamModal = lazy(() => import("./modals/JoinTeamModal").then((module) => ({ default: module.JoinTeamModal })))
const TeamModal = lazy(() => import("./modals/TeamModal").then((module) => ({ default: module.TeamModal })))
const CouncilLinkModal = lazy(() => import("./modals/CouncilLinkModal").then((module) => ({ default: module.CouncilLinkModal })))
const CouncilPage = lazy(() => import("./pages/CouncilPage").then((module) => ({ default: module.CouncilPage })))
const InsightPage = lazy(() => import("./pages/InsightPage").then((module) => ({ default: module.InsightPage })))
const TwoFactorModal = lazy(() => import("./modals/TwoFactorModal").then((module) => ({ default: module.TwoFactorModal })))
const PlanModal = lazy(() => import("./modals/PlanModal").then((module) => ({ default: module.PlanModal })))
const ProposeModal = lazy(() => import("./modals/ProposeModal").then((module) => ({ default: module.ProposeModal })))
const SafetyModal = lazy(() => import("./modals/SafetyModal").then((module) => ({ default: module.SafetyModal })))
const ResetPasswordModal = lazy(() => import("./modals/ResetPasswordModal").then((module) => ({ default: module.ResetPasswordModal })))
const MetricLogModal = lazy(() => import("./modals/MetricLogModal").then((module) => ({ default: module.MetricLogModal })))
const QrModal = lazy(() => import("./modals/QrModal").then((module) => ({ default: module.QrModal })))
const ReportModal = lazy(() => import("./modals/ReportModal").then((module) => ({ default: module.ReportModal })))
const AdminPage = lazy(() => import("./pages/AdminPage").then((module) => ({ default: module.AdminPage })))
const AgreementPage = lazy(() => import("./pages/AgreementPage").then((module) => ({ default: module.AgreementPage })))
const AgreementsPage = lazy(() => import("./pages/AgreementsPage").then((module) => ({ default: module.AgreementsPage })))
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage").then((module) => ({ default: module.AnalyticsPage })))
const EventCreatePage = lazy(() => import("./pages/EventCreatePage").then((module) => ({ default: module.EventCreatePage })))
const CampaignDetailPage = lazy(() => import("./pages/CampaignDetailPage").then((module) => ({ default: module.CampaignDetailPage })))
const EventDetailPage = lazy(() => import("./pages/EventDetailPage").then((module) => ({ default: module.EventDetailPage })))
const BoardPage = lazy(() => import("./pages/BoardPage").then((module) => ({ default: module.BoardPage })))
const PostPage = lazy(() => import("./pages/PostPage").then((module) => ({ default: module.PostPage })))
const PostFormModal = lazy(() => import("./modals/PostFormModal").then((module) => ({ default: module.PostFormModal })))
const LedgerPage = lazy(() => import("./pages/LedgerPage").then((module) => ({ default: module.LedgerPage })))
const ExplorePage = lazy(() => import("./pages/ExplorePage").then((module) => ({ default: module.ExplorePage })))
const EventsPage = lazy(() => import("./pages/EventsPage").then((module) => ({ default: module.EventsPage })))
const FaqPage = lazy(() => import("./pages/FaqPage").then((module) => ({ default: module.FaqPage })))
const LegalPage = lazy(() => import("./pages/LegalPage").then((module) => ({ default: module.LegalPage })))
const GroupsPage = lazy(() => import("./pages/GroupsPage").then((module) => ({ default: module.GroupsPage })))
const InboxPage = lazy(() => import("./pages/InboxPage").then((module) => ({ default: module.InboxPage })))
const InvitePage = lazy(() => import("./pages/InvitePage").then((module) => ({ default: module.InvitePage })))
const ChatPage = lazy(() => import("./pages/ChatPage").then((module) => ({ default: module.ChatPage })))
const MatchDetailPage = lazy(() => import("./pages/MatchDetailPage").then((module) => ({ default: module.MatchDetailPage })))
const MatchesPage = lazy(() => import("./pages/MatchesPage").then((module) => ({ default: module.MatchesPage })))
const OffersPage = lazy(() => import("./pages/OffersPage").then((module) => ({ default: module.OffersPage })))
const MeasurementPage = lazy(() => import("./pages/MeasurementPage").then((module) => ({ default: module.MeasurementPage })))
const MessagesPage = lazy(() => import("./pages/MessagesPage").then((module) => ({ default: module.MessagesPage })))
const ProfileEditPage = lazy(() => import("./pages/ProfileEditPage").then((module) => ({ default: module.ProfileEditPage })))
const ProfilePage = lazy(() => import("./pages/ProfilePage").then((module) => ({ default: module.ProfilePage })))
const ReportsPage = lazy(() => import("./pages/ReportsPage").then((module) => ({ default: module.ReportsPage })))
const AnalyticsExport = lazy(() => import("./report/AnalyticsExport").then((module) => ({ default: module.AnalyticsExport })))
const ReportExport = lazy(() => import("./report/ReportExport").then((module) => ({ default: module.ReportExport })))


// 처음 열 화면. 새로고침이면 주소와 맞는 한 히스토리 항목의 화면, 아니면 주소의
// 화면이다.
const initialView = entryView(history.state as HistoryEntry | null)

const noMetrics: Metrics = {
  scans: 0,
  coupons: 0,
  visits: 0,
  samples: 0,
  stamps: 0,
  posts: 0,
  surveys: 0,
  purchases: 0,
  giveaways: 0,
  raffles: 0,
  signups: 0,
  experiences: 0,
}

function App() {
  // 운영자의 스위치(점검, 가입, FAQ). 한 번만 읽는다.
  const site = useSiteState()
  const [view, setView] = useState<View>(initialView)
  // 뒤로 가기나 앞으로 가기 버튼(또는 스와이프)으로 온 화면이면 true.
  const [fromHistory, setFromHistory] = useState(false)
  const [activeModal, setActiveModal] = useState<ModalName | null>(null)
  // 제안하기를 누른 파트너. 폼이 열려 있는 동안.
  const [proposing, setProposing] = useState<Match | null>(null)
  // 일괄 제안: 제안 하나가 가는 단체들. 폼이 열려 있는 동안.
  const [proposingMany, setProposingMany] = useState<Match[] | null>(null)
  // 신고하기나 차단하기를 누른 대상. 폼이 열려 있는 동안.
  const [safety, setSafety] = useState<{ mode: "report" | "block"; target: SafetyTarget } | null>(null)
  // 이 계정이 차단한 계정. 내 정보에서 쓴다.
  const [blocked, setBlocked] = useState<BlockedListing[]>([])
  // 저장한 리스팅(찜). 최신순이며 카탈로그의 찜 탭에서 쓴다.
  const [saved, setSaved] = useState<string[]>([])
  // 모집 게시판 상태. 쓰거나 고치는 글, 지원서를 보낼 글, 게시판을 다시
  // 불러오려고 올리는 횟수.
  const [postForm, setPostForm] = useState<BoardPost | "new" | null>(null)
  const [applyingPost, setApplyingPost] = useState<string | null>(null)
  const [boardTick, setBoardTick] = useState(0)
  // A brand's business check, read when 내 정보 opens.
  const [business, setBusiness] = useState<BusinessStatus | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  // 저장된 토큰이 있으면 /auth/me가 답할 때까지 역할별 데이터를 기다린다.
  const [authReady, setAuthReady] = useState(() => getToken() === null)
  // 방문자는 어느 역할이든 미리 본다(처음엔 주소가 속한 쪽). 로그인한 계정은
  // 항상 자기 역할을 쓴다.
  const [previewRole, setPreviewRole] = useState<Role>(
    () => (initialView.invite ? "브랜드" : roleOfPage(initialView.page) ?? "학생단체"),
  )
  // 로그인이나 가입 폼이 열릴 때 미리 골라 둔 역할.
  const [authRole, setAuthRole] = useState<Role>("학생단체")
  // 비밀번호 찾기를 열 때 로그인 폼에 있던 이메일.
  const [resetEmail, setResetEmail] = useState("")
  // 학생단체가 초대하려는 가게와 그 초대 코드.
  const [inviting, setInviting] = useState<{ place: NearbyPlace; code: string } | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [proposals, setProposals] = useState<string[]>([])
  // 학생단체의 제안에 답한 브랜드의 답변.
  const [statuses, setStatuses] = useState<ProposalState["statuses"]>({})
  const [confirmedCount, setConfirmedCount] = useState(0)
  // 계정이 보낸 제안. 받은 제안 옆의 받은함 검토 중에 보여 준다.
  const [sent, setSent] = useState<SentProposal[]>([])
  // 1분마다, 그리고 창이 다시 보일 때 올라가서 상대의 답이 새로고침 없이
  // 나타나게 한다.
  const [refreshTick, setRefreshTick] = useState(0)
  // 학생단체의 행사별 실시간 집계와 리포트, 그리고 측정 페이지가 보여 주는
  // 행사(고르기 전에는 기본 행사).
  const [measurements, setMeasurements] = useState<EventMeasurement[]>([])
  const [measuredId, setMeasuredId] = useState<string | null>(null)
  // 계약서에서 저장한 목표의 횟수. 계약서가 목표를 다시 읽게 한다.
  const [goalsSaved, setGoalsSaved] = useState(0)
  // 결제 창이 끝낸 결제의 횟수. 페이지가 다시 읽게 한다.
  const [paid, setPaid] = useState(0)
  // 학생단체가 매칭 페이지에서 둘러보는 브랜드 카탈로그.
  const [brands, setBrands] = useState<Match[]>([])
  // 브랜드 쪽: 학생단체 카탈로그, 받은 제안, 결과.
  const [groups, setGroups] = useState<Match[]>([])
  // 카탈로그가 도착한 대상("role accountId"). 비어 있다는 말은 불러온 뒤에만
  // 한다.
  const [catalogFor, setCatalogFor] = useState<string | null>(null)
  // 행사가 도착한 대상. 카탈로그의 catalogFor와 같은 역할이다.
  const [eventsFor, setEventsFor] = useState<string | null>(null)
  const [requests, setRequests] = useState<SponsorRequest[]>([])
  const [offers, setOffers] = useState<SponsorOffer[]>([])
  const [sponsorships, setSponsorships] = useState<Sponsorship[]>([])
  // 계정 자신의 리스팅(작성 전에는 null)과 대화 목록.
  const [listing, setListing] = useState<Match | null>(null)
  // 리스팅이 도착한 대상(계정 id). 대시보드 체크리스트가 단계를 남은 것으로
  // 세지 않고 이를 기다린다.
  const [listingFor, setListingFor] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  // 운영자에게 한 계정의 질문. 벨의 답변 알림에 쓴다.
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  // 벨의 답변 알림이 도움말 센터의 질문을 바로 연다.
  const [askOnFaq, setAskOnFaq] = useState(false)
  // 내 행사 캘린더가 열리는 날. 방금 등록한 행사의 날짜 등.
  const [eventsFocus, setEventsFocus] = useState<string | undefined>(undefined)
  // 열린 모달이 보여 주는 기록이나 목표.
  const [logKind, setLogKind] = useState<MetricKind | "all">("all")
  const [goalKey, setGoalKey] = useState<KpiKey>("reach")
  const [exporting, setExporting] = useState(false)
  // 브랜드의 분석 리포트. AnalyticsExport가 같은 방식으로 만든다.
  const [exportingAnalytics, setExportingAnalytics] = useState(false)
  // 벨 아래의 알림 패널.
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  // 전체 화면 메뉴(헤더의 Menu 버튼).
  const [menuOpen, setMenuOpen] = useState(false)
  // 히스토리의 화면이 그려진 뒤 스크롤할 위치.
  const restoreScroll = useRef<number | null>(null)
  // 매칭과 행사를 마지막으로 불러온 때. 대시보드에 보인다.
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const { notice, noticeId, showNotice, hideNotice, pauseNotice } = useNotice()
  // 이 브라우저에서 앱 다운로드가 동작하는 방식(lib/install.ts). 설치된 앱
  // 안에서는 "app"이며 버튼이 보이지 않는다.
  const installKind = useInstallState()

  const role = account?.role ?? previewRole
  const accountId = account?.id
  // 로그아웃이 확인된 상태. 저장된 세션을 확인하는 동안은 아니다.
  const visitor = authReady && account === null
  const students = role === "학생단체"
  // 고른 페이지. 이 역할에 그런 페이지가 없으면 대시보드.
  const page = pageFor(role, view.page)
  // 메뉴가 선택됨으로 표시할 페이지. 화면이 메뉴에 속할 때만.
  const menuPage = menuPageOf(view, page)
  // 등록 페이지가 열리는 날짜. 그 페이지가 닫혀 있으면 null.
  const creating = view.create ?? null
  // 고치는 중인 행사나 캠페인. 그 페이지가 닫혀 있으면 null.
  const editing = view.edit ?? null
  const profileOpen = view.profile !== undefined && account !== null
  const chatOpen = view.chat !== undefined && account !== null
  const unreadMessages = conversations.reduce((sum, item) => sum + item.unread, 0)
  // 보는 사람이 바뀌면(로그인, 로그아웃, 반대편 보기) 같은 렌더에서 목록을
  // 비운다. 아무것도 그려지기 전이라 이전 보는 사람의 데이터(로그인 직전의
  // 예시)가 새 사람의 것처럼 보이지 않는다. 아래 effect가 새 보는 사람의
  // 데이터를 불러온다.
  const viewer = `${role} ${accountId ?? ""}`
  const [listsFor, setListsFor] = useState(viewer)
  if (listsFor !== viewer) {
    setListsFor(viewer)
    setMatches([])
    setEvents([])
    setBrands([])
    setGroups([])
    setOffers([])
    setRequests([])
    setSponsorships([])
    setMeasurements([])
    setProposals([])
    setStatuses({})
    setConfirmedCount(0)
    setSent([])
    setUpdatedAt(null)
    setInquiries([])
    setBlocked([])
    setSaved([])
  }
  // 학생단체가 볼 브랜드, 브랜드가 볼 학생단체, 그리고 지금 보는 사람 기준으로
  // 도착했는지 여부.
  const catalog = students ? brands : groups
  const catalogReady = catalogFor === viewer
  const detailMatch = view.detail
    ? catalog.find((match) => match.id === view.detail)
    : undefined
  const calendarPage: NavLabel = students ? "내 행사" : "행사 일정"

  // 탭 제목과 검색 설명이 화면을 따라간다(lib/pageMeta.ts).
  const partnerName = conversations.find((item) => item.id === view.chat)?.partner.name
  useEffect(() => {
    applyPageMeta(pageMeta(view, { role, page, detail: detailMatch, partnerName }))
  }, [view, role, page, detailMatch, partnerName])
  const pendingRequests = requests.filter((request) => request.status === "검토 중")
  const measured =
    measurements.find((item) => item.eventId === measuredId) ?? defaultMeasurement(measurements)
  const metrics = measured?.metrics ?? noMetrics
  const report = measured?.report ?? null
  const pendingOffers = offers.filter((offer) => offer.status === "검토 중")
  const confirmedRequests = requests.filter((request) => request.status === "수락")

  // 버튼은 누른 자리에서 물결이 퍼지고, 표시된 블록은 스크롤해 오면 떠오르며,
  // 옆으로 스와이프하면 화면을 오간다.
  useEffect(() => installRipple(), [])
  useEffect(() => installReveal(), [])
  useEffect(() => installSwipeNavigation(), [])

  // 모든 화면에 히스토리 항목이 있어서 뒤로·앞으로 버튼과 스와이프로 화면을
  // 오간다. 스크롤 위치는 항목마다 따로 둔다.
  useEffect(() => {
    history.scrollRestoration = "manual"
    if (!(history.state as HistoryEntry | null)?.view) {
      history.replaceState({ view: initialView, index: 0 } satisfies HistoryEntry, "")
      noteHistoryEnd(0)
    }
    const showEntry = (event: PopStateEvent) => {
      const entry = event.state as HistoryEntry | null
      const next = entryView(entry)
      setView(next)
      setFromHistory(true)
      // 방문자는 그 항목이 속한 쪽을 따라간다.
      const side = roleOfPage(next.page)
      if (side && !getToken()) setPreviewRole(side)
      restoreScroll.current = entry?.scrollY ?? 0
    }
    window.addEventListener("popstate", showEntry)
    return () => window.removeEventListener("popstate", showEntry)
  }, [])

  useEffect(() => {
    if (restoreScroll.current === null) return
    window.scrollTo(0, restoreScroll.current)
    restoreScroll.current = null
  }, [view])

  // 계정이 확인되면, 쓸 수 없는 주소(반대편의 페이지, 로그아웃 상태의 내 정보와
  // 등록)는 화면의 페이지로 바로잡고, 소개를 연 회원은 대시보드로 넘긴다.
  useEffect(() => {
    if (!authReady) return
    const usable =
      view.page === page &&
      (account !== null ? !view.home : !view.profile && !view.create && !view.edit && !view.chat)
    if (!usable) go({ page }, true)
  })

  // 서버가 제공하는 로그인 제공자(routes/social.ts).
  const [socialProviders, setSocialProviders] = useState<SocialProvider[]>([])
  useEffect(() => {
    api.socialProviders().then(
      (result) => setSocialProviders(result.providers),
      () => undefined,
    )
  }, [])
  // 2단계 인증 코드를 아직 요구하는, 카카오나 네이버에서 돌아온 로그인.
  const [socialTicket, setSocialTicket] = useState<{ email: string; ticket: CodeTicket } | null>(null)

  // 저장된 세션을 복원한다. 만료된 세션은 지운다. 서버에 닿지 못하는 동안은
  // 토큰을 두고 기다리며 매번 조금 뒤에 다시 시도한다. 방문자로 넘어가면 서버는
  // 토큰을 받았으니 계정으로 답하는데 방문자 화면이 보이게 된다.
  useEffect(() => {
    if (!getToken()) return
    let cancelled = false
    let timer: number | undefined
    let tries = 0
    const check = () =>
      api
        .me()
        .then((result) => {
          if (cancelled) return
          setAccount(result.account)
          setAuthReady(true)
        })
        .catch((error) => {
          if (cancelled) return
          if (error instanceof ApiError && error.status === 401) {
            setToken(null)
            setAuthReady(true)
            return
          }
          tries += 1
          if (tries === 1) showNotice(t("서버에 연결하지 못했어요. 다시 연결하고 있어요…"))
          timer = window.setTimeout(check, Math.min(30_000, 2_000 * 2 ** (tries - 1)))
        })
    check()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [showNotice])

  useEffect(() => {
    if (!authReady) return
    const refresh = () => {
      if (document.visibilityState === "visible") setRefreshTick((tick) => tick + 1)
    }
    const timer = window.setInterval(refresh, 60_000)
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [authReady])

  // 역할과 계정이 보는 데이터. 바뀔 때 불러오고 백그라운드에서 새로 고친다.
  // 요청마다 따로 적용하므로 하나가 실패해도 나머지는 최신으로 남고, 첫 로딩일
  // 때만 실패를 알린다.
  const loadedFor = useRef("")
  useEffect(() => {
    if (!authReady) return
    let cancelled = false
    const key = `${role} ${accountId ?? ""}`
    const background = loadedFor.current === key
    const students = role === "학생단체"
    const settle = <T,>(request: Promise<T>, apply: (result: T) => void) =>
      request.then((result) => {
        if (!cancelled) apply(result)
      })
    // 학생단체는 브랜드를 둘러보고 받은 협찬 제안에 답한다. 브랜드는 학생단체를
    // 둘러보고 제안에 답하며 결과를 따라간다.
    const requests = [
      settle(api.matches(role), (result) => {
        setMatches(result.matches)
        setUpdatedAt(new Date())
      }),
      settle(api.events(role), (result) => {
        setEvents(result.events)
        setEventsFor(key)
      }),
      settle(api.proposals(), applyProposals),
      ...(accountId
        ? [
            settle(api.inquiries(), (result) => setInquiries(result.inquiries)),
            settle(api.blocks(), (result) => setBlocked(result.blocked)),
            settle(api.saved(), (result) => setSaved(result.saved)),
          ]
        : []),
      ...(students
        ? [
            settle(api.brands(), (result) => {
              setBrands(result.brands)
              setCatalogFor(key)
            }),
            settle(api.offers(), (result) => setOffers(result.offers)),
          ]
        : [
            settle(api.groups(), (result) => {
              setGroups(result.groups)
              setCatalogFor(key)
            }),
            settle(api.requests(), (result) => setRequests(result.requests)),
            settle(api.analytics(), (result) => setSponsorships(result.sponsorships)),
          ]),
    ]
    Promise.allSettled(requests).then((results) => {
      if (cancelled) return
      loadedFor.current = key
      const failed = results.find((result) => result.status === "rejected")
      if (failed && !background) showNotice(errorMessage((failed as PromiseRejectedResult).reason))
    })
    return () => {
      cancelled = true
    }
  }, [authReady, role, accountId, showNotice, refreshTick])

  // 계정 자신의 리스팅과 대화. 채팅 버튼에 새 메시지가 보이도록 목록을 20초마다
  // 새로 고친다.
  useEffect(() => {
    if (!accountId) {
      setListing(null)
      setConversations([])
      return
    }
    let cancelled = false
    api
      .profile()
      .then((result) => {
        if (cancelled) return
        setListing(result.profile)
        setListingFor(accountId)
      })
      .catch(() => {})
    const loadConversations = () =>
      api
        .conversations()
        .then((result) => {
          if (!cancelled) setConversations(result.conversations)
        })
        .catch(() => {})
    loadConversations()
    const timer = window.setInterval(loadConversations, 20_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [accountId])

  // 계정의 행사(단체의 행사, 브랜드의 캠페인)와 그 측정. 캘린더가 바뀔 때마다
  // 다시 불러온다.
  useEffect(() => {
    if (!authReady) return
    let cancelled = false
    api
      .measurements(role)
      .then((result) => {
        if (!cancelled) setMeasurements(result.measurements)
      })
      .catch(() => {
        // 연결 문제는 위의 요청들이 이미 알린다.
      })
    return () => {
      cancelled = true
    }
  }, [authReady, role, accountId, events])

  // 측정 페이지에서 한 행사의 최신 집계와 리포트.
  const updateMeasurement = useCallback((next: EventMeasurement) => {
    setMeasurements((current) => current.map((item) => (item.eventId === next.eventId ? next : item)))
  }, [])

  // 화면을 새 히스토리 항목으로(또는 현재 항목을 대체해) 보여 준다. 떠나는
  // 페이지의 스크롤 위치를 기억한다.
  const go = (next: View, replace = false) => {
    const current = history.state as HistoryEntry | null
    const index = current?.index ?? 0
    const sameView = viewPath(next) === viewPath(view)
    if (replace || sameView) {
      history.replaceState({ view: next, index } satisfies HistoryEntry, "", viewPath(next))
    } else {
      history.replaceState({ view, index, scrollY: window.scrollY } satisfies HistoryEntry, "")
      history.pushState({ view: next, index: index + 1 } satisfies HistoryEntry, "", viewPath(next))
      noteHistoryEnd(index + 1)
    }
    setView(next)
    setFromHistory(false)
    window.scrollTo(0, 0)
  }

  // 페이지의 뒤로 화살표. 이 앱의 히스토리에서 한 단계 뒤로 가고, 페이지를 바로
  // 열었다면 `fallback`으로 간다.
  const goBack = (fallback: View) => {
    if ((history.state as HistoryEntry | null)?.index) history.back()
    else go(fallback, true)
  }

  const navigate = (label: NavLabel) => go({ page: label })

  // 홈: 방문자에게는 소개, 회원에게는 대시보드.
  const goHome = () => go(account ? { page: "대시보드" } : { page: "대시보드", home: true })

  // 소속한 쪽의 데모 데이터로 보여 주는 회원 화면. 소개에서 새 페이지로 연다.
  const openExample = (side: Role, next: NavLabel = "대시보드") => {
    if (!account) setPreviewRole(side)
    go({ page: next })
  }

  const openProfile = () => go({ page, profile: "page" })

  const openMessages = () => go({ page, messages: true })

  const openFaq = () => go({ page, faq: true })

  const openLegal = (legal: LegalKind) => go({ page, legal })

  const openAgreements = () => go({ page, agreements: true })

  // 계정 자신의 행사 하나에 대한 목표 폼. 계약서에서 연다.
  const editGoals = (eventId: string) => {
    if (!measurements.some((item) => item.eventId === eventId)) return
    setMeasuredId(eventId)
    setActiveModal("measure-goals")
  }

  const openAgreement = (id: string) => go({ page, agreement: id })

  // 열린 대화에 맞춰 대화 목록(최신 메시지 순)을 맞춘다.
  const updateConversation = useCallback((updated: Conversation) => {
    setConversations((current) =>
      [{ ...updated, messages: undefined }, ...current.filter((item) => item.id !== updated.id)].sort(
        (a, b) => (b.lastMessage?.at ?? "").localeCompare(a.lastMessage?.at ?? ""),
      ),
    )
  }, [])

  const openDetail = (match: Match) => go({ page, detail: match.id })

  // 대시보드에는 상세 페이지 주소가 따로 없어서 카드를 누르면 카탈로그 페이지
  // 위에 상세가 열린다. 뒤로 가면 대시보드로 돌아온다.
  const openCatalogDetail = (match: Match) =>
    go({ page: students ? "추천 매칭" : "단체 찾기", detail: match.id })

  const closeModal = useCallback(() => setActiveModal(null), [])
  const closeNotifications = useCallback(() => setNotificationsOpen(false), [])
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  const openAuth = (modal: "login" | "signup", nextRole: Role = role) => {
    setAuthRole(nextRole)
    setActiveModal(modal)
  }

  // 앱 다운로드: 브라우저에 자체 설치 대화 상자가 있으면 그것을, 없으면 이
  // 브라우저에서 설치하는 방법을 보여 준다.
  const startInstall = () => {
    if (installKind !== "prompt") {
      setActiveModal("install")
      return
    }
    void install().then((done) => done && showNotice(t("uniconnect를 앱으로 설치했어요.")))
  }

  const requireLogin = (message: string) => {
    showNotice(message)
    openAuth("login")
  }

  // `recoveryLeft`는 2단계 인증으로 로그인할 때 함께 온다. 복구 코드가 몇 개
  // 남지 않았다면 알려 줄 만하다.
  const startSession = (session: Session & { recoveryLeft?: number }, message: string) => {
    setToken(session.token)
    setAccount(session.account)
    go(view.invite || view.agreement || view.agreements ? view : { page: "대시보드" }, true)
    setActiveModal(null)
    const left = session.recoveryLeft
    showNotice(
      left !== undefined && left <= 3
        ? `${message} ${t("남은 복구 코드가 {count}개예요. 2단계 인증을 껐다 다시 켜면 새 코드를 받아요.", { count: left })}`
        : message,
    )
  }

  // 토스페이먼츠 창에서 돌아온 경우(lib/payments.ts). 답은 주소에 실려 오고
  // 주소는 이를 곧바로 잃는다. 성공은 서버가 승인하고 페이지가 산 내용을 보여
  // 준다.
  useEffect(() => {
    const answer = readPaymentReturn(window.location.search)
    if (!answer) return
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${withoutPaymentReturn(window.location.search)}${window.location.hash}`,
    )
    if (!answer.ok) {
      showNotice(answer.canceled ? t("결제를 취소했어요.") : answer.message || t("결제하지 못했어요. 다시 시도해 주세요."))
      return
    }
    // 서버에서 저장이나 Toss가 실패했거나(5xx) 아예 답이 없으면 다시
    // 시도한다. 서버가 키를 갖고 있고 Toss는 주문을 한 번만 승인하므로 다시
    // 시도해도 두 번 청구되지 않는다.
    const body = { orderId: answer.orderId, paymentKey: answer.paymentKey, amount: answer.amount }
    const confirm = async () => {
      for (const wait of confirmRetryMs) {
        try {
          return await api.confirmPayment(body)
        } catch (error) {
          if (!(error instanceof ApiError) || (error.status !== 0 && error.status < 500)) throw error
          await new Promise((resolve) => setTimeout(resolve, wait))
        }
      }
      return api.confirmPayment(body)
    }
    confirm().then(
      ({ order }) => {
        showNotice(t("{name} 결제를 마쳤어요.", { name: order.orderName }))
        setPaid((count) => count + 1)
      },
      (error: unknown) => showNotice(errorMessage(error)),
    )
    // 페이지가 열릴 때 한 번.
  }, [])

  // 카카오나 네이버에서 돌아온 경우(routes/social.ts). 결과는 ?social=에 실려
  // 오고 주소에서 곧 사라진다. 로그인은 서버가 쿠키에 남긴 일회용 코드로 여기서
  // 끝낸다.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const outcome = params.get("social")
    if (!outcome) return
    params.delete("social")
    const rest = params.toString()
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`)
    if (outcome === "login") {
      api.socialComplete().then(
        (answer) => {
          if ("ticket" in answer) {
            setSocialTicket({ email: answer.email, ticket: answer })
            setActiveModal("login")
          } else startSession(answer, t("{name} 계정으로 로그인했어요.", { name: answer.account.name }))
        },
        (error: unknown) => showNotice(errorMessage(error)),
      )
      return
    }
    const provider = outcome.endsWith("naver") ? t("네이버") : t("카카오")
    const notices: Record<string, string> = {
      "linked-kakao": t("{provider} 계정을 연결했어요. 다음부터 {provider}로 로그인할 수 있어요.", { provider }),
      "linked-naver": t("{provider} 계정을 연결했어요. 다음부터 {provider}로 로그인할 수 있어요.", { provider }),
      "link-taken": t("이미 다른 uniconnect 계정에 연결된 계정이에요."),
      "unlinked-kakao": t("{provider} 계정이 연결된 회원이 없어요. {provider} 로그인은 회원가입 뒤 내 정보에서 {provider} 계정을 연결해야 쓸 수 있어요.", { provider }),
      "unlinked-naver": t("{provider} 계정이 연결된 회원이 없어요. {provider} 로그인은 회원가입 뒤 내 정보에서 {provider} 계정을 연결해야 쓸 수 있어요.", { provider }),
      error: t("카카오 · 네이버 로그인을 마치지 못했어요. 다시 시도해 주세요."),
      "link-error": t("카카오 · 네이버 로그인을 마치지 못했어요. 다시 시도해 주세요."),
    }
    if (Object.prototype.hasOwnProperty.call(notices, outcome)) showNotice(notices[outcome])
    // 아직 연결되지 않았다. 로그인으로 돌아가 이메일로 로그인하거나 가입한다.
    if (outcome.startsWith("unlinked")) openAuth("login")
    // 페이지가 열릴 때 한 번.
  }, [])

  const endSession = () => {
    setToken(null)
    // 로그아웃한 뒤에도 같은 쪽을 계속 보여 준다.
    if (account) setPreviewRole(account.role)
    setAccount(null)
    if (view.profile || view.create || view.edit || view.chat) go({ page: view.page }, true)
    setNotificationsOpen(false)
  }

  const handleError = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401 && account) {
      endSession()
      openAuth("login", account.role)
      showNotice(t("로그인이 만료됐어요. 다시 로그인해 주세요."))
      return
    }
    showNotice(errorMessage(error))
  }
  // 채팅 페이지도 같은 처리를 한다. 렌더마다 페이지의 확인이 다시 시작되지
  // 않도록 함수 하나로 둔다.
  const latestHandleError = useRef(handleError)
  latestHandleError.current = handleError
  const handleSessionEnd = useCallback((error: unknown) => latestHandleError.current(error), [])

  const logout = async () => {
    try {
      await api.logout()
    } catch {
      // 어느 쪽이든 토큰은 로컬에서 지운다.
    }
    endSession()
    setActiveModal(null)
    // 계정에서 나오면 예시가 담긴 같은 화면이 아니라 소개로 돌아간다.
    go({ page: "대시보드", home: true })
    showNotice(t("로그아웃했어요."))
  }

  const switchRole = (next: Role) => {
    if (account) return
    // 소개에서 어느 쪽이든 예시 대시보드가 열린다.
    if (view.home) {
      openExample(next)
      return
    }
    if (next === previewRole) return
    setPreviewRole(next)
    go({ page: "대시보드" }, true)
    showNotice(t("{role} 전용 데이터로 전환했어요.", { role: t(next) }))
  }

  const openCreate = (date = todayIso()) => {
    if (!account) {
      requireLogin(
        role === "학생단체"
          ? t("로그인하면 행사를 등록할 수 있어요.")
          : t("로그인하면 캠페인을 등록할 수 있어요."),
      )
      return
    }
    go({ page, create: date })
  }

  const createEvent = async (draft: EventDraft) => {
    try {
      const { event } = await api.createEvent(draft)
      setEvents((current) => [event, ...current])
      setEventsFocus(event.date)
      // 캘린더가 등록 페이지의 자리를 히스토리에서 대신한다.
      go({ page: calendarPage }, true)
      showNotice(
        role === "학생단체"
          ? t("행사가 등록되었어요. 추천 매칭을 시작합니다.")
          : t("캠페인이 등록되었어요. 적합한 단체를 찾습니다."),
      )
    } catch (error) {
      handleError(error)
    }
  }

  const deleteEvent = async (event: EventItem) => {
    if (!account) {
      requireLogin(t("로그인하면 등록한 행사를 관리할 수 있어요."))
      return
    }
    try {
      await api.deleteEvent(event.id)
      setEvents((current) => current.filter((item) => item.id !== event.id))
      showNotice(t("목록에서 삭제했어요."))
    } catch (error) {
      handleError(error)
    }
  }

  const openEdit = (event: EventItem) => {
    if (!account) {
      requireLogin(t("로그인하면 등록한 행사를 관리할 수 있어요."))
      return
    }
    go({ page, edit: event.id })
  }

  const updateEvent = async (draft: EventDraft) => {
    if (editing === null) return
    try {
      const { event } = await api.updateEvent(editing, draft)
      setEvents((current) => current.map((item) => (item.id === event.id ? event : item)))
      setEventsFocus(event.date)
      // 그 행사에 대한 제안과 협찬이 새 이름과 날짜를 받았다.
      setRefreshTick((tick) => tick + 1)
      goBack({ page: calendarPage })
      showNotice(students ? t("행사 정보를 고쳤어요.") : t("캠페인 정보를 고쳤어요."))
    } catch (error) {
      handleError(error)
    }
  }

  // 행사 페이지(/event/<id>): 단체의 행사 또는 브랜드 자신의 캠페인.
  const openEventPage = (eventId: string) => go({ page, eventPage: eventId })

  function applyProposals(result: ProposalState) {
    setProposals(result.proposals)
    setStatuses(result.statuses)
    setConfirmedCount(result.confirmed)
    setSent(result.sent ?? [])
  }

  // 클릭과 서버의 수락은 따로 추적한다(lib/analytics.ts). 클릭은 폼을 열고,
  // 거기서 행사와 메모를 고른다.
  const propose = (match: Match) => {
    track("contact_click", { method: "proposal", role })
    if (!account) {
      requireLogin(t("로그인하면 협찬 제안을 보낼 수 있어요."))
      return
    }
    setApplyingPost(null)
    setProposing(match)
    setActiveModal("propose")
  }

  // 제안을 보낸다. 세션 종료가 아닌 문제는 폼에 남는다.
  const sendProposal = async (draft: { eventId?: string; message: string }) => {
    if (!proposing) return
    try {
      applyProposals(await api.propose(proposing.id, { ...draft, ...(applyingPost ? { postId: applyingPost } : {}) }))
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) throw error
      closeModal()
      handleError(error)
      return
    }
    track("generate_lead", { method: "proposal", role })
    if (applyingPost) {
      setBoardTick((tick) => tick + 1)
      showNotice(t("{name}의 모집 글에 지원했어요. 상대가 받은 제안에서 답해요.", { name: proposing.name }))
    } else {
      showNotice(t("{name}에 협찬 제안을 보냈어요.", { name: proposing.name }))
    }
    closeModal()
  }

  // 단체 찾기의 일괄 제안: 캠페인 하나와 메시지를 여러 단체에 보낸다.
  const proposeMany = (targets: Match[]) => {
    track("contact_click", { method: "proposal", role })
    setProposingMany(targets)
    setActiveModal("propose-many")
  }

  // 하나씩 차례로 보내며 {상대}를 그 이름으로 채운다. 보내진 단체는 선택에서
  // 빠진다. 하나도 보내지 못했으면 이유와 함께 폼이 열려 있고, 아니면 닫으면서
  // 어느 단체에 보내지 못했는지 알린다.
  const sendMany = async (draft: { eventId?: string; message: string }) => {
    if (!proposingMany) return
    const failed: string[] = []
    let sentCount = 0
    for (const target of proposingMany) {
      try {
        applyProposals(await api.propose(target.id, { ...draft, message: draft.message.split("{상대}").join(target.name) }))
        sentCount += 1
        track("generate_lead", { method: "proposal", role })
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          closeModal()
          handleError(error)
          return
        }
        failed.push(`${target.name}: ${errorMessage(error)}`)
      }
    }
    // 서버가 준 사유로 폼에 보여 준다.
    if (sentCount === 0) throw new ApiError(400, failed.join(" · "))
    showNotice(
      failed.length
        ? t("{sent}곳에 보냈고 {failed}곳은 보내지 못했어요. {reasons}", { sent: sentCount, failed: failed.length, reasons: failed.join(" · ") })
        : t("{count}곳에 협찬 제안을 보냈어요.", { count: sentCount }),
    )
    closeModal()
  }

  // 모집 게시판(/board)과 그 글(/board/<id>).
  const openBoard = () => go({ page, board: true })
  const openPost = (id: string) => go({ page, post: id })
  const writePost = (post?: BoardPost) => {
    if (!account) {
      requireLogin(t("로그인하면 모집 글을 쓸 수 있어요."))
      return
    }
    setPostForm(post ?? "new")
    setActiveModal("post")
  }
  // 서버가 알려 준 문제는 폼에 남는다(모달이 보여 준다).
  const savePost = async (draft: PostDraft) => {
    const editing = postForm !== "new" ? postForm : null
    const { post } = editing ? await api.updatePost(editing.id, draft) : await api.createPost(draft)
    closeModal()
    setBoardTick((tick) => tick + 1)
    showNotice(editing ? t("모집 글을 고쳤어요.") : t("모집 글을 올렸어요."))
    if (!editing) openPost(post.id)
  }
  // 지원하면 계정의 행사나 캠페인으로 글쓴이에게 제안이 간다. 제안하기와 같은
  // 폼을 쓴다.
  const applyToPost = (post: BoardPost) => {
    track("contact_click", { method: "proposal", role })
    if (!account) {
      requireLogin(t("로그인하면 모집 글에 지원할 수 있어요."))
      return
    }
    setApplyingPost(post.id)
    setProposing({
      id: post.listingId,
      name: post.poster.name,
      category: post.poster.category,
      industry: post.poster.industry,
      offer: "",
      score: 0,
      tags: [],
    })
    setActiveModal("propose")
  }

  // 회원은 신고하고 차단할 수 있다. 공용 데모 계정은 데모를 해 보는 모두가
  // 쓰므로 할 수 없다.
  const member = account !== null && !Object.values(demoAccounts).some((demo) => demo.email === account.email)

  // 내 정보의 받을 메일: 바로 화면에 반영한 뒤 저장한다.
  const saveMailOff = (mailOff: MailKind[]) => {
    if (!account) return
    setAccount({ ...account, mailOff })
    api
      .savePreferences({ mailOff })
      .then((result) => {
        setAccount(result.account)
        showNotice(t("받을 메일을 바꿨어요."))
      })
      .catch(handleError)
  }

  // 이메일은 앱이 보이는 언어를 따른다. 회원의 언어가 달라질 때마다(내 정보나
  // 푸터에서 새로 고르면 그 언어로 페이지를 다시 불러온다) 서버에 알린다. 공용
  // 데모 계정은 자기 언어를 그대로 둔다.
  useEffect(() => {
    if (!member || !account || (account.language ?? "ko") === lang) return
    api
      .savePreferences({ language: lang })
      .then((result) => setAccount(result.account))
      .catch(() => undefined)
  }, [member, account])

  // 목록에서 숨기기 (내 정보) and 다시 보이게 하기 (the dashboard's hero).
  const pauseListing = (paused: boolean) => {
    api
      .pauseProfile(paused)
      .then((result) => {
        setListing(result.profile)
        showNotice(
          paused
            ? t("내 소개를 숨겼어요. 상대 목록에 보이지 않고 새 제안을 받지 않아요.")
            : t("내 소개가 다시 상대 목록에 보여요."),
        )
      })
      .catch(handleError)
  }

  // 찜: 하트는 리스팅을 카탈로그의 찜 탭에 두고 다시 보게 한다. 바로 화면에
  // 반영하고 서버가 거절하면 되돌린다.
  const toggleSaved = (match: Match) => {
    if (!account) {
      requireLogin(t("찜하려면 로그인해 주세요."))
      return
    }
    const wasSaved = saved.includes(match.id)
    const without = (list: string[]) => list.filter((id) => id !== match.id)
    setSaved((list) => (wasSaved ? without(list) : [match.id, ...without(list)]))
    ;(wasSaved ? api.unsave(match.id) : api.save(match.id))
      .then(() => {
        if (!wasSaved) showNotice(t("찜했어요. 찜 탭에서 모아 볼 수 있어요."))
      })
      .catch((error: unknown) => {
        setSaved((list) => (wasSaved ? [match.id, ...without(list)] : without(list)))
        handleError(error)
      })
  }

  const openSafety = (mode: "report" | "block", target: SafetyTarget) => {
    setSafety({ mode, target })
    setActiveModal("safety")
  }

  // 차단하면 목록에서 그 리스팅이 빠지고 페이지가 닫힌다.
  const safetyDone = (notice: string) => {
    const blocking = safety?.mode === "block"
    closeModal()
    showNotice(notice)
    if (!blocking) return
    setRefreshTick((tick) => tick + 1)
    api
      .blocks()
      .then((result) => setBlocked(result.blocked))
      .catch(() => {})
    if (view.detail) goBack({ page })
  }

  // A member brand's business check, for its 내 정보.
  const checksBusiness = member && account?.role === "브랜드"
  useEffect(() => {
    if (!profileOpen || !checksBusiness) return
    let cancelled = false
    api
      .business()
      .then((result) => {
        if (!cancelled) setBusiness(result)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [profileOpen, checksBusiness, accountId])

  const unblock = async (item: BlockedListing) => {
    try {
      await api.unblock(item.listingId)
      setBlocked((current) => current.filter((entry) => entry.listingId !== item.listingId))
      setRefreshTick((tick) => tick + 1)
      showNotice(t("{name}의 차단을 풀었어요.", { name: item.name }))
    } catch (error) {
      handleError(error)
    }
  }

  // 학생단체가 가까운 순에서 가게를 초대한다. 초대가 만들어지면 true가 되어
  // 카드에 초대함이 나온다.
  const inviteShop = async (place: NearbyPlace) => {
    if (!account) {
      requireLogin(t("로그인하면 가게를 초대할 수 있어요."))
      return false
    }
    try {
      const { invite } = await api.inviteShop(place.id)
      setInviting({ place, code: invite.code })
      setActiveModal("invite")
      return true
    } catch (error) {
      handleError(error)
      return false
    }
  }

  const cancelProposal = async (match: Pick<Match, "id" | "name">) => {
    try {
      applyProposals(await api.cancelProposal(match.id))
      showNotice(t("{name}에 보낸 제안을 취소했어요.", { name: match.name }))
    } catch (error) {
      handleError(error)
    }
  }

  // 받은함에서 보낸 제안의 제안 취소.
  const withdrawProposal = (proposal: SentProposal) =>
    cancelProposal({ id: proposal.partnerId, name: proposal.partnerName })

  // 상세 페이지의 문의하기: 그 상대와의 대화를 연다(없으면 시작한다).
  const openChat = async (match: Match) => {
    track("contact_click", { method: "message", role })
    if (!account) {
      requireLogin(t("로그인하면 문의를 보낼 수 있어요."))
      return
    }
    try {
      const { conversation } = await api.startConversation(match.id)
      updateConversation(conversation)
      go({ page, chat: conversation.id })
    } catch (error) {
      handleError(error)
      // 상대가 누가 요청하는지 알아야 하므로 먼저 소개를 쓴다.
      if (error instanceof ApiError && error.status === 409) go({ page, profile: "edit" })
    }
  }

  // 계정이 만든 모든 것을 JSON 파일 하나로 저장한다(GET /api/auth/export).
  const downloadData = async () => {
    try {
      const data = await api.exportData()
      saveFile(`uniconnect-${todayIso()}.json`, JSON.stringify(data, null, 2), "application/json")
      showNotice(t("내 데이터를 내려받았어요."))
    } catch (error) {
      showNotice(errorMessage(error))
    }
  }

  // 폼에 보여 줄 문제를 돌려주고, 저장되면 null.
  const saveProfile = async (draft: ProfileDraft) => {
    try {
      const { profile } = await api.saveProfile(draft)
      setListing(profile)
      // 카탈로그의 점수와 거리는 리스팅으로 계산한다.
      setRefreshTick((tick) => tick + 1)
      goBack({ page, profile: "page" })
      showNotice(
        students
          ? t("소개를 저장했어요. 브랜드가 바로 볼 수 있어요.")
          : profile.location && profile.location.lat === undefined
            ? t("소개를 저장했어요. 매장 주소는 지도에서 찾지 못해 거리가 보이지 않아요.")
            : t("소개를 저장했어요. 학생단체가 바로 볼 수 있어요."),
      )
      return null
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) handleError(error)
      return errorMessage(error)
    }
  }

  // 브랜드가 학생단체의 제안을 수락하거나 거절한다.
  const answerRequest = async (request: SponsorRequest, decision: "accept" | "decline") => {
    if (!account) {
      requireLogin(t("로그인하면 받은 제안에 답할 수 있어요."))
      return
    }
    try {
      const result = await api.answerRequest(request.id, decision)
      setRequests((current) =>
        current.map((item) => (item.id === result.request.id ? result.request : item)),
      )
      api.proposals().then(applyProposals).catch(() => {})
      showNotice(
        decision === "accept"
          ? t("{name} 협찬을 확정했어요.", { name: request.eventName })
          : t("{name}의 제안을 거절했어요.", { name: request.groupName }),
      )
    } catch (error) {
      handleError(error)
      // 그 사이 다른 곳에서 답했거나 철회했다면 현재 상태를 보여 준다.
      if (error instanceof ApiError && (error.status === 409 || error.status === 404)) {
        api
          .requests()
          .then((result) => setRequests(result.requests))
          .catch(() => {})
      }
    }
  }

  // 학생단체가 브랜드의 제안을 수락하거나 거절한다.
  const answerOffer = async (offer: SponsorOffer, decision: "accept" | "decline") => {
    if (!account) {
      requireLogin(t("로그인하면 받은 협찬 제안에 답할 수 있어요."))
      return
    }
    try {
      const result = await api.answerOffer(offer.id, decision)
      setOffers((current) => current.map((item) => (item.id === result.offer.id ? result.offer : item)))
      api.proposals().then(applyProposals).catch(() => {})
      showNotice(
        decision === "accept"
          ? t("{name}의 협찬을 확정했어요.", { name: offer.brandName })
          : t("{name}의 제안을 거절했어요.", { name: offer.brandName }),
      )
    } catch (error) {
      handleError(error)
      // 그 사이 다른 곳에서 답했거나 철회했다면 현재 상태를 보여 준다.
      if (error instanceof ApiError && (error.status === 409 || error.status === 404)) {
        api
          .offers()
          .then((result) => setOffers(result.offers))
          .catch(() => {})
      }
    }
  }

  // 종류가 없으면 모든 측정의 기록.
  const openLog = (kind?: MetricKind) => {
    setLogKind(kind ?? "all")
    setActiveModal("metric-log")
  }

  const openEventsOn = (date: string) => {
    setEventsFocus(date)
    navigate(calendarPage)
  }

  const openGoal = (key: KpiKey) => {
    setGoalKey(key)
    setActiveModal("goal")
  }

  // PDF는 ReportExport가 만들며, exporting이 true인 동안 마운트된다.
  const saveReport = () => {
    if (report && !exporting) setExporting(true)
  }

  const finishExport = useCallback(
    (failed: boolean) => {
      setExporting(false)
      showNotice(
        failed ? t("PDF를 만들지 못했어요. 다시 시도해 주세요.") : t("PDF 리포트를 다운로드했어요."),
      )
    },
    [showNotice],
  )

  const finishAnalyticsExport = useCallback(
    (failed: boolean) => {
      setExportingAnalytics(false)
      showNotice(
        failed ? t("PDF를 만들지 못했어요. 다시 시도해 주세요.") : t("분석 보고서를 다운로드했어요."),
      )
    },
    [showNotice],
  )

  const goal = report ? reportKpis(report, metrics).find((kpi) => kpi.key === goalKey) : undefined

  // 브랜드의 캘린더에는 협찬하기로 한 학생 행사도 들어간다.
  const schedule = students
    ? events
    : [
        ...events,
        ...confirmedRequests.map((request) => ({
          name: request.eventName,
          date: request.eventDate,
          status: "협찬 확정",
        })),
      ]

  const notifications = [
    ...answerNotices(inquiries),
    ...(students
      ? studentNotifications({ matches, brands, statuses, report, offers, events })
      : brandNotifications({ matches, requests, sponsorships, events })),
  ]
  // 이 계정이 읽은 벨 알림의 부분. 계정에 저장된다.
  const readNotices = new Set(account?.readNotices ?? [])
  // 알림을 읽음으로 표시한다(하나를 열거나 모두 읽음). 화면에는 바로, 계정에는
  // 다른 기기를 위해 나중에 반영한다.
  const markNoticesRead = (opened: NotificationItem[]) => {
    if (!account || !opened.some((item) => isUnread(item, readNotices))) return
    const next = readParts(notifications, readNotices, opened)
    setAccount({ ...account, readNotices: next })
    api.readNotices(next).catch(handleError)
  }

  const activity: ActivityItem[] = students
    ? [
        { label: t("등록한 행사"), value: t("{count}개", { count: events.length }), target: "내 행사" },
        { label: t("보낸 협찬 제안"), value: t("{count}건", { count: proposals.length }), target: "추천 매칭" },
        { label: t("확정된 협찬"), value: t("{count}건", { count: confirmedCount }), target: "추천 매칭" },
      ]
    : [
        { label: t("등록한 캠페인"), value: t("{count}개", { count: events.length }), target: "행사 일정" },
        { label: tc("tile", "받은 협찬 제안"), value: t("{count}건", { count: requests.length }), target: "받은 제안" },
        { label: t("확정한 협찬"), value: t("{count}건", { count: confirmedCount }), target: "행사 일정" },
      ]

  const eventsPage = (
    <EventsPage
      role={role}
      events={events}
      sponsorships={students ? undefined : confirmedRequests}
      initialDate={eventsFocus}
      onCreate={(date) => {
        setEventsFocus(date)
        openCreate(date)
      }}
      onShowDetail={(event) => openEventPage(event.id)}
      onEdit={openEdit}
      onCopy={(event) => go({ page, create: todayIso(), copy: event.id })}
      onDelete={deleteEvent}
      onOpenSponsorship={(request) => (request?.eventId ? openEventPage(request.eventId) : navigate("받은 제안"))}
      onNotice={showNotice}
      canSubscribe={member}
      onExplore={students ? () => go({ page, explore: true }) : undefined}
    />
  )

  // 리스팅과 행사가 도착한 뒤 대시보드 히어로 아래에 보이는 새 회원의
  // 체크리스트(공용 데모 계정에는 없다).
  const checklist =
    member && account && listingFor === account.id && eventsFor === viewer ? (
      <ProfileChecklist
        accountId={account.id}
        role={account.role}
        listing={listing}
        hasEvent={events.length > 0}
        onEditProfile={() => go({ page, profile: "edit" })}
        onCreate={() => openCreate()}
      />
    ) : undefined

  const renderPage = (): ReactNode => {
    if (view.missing) return <NotFoundPage onHome={goHome} onNavigate={navigate} role={role} />
    if (view.home) {
      // 저장된 세션을 확인하는 동안과 회원이 대시보드로 넘어가는 동안은
      // 아무것도 보이지 않는다.
      if (!authReady || account) return null
      return (
        <LandingPage
          onSignup={(side) => openAuth("signup", side)}
          onBrowse={(side) => openExample(side)}
          onOpenExample={openExample}
          onOpenFaq={openFaq}
          onInstall={installKind === "app" ? undefined : startInstall}
        />
      )
    }
    if (view.faq) {
      return (
        <FaqPage
          account={account}
          askNow={askOnFaq}
          onAnswersRead={setInquiries}
          onAsked={() => setAskOnFaq(false)}
          onLogin={() => openAuth("login")}
        />
      )
    }
    if (view.board) {
      return <BoardPage onOpen={openPost} onWrite={() => writePost()} reload={boardTick} role={role} visitor={visitor} />
    }
    if (view.post) {
      return (
        <PostPage
          id={view.post}
          role={role}
          visitor={visitor}
          reload={boardTick}
          onBack={() => goBack({ page, board: true })}
          onApply={applyToPost}
          onEdit={(post) => writePost(post)}
          onDeleted={() => {
            setBoardTick((tick) => tick + 1)
            go({ page, board: true }, true)
          }}
          onOpenProfile={(listingId) => go({ page: students ? "추천 매칭" : "단체 찾기", detail: listingId })}
          onOpenEvent={openEventPage}
          onOpenInbox={() => navigate(students ? "받은 협찬" : "받은 제안")}
          onNotice={showNotice}
        />
      )
    }
    if (view.eventPage) {
      // 브랜드 자신의 캠페인은 자기 페이지가 있고, 그 밖의 것은 단체의 행사다.
      if (!students && eventsFor !== viewer) return null
      const campaign = students ? undefined : events.find((event) => event.id === view.eventPage)
      if (campaign) {
        return (
          <CampaignDetailPage
            campaign={campaign}
            onBack={() => goBack({ page })}
            onEdit={openEdit}
            onCopy={(event) => go({ page, create: todayIso(), copy: event.id })}
            onFindGroups={() => navigate("단체 찾기")}
            onOpenResults={() => navigate("성과 분석")}
          />
        )
      }
      return (
        <EventDetailPage
          id={view.eventPage}
          onBack={() => goBack({ page })}
          onEdit={(eventId) => go({ page, edit: eventId })}
          onCopy={(eventId) => go({ page, create: todayIso(), copy: eventId })}
          onOpenGroup={students ? undefined : (listingId) => go({ page: "단체 찾기", detail: listingId })}
          onNotice={showNotice}
        />
      )
    }
    if (view.admin) return <AdminPage onNotice={showNotice} />
    if (view.legal) return <LegalPage kind={view.legal} onSwitch={(legal) => openLegal(legal)} />
    if (view.agreement) {
      return (
        <AgreementPage
          id={view.agreement}
          loggedIn={account !== null}
          goalsSaved={goalsSaved}
          paid={paid}
          onBack={() => goBack({ page, agreements: true })}
          onEditGoals={account ? editGoals : undefined}
          onError={handleError}
          onLogin={() => openAuth("login")}
          onNotice={showNotice}
        />
      )
    }
    if (view.council) {
      return <CouncilPage onBack={() => goBack({ page, profile: "page" })} onNotice={showNotice} />
    }
    if (view.ledger) return <LedgerPage token={view.ledger} />
    if (view.explore) {
      return <ExplorePage onBack={() => goBack({ page: "내 행사" })} onOpenEvent={(eventId) => go({ page, eventPage: eventId })} />
    }
    if (view.insight || view.sharedReport) {
      return (
        <InsightPage
          id={view.insight}
          loggedIn={account !== null}
          onBack={() => goBack({ page: "성과 분석" })}
          onLogin={() => (account ? go({ page: "대시보드" }) : openAuth("signup", "브랜드"))}
          onNotice={showNotice}
          onOpenGroup={(listingId) => go({ page: "단체 찾기", detail: listingId })}
          paid={paid}
          shareToken={view.sharedReport}
        />
      )
    }
    if (view.agreements) {
      return (
        <AgreementsPage
          loggedIn={account !== null}
          onBack={() => goBack({ page })}
          onLogin={() => openAuth("login")}
          onOpen={openAgreement}
        />
      )
    }
    if (view.invite) {
      return (
        <InvitePage
          account={account}
          code={view.invite}
          onAccepted={(next, group) => {
            setListing(next)
            showNotice(t("가게를 연결했어요. {name}에 알렸어요.", { name: group }))
          }}
          onEditProfile={() => go({ page, profile: "edit" })}
          onError={handleError}
          onLogin={() => openAuth("login", "브랜드")}
          onHome={goHome}
          onNavigate={navigate}
          onSignup={() => openAuth("signup", "브랜드")}
        />
      )
    }
    if (editing !== null) {
      const event = events.find((item) => item.id === editing)
      // 행사를 불러오는 동안은 아무것도 보이지 않고, 없는 행사는 404 페이지로
      // 간다.
      if (!event) return eventsFor === viewer ? <NotFoundPage onHome={goHome} onNavigate={navigate} role={role} /> : null
      return (
        <EventCreatePage
          key={event.id}
          role={role}
          event={event}
          initialDate={event.date}
          onCancel={() => goBack({ page })}
          onSubmit={updateEvent}
        />
      )
    }
    if (creating !== null) {
      const copySource = view.copy ? events.find((item) => item.id === view.copy) : undefined
      return (
        <EventCreatePage
          // 폼은 복사한 행사를 한 번만 받는다. 주소로 바로 열어 행사가 나중에
          // 도착하면 다시 시작한다.
          key={copySource?.id ?? "new"}
          role={role}
          copyFrom={copySource}
          initialDate={creating}
          onCancel={() => goBack({ page })}
          onSubmit={createEvent}
        />
      )
    }
    if (profileOpen && account && view.profile === "edit") {
      return (
        <ProfileEditPage
          // 폼은 리스팅을 한 번만 받는다. 주소로 바로 열면 리스팅이 도착할 때
          // 다시 시작한다.
          key={listing?.id ?? "new"}
          role={role}
          listing={listing}
          onCancel={() => goBack({ page, profile: "page" })}
          onSave={saveProfile}
        />
      )
    }
    if (profileOpen && account) {
      return (
        <ProfilePage
          canInvite={member && !account.asMember}
          account={account}
          listing={listing}
          activity={activity}
          onBack={() => goBack({ page })}
          onEdit={() => go({ page, profile: "edit" })}
          onNavigate={navigate}
          onLogout={logout}
          onChangePassword={() => setActiveModal("password")}
          onTwoFactor={member ? () => setActiveModal("two-factor") : undefined}
          onDevices={member ? () => setActiveModal("devices") : undefined}
          onPayments={account ? () => setActiveModal("payments") : undefined}
          onPlan={account?.role === "브랜드" ? showNotice : undefined}
          onAd={showNotice}
          onTeam={member ? () => setActiveModal("team") : undefined}
          onCouncil={member && account && councilTypes.includes(account.type) ? () => go({ page, council: true }) : undefined}
          onCouncilLink={member && account?.role === "학생단체" ? () => setActiveModal("council-link") : undefined}
          socialProviders={member ? socialProviders : []}
          onSocialLink={(provider) =>
            api.socialStart(provider, "link").then(
              ({ url }) => window.location.assign(url),
              (error: unknown) => showNotice(errorMessage(error)),
            )
          }
          onSocialUnlink={(provider) =>
            api.socialUnlink(provider).then(
              (result) => {
                setAccount(result.account)
                showNotice(t("{provider} 연결을 끊었어요. 이메일로는 그대로 로그인할 수 있어요.", { provider: t(socialNames[provider]) }))
              },
              (error: unknown) => showNotice(errorMessage(error)),
            )
          }
          onChangeContact={() => setActiveModal("contact")}
          onChangeEmail={() => setActiveModal("email")}
          onDownloadData={downloadData}
          onLeave={() => setActiveModal("leave")}
          blocked={member ? blocked : undefined}
          onUnblock={unblock}
          business={checksBusiness && business ? business : undefined}
          onVerifyBusiness={() => setActiveModal("business")}
          onPause={member ? pauseListing : undefined}
          onMail={member ? saveMailOff : undefined}
        />
      )
    }
    if (chatOpen && view.chat) {
      const browsePage: NavLabel = students ? "추천 매칭" : "단체 찾기"
      return (
        <ChatPage
          canSendFiles={member}
          id={view.chat}
          onBack={() => goBack({ page, messages: true })}
          onChange={updateConversation}
          onSessionEnd={handleSessionEnd}
          onReport={
            member
              ? (message) =>
                  openSafety("report", {
                    kind: "message",
                    conversationId: view.chat!,
                    messageId: message.id,
                    name: partnerName ?? t("상대"),
                    // 파일은 보낼 때의 이름으로 보인다.
                    text: message.text || (message.attachment?.name ?? ""),
                  })
              : undefined
          }
          onOpenPartner={(partnerId) =>
            catalog.some((match) => match.id === partnerId)
              ? go({ page: browsePage, detail: partnerId })
              : showNotice(t("상세 정보를 열 수 없는 상대예요."))
          }
        />
      )
    }
    if (view.messages) {
      return (
        <MessagesPage
          conversations={conversations}
          loggedIn={account !== null}
          onBack={() => goBack({ page })}
          onLogin={() => openAuth("login")}
          onOpen={(conversation) => go({ page, chat: conversation.id })}
        />
      )
    }
    switch (page) {
      case "추천 매칭":
        return (
          <MatchesPage
            matches={matches}
            brands={brands}
            loaded={catalogReady}
            proposals={proposals}
            statuses={statuses}
            saved={saved}
            onToggleSave={toggleSaved}
            onOpenDetail={openDetail}
            onPropose={propose}
            onCancelProposal={cancelProposal}
            onInvite={inviteShop}
            visitor={visitor}
            onLogin={() => openAuth("login")}
            onSignup={() => openAuth("signup")}
          />
        )
      case "내 행사":
      case "행사 일정":
        return eventsPage
      case "성과":
        return (
          <MeasurementPage
            measurements={measurements}
            metrics={metrics}
            report={report}
            onSelect={setMeasuredId}
            onUpdate={updateMeasurement}
            onOpenQr={() => setActiveModal("qr")}
            onOpenAgreements={openAgreements}
            onShowLog={openLog}
          />
        )
      case "리포트":
        return (
          <ReportsPage
            measurements={measurements}
            report={report}
            onSelect={setMeasuredId}
            metrics={metrics}
            exporting={exporting}
            onDownload={saveReport}
            onOpenReport={() => setActiveModal("report")}
            onOpenGoal={openGoal}
            onNotice={member && students ? showNotice : undefined}
            terms={account?.terms ?? []}
            onSaveTerms={
              member && students
                ? async (terms) => {
                    try {
                      setAccount((await api.saveTerms(terms)).account)
                      showNotice(t("기수를 저장했어요."))
                      return true
                    } catch (error) {
                      handleError(error)
                      return false
                    }
                  }
                : undefined
            }
          />
        )
      case "단체 찾기":
        return (
          <GroupsPage
            matches={matches}
            groups={groups}
            loaded={catalogReady}
            onEditProfile={() => go({ page, profile: "edit" })}
            proposals={proposals}
            statuses={statuses}
            saved={saved}
            onToggleSave={toggleSaved}
            onOpenDetail={openDetail}
            onPropose={propose}
            onCancelProposal={cancelProposal}
            onProposeMany={member ? proposeMany : undefined}
            visitor={visitor}
            onLogin={() => openAuth("login")}
            onSignup={() => openAuth("signup")}
          />
        )
      case "받은 제안":
        return (
          <InboxPage
            requests={requests}
            sent={sent}
            onAnswer={answerRequest}
            onWithdraw={withdrawProposal}
            onOpenAgreement={openAgreement}
            onOpenEvent={openEventPage}
          />
        )
      case "받은 협찬":
        return (
          <OffersPage
            brands={brands}
            offers={offers}
            sent={sent}
            onAnswer={answerOffer}
            onWithdraw={withdrawProposal}
            onOpenAgreement={openAgreement}
          />
        )
      case "성과 분석":
        return (
          <AnalyticsPage
            onOpenReport={(id) => go({ page: "성과 분석", insight: id })}
            onOpenPlan={() => (account ? setActiveModal("plan") : openAuth("signup", "브랜드"))}
            exporting={exportingAnalytics}
            onDownload={() => setExportingAnalytics(true)}
            sponsorships={sponsorships}
            campaign={
              <CampaignMeasurement
                measurements={measurements}
                metrics={metrics}
                report={report}
                onSelect={setMeasuredId}
                onUpdate={updateMeasurement}
                onOpenQr={() => setActiveModal("qr")}
                onOpenAgreements={openAgreements}
                onShowLog={openLog}
              />
            }
          />
        )
      default:
        return students ? (
          <DashboardPage
            accountName={account?.name}
            matches={matches}
            brands={brands}
            loaded={catalogReady}
            events={events}
            proposals={proposals}
            statuses={statuses}
            confirmedCount={confirmedCount}
            metrics={metrics}
            report={report}
            updatedAt={updatedAt}
            onNavigate={navigate}
            onOpenDetail={openCatalogDetail}
            onPropose={propose}
            onCancelProposal={cancelProposal}
            onOpenReport={() => setActiveModal("report")}
            onInstall={installKind === "app" ? undefined : startInstall}
            demo={visitor}
            paused={listing?.pausedAt !== undefined}
            onResume={() => pauseListing(false)}
            checklist={checklist}
          />
        ) : (
          <BrandDashboardPage
            accountName={account?.name}
            demo={visitor}
            matches={matches}
            groups={groups}
            loaded={catalogReady}
            requests={requests}
            sponsorships={sponsorships}
            proposals={proposals}
            statuses={statuses}
            updatedAt={updatedAt}
            onNavigate={navigate}
            onOpenDetail={openCatalogDetail}
            onAccept={(request) => answerRequest(request, "accept")}
            onPropose={propose}
            onCancelProposal={cancelProposal}
            onInstall={installKind === "app" ? undefined : startInstall}
            paused={listing?.pausedAt !== undefined}
            onResume={() => pauseListing(false)}
            checklist={checklist}
          />
        )
    }
  }

  // 메뉴 페이지 옆의, 계정이 처리할 일의 개수. 방문자에게는 없다. 데모 데이터의
  // 개수가 자기 알림처럼 읽히기 때문이다.
  const badges: Partial<Record<NavLabel, number>> = !account
    ? {}
    : students
      ? { "추천 매칭": matches.length, "받은 협찬": pendingOffers.length }
      : { "받은 제안": pendingRequests.length }
  // 소개를 보는 방문자와, 데모 데이터로 보여 주는 회원 화면을 보는
  // 방문자(헤더에 예시로 표시한다).
  const landing = view.home === true && visitor
  const demoScreen = visitor && !view.home && !view.faq && !view.legal && !view.admin && !view.invite && !view.missing

  return (
    <div className="app-shell">
      {/* 본문으로 가는 링크(프래그먼트는 히스토리 항목을 추가하므로 쓰지 않는다). */}
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById("main")?.focus()
        }}
      >
        {t("본문으로 건너뛰기")}
      </a>
      <Loader />
      {site?.maintenance && (
        <div className="maintenance-screen" role="alert">
          <div>
            <span className="eyebrow">{t("점검 중")}</span>
            <h1>{t("잠시 점검하고 있어요")}</h1>
            <p>{site.maintenance.message || t("곧 다시 열게요. 조금 뒤에 다시 들러 주세요.")}</p>
          </div>
        </div>
      )}

      <Header
        role={role}
        activeNav={menuPage}
        account={account}
        authReady={authReady}
        badges={badges}
        events={schedule}
        notifications={notifications}
        isUnread={(item) => isUnread(item, readNotices)}
        notificationsOpen={notificationsOpen}
        menuOpen={menuOpen}
        unreadMessages={unreadMessages}
        landing={landing}
        demo={demoScreen}
        onHome={goHome}
        onNavigate={navigate}
        onSwitchRole={switchRole}
        onCreate={() => openCreate()}
        onOpenEvent={openEventsOn}
        onOpenMessages={openMessages}
        onOpenAnswers={() => {
          setAskOnFaq(true)
          openFaq()
        }}
        onToggleNotifications={() => setNotificationsOpen((open) => !open)}
        onCloseNotifications={closeNotifications}
        onReadNotices={markNoticesRead}
        onOpenProfile={openProfile}
        onLogout={logout}
        onLogin={() => openAuth("login")}
        onSignup={() => openAuth("signup")}
        onOpenMenu={() => {
          setNotificationsOpen(false)
          setMenuOpen(true)
        }}
      />

      <main className="main-content" id="main" tabIndex={-1}>
        <SiteNotices viewer={account?.id ?? ""} />
        {/* 페이지가 바뀔 때마다 새 key를 주어 페이지의 등장 효과를 다시
           재생한다. 상세 페이지는 목록을 덮으며, 목록은 마운트된 채(탭과
           스크롤을 유지) 남아 있다가 돌아올 때 다시 보인다. */}
        <div
          className={fromHistory ? "page-enter from-history" : "page-enter"}
          hidden={detailMatch !== undefined}
          key={`${role}:${
            view.missing
              ? "missing"
              : view.faq
                ? "faq"
                : view.legal
                  ? `legal-${view.legal}`
                  : view.admin
                    ? "admin"
                  : view.invite
                    ? `invite-${view.invite}`
                  : view.agreement
                    ? `agreement-${view.agreement}`
                  : view.agreements
                    ? "agreements"
                  : view.council
                    ? "council"
                  : view.explore
                    ? "explore"
                  : view.ledger
                    ? `ledger-${view.ledger}`
                  : view.insight || view.sharedReport
                    ? `insight-${view.insight ?? view.sharedReport}`
                  : editing !== null
                    ? `edit-${editing}`
                  : creating !== null
              ? "create"
              : profileOpen
                ? `profile-${view.profile}`
                : chatOpen
                  ? `chat-${view.chat}`
                  : view.messages
                    ? "messages"
                    : page
          }`}
        >
          <Suspense fallback={<PageLoading />}>{renderPage()}</Suspense>
        </div>
        {detailMatch && (
          <div
            className={fromHistory ? "page-enter from-history" : "page-enter"}
            key={`detail:${detailMatch.id}`}
          >
            <Suspense fallback={<PageLoading />}>
            <MatchDetailPage
              match={detailMatch}
              kind={students ? "brand" : "group"}
              viewer={{
                // 방문자는 자기 쪽의 데모 계정으로 둘러본다.
                name: listing?.name ?? account?.name ?? demoAccounts[role].name,
                mark: listing ?? { industry: students ? "performance" : "cafe" },
              }}
              done={proposals.includes(detailMatch.id)}
              status={statuses[detailMatch.id]}
              onBack={() => goBack({ page })}
              onChat={() => openChat(detailMatch)}
              onPropose={() => propose(detailMatch)}
              onCancel={() => cancelProposal(detailMatch)}
              saved={saved.includes(detailMatch.id)}
              onToggleSave={() => toggleSaved(detailMatch)}
              onOpenEvent={openEventPage}
              onReport={
                member
                  ? () => openSafety("report", { kind: "account", listingId: detailMatch.id, name: detailMatch.name })
                  : undefined
              }
              onBlock={
                member
                  ? () => openSafety("block", { kind: "account", listingId: detailMatch.id, name: detailMatch.name })
                  : undefined
              }
              onReportReview={
                member
                  ? (review) =>
                      openSafety("report", { kind: "review", reviewKey: review.key, name: review.authorName, text: review.comment })
                  : undefined
              }
              onReportReply={
                member
                  ? (review) =>
                      openSafety("report", {
                        kind: "reply",
                        reviewKey: review.key,
                        name: detailMatch.name,
                        text: review.reply?.text ?? "",
                      })
                  : undefined
              }
            />
            </Suspense>
          </div>
        )}
      </main>

      {/* 대화는 메시지 입력창을 화면 아래에 둔다. 가입 유도는 소개와 대시보드의
         푸터 머리에만 나온다. */}
      {!chatOpen && (
        <Footer
          role={role}
          account={account}
          invite={landing || viewPath(view) === viewPath({ page: "대시보드" })}
          landing={landing}
          onInstall={installKind === "app" ? undefined : startInstall}
          onNavigate={navigate}
          onSwitchRole={switchRole}
          onCreate={() => openCreate()}
          onOpenMessages={openMessages}
          onOpenProfile={openProfile}
          onOpenFaq={openFaq}
          onOpenLegal={openLegal}
          onEditProfile={() => go({ page, profile: "edit" })}
          onLogin={() => openAuth("login")}
          onSignup={() => openAuth("signup")}
          onLogout={logout}
        />
      )}

      <Presence show={menuOpen}>
        <NavMenu
          role={role}
          activeNav={menuPage}
          account={account}
          badges={badges}
          unreadMessages={unreadMessages}
          onHome={goHome}
          onNavigate={navigate}
          onSwitchRole={switchRole}
          onCreate={() => openCreate()}
          onOpenMessages={openMessages}
          onOpenAgreements={openAgreements}
          onOpenBoard={openBoard}
          onOpenProfile={openProfile}
          onOpenFaq={openFaq}
          onLogin={() => openAuth("login")}
          onSignup={() => openAuth("signup")}
          installable={installKind !== "app"}
          onInstall={startInstall}
          onClose={closeMenu}
        />
      </Presence>

      {/* 팝업은 닫히는 애니메이션이 끝날 때까지 화면에 남고, 처음 열릴 때
         불러온다. */}
      <Suspense fallback={null}>
      {report && (
        <Presence show={activeModal === "metric-log"}>
          <MetricLogModal
            eventId={report.eventId}
            role={role}
            kind={logKind === "all" ? undefined : logKind}
            total={
              logKind === "all" ? metrics.scans + metrics.coupons + metrics.visits : metrics[logKind]
            }
            startsOn={measureState(report) === "진행 전" ? report.eventDate : undefined}
            onClose={closeModal}
          />
        </Presence>
      )}
      {goal && (
        <Presence show={activeModal === "goal"}>
          <GoalModal kpi={goal} onClose={closeModal} />
        </Presence>
      )}
      <Presence show={activeModal === "install"}>
        <InstallGuideModal kind={installKind} onClose={closeModal} />
      </Presence>
      {report && (
        <Presence show={activeModal === "report"}>
          <ReportModal
            report={report}
            metrics={metrics}
            onClose={closeModal}
            onDownload={saveReport}
          />
        </Presence>
      )}
      {report && (
        <Presence show={activeModal === "measure-goals"}>
          <GoalsModal
            report={report}
            onClose={closeModal}
            onSaved={(next) => {
              updateMeasurement(next)
              setGoalsSaved((count) => count + 1)
              setActiveModal(null)
              showNotice(t("목표를 저장했어요. 리포트에 바로 반영돼요."))
            }}
          />
        </Presence>
      )}
      {report && (
        <Presence show={activeModal === "qr"}>
          <QrModal
            report={report}
            onClose={closeModal}
            onCopied={showNotice}
            onRotatePin={async (page) => {
              try {
                updateMeasurement({ eventId: report.eventId, ...(await api.rotateEventPin(report.eventId, page)) })
                showNotice(t("새 PIN을 만들었어요. 지금까지 쓰던 PIN은 막혔어요."))
              } catch (error) {
                showNotice(errorMessage(error))
              }
            }}
          />
        </Presence>
      )}
      <Presence show={activeModal === "login"}>
        <LoginModal
          initialRole={authRole}
          onClose={closeModal}
          onLoggedIn={(session) =>
            startSession(session, t("{name} 계정으로 로그인했어요.", { name: session.account.name }))
          }
          onSignup={(next) => openAuth("signup", next)}
          onForgot={(email) => {
            setResetEmail(email)
            setActiveModal("reset")
          }}
          onJoin={() => setActiveModal("join")}
          providers={socialProviders}
          initialTicket={socialTicket ?? undefined}
        />
      </Presence>
      {account && (
        <Presence show={activeModal === "leave"}>
          <LeaveModal
            account={account}
            onClose={closeModal}
            onLeft={() => {
              endSession()
              setActiveModal(null)
              showNotice(t("탈퇴했어요. 그동안 함께해 주셔서 고마워요."))
            }}
          />
        </Presence>
      )}
      {account && (
        <Presence show={activeModal === "two-factor"}>
          <TwoFactorModal
            account={account}
            onClose={closeModal}
            onSaved={(next, on) => {
              setAccount(next)
              if (on) return
              setActiveModal(null)
              showNotice(t("2단계 인증을 껐어요."))
            }}
          />
        </Presence>
      )}
      <Presence show={activeModal === "payments"}>
        <PaymentsModal onClose={closeModal} onNotice={showNotice} />
      </Presence>
      <Presence show={activeModal === "devices"}>
        <DevicesModal onClose={closeModal} onNotice={showNotice} />
      </Presence>
      <Presence show={activeModal === "council-link"}>
        <CouncilLinkModal onClose={closeModal} onNotice={showNotice} />
      </Presence>
      <Presence show={activeModal === "team"}>
        <TeamModal onClose={closeModal} onNotice={showNotice} />
      </Presence>
      <Presence show={activeModal === "join"}>
        <JoinTeamModal
          onClose={closeModal}
          onJoined={() => {
            closeModal()
            showNotice(t("서류를 보냈어요. 운영자가 확인하면 메일로 알려 드려요."))
          }}
          onLogin={() => openAuth("login")}
        />
      </Presence>
      <Presence show={activeModal === "password"}>
        <PasswordModal
          onClose={closeModal}
          onChanged={() => {
            setActiveModal(null)
            showNotice(t("비밀번호를 바꿨어요. 다른 기기에서는 로그아웃됐어요."))
          }}
        />
      </Presence>
      {account && (
        <Presence show={activeModal === "contact"}>
          <ContactModal
            account={account}
            onClose={closeModal}
            onSaved={(next) => {
              setAccount(next)
              setActiveModal(null)
              showNotice(t("담당자 정보를 바꿨어요."))
            }}
          />
        </Presence>
      )}
      <Presence show={activeModal === "email"}>
        <EmailChangeModal
          onClose={closeModal}
          onChanged={(next) => {
            setAccount(next)
            setActiveModal(null)
            showNotice(t("로그인 이메일을 바꿨어요. 다른 기기에서는 로그아웃됐어요."))
          }}
        />
      </Presence>
      {account && (
        <Presence show={activeModal === "business"}>
          <BusinessModal
            onClose={closeModal}
            onVerified={(verified) => {
              setBusiness({ ready: true, business: verified })
              closeModal()
              showNotice(t("사업자 확인을 마쳤어요. 소개에 '사업자 확인'이 붙어요."))
            }}
          />
        </Presence>
      )}
      {account && safety && (
        <Presence show={activeModal === "safety"}>
          <SafetyModal mode={safety.mode} onClose={closeModal} onDone={safetyDone} target={safety.target} />
        </Presence>
      )}
      <Presence show={activeModal === "plan"}>
        <PlanModal onClose={closeModal} onNotice={showNotice} />
      </Presence>
      {account && proposingMany && proposingMany.length > 0 && (
        <Presence show={activeModal === "propose-many"}>
          <ProposeModal
            events={events}
            match={proposingMany[0]}
            targets={proposingMany}
            templates={account.templates ?? []}
            onClose={closeModal}
            onCreate={() => {
              closeModal()
              openCreate()
            }}
            onSend={sendMany}
            role={role}
          />
        </Presence>
      )}
      {account && proposing && (
        <Presence show={activeModal === "propose"}>
          <ProposeModal
            events={events}
            match={proposing}
            templates={account.templates ?? []}
            onSaveTemplates={
              member
                ? async (templates) => {
                    const result = await api.saveTemplates(templates)
                    setAccount(result.account)
                    showNotice(t("제안 문구를 저장했어요."))
                  }
                : undefined
            }
            onClose={closeModal}
            onCreate={() => {
              closeModal()
              openCreate()
            }}
            onSend={sendProposal}
            role={role}
          />
        </Presence>
      )}
      {account && postForm && (
        <Presence show={activeModal === "post"}>
          <PostFormModal
            events={events}
            onClose={closeModal}
            onCreateEvent={() => {
              closeModal()
              openCreate()
            }}
            onSave={savePost}
            post={postForm === "new" ? undefined : postForm}
            role={role}
          />
        </Presence>
      )}
      {account && inviting && (
        <Presence show={activeModal === "invite"}>
          <InviteShopModal
            code={inviting.code}
            event={nextEvent(events)}
            group={listing?.name ?? account.name}
            onClose={closeModal}
            onNotice={showNotice}
            place={inviting.place}
            school={listing?.school ?? account.school}
          />
        </Presence>
      )}
      <Presence show={activeModal === "reset"}>
        <ResetPasswordModal
          initialEmail={resetEmail}
          onClose={closeModal}
          onReset={(session) =>
            startSession(session, t("새 비밀번호로 바꾸고 로그인했어요."))
          }
          onLogin={() => openAuth("login")}
          onNotice={showNotice}
        />
      </Presence>
      <Presence show={activeModal === "signup"}>
        <SignupModal
          initialRole={authRole}
          invite={view.invite}
          onClose={closeModal}
          onPending={() => {
            closeModal()
            showNotice(t("서류를 보냈어요. 운영자가 확인하면 메일로 알려 드려요."))
          }}
          onSignedUp={(session) => {
            track("sign_up", { method: "email", role: session.account.role })
            startSession(session, t("{name} 계정으로 가입했어요. 환영해요!", { name: session.account.name }))
          }}
          onLogin={(next) => openAuth("login", next)}
          onNotice={showNotice}
        />
      </Presence>

      </Suspense>

      <Suspense fallback={null}>
      {exporting && report && (
        <ReportExport
          report={report}
          metrics={metrics}
          author={account?.name ?? "uniconnect"}
          onDone={finishExport}
        />
      )}

      {exportingAnalytics && (
        <AnalyticsExport
          sponsorships={sponsorships}
          author={account?.name ?? "uniconnect"}
          onDone={finishAnalyticsExport}
        />
      )}
      </Suspense>

      <Presence show={notice !== ""}>
        <Toast id={noticeId} message={notice} onDismiss={hideNotice} onPause={pauseNotice} />
      </Presence>
    </div>
  )
}

// 화면의 코드가 도착하는 동안 보인다.
function PageLoading() {
  return (
    <p className="page-loading" role="status">
      {t("불러오고 있어요…")}
    </p>
  )
}

export default App
