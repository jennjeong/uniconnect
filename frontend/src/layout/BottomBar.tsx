import { useEffect, useState } from "react"

import { Icon } from "../components/Icon"
import { navItems } from "../data/navigation"
import { t } from "../i18n"
import type { NavLabel, Role } from "../types"

// 휴대폰의 아래 탭 바: 그 역할의 주요 화면 다섯 개까지. 아이콘과 이름을 한 칸에 위아래로 두고,
// 지금 화면은 굵은 이름과 채운 아이콘 바탕으로도 보인다. 넓은 화면에서는 머리의 메뉴가 같은 일을
// 하므로 CSS가 감춘다(.bottom-bar). 키보드가 올라오면 입력을 가리지 않게 숨는다.
export function BottomBar({
  role,
  active,
  badges,
  onNavigate,
}: {
  role: Role
  active?: NavLabel
  badges: Partial<Record<NavLabel, number>>
  onNavigate: (label: NavLabel) => void
}) {
  const keyboard = useKeyboardOpen()
  return (
    <nav aria-label={t("아래 메뉴")} className="bottom-bar" data-keyboard={keyboard || undefined}>
      {navItems[role].slice(0, 5).map((item) => {
        const current = active === item.label
        const count = badges[item.label] ?? 0
        return (
          <button
            aria-current={current ? "page" : undefined}
            className={current ? "active" : undefined}
            key={item.label}
            onClick={() => onNavigate(item.label)}
            type="button"
          >
            <span className="bottom-bar-icon">
              <Icon name={item.icon} size={20} />
              {count > 0 && (
                <span className="bottom-bar-count" aria-label={t("{count}건", { count })}>
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </span>
            <span className="bottom-bar-label">{t(item.short ?? item.label)}</span>
          </button>
        )
      })}
    </nav>
  )
}

// 화면 키보드가 올라와 보이는 영역이 크게 줄었는지. 입력에 초점이 갔는지로 보면 체크박스를 누를
// 때도 숨었다 나타나며 누르는 자리를 바꾸므로, 실제로 줄어든 높이(visualViewport)로 본다.
function useKeyboardOpen() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const check = () => setOpen(window.innerHeight - viewport.height > 150)
    check()
    viewport.addEventListener("resize", check)
    return () => viewport.removeEventListener("resize", check)
  }, [])
  return open
}
