import { useState } from "react"

import { api, errorMessage } from "../api"
import { CodeStep } from "../components/CodeStep"
import { Modal } from "../components/Modal"
import { PasswordField } from "../components/PasswordField"
import { RoleMark } from "../components/RoleMark"
import { RolePicker } from "../components/RolePicker"
import { demoAccounts, demoPassword } from "../data/demo"
import { roles } from "../data/roles"
import { t } from "../i18n"
import type { CodeTicket, Role, Session } from "../types"

export function LoginModal({
  initialRole,
  onClose,
  onLoggedIn,
  onSignup,
  onForgot,
}: {
  initialRole: Role
  onClose: () => void
  // With two-step login on, after the code; `recoveryLeft` then says how
  // many recovery codes remain.
  onLoggedIn: (session: Session & { recoveryLeft?: number }) => void
  onSignup: (role: Role) => void
  onForgot: (email: string) => void
}) {
  const [draft, setDraft] = useState({ role: initialRole, email: "", password: "" })
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  // The password was right and the account asks for its code next.
  const [ticket, setTicket] = useState<{ email: string; ticket: CodeTicket } | null>(null)

  // The form as typed, or a demo account's published login.
  const submit = async (form = draft) => {
    if (!form.email.trim() || !form.password) {
      setError(t("이메일과 비밀번호를 입력해 주세요."))
      return
    }
    setBusy(true)
    setError("")
    try {
      const answer = await api.login(form)
      if ("ticket" in answer) setTicket({ email: form.email, ticket: answer })
      else onLoggedIn(answer)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal banner name="login" kicker="Welcome Back" title={t("로그인")} onClose={onClose}>
      {ticket ? (
        <CodeStep
          email={ticket.email}
          onDone={onLoggedIn}
          onRestart={() => {
            setTicket(null)
            setDraft((current) => ({ ...current, password: "" }))
          }}
          ticket={ticket.ticket}
        />
      ) : (
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
            {t("이메일")}
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
          <PasswordField
            autoComplete="current-password"
            label={t("비밀번호")}
            value={draft.password}
            onChange={(event) =>
              setDraft((current) => ({ ...current, password: event.target.value }))
            }
          />
          <p className="forgot-row">
            <button onClick={() => onForgot(draft.email)} type="button">
              {t("비밀번호를 잊으셨나요?")}
            </button>
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button wide" disabled={busy} type="submit">
            {draft.role === "학생단체" ? t("학생단체로 로그인") : t("스폰서로 로그인")}
          </button>
          <p className="auth-switch">
            {t("아직 계정이 없나요?")}{" "}
            <button onClick={() => onSignup(draft.role)} type="button">
              {t("회원가입")}
            </button>
          </p>
          <div className="demo-login">
            <p>{t("데모 계정으로 체험하기")}</p>
            <div className="demo-login-buttons">
              {roles.map((role) => (
                <button
                  disabled={busy}
                  key={role}
                  onClick={() => void submit({ role, email: demoAccounts[role].email, password: demoPassword })}
                  type="button"
                >
                  <RoleMark role={role} size={22} />
                  <span>
                    {demoAccounts[role].name}
                    <small>{t(role)}</small>
                  </span>
                </button>
              ))}
            </div>
            <small>{t("여러 사람이 함께 쓰는 체험용 계정이라, 예시 데이터 안에서만 제안하고 수락해 볼 수 있어요.")}</small>
          </div>
        </form>
      )}
    </Modal>
  )
}
