import { useState } from "react"

import { api, errorMessage } from "../api"
import { Modal } from "../components/Modal"
import { PasswordField } from "../components/PasswordField"
import { t } from "../i18n"
import type { Account } from "../types"

// Leaving uniconnect from 내 정보: what goes with the account, then the
// password again and a tick that says so, since nothing can be brought back.
export function LeaveModal({
  account,
  onClose,
  onLeft,
}: {
  account: Account
  onClose: () => void
  onLeft: () => void
}) {
  const [password, setPassword] = useState("")
  const [understood, setUnderstood] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const students = account.role === "학생단체"

  const submit = async () => {
    if (!password) return setError(t("비밀번호를 입력해 주세요."))
    if (!understood) return setError(t("지워지는 내용을 확인했다고 체크해 주세요."))
    setBusy(true)
    setError("")
    try {
      await api.deleteAccount({ password })
      onLeft()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal name="leave" kicker="Leave uniconnect" title={t("회원 탈퇴")} onClose={onClose}>
      <form
        className="auth-form leave-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <p className="auth-lead">
          {t("탈퇴하면 {name} 계정과 아래 내용이 바로 지워지고, 되살릴 수 없어요.", { name: account.name })}
        </p>
        <ul className="leave-list">
          <li>{students ? t("계정 정보와 단체 소개") : t("계정 정보와 브랜드 소개")}</li>
          <li>{students ? t("등록한 행사와 보낸 협찬 제안") : t("등록한 캠페인과 받은 협찬 제안")}</li>
          <li>{t("주고받은 메시지 (상대방 쪽 대화도 함께 사라져요)")}</li>
          <li>{t("관리자에게 보낸 질문과 답변")}</li>
        </ul>
        <PasswordField
          autoComplete="current-password"
          label={t("비밀번호 확인")}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <label className="terms-check">
          <input
            checked={understood}
            type="checkbox"
            onChange={(event) => setUnderstood(event.target.checked)}
          />
          <span>{t("지워지는 내용을 확인했고, 되살릴 수 없다는 것을 이해했어요.")}</span>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button wide leave-confirm" disabled={busy} type="submit">
          {t("탈퇴하기")}
        </button>
        <p className="auth-switch">
          <button onClick={onClose} type="button">
            {t("계속 이용할게요")}
          </button>
        </p>
      </form>
    </Modal>
  )
}
