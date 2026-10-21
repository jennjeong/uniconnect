import { useEffect, useRef, useState } from "react"

import logo from "../assets/brand/uniconnect_horizontal.svg"
import { Icon } from "../components/Icon"
import { Presence } from "../components/Presence"
import { navItems } from "../data/navigation"
import { createLabel, roles } from "../data/roles"
import { daysUntil, formatDay, nextEvent } from "../lib/date"
import { initialOf } from "../lib/format"
import type { NotificationItem } from "../lib/notifications"
import type { Account, NavLabel, Role } from "../types"
import { NotificationsPanel } from "./NotificationsPanel"

// Stride's floating navigation from getlayers.ai, in silver glass: the logo
// and the role's menu as pills on the left; the next event (or, for
// visitors, the side to preview), the account buttons, Menu and the register
// action in deep blue on the right. The pills gain a soft shadow once the
// page scrolls, and slide in after the intro loader.
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
  const [scrolled, setScrolled] = useState(false)
  const next = nextEvent(events)
  const dDay = next ? daysUntil(next.date) : 0

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8)
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => window.removeEventListener("scroll", update)
  }, [])

  return (
    <header className={scrolled ? "site-header scrolled" : "site-header"}>
      <div className="nav-group">
        <button
          className="nav-pill brand-pill"
          aria-label="uniconnect 홈으로"
          onClick={() => onNavigate("대시보드")}
          type="button"
        >
          <img src={logo} alt="" width={116} height={27} />
        </button>
        <nav className="nav-pill links-pill" aria-label="주요 메뉴">
          {navItems[role].map((item) => (
            <button
              aria-current={activeNav === item.label ? "page" : undefined}
              className={activeNav === item.label ? "header-link active" : "header-link"}
              key={item.label}
              onClick={() => onNavigate(item.label)}
              type="button"
            >
              {item.label}
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
                ? `다가오는 일정 ${next.name}, ${formatDay(next.date)}, ${next.status}`
                : "다가오는 일정 없음, 새로 등록하기"
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
              <span className="chip-value">다가오는 일정 없음</span>
            )}
          </button>
        ) : (
          // Visitors can preview either side; a logged-in account stays on its own role.
          <div className="nav-pill role-switch" aria-label="사용자 유형">
            {roles.map((item) => (
              <button
                className={role === item ? "role-button active" : "role-button"}
                key={item}
                onClick={() => onSwitchRole(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        )}

        {authReady &&
          (account ? (
            <div className="nav-pill icons-pill">
              <button
                className="nav-icon"
                aria-label={unreadMessages > 0 ? `메시지, 읽지 않은 ${unreadMessages}개` : "메시지"}
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
                aria-label="알림"
                onClick={onToggleNotifications}
                ref={bellRef}
                type="button"
              >
                <Icon name="bell" size={17} />
                {hasUnread && <span className="notification-dot" />}
              </button>
              <button className="account-button" aria-label="내 정보" onClick={onOpenProfile} type="button">
                {initialOf(account.name)}
              </button>
            </div>
          ) : (
            <button className="nav-pill login-pill" onClick={onLogin} type="button">
              로그인
            </button>
          ))}

        <button
          aria-controls="site-menu"
          aria-expanded={menuOpen}
          aria-label="전체 메뉴"
          className="nav-pill menu-pill"
          onClick={onOpenMenu}
          type="button"
        >
          <Icon name="menu" size={15} />
          <span>Menu</span>
        </button>

        <button aria-label={createLabel(role)} className="cta-pill" onClick={onCreate} type="button">
          <Icon name="plus" size={16} />
          <span>{createLabel(role)}</span>
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
