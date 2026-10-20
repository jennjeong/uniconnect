import logoHorizontal from "../assets/brand/uniconnect_horizontal.svg"
import { Icon } from "../components/Icon"
import { initialOf } from "../lib/format"
import type { Account, NavLabel } from "../types"

// "2026 FALL SEMESTER" from today's date.
function semesterLabel(date = new Date()) {
  const month = date.getMonth() + 1
  const season =
    month >= 9 ? "FALL" : month >= 7 ? "SUMMER" : month >= 3 ? "SPRING" : "WINTER"
  return `${date.getFullYear()} ${season} SEMESTER`
}

export function Topbar({
  title,
  activeNav,
  account,
  authReady,
  hasUnread,
  onNavigate,
  onOpenNotifications,
  onOpenProfile,
  onLogin,
}: {
  // Overrides the page name, e.g. on the new event page.
  title?: string
  activeNav: NavLabel
  account: Account | null
  // False while a saved session is being checked, so the login button doesn't flash.
  authReady: boolean
  hasUnread: boolean
  onNavigate: (label: NavLabel) => void
  onOpenNotifications: () => void
  onOpenProfile: () => void
  onLogin: () => void
}) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <button
          className="topbar-home"
          aria-label="uniconnect 홈으로"
          onClick={() => onNavigate("대시보드")}
          type="button"
        >
          <img src={logoHorizontal} alt="" width={128} height={30} />
        </button>
        <div className="topbar-heading">
          <span className="eyebrow">{semesterLabel()}</span>
          <p className="page-title">
            {title
              ? title
              : activeNav !== "대시보드"
              ? activeNav
              : account
                ? `반가워요, ${account.name}`
                : "반가워요"}
          </p>
        </div>
      </div>
      <div className="top-actions">
        {authReady &&
          (account ? (
            <>
              <button
                className="icon-button"
                aria-label="알림"
                onClick={onOpenNotifications}
                type="button"
              >
                <Icon name="bell" size={18} />
                {hasUnread && <span className="notification-dot" />}
              </button>
              <button
                className="account-button"
                aria-label="내 정보"
                onClick={onOpenProfile}
                type="button"
              >
                {initialOf(account.name)}
              </button>
            </>
          ) : (
            <button className="login-button" onClick={onLogin} type="button">
              로그인
            </button>
          ))}
      </div>
    </header>
  )
}
