import { useContext, useRef, type RefObject } from "react"

import { Icon } from "../components/Icon"
import { ClosingContext } from "../components/Presence"
import { useDismiss } from "../hooks/useDismiss"
import { t } from "../i18n"
import { initialOf } from "../lib/format"
import type { Account } from "../types"

// 상단 바의 계정 버튼 아래로 내려오는 패널. 알림이 종 아래에 내려오는 것과
// 같다. 로그인한 사람, 내 정보, 로그아웃이 있다. 공동 관리자에게는 계정 정보
// 아래에 자기 이름과 이메일이 보인다.
export function AccountPanel({
  account,
  toggleRef,
  onClose,
  onOpenProfile,
  onLogout,
}: {
  account: Account
  // 계정 버튼. 패널은 이 버튼이 스스로 토글한다.
  toggleRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
  onOpenProfile: () => void
  onLogout: () => void
}) {
  const panelRef = useRef<HTMLElement>(null)
  const closing = useContext(ClosingContext)
  useDismiss(panelRef, toggleRef, onClose, closing)

  return (
    <section
      aria-label={t("내 계정")}
      className={closing ? "notify-panel account-panel closing" : "notify-panel account-panel"}
      id="account-panel"
      ref={panelRef}
    >
      <div className="account-panel-who">
        <span aria-hidden="true" className="account-panel-mark">
          {initialOf(account.name)}
        </span>
        <span>
          <strong>{account.name}</strong>
          <small>{[t(account.role), t(account.type)].join(" · ")}</small>
          <small>{account.asMember ? `${account.asMember.name} · ${account.asMember.email}` : account.email}</small>
        </span>
      </div>
      <div className="account-panel-actions">
        <button onClick={onOpenProfile} type="button">
          <Icon name="user" size={17} />
          <span>{t("내 정보")}</span>
          <Icon name="chevron" size={15} />
        </button>
        <button className="logout" onClick={onLogout} type="button">
          <Icon name="logout" size={17} />
          <span>{t("로그아웃")}</span>
        </button>
      </div>
    </section>
  )
}
