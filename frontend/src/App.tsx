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
import { entryView, roleOfPage, viewPath, type HistoryEntry, type View } from "./lib/route"
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

// Screens and popups that aren't on the first screen load the first time
// they open, so the first page downloads less (lazy chunks; Suspense below).
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
const EventDetailPage = lazy(() => import("./pages/EventDetailPage").then((module) => ({ default: module.EventDetailPage })))
const BoardPage = lazy(() => import("./pages/BoardPage").then((module) => ({ default: module.BoardPage })))
const PostPage = lazy(() => import("./pages/PostPage").then((module) => ({ default: module.PostPage })))
const PostFormModal = lazy(() => import("./modals/PostFormModal").then((module) => ({ default: module.PostFormModal })))
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


// The screen to open with: the history entry's on a reload while it still
// fits the address, else the address.
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
  const [view, setView] = useState<View>(initialView)
  // True when the view came from the back or forward button (or a swipe).
  const [fromHistory, setFromHistory] = useState(false)
  const [activeModal, setActiveModal] = useState<ModalName | null>(null)
  // The partner 제안하기 was pressed for, while its form is open.
  const [proposing, setProposing] = useState<Match | null>(null)
  // What 신고하기 or 차단하기 was pressed for, while its form is open.
  const [safety, setSafety] = useState<{ mode: "report" | "block"; target: SafetyTarget } | null>(null)
  // The accounts this one blocked, for 내 정보.
  const [blocked, setBlocked] = useState<BlockedListing[]>([])
  // The listings it saved (찜), newest first, for the catalogs' 찜 tab.
  const [saved, setSaved] = useState<string[]>([])
  // The recruitment board: the post being written or edited, the post an
  // application goes to, and a count that moves on to load the board again.
  const [postForm, setPostForm] = useState<BoardPost | "new" | null>(null)
  const [applyingPost, setApplyingPost] = useState<string | null>(null)
  const [boardTick, setBoardTick] = useState(0)
  // A brand's business check, read when 내 정보 opens.
  const [business, setBusiness] = useState<BusinessStatus | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  // With a saved token, role-specific data waits until /auth/me answers.
  const [authReady, setAuthReady] = useState(() => getToken() === null)
  // Visitors preview either role (the one the address belongs to, at first);
  // a logged-in account always uses its own.
  const [previewRole, setPreviewRole] = useState<Role>(
    () => (initialView.invite ? "브랜드" : roleOfPage(initialView.page) ?? "학생단체"),
  )
  // Role pre-selected when the login or sign-up form opens.
  const [authRole, setAuthRole] = useState<Role>("학생단체")
  // The email the login form had when 비밀번호 찾기 opened.
  const [resetEmail, setResetEmail] = useState("")
  // The shop a student group is inviting and its invitation's code.
  const [inviting, setInviting] = useState<{ place: NearbyPlace; code: string } | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [proposals, setProposals] = useState<string[]>([])
  // Answers from brands that replied to the student group's proposals.
  const [statuses, setStatuses] = useState<ProposalState["statuses"]>({})
  const [confirmedCount, setConfirmedCount] = useState(0)
  // Proposals the account sent, for the inbox's 검토 중 beside those it received.
  const [sent, setSent] = useState<SentProposal[]>([])
  // Moves on every minute and when the window comes back into view, so
  // answers from the other side show without reloading.
  const [refreshTick, setRefreshTick] = useState(0)
  // Each of the student group's events with its live counts and report, and
  // the one the measurement pages show (the default one until picked).
  const [measurements, setMeasurements] = useState<EventMeasurement[]>([])
  const [measuredId, setMeasuredId] = useState<string | null>(null)
  // Counts goals saved from an agreement, so the agreement reads them again.
  const [goalsSaved, setGoalsSaved] = useState(0)
  // Counts payments the payment window finished, so pages read them again.
  const [paid, setPaid] = useState(0)
  // Brand catalog that student groups browse on the matches page.
  const [brands, setBrands] = useState<Match[]>([])
  // Brand side: the student group catalog, proposals received and results.
  const [groups, setGroups] = useState<Match[]>([])
  // Whose catalog has arrived ("role accountId"), so an empty one says it
  // is empty only once it has loaded.
  const [catalogFor, setCatalogFor] = useState<string | null>(null)
  // Whose events have arrived, as catalogFor is for the catalog.
  const [eventsFor, setEventsFor] = useState<string | null>(null)
  const [requests, setRequests] = useState<SponsorRequest[]>([])
  const [offers, setOffers] = useState<SponsorOffer[]>([])
  const [sponsorships, setSponsorships] = useState<Sponsorship[]>([])
  // The account's own listing (null until written) and its conversations.
  const [listing, setListing] = useState<Match | null>(null)
  // Whose listing has arrived (an account id), so the dashboard's checklist
  // waits for it rather than counting steps as left.
  const [listingFor, setListingFor] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  // The account's questions to the operators, for the bell's answer notice.
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  // The bell's answer notice opens the help center's questions at once.
  const [askOnFaq, setAskOnFaq] = useState(false)
  // Day the 내 행사 calendar opens on, such as a just-registered event's.
  const [eventsFocus, setEventsFocus] = useState<string | undefined>(undefined)
  // Which history or goal the open modal shows.
  const [logKind, setLogKind] = useState<MetricKind | "all">("all")
  const [goalKey, setGoalKey] = useState<KpiKey>("reach")
  const [exporting, setExporting] = useState(false)
  // Brands' analytics report, made by AnalyticsExport the same way.
  const [exportingAnalytics, setExportingAnalytics] = useState(false)
  // The notifications panel under the bell.
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  // The full-screen menu (the Menu button in the header).
  const [menuOpen, setMenuOpen] = useState(false)
  // Where to scroll once a view from the history has rendered.
  const restoreScroll = useRef<number | null>(null)
  // When matches and events were last loaded, shown on the dashboard.
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const { notice, showNotice } = useNotice()
  // How 앱 다운로드 works in this browser (lib/install.ts); "app" inside the
  // installed app, which shows no button.
  const installKind = useInstallState()

  const role = account?.role ?? previewRole
  const accountId = account?.id
  // Known to be logged out: not while a saved session is still checked.
  const visitor = authReady && account === null
  const students = role === "학생단체"
  // The picked page, or the dashboard when this role has no such page.
  const page = pageFor(role, view.page)
  // Day the registration page opens on; null while that page is closed.
  const creating = view.create ?? null
  // The event or campaign being edited; null while that page is closed.
  const editing = view.edit ?? null
  const profileOpen = view.profile !== undefined && account !== null
  const chatOpen = view.chat !== undefined && account !== null
  const unreadMessages = conversations.reduce((sum, item) => sum + item.unread, 0)
  // Someone new is looking (a login, a logout or the other side): their
  // lists start empty in this same render, before anything is drawn, so the
  // last viewer's data (the examples, just before logging in) never shows
  // as theirs. The effects below then load the new viewer's.
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
  // Brands for student groups, student groups for brands, and whether it
  // has arrived for whoever is looking now.
  const catalog = students ? brands : groups
  const catalogReady = catalogFor === viewer
  const detailMatch = view.detail
    ? catalog.find((match) => match.id === view.detail)
    : undefined
  const calendarPage: NavLabel = students ? "내 행사" : "행사 일정"

  // The tab title and search description follow the screen (lib/pageMeta.ts).
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

  // Buttons ripple from where they are pressed, marked blocks rise into view
  // as the page scrolls to them, and swiping sideways moves between views.
  useEffect(() => installRipple(), [])
  useEffect(() => installReveal(), [])
  useEffect(() => installSwipeNavigation(), [])

  // Every view has a history entry, so the back and forward buttons and
  // swipe gestures move between views. Scroll positions are kept per entry.
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
      // Visitors follow the entry to the side it belongs to.
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

  // Once the account is known, an address it can't use (the other side's
  // page, or 내 정보 and registration while logged out) is corrected to the
  // page on screen, and a member opening the introduction goes on to the
  // dashboard.
  useEffect(() => {
    if (!authReady) return
    const usable =
      view.page === page &&
      (account !== null ? !view.home : !view.profile && !view.create && !view.edit && !view.chat)
    if (!usable) go({ page }, true)
  })

  // The login providers the server offers (routes/social.ts).
  const [socialProviders, setSocialProviders] = useState<SocialProvider[]>([])
  useEffect(() => {
    api.socialProviders().then(
      (result) => setSocialProviders(result.providers),
      () => undefined,
    )
  }, [])
  // A login back from Kakao or Naver that still asks for the two-step code.
  const [socialTicket, setSocialTicket] = useState<{ email: string; ticket: CodeTicket } | null>(null)

  // Restore the saved session. An expired one is dropped. While the server
  // cannot be reached the token stays and the page waits, trying again a
  // little later each time: going on as a visitor would show a visitor's
  // screens while the server, still sent the token, answers as the account.
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

  // What the role and account see, loaded when they change and refreshed in
  // the background. Each request applies on its own, so one failing leaves
  // the rest current; only a first load says so.
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
    // Student groups browse brands and answer their offers; brands browse
    // groups, answer proposals and follow their results.
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

  // The account's own listing and conversations; the list refreshes every
  // 20 seconds so the chat button shows new messages.
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

  // The account's events (a group's events, a brand's campaigns) with their
  // measurements, again whenever its calendar changes.
  useEffect(() => {
    if (!authReady) return
    let cancelled = false
    api
      .measurements(role)
      .then((result) => {
        if (!cancelled) setMeasurements(result.measurements)
      })
      .catch(() => {
        // Connection problems are already reported by the requests above.
      })
    return () => {
      cancelled = true
    }
  }, [authReady, role, accountId, events])

  // Fresh counts and report for one event, from the measurement page.
  const updateMeasurement = useCallback((next: EventMeasurement) => {
    setMeasurements((current) => current.map((item) => (item.eventId === next.eventId ? next : item)))
  }, [])

  // Shows a view as a new history entry (or in place of the current one),
  // remembering how far the page it leaves was scrolled.
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

  // The back arrow on a page: one step back in this app's history, or
  // `fallback` when the page was opened directly.
  const goBack = (fallback: View) => {
    if ((history.state as HistoryEntry | null)?.index) history.back()
    else go(fallback, true)
  }

  const navigate = (label: NavLabel) => go({ page: label })

  // Home: the introduction for visitors, the dashboard for a member.
  const goHome = () => go(account ? { page: "대시보드" } : { page: "대시보드", home: true })

  // A member screen with the demo data of the side it belongs to, opened
  // from the introduction as a new page.
  const openExample = (side: Role, next: NavLabel = "대시보드") => {
    if (!account) setPreviewRole(side)
    go({ page: next })
  }

  const openProfile = () => go({ page, profile: "page" })

  const openMessages = () => go({ page, messages: true })

  const openFaq = () => go({ page, faq: true })

  const openLegal = (legal: LegalKind) => go({ page, legal })

  const openAgreements = () => go({ page, agreements: true })

  // The goals form for one of the account's own events, from its agreement.
  const editGoals = (eventId: string) => {
    if (!measurements.some((item) => item.eventId === eventId)) return
    setMeasuredId(eventId)
    setActiveModal("measure-goals")
  }

  const openAgreement = (id: string) => go({ page, agreement: id })

  // Keeps the conversation list (latest message first) in step with an open
  // conversation.
  const updateConversation = useCallback((updated: Conversation) => {
    setConversations((current) =>
      [{ ...updated, messages: undefined }, ...current.filter((item) => item.id !== updated.id)].sort(
        (a, b) => (b.lastMessage?.at ?? "").localeCompare(a.lastMessage?.at ?? ""),
      ),
    )
  }, [])

  const openDetail = (match: Match) => go({ page, detail: match.id })

  // The dashboard has no address for a detail page of its own, so its cards
  // open the detail over the catalog page; back returns to the dashboard.
  const openCatalogDetail = (match: Match) =>
    go({ page: students ? "추천 매칭" : "단체 찾기", detail: match.id })

  const closeModal = useCallback(() => setActiveModal(null), [])
  const closeNotifications = useCallback(() => setNotificationsOpen(false), [])
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  const openAuth = (modal: "login" | "signup", nextRole: Role = role) => {
    setAuthRole(nextRole)
    setActiveModal(modal)
  }

  // 앱 다운로드: the browser's own install dialog where it has one, else how
  // to install in this browser.
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

  // `recoveryLeft` comes with a login by two-step login: few recovery codes
  // left are worth a word.
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

  // Back from Toss Payments' window (lib/payments.ts): the answer rides in
  // the address, which loses it at once; a success is approved by the
  // server, and the page shows what was bought.
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
    api.confirmPayment({ orderId: answer.orderId, paymentKey: answer.paymentKey, amount: answer.amount }).then(
      ({ order }) => {
        showNotice(t("{name} 결제를 마쳤어요.", { name: order.orderName }))
        setPaid((count) => count + 1)
      },
      (error: unknown) => showNotice(errorMessage(error)),
    )
    // Once, as the page opens.
  }, [])

  // Back from Kakao or Naver (routes/social.ts): the outcome rides in
  // ?social=, which goes from the address at once; a login finishes here
  // with the one-time code the server left in a cookie.
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
    // Not linked yet: back to the login, to log in or sign up by email.
    if (outcome.startsWith("unlinked")) openAuth("login")
    // Once, as the page opens.
  }, [])

  const endSession = () => {
    setToken(null)
    // Keep showing the same side after logging out.
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
  // The same handling for the chat page, kept as one function so the page's
  // checking does not restart on every render.
  const latestHandleError = useRef(handleError)
  latestHandleError.current = handleError
  const handleSessionEnd = useCallback((error: unknown) => latestHandleError.current(error), [])

  const logout = async () => {
    try {
      await api.logout()
    } catch {
      // The token is dropped locally either way.
    }
    endSession()
    setActiveModal(null)
    showNotice(t("로그아웃했어요."))
  }

  const switchRole = (next: Role) => {
    if (account) return
    // From the introduction, either side's example dashboard opens.
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
      // The calendar takes the registration page's place in the history.
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
      // Proposals and sponsorships about it took its new name and dates.
      setRefreshTick((tick) => tick + 1)
      goBack({ page: calendarPage })
      showNotice(students ? t("행사 정보를 고쳤어요.") : t("캠페인 정보를 고쳤어요."))
    } catch (error) {
      handleError(error)
    }
  }

  // A student group's event page (/event/<id>).
  const openEventPage = (eventId: string) => go({ page, eventPage: eventId })

  // 상세 보기 on a calendar card: a group's event opens its page; a brand's
  // campaign goes on to finding groups, or its results once measured.
  const showEventDetail = (event: EventItem) => {
    if (students) {
      openEventPage(event.id)
      return
    }
    navigate(event.status === "측정 완료" ? "성과 분석" : "단체 찾기")
    showNotice(t("{name} 상세 흐름을 열었어요.", { name: event.name }))
  }

  function applyProposals(result: ProposalState) {
    setProposals(result.proposals)
    setStatuses(result.statuses)
    setConfirmedCount(result.confirmed)
    setSent(result.sent ?? [])
  }

  // The click and the server's acceptance are tracked apart (lib/analytics.ts).
  // The click opens the form, where the event and a note are picked.
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

  // Sends it; a problem other than an ended session stays on the form.
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

  // The recruitment board (/board) and its posts (/board/<id>).
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
  // A problem from the server stays on the form (the modal shows it).
  const savePost = async (draft: PostDraft) => {
    const editing = postForm !== "new" ? postForm : null
    const { post } = editing ? await api.updatePost(editing.id, draft) : await api.createPost(draft)
    closeModal()
    setBoardTick((tick) => tick + 1)
    showNotice(editing ? t("모집 글을 고쳤어요.") : t("모집 글을 올렸어요."))
    if (!editing) openPost(post.id)
  }
  // Applying sends a proposal to the poster with one of this account's events
  // or campaigns, through the same form as 제안하기.
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

  // Members report and block; the shared demo accounts can't, as everyone
  // trying the demo uses them.
  const member = account !== null && !Object.values(demoAccounts).some((demo) => demo.email === account.email)

  // 받을 메일 from 내 정보: shown at once, then saved.
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

  // The emails follow the language the app is shown in: whenever a member's
  // differs (a new choice in 내 정보 or the footer reloads the page in it),
  // the server hears of it. The shared demo accounts keep theirs.
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

  // 찜: the heart keeps a listing to come back to on the catalog's 찜 tab. It
  // shows at once and goes back if the server refuses.
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

  // A block takes the listing out of the lists and closes its page.
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

  // A student group invites a shop from 가까운 순; true once the invitation
  // exists, so its card says 초대함.
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

  // 제안 취소 on a sent proposal in the inbox.
  const withdrawProposal = (proposal: SentProposal) =>
    cancelProposal({ id: proposal.partnerId, name: proposal.partnerName })

  // 문의하기 on a detail page: opens (or starts) the conversation with it.
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
      // The other side needs to see who is asking: write an introduction first.
      if (error instanceof ApiError && error.status === 409) go({ page, profile: "edit" })
    }
  }

  // Everything the account made, saved as one JSON file (GET /api/auth/export).
  const downloadData = async () => {
    try {
      const data = await api.exportData()
      saveFile(`uniconnect-${todayIso()}.json`, JSON.stringify(data, null, 2), "application/json")
      showNotice(t("내 데이터를 내려받았어요."))
    } catch (error) {
      showNotice(errorMessage(error))
    }
  }

  // Returns the problem to show on the form, or null once saved.
  const saveProfile = async (draft: ProfileDraft) => {
    try {
      const { profile } = await api.saveProfile(draft)
      setListing(profile)
      // The catalogs' scores and distances are worked out from the listing.
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

  // A brand accepts or declines a student group's proposal.
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
      // Answered or withdrawn elsewhere in the meantime: show the current state.
      if (error instanceof ApiError && (error.status === 409 || error.status === 404)) {
        api
          .requests()
          .then((result) => setRequests(result.requests))
          .catch(() => {})
      }
    }
  }

  // A student group accepts or declines a brand's offer.
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
      // Answered or withdrawn elsewhere in the meantime: show the current state.
      if (error instanceof ApiError && (error.status === 409 || error.status === 404)) {
        api
          .offers()
          .then((result) => setOffers(result.offers))
          .catch(() => {})
      }
    }
  }

  // Without a kind, the history of every measurement.
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

  // The PDF is made by ReportExport, which mounts while exporting is true.
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

  // Brands' calendars also hold the student events they agreed to sponsor.
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
  // The parts of the bell's notices this account has read, saved on it.
  const readNotices = new Set(account?.readNotices ?? [])
  // Marks notices read (one opened, or 모두 읽음): at once on screen, then on
  // the account for its other devices.
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
      onShowDetail={showEventDetail}
      onEdit={openEdit}
      onDelete={deleteEvent}
      onOpenSponsorship={() => navigate("받은 제안")}
      onNotice={showNotice}
      canSubscribe={member}
    />
  )

  // A new member's checklist under the dashboard's hero, once its listing and
  // events have arrived (never for the shared demo accounts).
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
      // Nothing while a saved session is checked, or while a member is sent
      // on to the dashboard.
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
      return (
        <EventDetailPage
          id={view.eventPage}
          onBack={() => goBack({ page })}
          onEdit={(eventId) => go({ page, edit: eventId })}
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
      // Nothing while the events load; one that isn't there gets the 404 page.
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
      return (
        <EventCreatePage
          role={role}
          initialDate={creating}
          onCancel={() => goBack({ page })}
          onSubmit={createEvent}
        />
      )
    }
    if (profileOpen && account && view.profile === "edit") {
      return (
        <ProfileEditPage
          // The form takes the listing once; opened straight from its
          // address, it starts again when the listing arrives.
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
          onPayments={account?.role === "브랜드" ? () => setActiveModal("payments") : undefined}
          onPlan={account?.role === "브랜드" ? showNotice : undefined}
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
                    // A file shows by the name it was sent with.
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
            onOpenFaq={openFaq}
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
            onOpenFaq={openFaq}
            onInstall={installKind === "app" ? undefined : startInstall}
            paused={listing?.pausedAt !== undefined}
            onResume={() => pauseListing(false)}
            checklist={checklist}
          />
        )
    }
  }

  // Counts beside the menu's pages, of what waits for the account. A visitor
  // gets none: the demo data's counts would read as their own notifications.
  const badges: Partial<Record<NavLabel, number>> = !account
    ? {}
    : students
      ? { "추천 매칭": matches.length, "받은 협찬": pendingOffers.length }
      : { "받은 제안": pendingRequests.length }
  // A visitor on the introduction, and a visitor on a member screen shown
  // with the demo data (marked as an example in the header).
  const landing = view.home === true && visitor
  const demoScreen = visitor && !view.home && !view.faq && !view.legal && !view.admin && !view.invite && !view.missing

  return (
    <div className="app-shell">
      {/* A link (not a fragment, which would add a history entry) to the page body. */}
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

      <Header
        role={role}
        activeNav={page}
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
        {/* A new key on every page change replays the page's entrance. A
            detail page covers its list, which stays mounted (keeping its
            tab and scroll) and shows again on the way back. */}
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

      {/* A conversation keeps its message box at the bottom of the screen; the
          call to register heads the footer on the introduction and the
          dashboard only. */}
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
          activeNav={page}
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

      {/* Each popup stays on screen for its closing animation, and loads the
          first time it opens. */}
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
          <QrModal report={report} onClose={closeModal} onCopied={showNotice} />
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
          onJoined={(session) =>
            startSession(session, t("{name} 계정을 함께 관리하기 시작했어요.", { name: session.account.name }))
          }
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
      {account && proposing && (
        <Presence show={activeModal === "propose"}>
          <ProposeModal
            events={events}
            match={proposing}
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
          onClose={closeModal}
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
        <Toast message={notice} />
      </Presence>
    </div>
  )
}

// Shown for the moment a screen's code arrives.
function PageLoading() {
  return (
    <p className="page-loading" role="status">
      {t("불러오고 있어요…")}
    </p>
  )
}

export default App
