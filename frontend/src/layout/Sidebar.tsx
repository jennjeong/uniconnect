import logoHorizontal from "../assets/brand/uniconnect_horizontal.svg"
import { Icon } from "../components/Icon"
import { navItems } from "../data/navigation"
import { createLabel, roles } from "../data/roles"
import { daysUntil, formatDay, nextEvent } from "../lib/date"
import { initialOf } from "../lib/format"
import type { Account, NavLabel, Role } from "../types"

export function Sidebar({
  role,
  account,
  activeNav,
  badges,
  events,
  onNavigate,
  onSwitchRole,
  onCreate,
  onOpenEvent,
  onOpenAccount,
}: {
  role: Role
  account: Account | null
  activeNav: NavLabel
  // Counts shown next to menu items, such as unanswered proposals.
  badges: Partial<Record<NavLabel, number>>
  // Upcoming schedule for the card below the menu.
  events: { name: string; date: string; status: string }[]
  onNavigate: (label: NavLabel) => void
  onSwitchRole: (role: Role) => void
  onCreate: () => void
  // Opens the 내 행사 (or 캠페인) calendar on this day.
  onOpenEvent: (date: string) => void
  onOpenAccount: () => void
}) {
  const next = nextEvent(events)
  const dDay = next ? daysUntil(next.date) : 0

  return (
    <aside className="sidebar">
      <button
        className="brand-lockup"
        aria-label="uniconnect 홈으로"
        onClick={() => onNavigate("대시보드")}
        type="button"
      >
        <img
          className="brand-logo"
          src={logoHorizontal}
          alt=""
          width={154}
          height={36}
        />
      </button>

      {/* Visitors can preview either side; a logged-in account stays on its own role. */}
      <div className="role-switch" aria-label="사용자 유형">
        {roles.map((item) => (
          <button
            className={role === item ? "role-button active" : "role-button"}
            disabled={account !== null && item !== role}
            key={item}
            onClick={() => onSwitchRole(item)}
            title={
              account && item !== role
                ? "로그아웃하면 다른 유형 화면도 둘러볼 수 있어요."
                : undefined
            }
            type="button"
          >
            {item}
          </button>
        ))}
      </div>

      <button
        className="primary-button sidebar-create"
        onClick={onCreate}
        type="button"
      >
        <Icon name="plus" size={18} />
        <span>{createLabel(role)}</span>
      </button>

      <nav className="main-nav" aria-label="주요 메뉴">
        <span className="nav-label">MENU</span>
        {navItems[role].map((item) => (
          <button
            className={activeNav === item.label ? "nav-item active" : "nav-item"}
            key={item.label}
            onClick={() => onNavigate(item.label)}
            type="button"
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
            {(badges[item.label] ?? 0) > 0 && (
              <span className="nav-count">{badges[item.label]}</span>
            )}
          </button>
        ))}
      </nav>

      <button
        className="pilot-card"
        onClick={() => (next ? onOpenEvent(next.date) : onCreate())}
        type="button"
      >
        <span className="pilot-kicker">다가오는 일정</span>
        {next ? (
          <>
            <strong>{next.name}</strong>
            <span>{formatDay(next.date)}</span>
            <span className="pilot-footer">
              <em className="d-day">{dDay === 0 ? "D-DAY" : `D-${dDay}`}</em>
              <small>{next.status}</small>
            </span>
          </>
        ) : (
          <>
            <strong>예정된 일정이 없어요</strong>
            <span>{role === "학생단체" ? "새 행사를 등록해 보세요" : "새 캠페인을 등록해 보세요"}</span>
          </>
        )}
      </button>

      <button className="profile" onClick={onOpenAccount} type="button">
        <div className="avatar">{account ? initialOf(account.name) : "?"}</div>
        <div>
          <strong>{account ? account.name : "로그인이 필요해요"}</strong>
          <span>{account ? account.type : "로그인하고 협찬을 관리하세요"}</span>
        </div>
        <Icon name="chevron" size={16} />
      </button>
    </aside>
  )
}
