import { useContext, useRef, type RefObject } from "react"

import { Icon } from "../components/Icon"
import { ClosingContext } from "../components/Presence"
import { useDismiss } from "../hooks/useDismiss"
import { t } from "../i18n"
import { initialOf } from "../lib/format"
import type { Account } from "../types"

// Drops down under the account button in the top bar, as the notifications
// do under the bell: who is logged in, 내 정보, and 로그아웃. A co-admin sees
// their own name and email under the account's.
export function AccountPanel({
  account,
  toggleRef,
  onClose,
  onOpenProfile,
  onLogout,
}: {
  account: Account
  // The account button, which toggles the panel itself.
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
