import { useState } from "react"

import { api, errorMessage } from "../api"
import { Modal } from "../components/Modal"
import { PasswordField } from "../components/PasswordField"
import { PasswordRules } from "../components/PasswordRules"
import { t } from "../i18n"
import { passwordProblem } from "../lib/password"
import type { Session } from "../types"

// Joining an account one was invited to run (from the login popup's
// 초대받았나요?): the email the invitation went to, its code, and a password
// of one's own; then logged in as a co-admin.
export function JoinTeamModal({
  onClose,
  onJoined,
  onLogin,
}: {
  onClose: () => void
  onJoined: (session: Session) => void
  onLogin: () => void
}) {
  const [draft, setDraft] = useState({ email: "", code: "", password: "", confirm: "" })
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!draft.email.trim() || !draft.code.trim()) return setError(t("초대받은 이메일과 초대 코드를 입력해 주세요."))
    if (passwordProblem(draft.password)) return setError(passwordProblem(draft.password))
    if (draft.password !== draft.confirm) return setError(t("비밀번호가 일치하지 않아요."))
    setBusy(true)
    setError("")
    try {
      onJoined(await api.joinTeam({ email: draft.email.trim(), code: draft.code.trim(), password: draft.password }))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const set = (key: keyof typeof draft) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }))

  return (
    <Modal banner name="join" kicker="Join a Team" title={t("초대받아 함께 관리하기")} onClose={onClose}>
      <form
        className="auth-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <p className="auth-lead">
          {t("대표가 보낸 초대 메일의 이메일과 6자리 코드를 입력하고, 나만 쓸 비밀번호를 정해 주세요. 그 뒤로는 이 이메일과 비밀번호로 로그인해요.")}
        </p>
        <label>
          {t("초대받은 이메일")}
          <input autoComplete="email" onChange={set("email")} type="email" value={draft.email} />
        </label>
        <label>
          {t("초대 코드")}
          <input autoComplete="one-time-code" inputMode="numeric" maxLength={6} onChange={set("code")} value={draft.code} />
        </label>
        <PasswordField
          aria-describedby="join-password-rules"
          autoComplete="new-password"
          label={t("새 비밀번호")}
          onChange={set("password")}
          value={draft.password}
        />
        <PasswordField autoComplete="new-password" label={t("새 비밀번호 확인")} onChange={set("confirm")} value={draft.confirm} />
        <PasswordRules id="join-password-rules" password={draft.password} />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button wide" disabled={busy} type="submit">
          {t("함께 관리 시작하기")}
        </button>
        <p className="auth-switch">
          {t("이미 함께 관리하고 있나요?")}{" "}
          <button onClick={onLogin} type="button">
            {t("로그인")}
          </button>
        </p>
      </form>
    </Modal>
  )
}
