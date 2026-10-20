import { Icon } from "../components/Icon"
import { navItems } from "../data/navigation"
import type { NavLabel, Role } from "../types"

export function MobileNav({
  role,
  activeNav,
  onNavigate,
}: {
  role: Role
  activeNav: NavLabel
  onNavigate: (label: NavLabel) => void
}) {
  return (
    <nav className="mobile-nav" aria-label="모바일 주요 메뉴">
      {navItems[role].map((item) => (
        <button
          className={activeNav === item.label ? "active" : ""}
          key={item.label}
          onClick={() => onNavigate(item.label)}
          type="button"
        >
          <Icon name={item.icon} size={20} />
          <span>{item.short ?? item.label}</span>
        </button>
      ))}
    </nav>
  )
}
