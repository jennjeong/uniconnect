import { useCallback, useEffect, useState } from "react"

import { api, ApiError, errorMessage, getToken, setToken, type EventDraft } from "./api"
import { Icon } from "./components/Icon"
import { createLabel } from "./data/roles"
import { useNotice } from "./hooks/useNotice"
import { MobileNav } from "./layout/MobileNav"
import { Sidebar } from "./layout/Sidebar"
import { Topbar } from "./layout/Topbar"
import { todayIso } from "./lib/date"
import { reportKpis, type KpiKey } from "./lib/kpis"
import { GoalModal } from "./modals/GoalModal"
import { LoginModal } from "./modals/LoginModal"
import { MetricLogModal } from "./modals/MetricLogModal"
import { NotificationsModal } from "./modals/NotificationsModal"
import { ProfileModal } from "./modals/ProfileModal"
import { QrModal } from "./modals/QrModal"
import { ReportModal } from "./modals/ReportModal"
import { SignupModal } from "./modals/SignupModal"
import { DashboardPage } from "./pages/DashboardPage"
import { EventCreatePage } from "./pages/EventCreatePage"
import { EventsPage } from "./pages/EventsPage"
import { MatchesPage } from "./pages/MatchesPage"
import { MeasurementPage } from "./pages/MeasurementPage"
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
} from "./types"

function App() {
  const [activeNav, setActiveNav] = useState<NavLabel>("대시보드")
  const [activeModal, setActiveModal] = useState<ModalName | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  // With a saved token, role-specific data waits until /auth/me answers.
  const [authReady, setAuthReady] = useState(() => getToken() === null)
  // Visitors preview either role; a logged-in account always uses its own.
  const [previewRole, setPreviewRole] = useState<Role>("학생단체")
  // Role pre-selected when the login or sign-up form opens.
  const [authRole, setAuthRole] = useState<Role>("학생단체")
  const [matches, setMatches] = useState<Match[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [proposals, setProposals] = useState<string[]>([])
  const [metrics, setMetrics] = useState<Metrics>({ scans: 0, coupons: 0, visits: 0 })
  // Brand catalog that student groups browse on the matches page.
  const [brands, setBrands] = useState<Match[]>([])
  const [report, setReport] = useState<Report | null>(null)
  // Day the new event page opens on; null while that page is closed.
  const [creating, setCreating] = useState<string | null>(null)
  // Day the 내 행사 calendar opens on, such as a just-registered event's.
  const [eventsFocus, setEventsFocus] = useState<string | undefined>(undefined)
  // Which history or goal the open modal shows.
  const [logKind, setLogKind] = useState<MetricKind | "all">("all")
  const [goalKey, setGoalKey] = useState<KpiKey>("reach")
  const [exporting, setExporting] = useState(false)
  const [notificationsRead, setNotificationsRead] = useState(false)
  // When matches and events were last loaded, shown on the dashboard.
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const { notice, showNotice } = useNotice()

  const role = account?.role ?? previewRole
  const accountId = account?.id

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
    Promise.all([
      api.matches(role),
      api.events(role),
      api.proposals(),
      // Only student groups browse the brand catalog.
      role === "학생단체" ? api.brands() : Promise.resolve({ brands: [] }),
    ])
      .then(([matchResult, eventResult, proposalResult, brandResult]) => {
        if (cancelled) return
        setMatches(matchResult.matches)
        setUpdatedAt(new Date())
        setEvents(eventResult.events)
        setProposals(proposalResult.proposals)
        setBrands(brandResult.brands)
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

  const navigate = (label: NavLabel) => {
    setCreating(null)
    setActiveNav(label)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const closeModal = useCallback(() => setActiveModal(null), [])

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
    setActiveModal(null)
    showNotice(message)
  }

  const endSession = () => {
    setToken(null)
    // Keep showing the same side after logging out.
    if (account) setPreviewRole(account.role)
    setAccount(null)
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
    setCreating(date)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const createEvent = async (draft: EventDraft) => {
    try {
      const { event } = await api.createEvent(draft)
      setEvents((current) => [event, ...current])
      setEventsFocus(event.date)
      navigate("내 행사")
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
    navigate(event.status === "측정 완료" ? "리포트" : "추천 매칭")
    showNotice(`${event.name} 상세 흐름을 열었어요.`)
  }

  const propose = async (match: Match) => {
    if (!account) {
      requireLogin("로그인하면 협찬 제안을 보낼 수 있어요.")
      return
    }
    try {
      const result = await api.propose(match.id)
      setProposals(result.proposals)
      showNotice(`${match.name}에 협찬 제안을 보냈어요.`)
    } catch (error) {
      handleError(error)
    }
  }

  const cancelProposal = async (match: Match) => {
    try {
      const result = await api.cancelProposal(match.id)
      setProposals(result.proposals)
      showNotice(`${match.name}에 보낸 제안을 취소했어요.`)
    } catch (error) {
      handleError(error)
    }
  }

  // Without a kind, the history of every measurement.
  const openLog = (kind?: MetricKind) => {
    setLogKind(kind ?? "all")
    setActiveModal("metric-log")
  }

  const openEventsOn = (date: string) => {
    setEventsFocus(date)
    navigate("내 행사")
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

  return (
    <div className="app-shell">
      <Sidebar
        role={role}
        account={account}
        activeNav={activeNav}
        matchCount={matches.length}
        events={events}
        onNavigate={navigate}
        onSwitchRole={switchRole}
        onCreate={() => openCreate()}
        onOpenEvent={openEventsOn}
        onOpenAccount={() => (account ? setActiveModal("profile") : openAuth("login"))}
      />

      <main className="main-content">
        <Topbar
          title={creating !== null ? createLabel(role) : undefined}
          activeNav={activeNav}
          account={account}
          authReady={authReady}
          hasUnread={!notificationsRead}
          onNavigate={navigate}
          onOpenNotifications={() => {
            setActiveModal("notifications")
            setNotificationsRead(true)
          }}
          onOpenProfile={() => setActiveModal("profile")}
          onLogin={() => openAuth("login")}
        />

        {creating !== null ? (
          <EventCreatePage
            role={role}
            initialDate={creating}
            onCancel={() => setCreating(null)}
            onSubmit={createEvent}
          />
        ) : activeNav === "대시보드" ? (
          <DashboardPage
            role={role}
            matches={matches}
            brands={brands}
            events={events}
            proposals={proposals}
            metrics={metrics}
            report={report}
            updatedAt={updatedAt}
            onNavigate={navigate}
            onPropose={propose}
            onCancelProposal={cancelProposal}
            onOpenReport={() => setActiveModal("report")}
          />
        ) : activeNav === "추천 매칭" ? (
          <MatchesPage
            role={role}
            matches={matches}
            brands={brands}
            proposals={proposals}
            onPropose={propose}
            onCancelProposal={cancelProposal}
          />
        ) : activeNav === "내 행사" ? (
          <EventsPage
            role={role}
            events={events}
            initialDate={eventsFocus}
            onCreate={(date) => {
              setEventsFocus(date)
              openCreate(date)
            }}
            onShowDetail={showEventDetail}
            onDelete={deleteEvent}
          />
        ) : activeNav === "성과 측정" ? (
          <MeasurementPage
            metrics={metrics}
            report={report}
            onMetrics={setMetrics}
            onOpenQr={() => setActiveModal("qr")}
            onShowLog={openLog}
          />
        ) : (
          <ReportsPage
            report={report}
            metrics={metrics}
            exporting={exporting}
            onDownload={saveReport}
            onOpenReport={() => setActiveModal("report")}
            onOpenGoal={openGoal}
          />
        )}
      </main>

      {creating === null && (
        <button
          className="create-fab"
          aria-label={createLabel(role)}
          onClick={() => openCreate()}
          type="button"
        >
          <Icon name="plus" size={24} />
        </button>
      )}

      <MobileNav activeNav={activeNav} onNavigate={navigate} />

      {activeModal === "metric-log" && (
        <MetricLogModal
          kind={logKind === "all" ? undefined : logKind}
          total={
            logKind === "all" ? metrics.scans + metrics.coupons + metrics.visits : metrics[logKind]
          }
          onClose={closeModal}
        />
      )}
      {activeModal === "goal" && goal && <GoalModal kpi={goal} onClose={closeModal} />}
      {activeModal === "notifications" && (
        <NotificationsModal
          matchCount={matches.length}
          report={report}
          onClose={closeModal}
          onOpen={(label) => {
            closeModal()
            navigate(label)
          }}
        />
      )}
      {activeModal === "report" && report && (
        <ReportModal
          report={report}
          metrics={metrics}
          onClose={closeModal}
          onDownload={saveReport}
        />
      )}
      {activeModal === "qr" && report && (
        <QrModal report={report} onClose={closeModal} onCopied={showNotice} />
      )}
      {activeModal === "profile" && account && (
        <ProfileModal
          account={account}
          eventCount={events.length}
          proposalCount={proposals.length}
          onClose={closeModal}
          onLogout={logout}
        />
      )}
      {activeModal === "login" && (
        <LoginModal
          initialRole={authRole}
          onClose={closeModal}
          onLoggedIn={(session) =>
            startSession(session, `${session.account.name} 계정으로 로그인했어요.`)
          }
          onSignup={(next) => openAuth("signup", next)}
        />
      )}
      {activeModal === "signup" && (
        <SignupModal
          initialRole={authRole}
          onClose={closeModal}
          onSignedUp={(session) =>
            startSession(session, `${session.account.name} 계정으로 가입했어요. 환영해요!`)
          }
          onLogin={(next) => openAuth("login", next)}
          onNotice={showNotice}
        />
      )}

      {exporting && report && (
        <ReportExport
          report={report}
          metrics={metrics}
          author={account?.name ?? "uniconnect"}
          onDone={finishExport}
        />
      )}

      {notice && (
        <div className="toast">
          <Icon name="check" size={18} />
          {notice}
        </div>
      )}
    </div>
  )
}

export default App
