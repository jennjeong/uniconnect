import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"

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
import { Toast } from "./components/Toast"
import type { LegalKind } from "./data/legal"
import { pageFor } from "./data/navigation"
import { useNotice } from "./hooks/useNotice"
import { Footer } from "./layout/Footer"
import { Header } from "./layout/Header"
import { NavMenu } from "./layout/NavMenu"
import { t, tc } from "./i18n"
import { todayIso } from "./lib/date"
import { reportKpis, type KpiKey } from "./lib/kpis"
import { defaultMeasurement } from "./lib/measurements"
import { brandNotifications, studentNotifications } from "./lib/notifications"
import { track } from "./lib/analytics"
import { applyPageMeta, pageMeta } from "./lib/pageMeta"
import { installReveal } from "./lib/reveal"
import { installRipple } from "./lib/ripple"
import { readView, roleOfPage, viewPath, type HistoryEntry, type View } from "./lib/route"
import { installSwipeNavigation, noteHistoryEnd } from "./lib/swipe"
import { GoalModal } from "./modals/GoalModal"
import { GoalsModal } from "./modals/GoalsModal"
import { LeaveModal } from "./modals/LeaveModal"
import { LoginModal } from "./modals/LoginModal"
import { PasswordModal } from "./modals/PasswordModal"
import { ResetPasswordModal } from "./modals/ResetPasswordModal"
import { MetricLogModal } from "./modals/MetricLogModal"
import { QrModal } from "./modals/QrModal"
import { ReportModal } from "./modals/ReportModal"
import { SignupModal } from "./modals/SignupModal"
import { AdminPage } from "./pages/AdminPage"
import { AnalyticsPage } from "./pages/AnalyticsPage"
import { BrandDashboardPage } from "./pages/BrandDashboardPage"
import { DashboardPage } from "./pages/DashboardPage"
import { EventCreatePage } from "./pages/EventCreatePage"
import { EventsPage } from "./pages/EventsPage"
import { FaqPage } from "./pages/FaqPage"
import { LegalPage } from "./pages/LegalPage"
import { GroupsPage } from "./pages/GroupsPage"
import { InboxPage } from "./pages/InboxPage"
import { ChatPage } from "./pages/ChatPage"
import { MatchDetailPage } from "./pages/MatchDetailPage"
import { MatchesPage } from "./pages/MatchesPage"
import { NotFoundPage } from "./pages/NotFoundPage"
import { OffersPage } from "./pages/OffersPage"
import { MeasurementPage } from "./pages/MeasurementPage"
import { MessagesPage } from "./pages/MessagesPage"
import { ProfileEditPage } from "./pages/ProfileEditPage"
import { ProfilePage, type ActivityItem } from "./pages/ProfilePage"
import { ReportsPage } from "./pages/ReportsPage"
import { AnalyticsExport } from "./report/AnalyticsExport"
import { ReportExport } from "./report/ReportExport"
import type {
  Account,
  Conversation,
  EventItem,
  EventMeasurement,
  Match,
  MetricKind,
  Metrics,
  ModalName,
  NavLabel,
  ProfileDraft,
  Role,
  Session,
  SponsorOffer,
  SponsorRequest,
  Sponsorship,
} from "./types"

// The screen to open with: the history entry's on a reload, else the address.
const initialView = (history.state as HistoryEntry | null)?.view ?? readView()

const noMetrics: Metrics = { scans: 0, coupons: 0, visits: 0 }

function App() {
  const [view, setView] = useState<View>(initialView)
  // True when the view came from the back or forward button (or a swipe).
  const [fromHistory, setFromHistory] = useState(false)
  const [activeModal, setActiveModal] = useState<ModalName | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  // With a saved token, role-specific data waits until /auth/me answers.
  const [authReady, setAuthReady] = useState(() => getToken() === null)
  // Visitors preview either role (the one the address belongs to, at first);
  // a logged-in account always uses its own.
  const [previewRole, setPreviewRole] = useState<Role>(
    () => roleOfPage(initialView.page) ?? "학생단체",
  )
  // Role pre-selected when the login or sign-up form opens.
  const [authRole, setAuthRole] = useState<Role>("학생단체")
  // The email the login form had when 비밀번호 찾기 opened.
  const [resetEmail, setResetEmail] = useState("")
  const [matches, setMatches] = useState<Match[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [proposals, setProposals] = useState<string[]>([])
  // Answers from brands that replied to the student group's proposals.
  const [statuses, setStatuses] = useState<ProposalState["statuses"]>({})
  const [confirmedCount, setConfirmedCount] = useState(0)
  // Moves on every minute and when the window comes back into view, so
  // answers from the other side show without reloading.
  const [refreshTick, setRefreshTick] = useState(0)
  // Each of the student group's events with its live counts and report, and
  // the one the measurement pages show (the default one until picked).
  const [measurements, setMeasurements] = useState<EventMeasurement[]>([])
  const [measuredId, setMeasuredId] = useState<string | null>(null)
  // Brand catalog that student groups browse on the matches page.
  const [brands, setBrands] = useState<Match[]>([])
  // Brand side: the student group catalog, proposals received and results.
  const [groups, setGroups] = useState<Match[]>([])
  const [requests, setRequests] = useState<SponsorRequest[]>([])
  const [offers, setOffers] = useState<SponsorOffer[]>([])
  const [sponsorships, setSponsorships] = useState<Sponsorship[]>([])
  // The account's own listing (null until written) and its conversations.
  const [listing, setListing] = useState<Match | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  // Day the 내 행사 calendar opens on, such as a just-registered event's.
  const [eventsFocus, setEventsFocus] = useState<string | undefined>(undefined)
  // Which history or goal the open modal shows.
  const [logKind, setLogKind] = useState<MetricKind | "all">("all")
  const [goalKey, setGoalKey] = useState<KpiKey>("reach")
  const [exporting, setExporting] = useState(false)
  // Brands' analytics report, made by AnalyticsExport the same way.
  const [exportingAnalytics, setExportingAnalytics] = useState(false)
  const [notificationsRead, setNotificationsRead] = useState(false)
  // The notifications panel under the bell.
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  // The full-screen menu (the Menu button in the header).
  const [menuOpen, setMenuOpen] = useState(false)
  // Where to scroll once a view from the history has rendered.
  const restoreScroll = useRef<number | null>(null)
  // When matches and events were last loaded, shown on the dashboard.
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const { notice, showNotice } = useNotice()

  const role = account?.role ?? previewRole
  const accountId = account?.id
  const students = role === "학생단체"
  // The picked page, or the dashboard when this role has no such page.
  const page = pageFor(role, view.page)
  // Day the registration page opens on; null while that page is closed.
  const creating = view.create ?? null
  const profileOpen = view.profile !== undefined && account !== null
  const chatOpen = view.chat !== undefined && account !== null
  const unreadMessages = conversations.reduce((sum, item) => sum + item.unread, 0)
  // Brands for student groups, student groups for brands.
  const catalog = students ? brands : groups
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
      const next = entry?.view ?? readView()
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
  // page on screen.
  useEffect(() => {
    if (!authReady) return
    const usable =
      view.page === page && (account !== null || (!view.profile && !view.create && !view.chat))
    if (!usable) go({ page }, true)
  })

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
      settle(api.events(role), (result) => setEvents(result.events)),
      settle(api.proposals(), applyProposals),
      ...(students
        ? [
            settle(api.brands(), (result) => setBrands(result.brands)),
            settle(api.offers(), (result) => setOffers(result.offers)),
          ]
        : [
            settle(api.groups(), (result) => setGroups(result.groups)),
            settle(api.requests(), (result) => setRequests(result.requests)),
            settle(api.analytics(), (result) => setSponsorships(result.sponsorships)),
          ]),
    ]
    if (!background) {
      if (students) {
        setGroups([])
        setRequests([])
        setSponsorships([])
      } else {
        setBrands([])
        setOffers([])
      }
    }
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
        if (!cancelled) setListing(result.profile)
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

  const openProfile = () => go({ page, profile: "page" })

  const openMessages = () => go({ page, messages: true })

  const openFaq = () => go({ page, faq: true })

  const openLegal = (legal: LegalKind) => go({ page, legal })

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

  const requireLogin = (message: string) => {
    showNotice(message)
    openAuth("login")
  }

  const startSession = (session: Session, message: string) => {
    setToken(session.token)
    setAccount(session.account)
    go({ page: "대시보드" }, true)
    setActiveModal(null)
    showNotice(message)
  }

  const endSession = () => {
    setToken(null)
    // Keep showing the same side after logging out.
    if (account) setPreviewRole(account.role)
    setAccount(null)
    if (view.profile || view.create || view.chat) go({ page: view.page }, true)
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
    if (account || next === previewRole) return
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

  const showEventDetail = (event: EventItem) => {
    const done = event.status === "측정 완료"
    navigate(students ? (done ? "리포트" : "추천 매칭") : done ? "성과 분석" : "단체 찾기")
    showNotice(t("{name} 상세 흐름을 열었어요.", { name: event.name }))
  }

  function applyProposals(result: ProposalState) {
    setProposals(result.proposals)
    setStatuses(result.statuses)
    setConfirmedCount(result.confirmed)
  }

  // The click and the server's acceptance are tracked apart (lib/analytics.ts).
  const propose = async (match: Match) => {
    track("contact_click", { method: "proposal", role })
    if (!account) {
      requireLogin(t("로그인하면 협찬 제안을 보낼 수 있어요."))
      return
    }
    try {
      applyProposals(await api.propose(match.id))
      track("generate_lead", { method: "proposal", role })
      showNotice(t("{name}에 협찬 제안을 보냈어요.", { name: match.name }))
    } catch (error) {
      handleError(error)
    }
  }

  const cancelProposal = async (match: Match) => {
    try {
      applyProposals(await api.cancelProposal(match.id))
      showNotice(t("{name}에 보낸 제안을 취소했어요.", { name: match.name }))
    } catch (error) {
      handleError(error)
    }
  }

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

  const notifications = students
    ? studentNotifications({ matches, brands, statuses, report, offers })
    : brandNotifications({ matches, requests, sponsorships })

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
      onDelete={deleteEvent}
      onOpenSponsorship={() => navigate("받은 제안")}
    />
  )

  const renderPage = (): ReactNode => {
    if (view.missing) return <NotFoundPage onNavigate={navigate} role={role} />
    if (view.faq) return <FaqPage account={account} onLogin={() => openAuth("login")} />
    if (view.admin) return <AdminPage onNotice={showNotice} />
    if (view.legal) return <LegalPage kind={view.legal} onSwitch={(legal) => openLegal(legal)} />
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
          onLeave={() => setActiveModal("leave")}
        />
      )
    }
    if (chatOpen && view.chat) {
      const browsePage: NavLabel = students ? "추천 매칭" : "단체 찾기"
      return (
        <ChatPage
          id={view.chat}
          onBack={() => goBack({ page, messages: true })}
          onChange={updateConversation}
          onSessionEnd={handleSessionEnd}
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
            proposals={proposals}
            statuses={statuses}
            onOpenDetail={openDetail}
            onPropose={propose}
            onCancelProposal={cancelProposal}
          />
        )
      case "내 행사":
      case "행사 일정":
        return eventsPage
      case "성과 측정":
        return (
          <MeasurementPage
            measurements={measurements}
            metrics={metrics}
            report={report}
            onSelect={setMeasuredId}
            onUpdate={updateMeasurement}
            onOpenQr={() => setActiveModal("qr")}
            onOpenGoals={() =>
              account ? setActiveModal("measure-goals") : requireLogin(t("로그인하면 행사 목표를 정할 수 있어요."))
            }
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
            proposals={proposals}
            statuses={statuses}
            onOpenDetail={openDetail}
            onPropose={propose}
            onCancelProposal={cancelProposal}
          />
        )
      case "받은 제안":
        return <InboxPage requests={requests} onAnswer={answerRequest} />
      case "받은 협찬":
        return <OffersPage brands={brands} offers={offers} onAnswer={answerOffer} />
      case "성과 분석":
        return (
          <AnalyticsPage
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
                onOpenGoals={() =>
                  account ? setActiveModal("measure-goals") : requireLogin(t("로그인하면 캠페인 목표를 정할 수 있어요."))
                }
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
          />
        ) : (
          <BrandDashboardPage
            accountName={account?.name}
            matches={matches}
            groups={groups}
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
          />
        )
    }
  }

  const badges: Partial<Record<NavLabel, number>> = students
    ? { "추천 매칭": matches.length, "받은 협찬": pendingOffers.length }
    : { "받은 제안": pendingRequests.length }

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
        hasUnread={!notificationsRead}
        notifications={notifications}
        notificationsOpen={notificationsOpen}
        menuOpen={menuOpen}
        unreadMessages={unreadMessages}
        onNavigate={navigate}
        onSwitchRole={switchRole}
        onCreate={() => openCreate()}
        onOpenEvent={openEventsOn}
        onOpenMessages={openMessages}
        onToggleNotifications={() => {
          setNotificationsOpen((open) => !open)
          setNotificationsRead(true)
        }}
        onCloseNotifications={closeNotifications}
        onOpenProfile={openProfile}
        onLogin={() => openAuth("login")}
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
          {renderPage()}
        </div>
        {detailMatch && (
          <div
            className={fromHistory ? "page-enter from-history" : "page-enter"}
            key={`detail:${detailMatch.id}`}
          >
            <MatchDetailPage
              match={detailMatch}
              kind={students ? "brand" : "group"}
              done={proposals.includes(detailMatch.id)}
              status={statuses[detailMatch.id]}
              onBack={() => goBack({ page })}
              onChat={() => openChat(detailMatch)}
              onPropose={() => propose(detailMatch)}
              onCancel={() => cancelProposal(detailMatch)}
            />
          </div>
        )}
      </main>

      {/* A conversation keeps its message box at the bottom of the screen; the
          call to register heads the footer on the dashboard only. */}
      {!chatOpen && (
        <Footer
          role={role}
          account={account}
          invite={viewPath(view) === viewPath({ page: "대시보드" })}
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
          onNavigate={navigate}
          onSwitchRole={switchRole}
          onCreate={() => openCreate()}
          onOpenMessages={openMessages}
          onOpenProfile={openProfile}
          onOpenFaq={openFaq}
          onLogin={() => openAuth("login")}
          onSignup={() => openAuth("signup")}
          onClose={closeMenu}
        />
      </Presence>

      {/* Each popup stays on screen for its closing animation. */}
      {report && (
        <Presence show={activeModal === "metric-log"}>
          <MetricLogModal
            eventId={report.eventId}
            role={role}
            kind={logKind === "all" ? undefined : logKind}
            total={
              logKind === "all" ? metrics.scans + metrics.coupons + metrics.visits : metrics[logKind]
            }
            onClose={closeModal}
          />
        </Presence>
      )}
      {goal && (
        <Presence show={activeModal === "goal"}>
          <GoalModal kpi={goal} onClose={closeModal} />
        </Presence>
      )}
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
      <Presence show={activeModal === "password"}>
        <PasswordModal
          onClose={closeModal}
          onChanged={() => {
            setActiveModal(null)
            showNotice(t("비밀번호를 바꿨어요. 다른 기기에서는 로그아웃됐어요."))
          }}
        />
      </Presence>
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

      <Presence show={notice !== ""}>
        <Toast message={notice} />
      </Presence>
    </div>
  )
}

export default App
