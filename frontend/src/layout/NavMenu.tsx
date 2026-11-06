import { useContext, useEffect, useRef, type CSSProperties } from "react"

import logo from "../assets/brand/uniconnect_horizontal.svg"
import { Icon } from "../components/Icon"
import { ClosingContext } from "../components/Presence"
import { navItems } from "../data/navigation"
import { createLabel, roles } from "../data/roles"
import { useDialogFocus } from "../hooks/useDialogFocus"
import { t } from "../i18n"
import type { Account, NavLabel, Role } from "../types"

// Menu 뒤의 전체 화면 메뉴. 은색 패널에 역할별 페이지가 큰 글자로 번호와 함께
// 차례로 나타나고, 그 아래에 계정 링크(와 FAQ)가 페이지 이름과 같은 줄에 맞춰
// 놓이며, 맨 아래에 가입 버튼이 있다.
// Escape나 닫기로 닫으며, 열려 있는 동안 뒤의 페이지는 스크롤되지 않는다.
export function NavMenu({
  role,
  activeNav,
  account,
  badges,
  unreadMessages,
  onHome,
  onNavigate,
  onSwitchRole,
  onCreate,
  onOpenMessages,
  onOpenAgreements,
  onOpenBoard,
  onOpenProfile,
  onOpenFaq,
  onOpenPlans,
  onLogin,
  onSignup,
  onInstall,
  installable,
  onClose,
}: {
  role: Role
  activeNav?: NavLabel
  account: Account | null
  badges: Partial<Record<NavLabel, number>>
  unreadMessages: number
  // 소개 페이지. 방문자용.
  onHome: () => void
  onNavigate: (label: NavLabel) => void
  onSwitchRole: (role: Role) => void
  onCreate: () => void
  onOpenMessages: () => void
  onOpenAgreements: () => void
  // 모집 게시판. 회원과 방문자 모두에게 보인다.
  onOpenBoard: () => void
  onOpenProfile: () => void
  onOpenFaq: () => void
  onOpenPlans: () => void
  onLogin: () => void
  onSignup: () => void
  // 앱 다운로드. 사이트를 브라우저에서 연 경우 항상 보인다 (lib/install.ts).
  onInstall: () => void
  installable: boolean
  onClose: () => void
}) {
  const closing = useContext(ClosingContext)
  const closeRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // 포커스는 메뉴 안(닫기 버튼)으로 들어가 메뉴가 열려 있는 동안 거기에 머물고,
  // 메뉴가 사라지면 원래 있던 곳으로 돌아간다. 단 링크가 포커스를 가져가는
  // 것(로그인 폼)을 열었다면 돌려주지 않는다.
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

  // 링크는 각각 먼저 메뉴를 닫고 나서 제 일을 한다.
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
                {t("임시 전자 계약서")}
              </button>
              <button onClick={pick(onOpenBoard)} type="button">
                {t("모집 게시판")}
              </button>
              <button onClick={pick(onOpenProfile)} type="button">
                {t("내 정보")}
              </button>
              <button onClick={pick(onOpenPlans)} type="button">
                {t("요금제")}
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
              <button onClick={pick(onHome)} type="button">
                {t("서비스 소개")}
              </button>
              <button onClick={pick(onOpenBoard)} type="button">
                {t("모집 게시판")}
              </button>
              <button onClick={pick(onLogin)} type="button">
                {t("로그인")}
              </button>
              <button onClick={pick(onSignup)} type="button">
                {t("회원가입")}
              </button>
              <button onClick={pick(onOpenPlans)} type="button">
                {t("요금제")}
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
