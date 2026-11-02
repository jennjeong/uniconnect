import { useCallback, useEffect, useRef, useState } from "react"

import logo from "../assets/brand/uniconnect_horizontal.svg"
import logoReversed from "../assets/brand/uniconnect_horizontal_reversed.svg"
import { Icon } from "../components/Icon"
import { Presence } from "../components/Presence"
import { navItems } from "../data/navigation"
import { roles } from "../data/roles"
import { t } from "../i18n"
import { daysUntil, formatDay, nextEvent } from "../lib/date"
import { initialOf } from "../lib/format"
import type { NotificationItem } from "../lib/notifications"
import type { Account, NavLabel, Role } from "../types"
import { AccountPanel } from "./AccountPanel"
import { NotificationsPanel } from "./NotificationsPanel"

// The introduction's sections, for the header's links there.
const sections: { id: string; label: string }[] = [
  { id: "sides", label: t("서비스 소개") },
  { id: "how", label: t("이용 방법") },
  { id: "examples", label: t("예시 화면") },
  { id: "faq", label: "FAQ" },
]

// Stride's floating navigation from getlayers.ai: the logo on its own and
// the role's menu as a silver glass pill on the left; the next event (or,
// for visitors, the side to preview), the account buttons and Menu on the
// right. On the introduction the menu gives way to its sections and sign-up
// stands beside login; on a member screen shown to a visitor, a chip by the
// logo says it is an example. The pills gain a soft shadow once the page
// scrolls, and slide in after the intro loader.
export function Header({
  role,
  activeNav,
  account,
  authReady,
  badges,
  events,
  notifications,
  isUnread,
  notificationsOpen,
  menuOpen,
  unreadMessages,
  landing,
  demo,
  onHome,
  onNavigate,
  onSwitchRole,
  onCreate,
  onOpenEvent,
  onOpenMessages,
  onOpenAnswers,
  onToggleNotifications,
  onCloseNotifications,
  onReadNotices,
  onOpenProfile,
  onLogout,
  onLogin,
  onSignup,
  onOpenMenu,
}: {
  role: Role
  activeNav?: NavLabel
  account: Account | null
  // False while a saved session is being checked, so the login button doesn't flash.
  authReady: boolean
  // Counts shown next to menu items, such as unanswered proposals.
  badges: Partial<Record<NavLabel, number>>
  // Upcoming schedule for the next event pill.
  events: { name: string; date: string; status: string }[]
  notifications: NotificationItem[]
  // Whether the account has yet to read a notice; the bell's dot shows while one is.
  isUnread: (item: NotificationItem) => boolean
  // The notifications panel hangs under the bell while this is true.
  notificationsOpen: boolean
  menuOpen: boolean
  // Messages not yet read, shown on the chat button.
  unreadMessages: number
  // A visitor on the introduction.
  landing: boolean
  // A visitor on a member screen, shown with the demo data.
  demo: boolean
  // The logo: the introduction for visitors, the dashboard for a member.
  onHome: () => void
  onNavigate: (label: NavLabel) => void
  onSwitchRole: (role: Role) => void
  onCreate: () => void
  // Opens the 내 행사 (or 캠페인) calendar on this day.
  onOpenEvent: (date: string) => void
  onOpenMessages: () => void
  // The help center's questions, where the operators' answers are.
  onOpenAnswers: () => void
  onToggleNotifications: () => void
  onCloseNotifications: () => void
  // Marks notices read: one opened, or all with 모두 읽음.
  onReadNotices: (items: NotificationItem[]) => void
  onOpenProfile: () => void
  onLogout: () => void
  onLogin: () => void
  onSignup: () => void
  onOpenMenu: () => void
}) {
  const bellRef = useRef<HTMLButtonElement>(null)
  const accountRef = useRef<HTMLButtonElement>(null)
  // The account panel; it and the notifications never hang open together.
  const [accountOpen, setAccountOpen] = useState(false)
  const closeAccount = useCallback(() => setAccountOpen(false), [])
  const unread = notifications.filter(isUnread).length
  const brandRef = useRef<HTMLButtonElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const [onDark, setOnDark] = useState(false)
  const next = nextEvent(events)
  const dDay = next ? daysUntil(next.date) : 0

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8)
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => window.removeEventListener("scroll", update)
  }, [])

  // The logo has no pill of its own, so it turns light while it floats over
  // a deep blue surface (index.css marks those with --surface-tone) and
  // stays deep blue over white. Checked on scroll, resize and page changes.
  useEffect(() => {
    let frame = 0
    const check = () => {
      frame = 0
      const brand = brandRef.current
      if (!brand) return
      const box = brand.getBoundingClientRect()
      const below = document
        .elementsFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        .find((element) => !element.closest(".site-header"))
      setOnDark(below ? getComputedStyle(below).getPropertyValue("--surface-tone").trim() === "dark" : false)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check)
    }
    schedule()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    const pages = new MutationObserver(schedule)
    pages.observe(document.body, { childList: true, subtree: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      pages.disconnect()
    }
  }, [])

  const showSection = (id: string) => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    document.getElementById(id)?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" })
  }

  return (
    <header className={["site-header", scrolled && "scrolled", onDark && "on-dark"].filter(Boolean).join(" ")}>
      <div className="nav-group">
        <button aria-label={t("uniconnect 홈으로")} className="brand-link" onClick={onHome} ref={brandRef} type="button">
          <img alt="" className="logo-dark" height={38} src={logo} width={163} />
          <img alt="" className="logo-light" height={38} src={logoReversed} width={163} />
        </button>
        {landing ? (
          <nav className="nav-pill links-pill" aria-label={t("소개 페이지 구역")}>
            {sections.map((section) => (
              <button className="header-link" key={section.id} onClick={() => showSection(section.id)} type="button">
                {section.label}
              </button>
            ))}
          </nav>
        ) : (
          <nav className="nav-pill links-pill" aria-label={t("주요 메뉴")}>
            {navItems[role].map((item) => (
              <button
                aria-current={activeNav === item.label ? "page" : undefined}
                className={activeNav === item.label ? "header-link active" : "header-link"}
                key={item.label}
                onClick={() => onNavigate(item.label)}
                type="button"
              >
                {t(item.label)}
                {(badges[item.label] ?? 0) > 0 && <span className="nav-count">{badges[item.label]}</span>}
              </button>
            ))}
          </nav>
        )}
      </div>

      <div className="nav-group">
        {account ? (
          <button
            aria-label={
              next
                ? t("다가오는 일정 {name}, {date}, {status}", {
                    name: next.name,
                    date: formatDay(next.date),
                    status: t(next.status),
                  })
                : t("다가오는 일정 없음, 새로 등록하기")
            }
            className="nav-pill event-pill"
            onClick={() => (next ? onOpenEvent(next.date) : onCreate())}
            type="button"
          >
            {next ? (
              <>
                <b>{dDay === 0 ? "D-DAY" : `D-${dDay}`}</b>
                <span className="chip-value">{next.name}</span>
              </>
            ) : (
              <span className="chip-value">{t("다가오는 일정 없음")}</span>
            )}
          </button>
        ) : landing ? null : (
          // Visitors can preview either side; a logged-in account stays on its own role.
          <div className="nav-pill role-switch" aria-label={t("사용자 유형")}>
            {roles.map((item) => (
              <button
                className={role === item ? "role-button active" : "role-button"}
                key={item}
                onClick={() => onSwitchRole(item)}
                type="button"
              >
                {t(item)}
              </button>
            ))}
          </div>
        )}

        {authReady &&
          (account ? (
            <div className="nav-pill icons-pill">
              <button
                className="nav-icon"
                aria-label={unreadMessages > 0 ? t("메시지, 읽지 않은 {count}개", { count: unreadMessages }) : t("메시지")}
                onClick={onOpenMessages}
                type="button"
              >
                <Icon name="chat" size={17} />
                {unreadMessages > 0 && <span className="message-count">{unreadMessages}</span>}
              </button>
              <button
                className={notificationsOpen ? "nav-icon active" : "nav-icon"}
                aria-controls="notifications-panel"
                aria-expanded={notificationsOpen}
                aria-label={unread > 0 ? t("알림, 읽지 않은 {count}개", { count: unread }) : t("알림")}
                onClick={() => {
                  setAccountOpen(false)
                  onToggleNotifications()
                }}
                ref={bellRef}
                type="button"
              >
                <Icon name="bell" size={17} />
                {unread > 0 && <span className="notification-dot" />}
              </button>
              <button
                className={accountOpen ? "account-button active" : "account-button"}
                aria-controls="account-panel"
                aria-expanded={accountOpen}
                aria-label={t("내 계정")}
                onClick={() => {
                  onCloseNotifications()
                  setAccountOpen((open) => !open)
                }}
                ref={accountRef}
                type="button"
              >
                {initialOf(account.name)}
              </button>
            </div>
          ) : (
            <>
              {demo && (
                <span className="nav-pill demo-chip" title={t("로그인하지 않아 예시 데이터로 보여요")}>
                  {t("예시 화면")}
                </span>
              )}
              <button className="nav-pill login-pill" onClick={onLogin} type="button">
                {t("로그인")}
              </button>
              {landing && (
                <button className="nav-pill signup-pill" onClick={onSignup} type="button">
                  {t("회원가입")}
                </button>
              )}
            </>
          ))}

        <button
          aria-controls="site-menu"
          aria-expanded={menuOpen}
          aria-label={t("전체 메뉴")}
          className="nav-pill menu-pill"
          onClick={() => {
            setAccountOpen(false)
            onOpenMenu()
          }}
          type="button"
        >
          <Icon name="menu" size={15} />
          <span>Menu</span>
        </button>

      </div>

      <Presence show={accountOpen && account !== null}>
        {account && (
          <AccountPanel
            account={account}
            toggleRef={accountRef}
            onClose={closeAccount}
            onOpenProfile={() => {
              setAccountOpen(false)
              onOpenProfile()
            }}
            onLogout={() => {
              setAccountOpen(false)
              onLogout()
            }}
          />
        )}
      </Presence>

      <Presence show={notificationsOpen && account !== null}>
        <NotificationsPanel
          items={notifications}
          unread={isUnread}
          toggleRef={bellRef}
          onClose={onCloseNotifications}
          onReadAll={() => onReadNotices(notifications)}
          onOpen={(item) => {
            onCloseNotifications()
            onReadNotices([item])
            if (item.faq) onOpenAnswers()
            else onNavigate(item.target)
          }}
        />
      </Presence>
    </header>
  )
}
