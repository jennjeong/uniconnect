import { useState } from "react"

import { api, errorMessage } from "../api"
import { Modal } from "../components/Modal"
import { PasswordField } from "../components/PasswordField"
import { t } from "../i18n"

// Changing the password from 내 정보: the current one, then the new one
// twice. Other devices are logged out; this one stays logged in.
export function PasswordModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [draft, setDraft] = useState({ current: "", next: "", confirm: "" })
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!draft.current) return setError(t("지금 비밀번호를 입력해 주세요."))
    if (draft.next.length < 8) return setError(t("새 비밀번호는 8자 이상이어야 해요."))
    if (draft.next !== draft.confirm) return setError(t("새 비밀번호가 일치하지 않아요."))
    setBusy(true)
    setError("")
    try {
      await api.changePassword({ current: draft.current, next: draft.next })
      onChanged()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const field = (key: keyof typeof draft, label: string, autoComplete: string) => (
    <PasswordField
      autoComplete={autoComplete}
      label={label}
      value={draft[key]}
      onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
    />
  )

  return (
    <Modal name="password" kicker="Account" title={t("비밀번호 변경")} onClose={onClose}>
      <form
        className="auth-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <p className="auth-lead">{t("비밀번호를 바꾸면 다른 기기에서는 로그아웃돼요.")}</p>
        {field("current", t("지금 비밀번호"), "current-password")}
        {field("next", t("새 비밀번호 (8자 이상)"), "new-password")}
        {field("confirm", t("새 비밀번호 확인"), "new-password")}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button wide" disabled={busy} type="submit">
          {t("비밀번호 바꾸기")}
        </button>
      </form>
    </Modal>
  )
}
