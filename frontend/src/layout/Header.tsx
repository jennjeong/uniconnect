import { useEffect, useRef, useState } from "react"

import logo from "../assets/brand/uniconnect_horizontal.svg"
import logoReversed from "../assets/brand/uniconnect_horizontal_reversed.svg"
import { Icon } from "../components/Icon"
import { Presence } from "../components/Presence"
import { navItems } from "../data/navigation"
import { roles } from "../data/roles"
import { lang, setLang, t } from "../i18n"
import { daysUntil, formatDay, nextEvent } from "../lib/date"
import { initialOf } from "../lib/format"
import type { NotificationItem } from "../lib/notifications"
import type { Account, NavLabel, Role } from "../types"
import { NotificationsPanel } from "./NotificationsPanel"

// Stride's floating navigation from getlayers.ai: the logo on its own and
// the role's menu as a silver glass pill on the left; the next event (or,
// for visitors, the side to preview), the account buttons, the language
// switch and Menu on the right. The pills gain a soft shadow once the page
// scrolls, and slide in after the intro loader.
export function Header({
  role,
  activeNav,
  account,
  authReady,
  badges,
  events,
  hasUnread,
  notifications,
  notificationsOpen,
  menuOpen,
  unreadMessages,
  onNavigate,
  onSwitchRole,
  onCreate,
  onOpenEvent,
  onOpenMessages,
  onToggleNotifications,
  onCloseNotifications,
  onOpenProfile,
  onLogin,
  onOpenMenu,
}: {
  role: Role
  activeNav: NavLabel
  account: Account | null
  // False while a saved session is being checked, so the login button doesn't flash.
  authReady: boolean
  // Counts shown next to menu items, such as unanswered proposals.
  badges: Partial<Record<NavLabel, number>>
  // Upcoming schedule for the next event pill.
  events: { name: string; date: string; status: string }[]
  hasUnread: boolean
  notifications: NotificationItem[]
  // The notifications panel hangs under the bell while this is true.
  notificationsOpen: boolean
  menuOpen: boolean
  // Messages not yet read, shown on the chat button.
  unreadMessages: number
  onNavigate: (label: NavLabel) => void
  onSwitchRole: (role: Role) => void
  onCreate: () => void
  // Opens the 내 행사 (or 캠페인) calendar on this day.
  onOpenEvent: (date: string) => void
  onOpenMessages: () => void
  onToggleNotifications: () => void
  onCloseNotifications: () => void
  onOpenProfile: () => void
  onLogin: () => void
  onOpenMenu: () => void
}) {
  const bellRef = useRef<HTMLButtonElement>(null)
  const brandRef = useRef<HTMLButtonElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const [onDark, setOnDark] = useState(false)
  const next = nextEvent(events)
  const dDay = next ? daysUntil(next.date) : 0
  // The switch offers the language not on screen, named in itself.
  const other = lang === "ko" ? "en" : "ko"
  const otherName = other === "en" ? "English" : "한국어"

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

  return (
    <header className={["site-header", scrolled && "scrolled", onDark && "on-dark"].filter(Boolean).join(" ")}>
      <div className="nav-group">
        <button
          aria-label={t("uniconnect 홈으로")}
          className="brand-link"
          onClick={() => onNavigate("대시보드")}
          ref={brandRef}
          type="button"
        >
          <img alt="" className="logo-dark" height={27} src={logo} width={116} />
          <img alt="" className="logo-light" height={27} src={logoReversed} width={116} />
        </button>
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
        ) : (
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
                aria-label={t("알림")}
                onClick={onToggleNotifications}
                ref={bellRef}
                type="button"
              >
                <Icon name="bell" size={17} />
                {hasUnread && <span className="notification-dot" />}
              </button>
              <button className="account-button" aria-label={t("내 정보")} onClick={onOpenProfile} type="button">
                {initialOf(account.name)}
              </button>
            </div>
          ) : (
            <button className="nav-pill login-pill" onClick={onLogin} type="button">
              {t("로그인")}
            </button>
          ))}

        {/* A globe named for the other language; the choice is remembered,
            and the page reloads in that language. */}
        <button
          aria-label={otherName}
          className="nav-pill lang-pill"
          lang={other}
          onClick={() => setLang(other)}
          title={otherName}
          type="button"
        >
          <Icon name="globe" size={17} />
        </button>

        <button
          aria-controls="site-menu"
          aria-expanded={menuOpen}
          aria-label={t("전체 메뉴")}
          className="nav-pill menu-pill"
          onClick={onOpenMenu}
          type="button"
        >
          <Icon name="menu" size={15} />
          <span>Menu</span>
        </button>

      </div>

      <Presence show={notificationsOpen && account !== null}>
        <NotificationsPanel
          items={notifications}
          toggleRef={bellRef}
          onClose={onCloseNotifications}
          onOpen={(label) => {
            onCloseNotifications()
            onNavigate(label)
          }}
        />
      </Presence>
    </header>
  )
}
