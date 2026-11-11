import { useCallback, useEffect, useRef, useState } from "react"

import logo from "../assets/brand/uniconnect_horizontal.svg"
import logoReversed from "../assets/brand/uniconnect_horizontal_reversed.svg"
import { Icon } from "../components/Icon"
import { Presence } from "../components/Presence"
import { navItems } from "../data/navigation"
import { roles } from "../data/roles"
import { t, tc } from "../i18n"
import { daysUntil, formatDay, nextEvent } from "../lib/date"
import { initialOf } from "../lib/format"
import type { NotificationItem } from "../lib/notifications"
import type { Account, NavLabel, Role } from "../types"
import { AccountPanel } from "./AccountPanel"
import { NotificationsPanel } from "./NotificationsPanel"

// 소개 페이지의 섹션. 헤더의 링크용.
const sections: { id: string; label: string }[] = [
  { id: "landing-title", label: t("서비스 소개") },
  { id: "how", label: t("이용 방법") },
  { id: "examples", label: t("예시 화면") },
  { id: "faq", label: "FAQ" },
]

// getlayers.ai의 Stride 플로팅 내비게이션. 로고는 홀로 두고, 역할별 메뉴는
// 왼쪽의 은색 유리 알약으로, 다음 행사(방문자에게는 미리 볼 쪽), 계정 버튼,
// Menu는 오른쪽에 둔다. 소개 페이지에서는 메뉴 대신 섹션이 나오고 가입이 로그인
// 옆에 놓인다. 방문자에게 보이는 회원 화면에서는 로고 옆의 칩이 예시 화면임을
// 알린다. 페이지를 스크롤하면 알약에 부드러운 그림자가 붙고, 인트로 로더 뒤에
// 미끄러져 들어온다.
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
  // 저장된 세션을 확인하는 동안 false. 로그인 버튼이 깜박이지 않게 한다.
  authReady: boolean
  // 메뉴 항목 옆에 보이는 수. 답하지 않은 제안 같은 것.
  badges: Partial<Record<NavLabel, number>>
  // 다음 행사 알약에 보여 줄 앞으로의 일정.
  events: { name: string; date: string; status: string }[]
  notifications: NotificationItem[]
  // 계정이 아직 읽지 않은 알림이 있는지. 있는 동안 종 모양의 점이 보인다.
  isUnread: (item: NotificationItem) => boolean
  // 이 값이 true인 동안 알림 패널이 종 아래에 걸린다.
  notificationsOpen: boolean
  menuOpen: boolean
  // 아직 읽지 않은 메시지. 채팅 버튼에 보인다.
  unreadMessages: number
  // 소개 페이지에 있는 방문자.
  landing: boolean
  // 회원 화면을 데모 데이터로 보고 있는 방문자.
  demo: boolean
  // 로고. 방문자는 소개 페이지로, 회원은 대시보드로 간다.
  onHome: () => void
  onNavigate: (label: NavLabel) => void
  onSwitchRole: (role: Role) => void
  onCreate: () => void
  // 이 날짜의 내 행사(또는 캠페인) 달력을 연다.
  onOpenEvent: (date: string) => void
  onOpenMessages: () => void
  // 도움말 센터의 질문. 운영진의 답이 있는 곳.
  onOpenAnswers: () => void
  onToggleNotifications: () => void
  onCloseNotifications: () => void
  // 알림을 읽음으로 표시한다. 하나를 열었을 때나, 모두 읽음으로 전체를.
  onReadNotices: (items: NotificationItem[]) => void
  onOpenProfile: () => void
  onLogout: () => void
  onLogin: () => void
  onSignup: () => void
  onOpenMenu: () => void
}) {
  const bellRef = useRef<HTMLButtonElement>(null)
  const accountRef = useRef<HTMLButtonElement>(null)
  // 계정 패널. 이 패널과 알림 패널이 동시에 열려 있지는 않는다.
  const [accountOpen, setAccountOpen] = useState(false)
  const closeAccount = useCallback(() => setAccountOpen(false), [])
  const unread = notifications.filter(isUnread).length
  const brandRef = useRef<HTMLButtonElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const [onDark, setOnDark] = useState(false)
  const next = nextEvent(events)
  const dDay = next ? daysUntil(next.date) : 0

  // 첫 확인은 첫 화면을 그린 뒤에 한다. 그리기 전에 scrollY를 읽으면 브라우저가 레이아웃을
  // 앞당겨 계산해야 한다(강제 리플로우).
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8)
    const first = window.setTimeout(update, 0)
    window.addEventListener("scroll", update, { passive: true })
    return () => {
      window.clearTimeout(first)
      window.removeEventListener("scroll", update)
    }
  }, [])

  // 로고에는 자기 알약이 없어서 짙은 파랑 표면 위에 떠 있을 때는 밝게 바뀌고
  // (index.css가 --surface-tone으로 그런 표면을 표시한다) 흰색 위에서는 짙은
  // 파랑을 유지한다. 스크롤, 크기 변경, 페이지 전환 때 확인하며, 페이지를
  // 그리는 동안 몰려오므로 잠잠해질 때를 기다린다.
  useEffect(() => {
    let frame = 0
    let after = 0
    let pause = 0
    const check = () => {
      frame = 0
      after = 0
      const brand = brandRef.current
      if (!brand) return
      const box = brand.getBoundingClientRect()
      const below = document
        .elementsFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        .find((element) => !element.closest(".site-header"))
      setOnDark(below ? getComputedStyle(below).getPropertyValue("--surface-tone").trim() === "dark" : false)
    }
    // 다음 화면을 그린 직후에 잰다. 그리기 전(requestAnimationFrame 안)에 재면 바뀐 스타일과
    // 레이아웃을 그 자리에서 다시 계산하게 된다.
    const schedule = () => {
      if (!frame && !after) frame = requestAnimationFrame(() => {
        frame = 0
        after = window.setTimeout(check, 0)
      })
    }
    schedule()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    const pages = new MutationObserver(() => {
      window.clearTimeout(pause)
      pause = window.setTimeout(schedule, 100)
    })
    pages.observe(document.body, { childList: true, subtree: true })
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(after)
      window.clearTimeout(pause)
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      pages.disconnect()
    }
  }, [])

  // 섹션의 제목(라벨)을 헤더 아래 24px 위치로 가져온다. 변형(transform)을
  // 무시하는 offset으로 측정하므로, 아직 올라오기를 기다리는
  // 제목(data-reveal)은 자리 잡았을 때보다 낮게 있다.
  const showSection = (id: string) => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const section = document.getElementById(id)
    let element = (section?.querySelector(".eyebrow") ?? section) as HTMLElement | null
    if (!element) return
    let top = 0
    while (element) {
      top += element.offsetTop
      element = element.offsetParent as HTMLElement | null
    }
    const header = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 0
    window.scrollTo({ top: top - header - 24, behavior: still ? "auto" : "smooth" })
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
          // 방문자는 어느 쪽이든 미리 볼 수 있다. 로그인한 계정은 자기 역할에
          // 머문다.
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
          <span>{tc("button", "메뉴")}</span>
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
