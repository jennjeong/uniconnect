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
import { Icon } from "./components/Icon"
import { Presence } from "./components/Presence"
import { Toast } from "./components/Toast"
import { pageFor } from "./data/navigation"
import { createLabel } from "./data/roles"
import { useNotice } from "./hooks/useNotice"
import { MobileNav } from "./layout/MobileNav"
import { Sidebar } from "./layout/Sidebar"
import { Topbar } from "./layout/Topbar"
import { todayIso } from "./lib/date"
import { reportKpis, type KpiKey } from "./lib/kpis"
import { brandNotifications, studentNotifications } from "./lib/notifications"
import { installRipple } from "./lib/ripple"
import { readView, roleOfPage, viewPath, type HistoryEntry, type View } from "./lib/route"
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
import { MatchDetailPage } from "./pages/MatchDetailPage"
import { MatchesPage } from "./pages/MatchesPage"
import { MeasurementPage } from "./pages/MeasurementPage"
import { ProfilePage, type ActivityItem } from "./pages/ProfilePage"
import { ReportsPage } from "./pages/ReportsPage"
import { ReportExport } from "./report/ReportExport"
import type {
  Account,
  EventItem,
  Match,
  MetricKind,
  Metrics,
  ModalName,
  NavLabel,
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
  const [report, setReport] = useState<Report | null>(null)
  // Day the 내 행사 calendar opens on, such as a just-registered event's.
  const [eventsFocus, setEventsFocus] = useState<string | undefined>(undefined)
  // Which history or goal the open modal shows.
  const [logKind, setLogKind] = useState<MetricKind | "all">("all")
  const [goalKey, setGoalKey] = useState<KpiKey>("reach")
  const [exporting, setExporting] = useState(false)
  const [notificationsRead, setNotificationsRead] = useState(false)
  // The notifications panel under the bell.
  const [notificationsOpen, setNotificationsOpen] = useState(false)
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
  const profileOpen = view.profile === true && account !== null
  // Brands for student groups, student groups for brands.
  const catalog = students ? brands : groups
  const detailMatch = view.detail
    ? catalog.find((match) => match.id === view.detail)
    : undefined
  const calendarPage: NavLabel = students ? "내 행사" : "캠페인"
  const pendingRequests = requests.filter((request) => request.status === "검토 중")
  const confirmedRequests = requests.filter((request) => request.status === "수락")

  // Buttons ripple from where they are pressed.
  useEffect(() => installRipple(), [])

  // Every view has a history entry, so the back and forward buttons and
  // swipe gestures move between views. Scroll positions are kept per entry.
  useEffect(() => {
    history.scrollRestoration = "manual"
    if (!(history.state as HistoryEntry | null)?.view) {
      history.replaceState({ view: initialView, index: 0 } satisfies HistoryEntry, "")
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
    const usable = view.page === page && (account !== null || (!view.profile && !view.create))
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

  const openProfile = () => go({ page, profile: true })

  const openDetail = (match: Match) => go({ page, detail: match.id })

  const closeModal = useCallback(() => setActiveModal(null), [])
  const closeNotifications = useCallback(() => setNotificationsOpen(false), [])

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
    if (view.profile || view.create) go({ page: view.page }, true)
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
        { label: "등록한 캠페인", value: `${events.length}개`, target: "캠페인" },
        { label: "받은 협찬 제안", value: `${requests.length}건`, target: "받은 제안" },
        { label: "확정한 협찬", value: `${confirmedRequests.length}건`, target: "캠페인" },
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
    if (profileOpen && account) {
      return (
        <ProfilePage
          account={account}
          activity={activity}
          onBack={() => goBack({ page })}
          onNavigate={navigate}
          onLogout={logout}
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
      case "캠페인":
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
        return <AnalyticsPage sponsorships={sponsorships} onNavigate={navigate} />
      default:
        return students ? (
          <DashboardPage
            matches={matches}
            brands={brands}
            events={events}
            proposals={proposals}
            statuses={statuses}
            metrics={metrics}
            report={report}
            updatedAt={updatedAt}
            onNavigate={navigate}
            onPropose={propose}
            onCancelProposal={cancelProposal}
            onOpenReport={() => setActiveModal("report")}
          />
        ) : (
          <BrandDashboardPage
            matches={matches}
            requests={requests}
            sponsorships={sponsorships}
            proposals={proposals}
            updatedAt={updatedAt}
            onNavigate={navigate}
            onAccept={(request) => answerRequest(request, "accept")}
            onPropose={propose}
            onCancelProposal={cancelProposal}
          />
        )
    }
  }

  return (
    // While a toast shows, phones lift the + button above it.
    <div className={notice ? "app-shell has-toast" : "app-shell"}>
      <Sidebar
        role={role}
        account={account}
        activeNav={page}
        badges={
          students ? { "추천 매칭": matches.length } : { "받은 제안": pendingRequests.length }
        }
        events={schedule}
        onNavigate={navigate}
        onSwitchRole={switchRole}
        onCreate={() => openCreate()}
        onOpenEvent={openEventsOn}
        onOpenAccount={() => (account ? openProfile() : openAuth("login"))}
      />

      <main className="main-content">
        <Topbar
          title={
            creating !== null
              ? createLabel(role)
              : profileOpen
                ? "내 정보"
                : detailMatch
                  ? detailMatch.name
                  : undefined
          }
          activeNav={page}
          account={account}
          authReady={authReady}
          hasUnread={!notificationsRead}
          notifications={notifications}
          notificationsOpen={notificationsOpen}
          onNavigate={navigate}
          onToggleNotifications={() => {
            setNotificationsOpen((open) => !open)
            setNotificationsRead(true)
          }}
          onCloseNotifications={closeNotifications}
          onOpenProfile={openProfile}
          onLogin={() => openAuth("login")}
        />

        {/* A new key on every page change replays the page's entrance. A
            detail page covers its list, which stays mounted (keeping its
            tab and scroll) and shows again on the way back. */}
        <div
          className={fromHistory ? "page-enter from-history" : "page-enter"}
          hidden={detailMatch !== undefined}
          key={`${role}:${creating !== null ? "create" : profileOpen ? "profile" : page}`}
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
              onPropose={() => propose(detailMatch)}
              onCancel={() => cancelProposal(detailMatch)}
            />
          </div>
        )}
      </main>

      {creating === null && !profileOpen && !detailMatch && (
        <button
          className="create-fab"
          aria-label={createLabel(role)}
          onClick={() => openCreate()}
          type="button"
        >
          <Icon name="plus" size={24} />
        </button>
      )}

      <MobileNav role={role} activeNav={page} onNavigate={navigate} />

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

      <Presence show={notice !== ""}>
        <Toast message={notice} />
      </Presence>
    </div>
  )
}

export default App
