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
import { Presence } from "./components/Presence"
import { Toast } from "./components/Toast"
import { pageFor } from "./data/navigation"
import { useNotice } from "./hooks/useNotice"
import { Footer } from "./layout/Footer"
import { Header } from "./layout/Header"
import { NavMenu } from "./layout/NavMenu"
import { todayIso } from "./lib/date"
import { reportKpis, type KpiKey } from "./lib/kpis"
import { brandNotifications, studentNotifications } from "./lib/notifications"
import { installReveal } from "./lib/reveal"
import { installRipple } from "./lib/ripple"
import { readView, roleOfPage, viewPath, type HistoryEntry, type View } from "./lib/route"
import { installSwipeNavigation, noteHistoryEnd } from "./lib/swipe"
import { GoalModal } from "./modals/GoalModal"
import { LoginModal } from "./modals/LoginModal"
import { MetricLogModal } from "./modals/MetricLogModal"
import { QrModal } from "./modals/QrModal"
import { ReportModal } from "./modals/ReportModal"
import { SignupModal } from "./modals/SignupModal"
import { AnalyticsPage } from "./pages/AnalyticsPage"
import { BrandDashboardPage } from "./pages/BrandDashboardPage"
import { DashboardPage } from "./pages/DashboardPage"
import { EventCreatePage } from "./pages/EventCreatePage"
import { EventsPage } from "./pages/EventsPage"
import { GroupsPage } from "./pages/GroupsPage"
import { InboxPage } from "./pages/InboxPage"
import { ChatPage } from "./pages/ChatPage"
import { MatchDetailPage } from "./pages/MatchDetailPage"
import { MatchesPage } from "./pages/MatchesPage"
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
  Match,
  MetricKind,
  Metrics,
  ModalName,
  NavLabel,
  ProfileDraft,
  Report,
  Role,
  Session,
  SponsorRequest,
  Sponsorship,
} from "./types"

// The screen to open with: the history entry's on a reload, else the address.
const initialView = (history.state as HistoryEntry | null)?.view ?? readView()

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
  const [matches, setMatches] = useState<Match[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [proposals, setProposals] = useState<string[]>([])
  // Answers from brands that replied to the student group's proposals.
  const [statuses, setStatuses] = useState<ProposalState["statuses"]>({})
  const [metrics, setMetrics] = useState<Metrics>({ scans: 0, coupons: 0, visits: 0 })
  // Brand catalog that student groups browse on the matches page.
  const [brands, setBrands] = useState<Match[]>([])
  // Brand side: the student group catalog, proposals received and results.
  const [groups, setGroups] = useState<Match[]>([])
  const [requests, setRequests] = useState<SponsorRequest[]>([])
  const [sponsorships, setSponsorships] = useState<Sponsorship[]>([])
  // The account's own listing (null until written) and its conversations.
  const [listing, setListing] = useState<Match | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [report, setReport] = useState<Report | null>(null)
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
  const pendingRequests = requests.filter((request) => request.status === "검토 중")
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

  // Restore the saved session.
  useEffect(() => {
    if (!getToken()) return
    let cancelled = false
    api
      .me()
      .then((result) => {
        if (!cancelled) setAccount(result.account)
      })
      .catch((error) => {
        // Drop an expired session; keep the token if the server was just unreachable.
        if (error instanceof ApiError && error.status === 401) setToken(null)
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!authReady) return
    let cancelled = false
    // Student groups browse brands; brands browse groups, answer proposals
    // and follow their results.
    const roleData =
      role === "학생단체"
        ? api.brands().then(({ brands }) => ({
            brands,
            groups: [],
            requests: [],
            sponsorships: [],
          }))
        : Promise.all([api.groups(), api.requests(), api.analytics()]).then(
            ([groupResult, requestResult, analyticsResult]) => ({
              brands: [],
              groups: groupResult.groups,
              requests: requestResult.requests,
              sponsorships: analyticsResult.sponsorships,
            }),
          )
    Promise.all([api.matches(role), api.events(role), api.proposals(), roleData])
      .then(([matchResult, eventResult, proposalResult, data]) => {
        if (cancelled) return
        setMatches(matchResult.matches)
        setUpdatedAt(new Date())
        setEvents(eventResult.events)
        setProposals(proposalResult.proposals)
        setStatuses(proposalResult.statuses)
        setBrands(data.brands)
        setGroups(data.groups)
        setRequests(data.requests)
        setSponsorships(data.sponsorships)
      })
      .catch((error) => {
        if (!cancelled) showNotice(errorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [authReady, role, accountId, showNotice])

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

  useEffect(() => {
    let cancelled = false
    Promise.all([api.metrics(), api.report()])
      .then(([metricResult, reportResult]) => {
        if (cancelled) return
        setMetrics(metricResult.metrics)
        setReport(reportResult.report)
      })
      .catch(() => {
        // Connection problems are already reported by the request above.
      })
    return () => {
      cancelled = true
    }
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
      showNotice("로그인이 만료됐어요. 다시 로그인해 주세요.")
      return
    }
    showNotice(errorMessage(error))
  }

  const logout = async () => {
    try {
      await api.logout()
    } catch {
      // The token is dropped locally either way.
    }
    endSession()
    setActiveModal(null)
    showNotice("로그아웃했어요.")
  }

  const switchRole = (next: Role) => {
    if (account || next === previewRole) return
    setPreviewRole(next)
    go({ page: "대시보드" }, true)
    showNotice(`${next} 전용 데이터로 전환했어요.`)
  }

  const openCreate = (date = todayIso()) => {
    if (!account) {
      requireLogin(
        role === "학생단체"
          ? "로그인하면 행사를 등록할 수 있어요."
          : "로그인하면 캠페인을 등록할 수 있어요.",
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
          ? "행사가 등록되었어요. 추천 매칭을 시작합니다."
          : "캠페인이 등록되었어요. 적합한 단체를 찾습니다.",
      )
    } catch (error) {
      handleError(error)
    }
  }

  const deleteEvent = async (event: EventItem) => {
    if (!account) {
      requireLogin("로그인하면 등록한 행사를 관리할 수 있어요.")
      return
    }
    try {
      await api.deleteEvent(event.id)
      setEvents((current) => current.filter((item) => item.id !== event.id))
      showNotice("목록에서 삭제했어요.")
    } catch (error) {
      handleError(error)
    }
  }

  const showEventDetail = (event: EventItem) => {
    const done = event.status === "측정 완료"
    navigate(students ? (done ? "리포트" : "추천 매칭") : done ? "성과 분석" : "단체 찾기")
    showNotice(`${event.name} 상세 흐름을 열었어요.`)
  }

  const applyProposals = (result: ProposalState) => {
    setProposals(result.proposals)
    setStatuses(result.statuses)
  }

  const propose = async (match: Match) => {
    if (!account) {
      requireLogin("로그인하면 협찬 제안을 보낼 수 있어요.")
      return
    }
    try {
      applyProposals(await api.propose(match.id))
      showNotice(`${match.name}에 협찬 제안을 보냈어요.`)
    } catch (error) {
      handleError(error)
    }
  }

  const cancelProposal = async (match: Match) => {
    try {
      applyProposals(await api.cancelProposal(match.id))
      showNotice(`${match.name}에 보낸 제안을 취소했어요.`)
    } catch (error) {
      handleError(error)
    }
  }

  // 문의하기 on a detail page: opens (or starts) the conversation with it.
  const openChat = async (match: Match) => {
    if (!account) {
      requireLogin("로그인하면 문의를 보낼 수 있어요.")
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
      goBack({ page, profile: "page" })
      showNotice(`소개를 저장했어요. ${students ? "브랜드" : "학생단체"}가 바로 볼 수 있어요.`)
      return null
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) handleError(error)
      return errorMessage(error)
    }
  }

  // A brand accepts or declines a student group's proposal.
  const answerRequest = async (request: SponsorRequest, decision: "accept" | "decline") => {
    if (!account) {
      requireLogin("로그인하면 받은 제안에 답할 수 있어요.")
      return
    }
    try {
      const result = await api.answerRequest(request.id, decision)
      setRequests((current) =>
        current.map((item) => (item.id === result.request.id ? result.request : item)),
      )
      showNotice(
        decision === "accept"
          ? `${request.eventName} 협찬을 확정했어요.`
          : `${request.groupName}의 제안을 거절했어요.`,
      )
    } catch (error) {
      handleError(error)
      // Answered elsewhere in the meantime: show the current state.
      if (error instanceof ApiError && error.status === 409) {
        api
          .requests()
          .then((result) => setRequests(result.requests))
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
        failed ? "PDF를 만들지 못했어요. 다시 시도해 주세요." : "PDF 리포트를 다운로드했어요.",
      )
    },
    [showNotice],
  )

  const finishAnalyticsExport = useCallback(
    (failed: boolean) => {
      setExportingAnalytics(false)
      showNotice(
        failed ? "PDF를 만들지 못했어요. 다시 시도해 주세요." : "분석 보고서를 다운로드했어요.",
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
    ? studentNotifications({ matches, brands, statuses, report })
    : brandNotifications({ matches, requests, sponsorships })

  const activity: ActivityItem[] = students
    ? [
        { label: "등록한 행사", value: `${events.length}개`, target: "내 행사" },
        { label: "보낸 협찬 제안", value: `${proposals.length}건`, target: "추천 매칭" },
        {
          label: "확정된 협찬",
          value: `${proposals.filter((id) => statuses[id] === "수락").length}건`,
          target: "추천 매칭",
        },
      ]
    : [
        { label: "등록한 캠페인", value: `${events.length}개`, target: "행사 일정" },
        { label: "받은 협찬 제안", value: `${requests.length}건`, target: "받은 제안" },
        { label: "확정한 협찬", value: `${confirmedRequests.length}건`, target: "행사 일정" },
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
          onOpenPartner={(partnerId) =>
            catalog.some((match) => match.id === partnerId)
              ? go({ page: browsePage, detail: partnerId })
              : showNotice("상세 정보를 열 수 없는 상대예요.")
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
            metrics={metrics}
            report={report}
            onMetrics={setMetrics}
            onOpenQr={() => setActiveModal("qr")}
            onShowLog={openLog}
          />
        )
      case "리포트":
        return (
          <ReportsPage
            report={report}
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
            onOpenDetail={openDetail}
            onPropose={propose}
            onCancelProposal={cancelProposal}
          />
        )
      case "받은 제안":
        return <InboxPage requests={requests} onAnswer={answerRequest} />
      case "성과 분석":
        return (
          <AnalyticsPage
            exporting={exportingAnalytics}
            onDownload={() => setExportingAnalytics(true)}
            sponsorships={sponsorships}
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
            metrics={metrics}
            report={report}
            updatedAt={updatedAt}
            onNavigate={navigate}
            onOpenDetail={openCatalogDetail}
            onPropose={propose}
            onCancelProposal={cancelProposal}
            onOpenReport={() => setActiveModal("report")}
          />
        ) : (
          <BrandDashboardPage
            accountName={account?.name}
            matches={matches}
            groups={groups}
            requests={requests}
            sponsorships={sponsorships}
            proposals={proposals}
            updatedAt={updatedAt}
            onNavigate={navigate}
            onOpenDetail={openCatalogDetail}
            onAccept={(request) => answerRequest(request, "accept")}
            onPropose={propose}
            onCancelProposal={cancelProposal}
          />
        )
    }
  }

  const badges: Partial<Record<NavLabel, number>> = students
    ? { "추천 매칭": matches.length }
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
        본문으로 건너뛰기
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
            creating !== null
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
          onLogin={() => openAuth("login")}
          onSignup={() => openAuth("signup")}
          onClose={closeMenu}
        />
      </Presence>

      {/* Each popup stays on screen for its closing animation. */}
      <Presence show={activeModal === "metric-log"}>
        <MetricLogModal
          kind={logKind === "all" ? undefined : logKind}
          total={
            logKind === "all" ? metrics.scans + metrics.coupons + metrics.visits : metrics[logKind]
          }
          onClose={closeModal}
        />
      </Presence>
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
        <Presence show={activeModal === "qr"}>
          <QrModal report={report} onClose={closeModal} onCopied={showNotice} />
        </Presence>
      )}
      <Presence show={activeModal === "login"}>
        <LoginModal
          initialRole={authRole}
          onClose={closeModal}
          onLoggedIn={(session) =>
            startSession(session, `${session.account.name} 계정으로 로그인했어요.`)
          }
          onSignup={(next) => openAuth("signup", next)}
        />
      </Presence>
      <Presence show={activeModal === "signup"}>
        <SignupModal
          initialRole={authRole}
          onClose={closeModal}
          onSignedUp={(session) =>
            startSession(session, `${session.account.name} 계정으로 가입했어요. 환영해요!`)
          }
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
