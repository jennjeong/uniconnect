import { useContext, useEffect, useRef, type CSSProperties } from "react"

import logo from "../assets/brand/uniconnect_horizontal.svg"
import { Icon } from "../components/Icon"
import { ClosingContext } from "../components/Presence"
import { navItems } from "../data/navigation"
import { createLabel, roles } from "../data/roles"
import { useDialogFocus } from "../hooks/useDialogFocus"
import { t } from "../i18n"
import type { Account, NavLabel, Role } from "../types"

// The full-screen menu behind Menu: a silver panel with the role's pages in
// large type, numbered and arriving one after another, the account links
// (and the FAQ) under them in line with the page names, and the register
// action at the bottom.
// Escape or 닫기 closes it; the page behind doesn't scroll while it is open.
export function NavMenu({
  role,
  activeNav,
  account,
  badges,
  unreadMessages,
  onNavigate,
  onSwitchRole,
  onCreate,
  onOpenMessages,
  onOpenAgreements,
  onOpenProfile,
  onOpenFaq,
  onLogin,
  onSignup,
  onInstall,
  installable,
  onClose,
}: {
  role: Role
  activeNav: NavLabel
  account: Account | null
  badges: Partial<Record<NavLabel, number>>
  unreadMessages: number
  onNavigate: (label: NavLabel) => void
  onSwitchRole: (role: Role) => void
  onCreate: () => void
  onOpenMessages: () => void
  onOpenAgreements: () => void
  onOpenProfile: () => void
  onOpenFaq: () => void
  onLogin: () => void
  onSignup: () => void
  // 앱 다운로드, whenever the site is open in a browser (lib/install.ts).
  onInstall: () => void
  installable: boolean
  onClose: () => void
}) {
  const closing = useContext(ClosingContext)
  const closeRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Focus moves into the menu (its close button), stays there while it is
  // open and goes back to where it was when the menu goes, unless a link
  // opened something that took the focus (a login form).
  useDialogFocus(menuRef, !closing, closeRef)

  useEffect(() => {
    const root = document.documentElement
    root.classList.add("scroll-locked")
    return () => root.classList.remove("scroll-locked")
  }, [])

  useEffect(() => {
    if (closing) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [closing, onClose])

  // Each link closes the menu first, then does its job.
  const pick = (action: () => void) => () => {
    onClose()
    action()
  }

  return (
    <div
      aria-label={t("전체 메뉴")}
      aria-modal="true"
      className={closing ? "nav-menu closing" : "nav-menu"}
      id="site-menu"
      ref={menuRef}
      role="dialog"
    >
      <div className="nav-menu-top">
        <img alt="uniconnect" height={29} src={logo} width={124} />
        <button className="nav-menu-close" onClick={onClose} ref={closeRef} type="button">
          <Icon name="close" size={14} />
          {t("닫기")}
        </button>
      </div>

      <nav aria-label={t("전체 메뉴 목록")} className="nav-menu-body">
        <ul className="nav-menu-list">
          {navItems[role].map((item, index) => (
            <li key={item.label} style={{ "--i": index } as CSSProperties}>
              <button
                aria-current={activeNav === item.label ? "page" : undefined}
                className={activeNav === item.label ? "nav-menu-item active" : "nav-menu-item"}
                onClick={pick(() => onNavigate(item.label))}
                type="button"
              >
                <small>{String(index + 1).padStart(2, "0")}</small>
                <span>{t(item.label)}</span>
                {(badges[item.label] ?? 0) > 0 && <em>{badges[item.label]}</em>}
              </button>
            </li>
          ))}
        </ul>

        <div className="nav-menu-extra" style={{ "--i": navItems[role].length } as CSSProperties}>
          {account ? (
            <>
              <button onClick={pick(onOpenMessages)} type="button">
                {t("메시지")}{unreadMessages > 0 && <em>{unreadMessages}</em>}
              </button>
              <button onClick={pick(onOpenAgreements)} type="button">
                {t("협찬 약속서")}
              </button>
              <button onClick={pick(onOpenProfile)} type="button">
                {t("내 정보")}
              </button>
              <button onClick={pick(onOpenFaq)} type="button">
                FAQ
              </button>
              {installable && (
                <button onClick={pick(onInstall)} type="button">
                  {t("앱 다운로드")}
                </button>
              )}
            </>
          ) : (
            <>
              <button onClick={pick(onLogin)} type="button">
                {t("로그인")}
              </button>
              <button onClick={pick(onSignup)} type="button">
                {t("회원가입")}
              </button>
              <button onClick={pick(onOpenFaq)} type="button">
                FAQ
              </button>
              {installable && (
                <button onClick={pick(onInstall)} type="button">
                  {t("앱 다운로드")}
                </button>
              )}
              <span className="nav-menu-roles" aria-label={t("둘러볼 화면")}>
                {roles.map((item) => (
                  <button
                    aria-pressed={role === item}
                    className={role === item ? "active" : undefined}
                    key={item}
                    onClick={pick(() => onSwitchRole(item))}
                    type="button"
                  >
                    {t("{role} 화면", { role: t(item) })}
                  </button>
                ))}
              </span>
            </>
          )}
        </div>
      </nav>

      <div className="nav-menu-bottom">
        <button onClick={pick(onCreate)} type="button">
          {createLabel(role)} →
        </button>
      </div>
    </div>
  )
}
