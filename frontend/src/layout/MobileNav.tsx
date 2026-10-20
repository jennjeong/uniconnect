import { Icon } from "../components/Icon"
import { navItems } from "../data/navigation"
import type { NavLabel } from "../types"

export function MobileNav({
  activeNav,
  onNavigate,
}: {
  activeNav: NavLabel
  onNavigate: (label: NavLabel) => void
}) {
  return (
    <nav className="mobile-nav" aria-label="모바일 주요 메뉴">
      {navItems.map((item) => (
        <button
          className={activeNav === item.label ? "active" : ""}
          key={item.label}
          onClick={() => onNavigate(item.label)}
          type="button"
        >
          <Icon name={item.icon} size={20} />
          <span>{item.label.replace("추천 ", "")}</span>
        </button>
      ))}
    </nav>
  )
}
