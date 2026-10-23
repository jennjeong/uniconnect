import { useState } from "react"

import { api, errorMessage } from "../api"
import { Modal } from "../components/Modal"
import { RolePicker } from "../components/RolePicker"
import type { Role, Session } from "../types"

export function LoginModal({
  initialRole,
  onClose,
  onLoggedIn,
  onSignup,
  onForgot,
}: {
  initialRole: Role
  onClose: () => void
  onLoggedIn: (session: Session) => void
  onSignup: (role: Role) => void
  onForgot: (email: string) => void
}) {
  const [draft, setDraft] = useState({ role: initialRole, email: "", password: "" })
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!draft.email.trim() || !draft.password) {
      setError("이메일과 비밀번호를 입력해 주세요.")
      return
    }
    setBusy(true)
    setError("")
    try {
      onLoggedIn(await api.login(draft))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal banner name="login" kicker="Welcome Back" title="로그인" onClose={onClose}>
      <form
        className="auth-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <RolePicker
          name="login-role"
          value={draft.role}
          onChange={(role) => setDraft((current) => ({ ...current, role }))}
        />
        <label>
          이메일
          <input
            autoComplete="email"
            placeholder={
              draft.role === "학생단체" ? "name@school.ac.kr" : "name@company.com"
            }
            type="email"
            value={draft.email}
            onChange={(event) =>
              setDraft((current) => ({ ...current, email: event.target.value }))
            }
          />
        </label>
        <label>
          비밀번호
          <input
            autoComplete="current-password"
            type="password"
            value={draft.password}
            onChange={(event) =>
              setDraft((current) => ({ ...current, password: event.target.value }))
            }
          />
        </label>
        <p className="forgot-row">
          <button onClick={() => onForgot(draft.email)} type="button">
            비밀번호를 잊으셨나요?
          </button>
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button wide" disabled={busy} type="submit">
          {draft.role === "학생단체" ? "학생단체로 로그인" : "스폰서로 로그인"}
        </button>
        <p className="auth-switch">
          아직 계정이 없나요?{" "}
          <button onClick={() => onSignup(draft.role)} type="button">
            회원가입
          </button>
        </p>
      </form>
    </Modal>
  )
}
