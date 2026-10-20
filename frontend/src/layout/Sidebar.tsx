import logoHorizontal from "../assets/brand/uniconnect_horizontal.svg"
import { Icon } from "../components/Icon"
import { navItems } from "../data/navigation"
import { createLabel, roles } from "../data/roles"
import { initialOf } from "../lib/format"
import type { Account, NavLabel, Role } from "../types"

export function Sidebar({
  role,
  account,
  activeNav,
  matchCount,
  onNavigate,
  onSwitchRole,
  onCreate,
  onOpenAccount,
}: {
  role: Role
  account: Account | null
  activeNav: NavLabel
  matchCount: number
  onNavigate: (label: NavLabel) => void
  onSwitchRole: (role: Role) => void
  onCreate: () => void
  onOpenAccount: () => void
}) {
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
        {navItems.map((item) => (
          <button
            className={activeNav === item.label ? "nav-item active" : "nav-item"}
            key={item.label}
            onClick={() => onNavigate(item.label)}
            type="button"
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
            {item.label === "추천 매칭" && matchCount > 0 && (
              <span className="nav-count">{matchCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="pilot-card">
        <span className="pilot-kicker">MVP PILOT</span>
        <strong>삼육대 파일럿</strong>
        <span>11월 30일까지</span>
        <div className="pilot-progress">
          <span />
        </div>
        <small>전체 목표의 68%</small>
      </div>

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
